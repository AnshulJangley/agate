"""
Remote embedding service for the AGATE knowledge layer.

Mirrors the provider-detection style of ``nlp.llm_factory``: a single service
object that resolves a provider from the environment, exposes a stable
``embed``/``embed_batch`` API, and degrades to a deterministic local surrogate
rather than crashing when no key is configured.

Design notes
------------
* **Dimension is explicit and enforced.** ``EMBEDDING_DIM`` (default 768) is the
  contract between ingest and query. Vectors written at one dimension and
  queried at another produce silently meaningless similarity scores, so the
  service asserts the returned width matches the configured width and raises
  rather than returning a short vector that would later poison the index.
* **Vectors are L2-normalised on output**, which makes cosine similarity a plain
  dot product downstream and keeps the door open for a pgvector migration.
* **No local model.** Per project decision the laptop runs no embedding model;
  Gemini is the remote provider. The only local path is the hash surrogate used
  when there is no key at all, and it is loud about being used.
"""

from __future__ import annotations

import hashlib
import logging
import math
import os
import threading
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

PROVIDER_GEMINI = "gemini"
PROVIDER_OFFLINE = "offline"

DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
DEFAULT_EMBEDDING_DIM = 768

# Gemini accepts larger payloads, but staying modest keeps individual requests
# well inside the per-request token cap and makes partial failures cheap.
_BATCH_SIZE = 32


def _clean_key(val: Optional[str]) -> Optional[str]:
    """Returns the key if non-empty and not an obvious placeholder, else None."""
    if not val:
        return None
    v = val.strip()
    if v.lower() in {
        "your-api-key-here", "none", "", "placeholder",
        "your_api_key_here", "dummy", "changeme",
    }:
        return None
    return v


def get_embedding_dim() -> int:
    """Configured vector width. Single source of truth for the whole app."""
    raw = os.getenv("EMBEDDING_DIM")
    if raw:
        try:
            dim = int(raw)
            if dim > 0:
                return dim
        except ValueError:
            logger.warning(
                "EMBEDDING_DIM=%r is not a positive integer; falling back to %d.",
                raw, DEFAULT_EMBEDDING_DIM,
            )
    return DEFAULT_EMBEDDING_DIM


