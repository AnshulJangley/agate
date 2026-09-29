"""
Phase 3: multi-turn chat over the offset-well knowledge base.

Design notes
------------
* **No agent framework, no tool loop.** One retrieval step, one generation step,
  deterministic server-side assembly. The retrieval reuses the Phase 1 hybrid
  search (`main.search_events`) rather than reimplementing ranking, and pulls
  Phase 2 graph neighbours for the anchored well.

* **The citation gate is real here.** ``api/ai_assistant.py`` passes the
  deterministic citation list straight through as the LLM's citations, so
  ``GuardrailsService`` gate 2 can never fail. This module instead parses the
  ``[n]`` markers out of the model's own prose and maps them back to sources.
  An answer that cites ``[7]`` when only five sources were retrieved produces a
  citation that is genuinely fabricated, and the guardrail rejects it.

* **Retrieval failure degrades to lexical, generation failure degrades to the
  deterministic answer** - never to a 500. Every response carries ``mode`` so
  the caller can tell a live-LLM answer from a rules-engine one.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from guardrails.guardrails_service import GuardrailsService, PROMPT_INJECTION_PATTERNS
from models import ChatMessage, ChatSession
from nlp.llm_factory import (
    PROVIDER_OFFLINE,
    detect_active_provider,
    get_llm_candidates,
    is_llm_available,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["AI Assistant Chat"])

# How many prior turns to replay into the prompt. Enough for pronoun/ellipsis
# resolution ("what about at 3000m?") without letting a long session crowd out
# the retrieved evidence, which is what actually grounds the answer.
_MAX_HISTORY_TURNS = 6


class ChatCitation(BaseModel):
    source_file: str
    source_page: int
    well_id: Optional[str] = None
    depth_tvd: Optional[float] = None


class ChatRequest(BaseModel):
    message: str = Field(..., description="The engineer's question")
    session_id: Optional[int] = Field(None, description="Continue an existing session; omit to start one")
    well_id: Optional[str] = Field(None, description="Well the conversation is anchored to")
    depth_tvd: Optional[float] = Field(None, description="Current or target TVD in metres")
    max_records: int = Field(5, ge=1, le=20, description="Maximum evidence records to retrieve")


class ChatResponse(BaseModel):
    session_id: int
    message_id: int
    answer: str
    citations: List[ChatCitation]
    guardrail_verified: bool
    guardrail_violations: List[str]
    provider: str
    model: str
    mode: str
    evidence_count: int
    graph_context: Dict[str, Any]


class SessionSummary(BaseModel):
    id: int
    title: Optional[str] = None
    well_id: Optional[str] = None
    created_at: Optional[str] = None
    message_count: int


def _retrieve_evidence(db: Session, query: str, well_id: Optional[str],
                       depth: Optional[float], limit: int) -> List[Any]:
    """
    Phase 1 hybrid retrieval, reused rather than reimplemented.

    ``main.search_events`` is imported lazily: main.py imports this router, so a
    module-level import would be circular.

    ⚠️ EVERY parameter must be passed explicitly. ``search_events`` is a FastAPI
    endpoint, so its optional parameters default to ``Query(...)`` objects which
    FastAPI resolves during dependency injection. Calling the function directly
    bypasses that, leaving the *raw* ``Query`` instances in place:

      * ``reference_depth`` stays a ``Query`` instead of ``None``, so
        ``target_depth`` becomes a ``Query`` and every depth comparison then
        raises ``unsupported operand type(s) for -: 'float' and 'Query'``;
      * ``pre_filter_to_analogs`` / ``exclude_synthetic`` are *truthy* (the class
        has no ``__bool__``), which silently switches on the analog pre-filter
        and filters out every ``data_source == 'synthetic'`` row.

    The failure is invisible: ``search_events`` catches the exception and returns
    its offline JSON fallback, which has plausible-looking incidents in it. Chat
    then answers confidently from a file while never touching the database.
    """
    try:
        from main import search_events

        return list(search_events(
            query=query,
            formation=None,
            depth=depth,
            reference_depth=None,
            event_type=None,
            well_id=well_id,
            pre_filter_to_analogs=False,
            exclude_synthetic=False,
            limit=limit,
            db=db,
        ))
    except Exception as exc:
        logger.warning("Evidence retrieval failed (%s); answering without evidence.", exc)
        return []


def _graph_context(db: Session, well_id: Optional[str]) -> Dict[str, Any]:
    """Phase 2 persisted graph neighbourhood around the anchored well."""
    if not well_id:
        return {}
    try:
        from services import graph_store

        result = graph_store.neighbors(db, f"Well:{well_id}", depth=1)
        if not result.get("found"):
            return {}
        return {
            "root": result["root"],
            "nodes": [
                {"id": n.get("id"), "label": n.get("label") or n.get("type")}
                for n in result.get("nodes", [])
            ],
            "relationships": sorted({
                e.get("relationship", "") for e in result.get("edges", []) if e.get("relationship")
            }),
        }
    except Exception as exc:
        logger.warning("Graph context unavailable (%s).", exc)
        return {}


def _build_evidence(rows: List[Any]) -> tuple[List[Dict[str, Any]], List[str], List[str]]:
    """Turn retrieved events into (citations, evidence lines, mitigations)."""
    citations: List[Dict[str, Any]] = []
    lines: List[str] = []
    mitigations: List[str] = []

    for idx, row in enumerate(rows):
        well = getattr(row, "well_id", None) or "unknown"
        depth = getattr(row, "depth_tvd", None)
        event_type = getattr(row, "event_type", "") or "unspecified event"
        formation = getattr(row, "formation", "") or "unknown formation"
        cause = getattr(row, "root_cause", "") or "not recorded"
        mitigation = getattr(row, "mitigation_applied", "") or "not recorded"

        citations.append({
            "source_file": f"well_{well}_history.las",
            "source_page": idx + 1,
            "well_id": well,
            "depth_tvd": depth,
        })
        lines.append(
            f"[{idx + 1}] Well: {well} | Depth: {depth}m TVD | Formation: {formation} | "
            f"Hazard: {event_type} | Cause: {cause} | Mitigation: {mitigation}"
        )
        if mitigation and mitigation not in mitigations:
            mitigations.append(mitigation)

    return citations, lines, mitigations


def _parse_cited_sources(answer: str, citations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Map the [n] markers the model wrote back onto real sources.

    Only in-range indices resolve. An out-of-range marker is dropped rather than
    clamped, so a hallucinated citation surfaces as a missing source and the
    guardrail's citation gate rejects the answer instead of silently accepting a
    reference to a record that was never retrieved.
    """
    quoted: List[Dict[str, Any]] = []
    for marker in re.findall(r"\[(\d+)\]", answer or ""):
        index = int(marker) - 1
        if 0 <= index < len(citations):
            source = citations[index]
            if source not in quoted:
                quoted.append(source)
    return quoted


