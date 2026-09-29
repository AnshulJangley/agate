import argparse
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Document, DocumentChunk, SyntheticEvent, WellMaster
from nlp.config import EMBEDDING_DIM, get_embedding
from nlp.embeddings import EmbeddingService
from nlp.extractor import extract_incidents_from_chunks, detect_doc_type
from nlp.graph_linker import link_document
from nlp.parser import DrillingReportParser

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def _sha256_file(path: str) -> str:
    """Content hash of the upload - the dedupe key for re-ingestion."""
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(65536), b""):
            digest.update(block)
    return digest.hexdigest()


def ingest_report(pdf_path: str, well_id: str, db_session: Session):
    """
    Parses a drilling report, extracts incidents via LLM, generates embeddings,
    and saves them to the PostgreSQL database.

    Since Phase 4 this also persists the *document itself* - one ``document`` row
    plus one ``document_chunk`` row per semantic chunk, each with its own vector -
    and links the document into the persisted knowledge graph. Previously the
    text was parsed, mined for incidents and discarded, which made the source
    unquotable and un-reprocessable.

    Idempotent on content: re-uploading a byte-identical file resolves to the
    existing ``document`` row and does not create a second one. The 42 duplicate
    events that polluted this database came from exactly that gap.
    """
    logger.info(f"Starting ingestion for {pdf_path} (Well ID: {well_id})")

    # ------------------------------------------------------------------
    # 0. Content hash + duplicate check
    # ------------------------------------------------------------------
    try:
        sha256 = _sha256_file(pdf_path)
    except Exception as e:
        logger.error(f"Could not hash {pdf_path}: {e}")
        sha256 = None

    if sha256:
        try:
            existing = db_session.query(Document).filter(Document.sha256 == sha256).first()
            if existing is not None:
                logger.info(f"Document {sha256[:12]} already ingested (id={existing.id}); skipping.")
                return {
                    "status": "duplicate",
                    "document_id": existing.id,
                    "sha256": sha256,
                    "ocr_triggered": bool(existing.ocr_triggered),
                    "extracted_count": 0,
                    "chunk_count": existing.chunk_count or 0,
                    "events": [],
                    "guardrail_verified": True,
                    "guardrail_violations": [],
                    "message": f"{existing.filename} was already ingested on "
                               f"{existing.created_at}; not re-processed.",
                }
        except Exception as e:
            logger.warning(f"Duplicate check failed ({e}); continuing.")

    # ------------------------------------------------------------------
    # 1. Parse the PDF
    # ------------------------------------------------------------------
    parser = DrillingReportParser()
    raw_text, ocr_triggered = parser.extract_text_and_tables(pdf_path)
    raw_text = raw_text or ""

    filename = os.path.basename(pdf_path)
    document: Optional[Document] = None

    def _open_document(status: str, chunk_count: int = 0) -> Optional[Document]:
        """Create the document row, tolerating an unreachable database."""
        if not sha256:
            return None
        try:
            doc = Document(
                well_id=well_id,
                filename=filename,
                sha256=sha256,
                doc_type=detect_doc_type(filename, raw_text),
                ocr_triggered=bool(ocr_triggered),
                char_count=len(raw_text.strip()),
                chunk_count=chunk_count,
                status=status,
            )
            db_session.add(doc)
            db_session.commit()
            db_session.refresh(doc)
            return doc
        except Exception as e:
            db_session.rollback()
            logger.warning(f"Could not persist document row ({e}); continuing without it.")
            return None

    # ------------------------------------------------------------------
    # 2. Insufficient text -> raw_text fallback event
    # ------------------------------------------------------------------
    if len(raw_text.strip()) < 50:
        logger.error(f"Insufficient text from {pdf_path}. Exiting extraction and storing raw fallback.")

        document = _open_document(status="failed")

        fallback_text = raw_text.strip() if raw_text else "No text extracted."
        db_event = SyntheticEvent(
            well_id=well_id,
            depth_start_tvd=0,
            depth_end_tvd=0,
            formation="Unknown",
            event_type="raw_text",
            severity="LOW",
            root_cause=fallback_text,
            mitigation_applied="None",
            npt_hours=0.0,
            embedding=get_embedding(fallback_text[:1000]),
            data_source="dd_report"
        )
        db_session.add(db_event)
        db_session.commit()

        return {
            "status": "error",
            "message": "extraction failed: no readable text",
            "ocr_triggered": ocr_triggered,
            "extracted_count": 0,
            "chunk_count": 0,
            "events": []
        }

    # ------------------------------------------------------------------
    # 3. Chunk the text
    # ------------------------------------------------------------------
    chunks = parser.create_operational_chunks(raw_text)
    logger.info(f"Generated {len(chunks)} chunks for LLM extraction.")

    # ------------------------------------------------------------------
    # 4. Persist the document and its chunk-level embeddings
    # ------------------------------------------------------------------
    document = _open_document(status="ingested", chunk_count=len(chunks))

    if document is not None and chunks:
        try:
            # Batch the embedding call - much cheaper and faster than one
            # request per chunk.
            vectors: List[Optional[List[float]]] = []
            try:
                vectors = EmbeddingService().embed_batch(chunks)
            except Exception as e:
                logger.warning(f"Chunk embedding failed ({e}); storing chunks without vectors.")

            for index, chunk_text in enumerate(chunks):
                vector = None
                if index < len(vectors) and vectors[index] and len(vectors[index]) == EMBEDDING_DIM:
                    vector = vectors[index]
                db_session.add(DocumentChunk(
                    document_id=document.id,
                    chunk_index=index,
                    text=chunk_text,
                    embedding=vector,
                ))
            db_session.commit()
            embedded = sum(1 for v in vectors if v)
            logger.info(f"Persisted {len(chunks)} chunks ({embedded} embedded) for document {document.id}.")
        except Exception as e:
            db_session.rollback()
            logger.warning(f"Could not persist chunks ({e}); extraction continues.")

    # ------------------------------------------------------------------
    # 5. Extract incidents from chunks
    # ------------------------------------------------------------------
    incidents = extract_incidents_from_chunks(chunks)
    logger.info(f"Extracted {len(incidents)} total incidents from the document.")

    from guardrails.guardrails_service import GuardrailsService

    pdf_filename = filename
    deterministic_evidence = {
        "confidence": "medium",
        "citations": [{"source_file": pdf_filename, "source_page": 1}],
        "recommended_actions": [ev.mitigation_applied for ev in incidents if ev.mitigation_applied]
    }

    events_to_insert = []
    extracted_summary = []
    guardrail_violations = []

    for event in incidents:
        llm_candidate = {
            "confidence": "medium",
            "citations": [{"source_file": pdf_filename, "source_page": 1}],
            "recommendations": [event.mitigation_applied] if event.mitigation_applied else [],
            "summary": event.root_cause or "",
            "reasoning": event.event_type or ""
        }
        val_result = GuardrailsService.validate(deterministic_evidence, llm_candidate)

        mitigation_final = event.mitigation_applied
        if not val_result["allowed"]:
            logger.warning(f"Guardrail violation blocked during extraction: {val_result['violations']}")
            guardrail_violations.extend(val_result["violations"])
            fallback_rec = val_result["validated_response"].get("recommendations", [])
            mitigation_final = fallback_rec[0] if fallback_rec else "Advisory intervention: manual drilling crew assessment required."

        # Construct dense context string for optimal semantic search
        context_str = f"{event.event_type} in {event.formation} at {event.depth_tvd}m TVD. Root cause: {event.root_cause}. Mitigation: {mitigation_final}"

        try:
            embedding = get_embedding(context_str)
        except Exception as e:
            logger.error(f"Failed to generate embedding for context: {e}")
            continue

        provenance_tag = "dd_report"

        # Note: mapping single depth_tvd to both start and end for point-in-time incidents.
        db_event = SyntheticEvent(
            well_id=well_id,
            depth_start_tvd=event.depth_tvd,
            depth_end_tvd=event.depth_tvd,
            formation=event.formation,
            event_type=event.event_type,
            severity=event.severity,
            root_cause=event.root_cause,
            mitigation_applied=mitigation_final,
            npt_hours=event.npt_hours,
            casing_type=event.casing_type,
            casing_size=event.casing_size,
            cement_slurry=event.cement_slurry,
            toc_depth=event.toc_depth,
            embedding=embedding,
            data_source=provenance_tag
        )
        events_to_insert.append(db_event)
        extracted_summary.append({
            "well_id": well_id,
            "data_source": provenance_tag,
            "event_type": event.event_type,
            "formation": event.formation,
            "depth_tvd": event.depth_tvd,
            "severity": event.severity,
            "root_cause": event.root_cause,
            "mitigation_applied": mitigation_final,
            "npt_hours": event.npt_hours,
            "guardrail_verified": val_result["allowed"]
        })

    # ------------------------------------------------------------------
    # 6. Insert events, then link the document into the knowledge graph
    # ------------------------------------------------------------------
    graph_link: Dict[str, Any] = {"status": "skipped"}
    if events_to_insert:
        try:
            db_session.add_all(events_to_insert)
            db_session.commit()
            logger.info(f"Successfully committed {len(events_to_insert)} events to the database.")
        except Exception as e:
            db_session.rollback()
            logger.warning(f"Database insertion skipped (offline or unreachable DB): {e}. Saving to local offline cache.")
            try:
                import json
                cache_path = os.path.join(os.path.dirname(__file__), "..", "data", "offline_ingested_events.json")
                existing_cache = []
                if os.path.exists(cache_path):
                    with open(cache_path, "r", encoding="utf-8") as f:
                        existing_cache = json.load(f)
                existing_cache.extend(extracted_summary)
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump(existing_cache, f, indent=2)
            except Exception as cache_err:
                logger.warning(f"Could not write offline event cache: {cache_err}")
    else:
        logger.info("No valid events found to ingest.")

    if document is not None:
        graph_link = link_document(db_session, document, extracted_summary)

    return {
        "status": "success",
        "document_id": document.id if document is not None else None,
        "sha256": sha256,
        "ocr_triggered": ocr_triggered,
        "extracted_count": len(extracted_summary),
        "chunk_count": document.chunk_count if document is not None else 0,
        "events": extracted_summary,
        "graph_link": graph_link,
        "guardrail_verified": len(guardrail_violations) == 0,
        "guardrail_violations": guardrail_violations
    }


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description="Ingest drilling report PDF and extract structured NLP incidents.")
    cli.add_argument("--file", type=str, required=True, help="Path to the PDF file")
    cli.add_argument("--well_id", type=str, required=True, help="Well ID associated with the report")

    args = cli.parse_args()

    db = SessionLocal()
    try:
        ingest_report(args.file, args.well_id, db)
    finally:
        db.close()