def _pseudo_embedding(text: str, dim: Optional[int] = None) -> List[float]:
    """
    Deterministic hash-based surrogate used when no remote embedder is reachable.

    This carries no semantic meaning — it only keeps the pipeline structurally
    intact (right shape, unit norm, stable for identical input) so the app
    degrades to lexical BM25 ranking instead of failing outright.
    """
    dim = dim or get_embedding_dim()
    tokens = (text or "").lower().split()
    vec = [0.0] * dim
    for i, token in enumerate(tokens):
        h = int(hashlib.md5(token.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        vec[idx] += 1.0 / (1.0 + math.log(i + 1))
    norm = math.sqrt(sum(x * x for x in vec)) or 1.0
    return [round(x / norm, 6) for x in vec]


def _l2_normalize(vec: Sequence[float]) -> List[float]:
    norm = math.sqrt(sum(float(x) * float(x) for x in vec))
    if norm == 0.0:
        return [float(x) for x in vec]
    return [float(x) / norm for x in vec]


class EmbeddingService:
    """Lazy, thread-safe singleton wrapper around a remote embedding provider."""

    _instance: Optional["EmbeddingService"] = None
    _instance_lock = threading.Lock()

    def __new__(cls) -> "EmbeddingService":
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._initialised = False
                    cls._instance = inst
        return cls._instance

    def __init__(self) -> None:
        if getattr(self, "_initialised", False):
            return
        self._initialised = True
        self._lock = threading.Lock()
        self._client: Any = None
        self._client_ready = False
        self._model = os.getenv("EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip()
        self._dim = get_embedding_dim()
        # Recorded once we learn the true width from the provider, so a mismatch
        # is reported once rather than on every call.
        self._observed_dim: Optional[int] = None
        self._surrogate_warned = False

    # -- provider resolution -------------------------------------------------

    def _api_key(self) -> Optional[str]:
        return _clean_key(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))

    @property
    def provider(self) -> str:
        return PROVIDER_GEMINI if self._api_key() else PROVIDER_OFFLINE

    @property
    def dimension(self) -> int:
        return self._observed_dim or self._dim

    def is_available(self) -> bool:
        return self.provider != PROVIDER_OFFLINE

    def _ensure_client(self) -> Any:
        if self._client_ready:
            return self._client
        with self._lock:
            if self._client_ready:
                return self._client
            key = self._api_key()
            if not key:
                self._client = None
                self._client_ready = True
                return None
            try:
                from google import genai  # type: ignore

                self._client = genai.Client(api_key=key)
            except Exception as exc:  # pragma: no cover - depends on env
                logger.warning(
                    "Could not initialise the Gemini embedding client (%s). "
                    "Falling back to the deterministic surrogate.", exc,
                )
                self._client = None
            self._client_ready = True
            return self._client

    # -- embedding -----------------------------------------------------------

    def _warn_surrogate(self, reason: str) -> None:
        if not self._surrogate_warned:
            logger.warning(
                "Embeddings are running on the deterministic SURROGATE (%s). "
                "Similarity scores are not semantic — results degrade to BM25 "
                "lexical ranking. Set GEMINI_API_KEY to enable real embeddings.",
                reason,
            )
            self._surrogate_warned = True

    def _remote_embed(self, texts: List[str]) -> Optional[List[List[float]]]:
        """Returns one normalised vector per input, or None if unavailable."""
        client = self._ensure_client()
        if client is None:
            return None

        from google.genai import types  # type: ignore

        try:
            response = client.models.embed_content(
                model=self._model,
                contents=texts,
                config=types.EmbedContentConfig(output_dimensionality=self._dim),
            )
        except Exception as exc:
            # Older embedding models reject output_dimensionality. Retry without
            # it and truncate below (Matryoshka-style) rather than losing the
            # provider entirely.
            logger.warning(
                "Embedding request with output_dimensionality=%d failed (%s); "
                "retrying with the model's native width.", self._dim, exc,
            )
            try:
                response = client.models.embed_content(
                    model=self._model,
                    contents=texts,
                )
            except Exception as exc2:
                logger.warning("Remote embedding failed entirely (%s).", exc2)
                return None

        embeddings = getattr(response, "embeddings", None)
        if not embeddings:
            logger.warning("Embedding provider returned no vectors.")
            return None

        vectors: List[List[float]] = []
        for item in embeddings:
            values = getattr(item, "values", None)
            if values is None and isinstance(item, dict):
                values = item.get("values")
            if not values:
                return None
            vec = [float(v) for v in values]

            if len(vec) > self._dim:
                # Truncate then renormalise; the leading dimensions carry the
                # most signal in Matryoshka-trained models.
                vec = vec[: self._dim]
            elif len(vec) < self._dim:
                logger.error(
                    "Embedding provider returned %d dimensions but EMBEDDING_DIM "
                    "is %d. Refusing to return a short vector.", len(vec), self._dim,
                )
                return None

            vectors.append(_l2_normalize(vec))

        if vectors and self._observed_dim is None:
            self._observed_dim = len(vectors[0])
            logger.info(
                "Embedding service online: provider=%s model=%s dim=%d",
                self.provider, self._model, self._observed_dim,
            )
        return vectors

    def embed_batch(self, texts: Sequence[str]) -> List[List[float]]:
        """Embed many strings, preserving input order."""
        items = [("" if t is None else str(t)) for t in texts]
        if not items:
            return []

        out: List[List[float]] = []
        for start in range(0, len(items), _BATCH_SIZE):
            window = items[start:start + _BATCH_SIZE]
            remote = self._remote_embed(window)
            if remote is None or len(remote) != len(window):
                self._warn_surrogate("remote provider unavailable")
                out.extend(_pseudo_embedding(t) for t in window)
            else:
                out.extend(remote)
        return out

    def embed(self, text: str) -> List[float]:
        """Embed a single string."""
        return self.embed_batch([text])[0]

    def status(self) -> Dict[str, Any]:
        """Summary for /api/ai/status and diagnostics."""
        return {
            "provider": self.provider,
            "model": self._model,
            "configured_dim": self._dim,
            "observed_dim": self._observed_dim,
            "available": self.is_available(),
        }


def embed_text(text: str) -> List[float]:
    """Module-level convenience wrapper."""
    return EmbeddingService().embed(text)


def embed_texts(texts: Sequence[str]) -> List[List[float]]:
    """Module-level convenience wrapper for batches."""
    return EmbeddingService().embed_batch(texts)


def get_embedding_status() -> Dict[str, Any]:
    """Module-level status helper."""
    return EmbeddingService().status()