def _detect_input_injection(text: str) -> Optional[str]:
    """
    Scan the *user's* message for prompt-injection patterns.

    ``GuardrailsService`` only scans the LLM's output, so an injection attempt in
    the prompt is caught solely when the model happens to echo it back. A model
    that quietly obeys - or one that merely declines without repeating the
    wording - leaves no trace, and the turn is recorded as guardrail-verified.

    Detecting the attempt on the way in means the attack is recorded against the
    session whether or not the model complied, and the model never sees it.
    """
    for pattern in PROMPT_INJECTION_PATTERNS:
        if re.search(pattern, text or "", re.IGNORECASE):
            return pattern
    return None


def _offline_answer(citations: List[Dict[str, Any]], lines: List[str],
                    mitigations: List[str], query: str) -> List[str]:
    """Deterministic answer used when no LLM is reachable."""
    if not lines:
        return [
            f"No indexed offset-well records matched “{query}”. The knowledge base currently "
            "holds 19 seeded incidents across 8 wells; try naming a hazard, a formation, or a depth."
        ]
    hazards: List[str] = []
    for line in lines:
        m = re.search(r"Hazard: ([^|]+)", line)
        if m:
            hazards.append(m.group(1).strip())
    return [
        f"Retrieved {len(lines)} offset-well record(s) matching “{query}”. "
        f"Hazards represented: {', '.join(sorted(set(hazards))[:4])}.",
        *lines,
    ]


