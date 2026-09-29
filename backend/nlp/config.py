import os

# ---------------------------------------------------------------------------
# Multi-Provider LLM Configuration (Gemini, Claude, OpenAI, Ollama)
# ---------------------------------------------------------------------------
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto")

# Google Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL_NAME", "gemini-flash-latest")

# Anthropic Claude
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
ANTHROPIC_MODEL_NAME = os.getenv("ANTHROPIC_MODEL_NAME", "claude-3-5-haiku-20241022")

# OpenAI
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL_NAME = os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL")

# Ollama (Local)
OLLAMA_ENDPOINT = os.getenv("OLLAMA_ENDPOINT", "http://localhost:11434/v1")
OLLAMA_MODEL_NAME = os.getenv("OLLAMA_MODEL_NAME", "llama3")

# Backward compatibility fallbacks
LLM_API_KEY = os.getenv("LLM_API_KEY", "your-api-key-here")
LLM_ENDPOINT = os.getenv("LLM_ENDPOINT", OLLAMA_ENDPOINT)
LLM_MODEL_NAME = os.getenv("LLM_MODEL_NAME", "llama3")

# ---------------------------------------------------------------------------
# Embeddings
# ---------------------------------------------------------------------------
# The embedder is a remote provider (Gemini) resolved by nlp.embeddings, not a
# local model. It replaces the previous in-process fastembed BGE-small path,
# which pinned every vector to 384 dimensions. The configured width now lives
# in one place (EMBEDDING_DIM, default 768) and is asserted by the service.
from nlp.embeddings import (  # noqa: E402
    EmbeddingService,
    get_embedding_dim,
    get_embedding_status,
    _pseudo_embedding,
)


def get_embedding(text: str) -> list[float]:
    """
    Generates an embedding for ``text`` via the configured remote provider.

    Lazily initialises on first call. Falls back to a deterministic local
    surrogate when no provider is available, so callers never have to handle
    an exception — but the surrogate carries no semantic meaning, so the
    similarity scores it produces are meaningless beyond lexical overlap.
    """
    return EmbeddingService().embed(text)


def get_embeddings(texts: list[str]) -> list[list[float]]:
    """Batch variant of :func:`get_embedding`, preserving input order."""
    return EmbeddingService().embed_batch(texts)


EMBEDDING_DIM = get_embedding_dim()

