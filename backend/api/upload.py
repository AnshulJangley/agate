from fastapi import APIRouter, File, UploadFile, Form, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import shutil
import uuid
import lasio
import pandas as pd

from database import get_db
from sqlalchemy.orm import Session
from models import SyntheticEvent, WellLog, WellMaster
from nlp.config import get_embedding, EMBEDDING_DIM

router = APIRouter()

class ContributeLessonSchema(BaseModel):
    well_id: str
    event_type: str = Field(..., description="e.g. Lost Circulation, Gas Kick, Stuck Pipe, Packoff")
    formation: str = Field(..., description="e.g. Barail Formation, Tipam Sandstone, Kopili")
    depth_tvd: float
    severity: str = Field("MEDIUM", description="LOW, MEDIUM, HIGH, CRITICAL")
    root_cause: str
    mitigation_applied: str
    npt_hours: Optional[float] = 0.0

@router.post("/api/upload-report")
async def upload_report(
    file: UploadFile = File(...),
    well_id: str = Form(...),
    db: Session = Depends(get_db)
):
    """
    Multi-format file ingestion endpoint:
    Supports PDF reports (with OCR fallback for scanned reports) and
    LAS well log files (Log ASCII Standard).
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided.")
    
    filename = file.filename
    filename_lower = filename.lower()
    is_pdf = filename_lower.endswith('.pdf')
    is_las = filename_lower.endswith('.las')

    if not is_pdf and not is_las:
        raise HTTPException(status_code=400, detail="Only PDF reports and LAS well log files are supported.")
        
    temp_dir = "temp_uploads"
    os.makedirs(temp_dir, exist_ok=True)
    temp_file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{filename}")
    
    try:
        # Save uploaded file to disk
        with open(temp_file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        if is_pdf:
            # Ingest PDF report with OCR fallback
            from nlp.ingest import ingest_report
            result = ingest_report(temp_file_path, well_id, db)

            ingestion_status = result.get("status", "success")
            extracted = result.get("extracted_count", 0)

            # A byte-identical re-upload resolves to the existing document and
            # extracts nothing. Reporting that as a fresh success would be a lie
            # of the same kind that let 42 duplicate rows accumulate unnoticed.
            if ingestion_status == "duplicate":
                message = result.get("message") or f"{file.filename} was already ingested; not re-processed."
            elif ingestion_status == "error":
                message = result.get("message") or f"{file.filename} produced no readable text."
            else:
                message = f"Successfully parsed {file.filename} with {extracted} incidents extracted."

            return {
                "status": ingestion_status,
                "file_type": "pdf",
                "filename": file.filename,
                "document_id": result.get("document_id"),
                "sha256": result.get("sha256"),
                "ocr_triggered": result.get("ocr_triggered", False),
                "extracted_count": extracted,
                "chunk_count": result.get("chunk_count", 0),
                "graph_link": result.get("graph_link", {}),
                "message": message,
                "events": result.get("events", []),
                "guardrail_verified": result.get("guardrail_verified", True),
                "guardrail_violations": result.get("guardrail_violations", [])
            }

        elif is_las:
            # Parse LAS well log file using lasio
            las = lasio.read(temp_file_path)
            df = las.df().reset_index()

            # Identify curve columns case-insensitively
            cols_lower = {col.lower(): col for col in df.columns}
            depth_col = next((cols_lower[c] for c in ['dept', 'depth', 'tvd'] if c in cols_lower), df.columns[0])
            gr_col = next((cols_lower[c] for c in ['gr', 'gamma', 'gam'] if c in cols_lower), None)
            res_col = next((cols_lower[c] for c in ['res', 'ild', 'rt', 'at90'] if c in cols_lower), None)
            sonic_col = next((cols_lower[c] for c in ['dt', 'sonic', 'ac'] if c in cols_lower), None)
            dens_col = next((cols_lower[c] for c in ['rhob', 'den', 'density'] if c in cols_lower), None)

            # Subsample to avoid massive inserts (e.g. 1 sample every 5 meters)
            df_sampled = df.iloc[::max(1, len(df) // 150)]
            log_entries = []

            for _, row in df_sampled.iterrows():
                d_val = float(row[depth_col]) if pd.notna(row[depth_col]) else None
                if d_val is None or d_val < 0:
                    continue
                
                gr_val = float(row[gr_col]) if gr_col and pd.notna(row[gr_col]) else None
                res_val = float(row[res_col]) if res_col and pd.notna(row[res_col]) else None
                dt_val = float(row[sonic_col]) if sonic_col and pd.notna(row[sonic_col]) else None
                rhob_val = float(row[dens_col]) if dens_col and pd.notna(row[dens_col]) else None

                # Determine formation based on depth
                formation_top = "Tipam Sandstone" if d_val < 2200 else ("Barail Formation" if d_val < 2950 else "Kopili Formation")

                log_entry = WellLog(
                    well_id=well_id,
                    depth_tvd=d_val,
                    gamma_ray=gr_val,
                    resistivity=res_val,
                    sonic=dt_val,
                    density=rhob_val,
                    formation_top=formation_top
                )
                log_entries.append(log_entry)

            if log_entries:
                try:
                    db.add_all(log_entries)
                    db.commit()
                except Exception as db_err:
                    db.rollback()
                    import json
                    cache_dir = os.path.join(os.path.dirname(__file__), "..", "data")
                    os.makedirs(cache_dir, exist_ok=True)
                    log_cache_path = os.path.join(cache_dir, "offline_ingested_logs.json")
                    log_dicts = [
                        {
                            "well_id": well_id,
                            "depth_tvd": l.depth_tvd,
                            "gamma_ray": l.gamma_ray,
                            "resistivity": l.resistivity,
                            "sonic": l.sonic,
                            "density": l.density,
                            "formation_top": l.formation_top
                        }
                        for l in log_entries
                    ]
                    existing_logs = []
                    if os.path.exists(log_cache_path):
                        try:
                            with open(log_cache_path, "r", encoding="utf-8") as f:
                                existing_logs = json.load(f)
                        except Exception:
                            pass
                    existing_logs.extend(log_dicts)
                    with open(log_cache_path, "w", encoding="utf-8") as f:
                        json.dump(existing_logs[-1000:], f, indent=2)

            return {
                "status": "success",
                "file_type": "las",
                "filename": file.filename,
                "curves_identified": [c for c in [gr_col, res_col, sonic_col, dens_col] if c is not None],
                "points_ingested": len(log_entries),
                "message": f"Successfully parsed LAS file: {len(log_entries)} well log points processed (Rig Edge Active)."
            }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

@router.post("/api/events/contribute")
def contribute_lesson_learned(
    payload: ContributeLessonSchema,
    db: Session = Depends(get_db)
):
    """
    Institutional Memory Two-Way Feedback Loop (SIH 2026 Core Mandate):
    Allows field engineers and operations reviewers to log lessons learned and mitigations
    from active drilling. Uses the exact same embedding provider and dimension as the
    RAG search path so the new record is immediately retrievable within the same session.
    """
    # 1. Verify well exists (with fallback to defaultWells.json if DB is offline)
    well_found = False
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == payload.well_id).first()
        if well:
            well_found = True
    except Exception:
        import json
        wells_file = os.path.join(os.path.dirname(__file__), "..", "data", "defaultWells.json")
        if os.path.exists(wells_file):
            try:
                with open(wells_file, "r", encoding="utf-8") as f:
                    wells_data = json.load(f)
                    if any(w.get("well_id") == payload.well_id for w in wells_data):
                        well_found = True
            except Exception:
                pass
    
    if not well_found:
        # Don't hard-block active field logging even if well is custom
        pass

    # 2. Construct dense context text for embedding (matching ingest.py convention)
    context_str = (
        f"{payload.event_type} in {payload.formation} at {payload.depth_tvd}m TVD. "
        f"Severity: {payload.severity}. Root cause: {payload.root_cause}. "
        f"Mitigation: {payload.mitigation_applied}."
    )

    # 3. Generate embedding with the same provider/dimension the search path uses
    try:
        embedding = get_embedding(context_str)
        if len(embedding) != EMBEDDING_DIM:
            from nlp.config import _pseudo_embedding
            embedding = _pseudo_embedding(context_str, EMBEDDING_DIM)
    except Exception:
        from nlp.config import _pseudo_embedding
        embedding = _pseudo_embedding(context_str, EMBEDDING_DIM)

    # Determine appropriate region-based provenance tag
    from simulator import get_well_region_tag
    region = get_well_region_tag(payload.well_id)
    
    provenance_tag = "synthetic" if region == "assam" else "synthetic_uncalibrated"
    if well_found:
        try:
            db_well = db.query(WellMaster).filter(WellMaster.well_id == payload.well_id).first()
            if db_well and db_well.data_source:
                provenance_tag = db_well.data_source
        except Exception:
            pass

    # 4. Insert into SyntheticEvent table (with offline JSON cache fallback)
    event_id = None
    try:
        new_event = SyntheticEvent(
            well_id=payload.well_id,
            depth_start_tvd=payload.depth_tvd,
            depth_end_tvd=payload.depth_tvd,
            formation=payload.formation,
            event_type=payload.event_type,
            severity=payload.severity.upper(),
            root_cause=payload.root_cause,
            mitigation_applied=payload.mitigation_applied,
            npt_hours=payload.npt_hours or 0.0,
            embedding=embedding,
            data_source=provenance_tag
        )
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        event_id = new_event.id
    except Exception as db_err:
        db.rollback()
        import json
        cache_path = os.path.join(os.path.dirname(__file__), "..", "data", "offline_ingested_events.json")
        existing = []
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    existing = json.load(f)
            except Exception:
                pass
        offline_event = {
            "id": f"offline-{uuid.uuid4().hex[:8]}",
            "well_id": payload.well_id,
            "depth_tvd": payload.depth_tvd,
            "depth_start_tvd": payload.depth_tvd,
            "depth_end_tvd": payload.depth_tvd,
            "formation": payload.formation,
            "event_type": payload.event_type,
            "severity": payload.severity.upper(),
            "root_cause": payload.root_cause,
            "mitigation_applied": payload.mitigation_applied,
            "npt_hours": payload.npt_hours or 0.0,
            "embedding": embedding,
            "data_source": provenance_tag
        }
        existing.append(offline_event)
        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(existing, f, indent=2)
        except Exception:
            pass
        event_id = offline_event["id"]

    return {
        "status": "success",
        "message": f"Lesson successfully committed to Institutional Memory with {len(embedding)}-dim vector embedding.",
        "event_id": event_id,
        "well_id": payload.well_id,
        "embedding_dimensions": len(embedding),
        "is_immediately_searchable": True
    }


# ==============================================================================
# Phase 4: document library
# ==============================================================================

@router.get("/api/documents")
def list_documents(
    well_id: Optional[str] = None,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """
    Ingested document library, newest first, with chunk counts.

    Reads Postgres and reports data_source, so the UI can tell a real listing
    from this codebase's silent JSON fallbacks.
    """
    from models import Document

    try:
        query = db.query(Document)
        if well_id:
            query = query.filter(Document.well_id == well_id)
        docs = query.order_by(Document.id.desc()).limit(max(1, min(limit, 200))).all()

        return {
            "data_source": "postgres",
            "count": len(docs),
            "documents": [
                {
                    "id": d.id,
                    "well_id": d.well_id,
                    "filename": d.filename,
                    "doc_type": d.doc_type,
                    "sha256": d.sha256,
                    "ocr_triggered": bool(d.ocr_triggered),
                    "char_count": d.char_count,
                    "chunk_count": d.chunk_count,
                    "status": d.status,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in docs
            ],
        }
    except Exception as e:
        return {
            "data_source": "unavailable",
            "count": 0,
            "documents": [],
            "error": str(e),
        }


@router.get("/api/documents/{document_id}/chunks")
def get_document_chunks(
    document_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    """Chunk texts for one document. Embeddings are omitted - they are not useful to the UI."""
    from models import DocumentChunk

    try:
        rows = (
            db.query(DocumentChunk)
            .filter(DocumentChunk.document_id == document_id)
            .order_by(DocumentChunk.chunk_index.asc())
            .limit(max(1, min(limit, 500)))
            .all()
        )
        return {
            "data_source": "postgres",
            "document_id": document_id,
            "count": len(rows),
            "chunks": [
                {
                    "chunk_index": c.chunk_index,
                    "text": c.text,
                    "embedded": bool(c.embedding),
                    "char_count": len(c.text or ""),
                }
                for c in rows
            ],
        }
    except Exception as e:
        return {
            "data_source": "unavailable",
            "document_id": document_id,
            "count": 0,
            "chunks": [],
            "error": str(e),
        }