@router.post("", response_model=ChatResponse)
def chat(payload: ChatRequest, db: Session = Depends(get_db)):
    """Ask a question about offset-well history. Multi-turn via ``session_id``."""
    question = (payload.message or "").strip()
    if not question:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    # Checked before retrieval and before generation - a detected attempt never
    # reaches the model at all.
    input_injection = _detect_input_injection(question)

    # 1. Resolve or create the session.
    session: Optional[ChatSession] = None
    if payload.session_id is not None:
        session = db.query(ChatSession).filter(ChatSession.id == payload.session_id).first()
        if session is None:
            raise HTTPException(status_code=404, detail=f"No chat session {payload.session_id}")
    else:
        session = ChatSession(
            well_id=payload.well_id,
            title=question[:80],
        )
        db.add(session)
        db.commit()
        db.refresh(session)

    if payload.well_id and not session.well_id:
        session.well_id = payload.well_id

    # 2. Prior turns, before this one is written.
    history = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    history = history[-_MAX_HISTORY_TURNS:]

    # 3. Retrieve evidence and graph context.
    rows = _retrieve_evidence(db, question, payload.well_id, payload.depth_tvd, payload.max_records)
    citations, evidence_lines, mitigations = _build_evidence(rows)
    graph_context = _graph_context(db, payload.well_id or session.well_id)

    evidence_context = "\n".join(evidence_lines) if evidence_lines else "No matching historical records were retrieved."

    deterministic_evidence = {
        "confidence": "high" if len(evidence_lines) >= 2 else "medium" if evidence_lines else "low",
        "citations": [{"source_file": c["source_file"], "source_page": c["source_page"]} for c in citations],
        "recommended_actions": mitigations[:3],
    }

    active_provider, active_model = detect_active_provider()

    # 4. Generate. Walk the provider failover chain rather than trusting one.
    llm_candidate = None
    mode = "offline_deterministic"

    if evidence_lines and is_llm_available() and not input_injection:
        system_prompt = (
            "You are a senior drilling engineer supporting Oil India offset-well decisions. "
            "Answer strictly from the retrieved evidence below.\n"
            "Rules:\n"
            "1. Ground every factual claim in the evidence and cite it inline as [1], [2] - "
            "only numbers that actually appear below.\n"
            "2. If the evidence does not answer the question, say so plainly instead of guessing.\n"
            "3. Never advise autonomous rig control, BOP actuation, or shutting down the well.\n"
            "4. Be concise: at most three short paragraphs or a short bulleted list.\n"
        )
        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        for turn in history:
            if turn.role in ("user", "assistant") and turn.content:
                messages.append({"role": turn.role, "content": turn.content})

        context_block = (
            f"Reference well: {payload.well_id or session.well_id or 'not specified'}"
            f" | Depth: {payload.depth_tvd if payload.depth_tvd is not None else 'not specified'}m\n"
        )
        if graph_context:
            context_block += (
                f"Graph context for this well: {len(graph_context.get('nodes', []))} "
                f"related entities; relationships: {', '.join(graph_context.get('relationships', []))}\n"
            )
        messages.append({
            "role": "user",
            "content": (
                f"{context_block}\nRetrieved offset-well evidence:\n{evidence_context}\n\n"
                f"Question: {question}"
            ),
        })

        failures: List[str] = []
        for prov, model, llm in get_llm_candidates(temperature=0.1, timeout=20.0):
            try:
                response = llm.invoke(messages)
                content = getattr(response, "content", response)
                if isinstance(content, str):
                    produced = content
                elif isinstance(content, list):
                    produced = "\n".join(
                        c if isinstance(c, str) else str(c.get("text", "")) if isinstance(c, dict) else str(c)
                        for c in content
                    )
                else:
                    produced = str(content)

                if not produced.strip():
                    raise ValueError("provider returned an empty answer")

                answer = produced.strip()
                llm_candidate = {
                    "confidence": deterministic_evidence["confidence"],
                    # Parsed from the model's own prose - see module docstring.
                    "citations": [
                        {"source_file": c["source_file"], "source_page": c["source_page"]}
                        for c in _parse_cited_sources(answer, citations)
                    ],
                    "recommendations": mitigations[:3],
                    "summary": answer,
                    "reasoning": f"Generated from {len(evidence_lines)} retrieved records via {prov}.",
                }
                active_provider, active_model = prov, (model or active_model)
                mode = "live_llm"
                break
            except Exception as exc:
                failures.append(f"{prov}: {str(exc)[:120]}")
                logger.warning("Provider %s failed for chat, trying next. (%s)", prov, exc)

        if llm_candidate is None and failures:
            logger.warning("Every LLM provider failed; answering deterministically. %s",
                           " | ".join(failures))

    if llm_candidate is None:
        if input_injection:
            answer = (
                "Request declined: this message matches a known prompt-injection pattern and "
                "was not sent to the language model. Ask a drilling or offset-well question instead."
            )
        else:
            answer = "\n\n".join(_offline_answer(citations, evidence_lines, mitigations, question))
        llm_candidate = {
            "confidence": deterministic_evidence["confidence"],
            "citations": deterministic_evidence["citations"],
            "recommendations": mitigations[:3],
            "summary": answer,
            "reasoning": "Deterministic rules-engine answer (no live LLM).",
        }
        mode = "offline_deterministic"
        active_provider = PROVIDER_OFFLINE

    # 5. Guardrails - every answer, live or offline.
    validation = GuardrailsService.validate(deterministic_evidence, llm_candidate)
    validated = validation["validated_response"]
    final_answer = validated.get("summary") or answer
    verified = bool(validation["allowed"])
    violations = list(validation.get("violations", []))

    if input_injection:
        # The attempt is recorded whether or not the model complied, so an audit
        # of the session shows the attack rather than a clean "verified" turn.
        verified = False
        note = "Prompt injection pattern detected in user input."
        if note not in violations:
            violations.append(note)

    # 6. Persist both turns.
    db.add(ChatMessage(session_id=session.id, role="user", content=question))
    assistant_msg = ChatMessage(
        session_id=session.id,
        role="assistant",
        content=final_answer,
        citations=citations,
        guardrail_verified=verified,
        guardrail_violations=violations,
        provider=active_provider,
        model=active_model,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)

    return ChatResponse(
        session_id=session.id,
        message_id=assistant_msg.id,
        answer=final_answer,
        citations=[ChatCitation(**c) for c in citations],
        guardrail_verified=verified,
        guardrail_violations=violations,
        provider=active_provider,
        model=active_model,
        mode=mode,
        evidence_count=len(evidence_lines),
        graph_context=graph_context,
    )


@router.get("/sessions", response_model=List[SessionSummary])
def list_sessions(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    """Most recent chat sessions, newest first."""
    sessions = (
        db.query(ChatSession)
        .order_by(ChatSession.id.desc())
        .limit(limit)
        .all()
    )
    out: List[SessionSummary] = []
    for s in sessions:
        count = db.query(ChatMessage).filter(ChatMessage.session_id == s.id).count()
        out.append(SessionSummary(
            id=s.id,
            title=s.title,
            well_id=s.well_id,
            created_at=s.created_at.isoformat() if s.created_at else None,
            message_count=count,
        ))
    return out


@router.get("/sessions/{session_id}")
def get_session(session_id: int, db: Session = Depends(get_db)):
    """Full transcript of one session."""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=404, detail=f"No chat session {session_id}")
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.id.asc())
        .all()
    )
    return {
        "id": session.id,
        "title": session.title,
        "well_id": session.well_id,
        "created_at": session.created_at.isoformat() if session.created_at else None,
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "citations": m.citations or [],
                "guardrail_verified": m.guardrail_verified,
                "guardrail_violations": m.guardrail_violations or [],
                "provider": m.provider,
                "model": m.model,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in messages
        ],
        "data_source": "postgres",
    }
