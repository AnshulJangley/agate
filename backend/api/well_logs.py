"""
Well-log ingestion.

`well_log` was read by `/api/correlate` but nothing could write to it except the
seed script, so the "drilling and mud logging databases" data source in the problem
statement had no way in. This adds one: LAS 2.0 and CSV.

Only the curves the table actually has columns for are stored — gamma ray,
resistivity, sonic and density. Anything else in the file (neutron porosity, caliper,
SP) is **parsed and reported back as unmapped** rather than silently dropped, so a
user can see that their NPHI column went nowhere instead of assuming it landed.
"""

from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from models import WellLog, WellMaster

router = APIRouter()

# Curve mnemonic -> column. Mnemonics vary by vendor and era; these are the common
# ones. Matched on the token before the first '.' in a LAS curve line, or the CSV
# header cell.
CURVE_ALIASES: Dict[str, str] = {
    "dept": "depth_tvd", "depth": "depth_tvd", "depth_tvd": "depth_tvd",
    "tvd": "depth_tvd", "md": "depth_tvd",
    "gr": "gamma_ray", "gr_api": "gamma_ray", "gamma_ray": "gamma_ray", "gam": "gamma_ray",
    "res": "resistivity", "rt": "resistivity", "rild": "resistivity",
    "lld": "resistivity", "ild": "resistivity", "resistivity": "resistivity",
    "dt": "sonic", "dtc": "sonic", "sonic": "sonic", "ac": "sonic",
    "rhob": "density", "rho": "density", "density": "density", "den": "density",
}

STORED_CURVES = ("gamma_ray", "resistivity", "sonic", "density")


def _to_float(token: str, null_value: Optional[float]) -> Optional[float]:
    try:
        value = float(token)
    except (TypeError, ValueError):
        return None
    if value != value:  # NaN
        return None
    if null_value is not None and abs(value - null_value) < 1e-6:
        return None
    if value in (-999.25, -999.0):  # ubiquitous LAS null sentinel
        return None
    return value


def _parse_las(content: str) -> Tuple[List[str], List[List[str]], Optional[float], Dict[str, str]]:
    """
    Parse a LAS 2.0 file.

    Returns (mnemonics, rows, null_value, header_info). Deliberately tolerant: real
    LAS files carry inconsistent section markers and trailing comments, so an
    unexpected line is skipped rather than aborting the whole file.
    """
    section = ""
    mnemonics: List[str] = []
    rows: List[List[str]] = []
    null_value: Optional[float] = None
    header: Dict[str, str] = {}

    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        if line.startswith("~"):
            section = line[1:].strip().lower()
            continue

        if section.startswith("curve") or section.startswith("curve information"):
            # "GR.API : Gamma Ray" -> mnemonic is everything before the first '.'
            mnemonic = line.split(":", 1)[0].strip().split(".")[0].strip().lower()
            if mnemonic:
                mnemonics.append(mnemonic)
            continue

        if section.startswith("ascii"):
            rows.append(line.split())
            continue

        # Header sections: KEY. VALUE : Description
        match = re.match(r"^([A-Za-z0-9_]+)\s*\.\s*([^:]*)", line)
        if match:
            key = match.group(1).strip().upper()
            value = match.group(2).strip()
            header[key] = value
            if key == "NULL":
                try:
                    null_value = float(value)
                except ValueError:
                    null_value = None

    return mnemonics, rows, null_value, header


def _parse_csv(content: str) -> Tuple[List[str], List[List[str]], Optional[float], Dict[str, str]]:
    lines = [ln.strip() for ln in content.splitlines() if ln.strip()]
    if not lines:
        return [], [], None, {}
    mnemonics = [cell.strip().strip('"').lower() for cell in lines[0].split(",")]
    rows = [ln.split(",") for ln in lines[1:]]
    return mnemonics, rows, None, {}


def _ingest_parsed(
    db: Session,
    well_id: str,
    mnemonics: List[str],
    rows: List[List[str]],
    null_value: Optional[float],
    header: Dict[str, str],
) -> Dict[str, Any]:
    # Resolve each column to a model field, keeping its position in the file.
    column_map: Dict[int, str] = {}
    unmapped: List[str] = []
    for index, mnemonic in enumerate(mnemonics):
        target = CURVE_ALIASES.get(mnemonic)
        if target and target not in column_map.values():
            column_map[index] = target
        elif mnemonic:
            unmapped.append(mnemonic)

    if "depth_tvd" not in column_map.values():
        raise HTTPException(
            status_code=400,
            detail=(
                "No depth curve found. Expected a DEPT, DEPTH, MD or TVD column — "
                f"file declared: {mnemonics}"
            ),
        )

    def value_for(row: List[str], target: str) -> Optional[float]:
        for index, field in column_map.items():
            if field == target and index < len(row):
                return _to_float(row[index], null_value)
        return None

    records = []
    skipped = 0
    for row in rows:
        depth = value_for(row, "depth_tvd")
        if depth is None:
            skipped += 1
            continue
        record = {"well_id": well_id, "depth_tvd": depth}
        for field in STORED_CURVES:
            record[field] = value_for(row, field)
        # A row of nothing but nulls carries no information.
        if all(record[f] is None for f in STORED_CURVES):
            skipped += 1
            continue
        records.append(record)

    if not records:
        raise HTTPException(status_code=400, detail="No usable log rows found in the file.")

    # Replacing rather than appending: `well_log` has no unique constraint on
    # (well_id, depth_tvd), so re-ingesting the same file would otherwise double every
    # sample and skew the cross-well correlation that reads this table.
    replaced = db.execute(
        text("DELETE FROM well_log WHERE well_id = :w"), {"w": well_id}
    ).rowcount
    db.bulk_insert_mappings(WellLog, records)
    db.commit()

    header_well = header.get("WELL") or header.get("UWI") or None
    return {
        "status": "success",
        "well_id": well_id,
        "rows_written": len(records),
        "rows_skipped": skipped,
        "rows_replaced": replaced,
        "curves_stored": sorted({f for f in column_map.values() if f != "depth_tvd"}),
        "curves_unmapped": sorted(set(unmapped)),
        "depth_range_m": [
            min(r["depth_tvd"] for r in records),
            max(r["depth_tvd"] for r in records),
        ],
        "file_declared_well": header_well,
        "data_source": "postgres",
    }


@router.post("/api/well-logs/ingest")
async def ingest_well_log(
    file: UploadFile = File(...),
    well_id: str = Query(..., description="Well to attach the log to (must exist in well_master)"),
    db: Session = Depends(get_db),
):
    """
    Ingest a LAS 2.0 or CSV well log for a well.

    Curves the table has no column for are reported in `curves_unmapped` rather than
    discarded silently.
    """
    if not db.query(WellMaster).filter(WellMaster.well_id == well_id).first():
        raise HTTPException(
            status_code=404,
            detail=f"Unknown well '{well_id}'. Ingest the well record first — the log is keyed to well_master.",
        )

    raw = await file.read()
    try:
        content = raw.decode("utf-8", errors="replace")
    except Exception as exc:  # pragma: no cover - decode is already lossy
        raise HTTPException(status_code=400, detail=f"Could not read file as text: {exc}")

    name = (file.filename or "").lower()
    if name.endswith(".las") or "~ascii" in content[:4000].lower() or "~curve" in content[:4000].lower():
        mnemonics, rows, null_value, header = _parse_las(content)
        fmt = "las"
    elif name.endswith(".csv") or name.endswith(".txt") or "," in content.splitlines()[0]:
        mnemonics, rows, null_value, header = _parse_csv(content)
        fmt = "csv"
    else:
        raise HTTPException(
            status_code=400,
            detail="Unrecognised format. Expected a LAS 2.0 file (with ~Curve and ~ASCII sections) or a CSV with a header row.",
        )

    if not rows:
        raise HTTPException(status_code=400, detail=f"No data rows found in the {fmt.upper()} file.")

    result = _ingest_parsed(db, well_id, mnemonics, rows, null_value, header)
    result["format"] = fmt
    result["mnemonics_seen"] = mnemonics
    return result


@router.get("/api/well-logs/{well_id}")
def get_well_log_summary(well_id: str, db: Session = Depends(get_db)):
    """What log data is loaded for a well, and over what depth range."""
    rows = db.execute(
        text(
            """
            SELECT count(*) AS samples,
                   min(depth_tvd) AS top_m,
                   max(depth_tvd) AS base_m,
                   count(gamma_ray) AS gr,
                   count(resistivity) AS res,
                   count(sonic) AS son,
                   count(density) AS den
            FROM well_log WHERE well_id = :w
            """
        ),
        {"w": well_id},
    ).mappings().first()

    if not rows or not rows["samples"]:
        return {"well_id": well_id, "samples": 0, "data_source": "postgres"}

    return {
        "well_id": well_id,
        "samples": rows["samples"],
        "depth_range_m": [rows["top_m"], rows["base_m"]],
        "curves": {
            "gamma_ray": rows["gr"],
            "resistivity": rows["res"],
            "sonic": rows["son"],
            "density": rows["den"],
        },
        "data_source": "postgres",
    }
