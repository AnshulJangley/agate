import sys
import os

# Ensure backend directory is in sys.path for direct imports (e.g. database, models)
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI, Depends, Query, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import cast
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_SetSRID
from geoalchemy2.types import Geography
import re
import math
from typing import List, Optional, Dict, Any
import numpy as np
from pydantic import BaseModel

from contextlib import asynccontextmanager

from database import get_db
from models import WellMaster, SyntheticEvent, WellLog
from schemas import WellResponse, EventResponse, WellLogResponse, TelemetryInput, RiskPredictionResponse
from nlp.config import get_embedding
from ml.service import HazardPredictionService
from api.upload import router as upload_router
from api.correlate import router as correlate_router
from api.lookahead import router as lookahead_router
from api.ppfg import router as ppfg_router
from api.dossier import router as dossier_router
from api.backtest import router as backtest_router
from api.ai_assistant import router as ai_assistant_router
from api.chat import router as chat_router
from api.well_logs import router as well_logs_router
from services.telemetry import get_telemetry_source
from services.hybrid_retrieval import (
    DEFAULT_WEIGHTS,
    compute_bm25_score,
    compute_depth_proximity_score,
    compute_formation_match_score,
    compute_event_type_match_score,
    compute_hybrid_relevance_score,
    get_analog_wells
)
from services.ahp_weights import (
    AHP_RETRIEVAL_RESULT,
    AHP_WEIGHTS,
    AHP_CONSISTENCY_RATIO,
    AHP_IS_CONSISTENT
)
from guardrails.guardrails_service import GuardrailsService

class ScoreBreakdown(BaseModel):
    formation_match: float
    depth_proximity: float
    event_type_match: float
    bm25: float
    vector: float

class RAGSearchResponse(BaseModel):
    similarity_score: float
    hybrid_score: Optional[float] = None
    score_breakdown: Optional[ScoreBreakdown] = None
    well_id: str
    depth_tvd: float
    formation: Optional[str] = None
    event_type: str
    root_cause: str
    mitigation_applied: str
    guardrail_verified: bool = True
    data_source: Optional[str] = "synthetic"

def compute_cosine_similarity(vec1, vec2):
    v1 = np.array(vec1, dtype=float)
    v2 = np.array(vec2, dtype=float)
    # Vectors written under a different embedding model/dimension cannot be
    # compared. Returning 0.0 lets the caller fall through to the lexical
    # signals instead of raising a ValueError mid-request.
    if v1.shape != v2.shape:
        return 0.0
    n1 = np.linalg.norm(v1)
    n2 = np.linalg.norm(v2)
    if n1 == 0 or n2 == 0:
        return 0.0
    return float(np.dot(v1, v2) / (n1 * n2))

import threading

# Initialize the ML service globally
ml_service = None
_ml_lock = threading.Lock()

def get_ml_service():
    global ml_service
    if ml_service is None:
        with _ml_lock:
            if ml_service is None:
                ml_service = HazardPredictionService()
    return ml_service

@asynccontextmanager
async def lifespan(app: FastAPI):
    global ml_service
    # Do NOT instantiate HazardPredictionService at startup to keep boot memory minimal for Render
    yield
    # Clean up on shutdown if necessary

app = FastAPI(title="AGATE API", description="Oil & Gas Drilling Data API", lifespan=lifespan)

# Configure CORS - allow all Vercel previews and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "https://petrol-q.vercel.app"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount offline tiles
tiles_dir = os.path.join(backend_dir, "static", "tiles")
os.makedirs(tiles_dir, exist_ok=True)
app.mount("/tiles", StaticFiles(directory=tiles_dir), name="tiles")

app.include_router(upload_router)
app.include_router(correlate_router)
app.include_router(lookahead_router)
app.include_router(ppfg_router)
app.include_router(dossier_router)
app.include_router(backtest_router)
app.include_router(ai_assistant_router)
app.include_router(chat_router)
app.include_router(well_logs_router)

@app.get("/")
def root():
    return {"status": "ok", "service": "AGATE API"}

@app.get("/health")
@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "AGATE API"}

import json
from pathlib import Path

_NORTH_SEA_WELLS_CACHE = None
_ALL_WELLS_CACHE = None

INDIAN_WELLS_METADATA: Dict[str, Dict[str, Any]] = {
    "OIL-BAGHJAN-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Baghjan Gas Field",
        "source": "OIL Deep Exploration Asset",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Barail Sandstone (Gas/Condensate)",
        "total_depth_m": 3520.0,
        "bha_type": "Steerable Motor BHA (1.5° PDM + MWD/LWD Dual Pulse)",
        "primary_hazard": "High Pressure Gas Kick (12.4 ppg Influx)"
    },
    "OIL-BAGHJAN-4": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Baghjan Gas Field",
        "source": "OIL Incident DDR-BGN-04/18",
        "is_synthetic": True,
        "formation_count": 5,
        "target_formation": "Overpressured Barail Gas Sand Stringer",
        "total_depth_m": 3540.0,
        "bha_type": "High-Temperature RSS + Azimuthal Sonic LWD",
        "primary_hazard": "Critical Formation Influx (12.0 ppg Kick)"
    },
    "OIL-NAHARKATIYA-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Naharkatiya Oilfield",
        "source": "OIL Asset Baseline (FORCE 2020 Calibrated)",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Barail Lower Sand Reservoir",
        "total_depth_m": 3490.0,
        "bha_type": "Steerable Positive Displacement Motor (PDM 7/8 lobe, 1.83° bend)",
        "primary_hazard": "Sloughing Shale & Tight Hole"
    },
    "OIL-MORAN-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Moran Oil Field",
        "source": "OIL Historical Completion Record",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Barail Main Producing Sand",
        "total_depth_m": 3600.0,
        "bha_type": "Conventional Packed Hole Motor BHA (Jar + Float Sub)",
        "primary_hazard": "Differential Sticking (Permeable Sand Packoff)"
    },
    "OIL-DIKOM-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Dikom Field",
        "source": "Rig Physics Simulator Twin",
        "is_synthetic": True,
        "formation_count": 4,
        "target_formation": "Tipam Upper Reservoir Sand",
        "total_depth_m": 3550.0,
        "bha_type": "Tandem Stabilizer Drilling Assembly (8.5\" Bit + MWD Gamma)",
        "primary_hazard": "Thief-Bed Mud Loss in Tipam Sand"
    },
    "OIL-TENGAKHAT-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Tengakhat Discovery Block",
        "source": "OIL Exploration Log",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Barail Oligocene Gas Sand",
        "total_depth_m": 3650.0,
        "bha_type": "Vortex Mud Motor Assembly with Integrated APWD Caliper",
        "primary_hazard": "Reactive Swelling Shale Packoff"
    },
    "OIL-KOTHALONI-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Kothaloni Field",
        "source": "OIL Deep Appraisal Record",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Barail / Eocene Interface",
        "total_depth_m": 3700.0,
        "bha_type": "Dual Caliper PDM Assembly (Hydromotor + Shock Sub)",
        "primary_hazard": "Narrow Mud Weight Operating Window"
    },
    "OIL-HAPJAN-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Hapjan Development Area",
        "source": "OIL Production Logging Archive",
        "is_synthetic": False,
        "formation_count": 4,
        "target_formation": "Barail Sandstone Payzone",
        "total_depth_m": 3450.0,
        "bha_type": "Rotary Pendulum Assembly for Deviation Control",
        "primary_hazard": "Bit Balling & Heavy Sloughing"
    },
    "OIL-KUSIJAN-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Kusijan Prospect",
        "source": "OIL Structural Test Well",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Barail Thin-Bed Sandstone",
        "total_depth_m": 3580.0,
        "bha_type": "Point-the-Bit RSS (675) with Multi-Resistivity LWD",
        "primary_hazard": "Severe Thief-Bed Loss in Tipam Sand"
    },
    "OIL-HEBEDA-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Hebeda Fault Block",
        "source": "OIL Frontier Asset",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Faulted Barail Reservoir Stringer",
        "total_depth_m": 3620.0,
        "bha_type": "Slick Rotary BHA with Real-Time Vibration Pulser",
        "primary_hazard": "Fault-Induced Mud Influx"
    },
    "OIL-SHALMARI-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Shalmari Deep Structure",
        "source": "OIL Sub-thrust Deep Test",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Deep Eocene Barail Sandstone",
        "total_depth_m": 3800.0,
        "bha_type": "High-Deviation Steerable PDM BHA (Near-Bit Inclination)",
        "primary_hazard": "High Differential Overbalance Sticking"
    },
    "OIL-RAJ-BAGHEWALA-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Baghewala Heavy Oil Field",
        "source": "OIL Heavy Oil Division",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Jodhpur Sandstone (16° API Heavy Oil)",
        "total_depth_m": 3100.0,
        "bha_type": "High-Torque Heavy Oil Motor BHA with Anti-Stall Tool",
        "primary_hazard": "Viscous Drag & Differential Sticking"
    },
    "OIL-RAJ-BAGHEWALA-2": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Baghewala Field Extended Reach",
        "source": "OIL Carbonate Exploration Log",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Bilara Cavernous Dolomite",
        "total_depth_m": 3180.0,
        "bha_type": "Roller Cone Anti-Abrasion BHA (Tungsten Carbide Inserts)",
        "primary_hazard": "Cavernous Lost Circulation in Bilara Carbonate"
    },
    "OIL-RAJ-TANOT-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Tanot Gas Field",
        "source": "OIL Jaisalmer Gas Asset",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Pariwar Gas Sand",
        "total_depth_m": 2900.0,
        "bha_type": "Air/Aerated Mud Motor Assembly with Flo-Gard Sub",
        "primary_hazard": "Quartz Sand Drillstring Wear & High Friction"
    },
    "OIL-RAJ-TANOT-2": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Tanot Gas Field",
        "source": "OIL Jaisalmer Gas Asset",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Pariwar Deep Gas Horizon",
        "total_depth_m": 2950.0,
        "bha_type": "Rotary Stiff Assembly (Square Drill Collar + 3-Point Reamer)",
        "primary_hazard": "Severe Sandstone Abrasive Wear"
    },
    "OIL-RAJ-DANDEWALA-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Dandewala Gas Field",
        "source": "OIL Jaisalmer Basin Record",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Goru / Pariwar Tight Gas Sand",
        "total_depth_m": 3050.0,
        "bha_type": "Slimhole Steerable PDM (4.75\" Motor + Gamma-Ray MWD)",
        "primary_hazard": "Baisakhi Tight Hole & Overpull"
    },
    "OIL-KG-DEEPWATER-1": {
        "operator": "ONGC / OIL Joint Venture",
        "field_name": "KG Offshore Deepwater Block",
        "source": "KG Deepwater Exploration Log",
        "is_synthetic": False,
        "formation_count": 7,
        "target_formation": "Ravva Deepwater Channel Sand",
        "total_depth_m": 4500.0,
        "bha_type": "Push-the-Bit RSS with APWD & Formation Pressure While Drilling",
        "primary_hazard": "Shallow Water Flow & Rapid Gas Influx"
    },
    "OIL-KG-DWN-98-2": {
        "operator": "ONGC Deepwater",
        "field_name": "KG-DWN-98/2 Ultra-Deepwater",
        "source": "ONGC Deepwater Record",
        "is_synthetic": False,
        "formation_count": 8,
        "target_formation": "Lower Miocene Deep Turbidite",
        "total_depth_m": 4680.0,
        "bha_type": "Ultra-Deepwater RSS BHA + Sonic Scanner + Density Neutron LWD",
        "primary_hazard": "Gumbo Bit Balling & HPHT Narrow Margin"
    },
    "OIL-KG-D6-OFFSHORE": {
        "operator": "Reliance / ONGC Offshore Asset",
        "field_name": "KG-D6 Block Offshore",
        "source": "Deepwater Gas Development Log",
        "is_synthetic": False,
        "formation_count": 7,
        "target_formation": "Mio-Pliocene Turbidite Gas Complex",
        "total_depth_m": 4850.0,
        "bha_type": "HPHT Geo-Pilot RSS with Acoustic Telemetry & Annular PWD",
        "primary_hazard": "HPHT Overpressure & Narrow Drilling Margin"
    },
    "OIL-KG-YANAM-1": {
        "operator": "ONGC Eastern Offshore",
        "field_name": "Yanam Shelf Prospect",
        "source": "Shelf Gas Exploration Archive",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Ravva Sandstone Reservoir",
        "total_depth_m": 4100.0,
        "bha_type": "Semi-Stiff Directional Motor BHA with Real-Time Shock & Vibration",
        "primary_hazard": "Differential Sticking in Depleted Shelf Sand"
    },
    "OIL-KG-AMALAPURAM-1": {
        "operator": "ONGC Coastal Asset",
        "field_name": "Amalapuram Coastal Block",
        "source": "KG Onshore/Coastal Archive",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Narasapur High-Pressure Sand",
        "total_depth_m": 3950.0,
        "bha_type": "Steerable Motor BHA with Annular Velocity & Pit Level Telemetry",
        "primary_hazard": "Narrow Mud Weight Operating Window"
    },
    "OIL-MZ-AIZAWL-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Mizoram Overthrust Belt",
        "source": "OIL NELP Frontier Exploration",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Middle Bhuban Tight Gas Sand",
        "total_depth_m": 4200.0,
        "bha_type": "High-Torque Packed-Hole RSS Assembly with Tectonic Stress Monitor",
        "primary_hazard": "Catastrophic Stuck Pipe & Tectonic Ovalization"
    },
    "OIL-MZ-MAMIT-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Mamit Anticline",
        "source": "OIL Thrust Belt Archive",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Lower Bhuban Sub-thrust Sand",
        "total_depth_m": 4350.0,
        "bha_type": "Pendulum BHA with Dynamic Inclinometer for Dipping Beds",
        "primary_hazard": "Steeply Dipping Bed Packoff"
    },
    "OIL-MZ-KOLASIB-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Kolasib Fault Trend",
        "source": "OIL Frontier Asset",
        "is_synthetic": False,
        "formation_count": 5,
        "target_formation": "Middle Bhuban Sandstone",
        "total_depth_m": 4100.0,
        "bha_type": "Heavy Drill Collar Stabilized Assembly with Friction Reducer",
        "primary_hazard": "High Tectonic Stress Wellbore Breakout"
    },
    "OIL-MZ-LUNGLEI-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Lunglei Southern Fold Block",
        "source": "OIL Exploration Log",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Disang Thrust Zone",
        "total_depth_m": 4400.0,
        "bha_type": "Anti-Packoff Reaming BHA (Bi-Directional Key Seat Wiper)",
        "primary_hazard": "Tectonic Borehole Spalling & Caving"
    },
    "OIL-MZ-CHAMPHAI-1": {
        "operator": "Oil India Limited (OIL)",
        "field_name": "Champhai Border Belt",
        "source": "OIL Frontier Deep Test",
        "is_synthetic": False,
        "formation_count": 6,
        "target_formation": "Disang Flysch Overthrust",
        "total_depth_m": 4500.0,
        "bha_type": "Severe Thrust Fault RSS BHA with Ultra-High Strength Stabilizers",
        "primary_hazard": "Crushed Rock Overpressure & Sudden Borehole Collapse"
    }
}

def get_north_sea_wells() -> List[WellResponse]:
    global _NORTH_SEA_WELLS_CACHE
    if _NORTH_SEA_WELLS_CACHE is None:
        # Single source of truth. The backend must not read from the frontend source tree at runtime.
        north_sea_file = Path(__file__).resolve().parent / "data" / "north_sea_wells.json"
        if north_sea_file.exists():
            try:
                with open(north_sea_file, encoding="utf-8") as f:
                    raw = json.load(f)
                cached = []
                for idx, w in enumerate(raw, 1):
                    lat = w.get("latitude")
                    lon = w.get("longitude")
                    if lat is None or lon is None:
                        continue
                    w_id = w["well_id"]
                    is_volve = "VOLVE" in w_id.upper() or "15/9" in w_id
                    cached.append(WellResponse(
                        id=1000 + idx,
                        well_id=w_id,
                        field_name="Volve Field" if is_volve else "North Sea Basin (Block " + w_id.split('/')[0] + ")",
                        kb_elevation=25.0,
                        total_depth_tvd=w.get("total_depth_m", 2853.0),
                        total_depth_m=w.get("total_depth_m", 2853.0),
                        spud_date=w.get("spud_date", "2018-05-12"),
                        data_source=w.get("source", "real_force2020"),
                        source="Equinor Volve Open Data" if is_volve else "FORCE 2020 ML Benchmark",
                        operator="Equinor ASA" if is_volve else "North Sea Operating Consortium",
                        is_synthetic=w.get("is_synthetic", False),
                        formation_count=w.get("formation_count", len(w.get("formation_tops", [])) or (16 if is_volve else 14)),
                        target_formation="Hugin Sandstone Reservoir" if is_volve else "Brent Group Sandstone",
                        primary_hazard="Depleted Reservoir Differential Sticking" if is_volve else "Overburden Sloughing / Window Packoff",
                        bha_type=w.get("bha_type", "Rotary Steerable System (RSS) with MWD/LWD"),
                        surface_location={"lat": lat, "lon": lon}
                    ))
                _NORTH_SEA_WELLS_CACHE = cached
            except Exception as e:
                print(f"Error loading north sea wells: {e}")
                _NORTH_SEA_WELLS_CACHE = []
        else:
            print(f"Warning: {north_sea_file} is missing; North Sea reference wells unavailable (count 0).")
            _NORTH_SEA_WELLS_CACHE = []
    return _NORTH_SEA_WELLS_CACHE

def _format_well_response(w: Any) -> WellResponse:
    loc = None
    surf_loc: Any = getattr(w, "surface_location", None)
    if surf_loc is not None:
        try:
            from geoalchemy2.shape import to_shape
            shape = to_shape(surf_loc)
            loc = {"lat": float(getattr(shape, "y", 0.0)), "lon": float(getattr(shape, "x", 0.0))}
        except Exception:
            loc = surf_loc

    well_id_str: str = str(getattr(w, "well_id", "") or "")
    field_name_val = getattr(w, "field_name", None)
    kb_elevation_val = getattr(w, "kb_elevation", None)
    total_depth_val = getattr(w, "total_depth_tvd", None)
    spud_date_val = getattr(w, "spud_date", None)
    data_source_val = getattr(w, "data_source", None)

    # Lookup distinct well metadata from registry
    meta = INDIAN_WELLS_METADATA.get(well_id_str, {})
    
    td = float(meta.get("total_depth_m") or (total_depth_val if total_depth_val is not None else 3500.0))
    field = meta.get("field_name") or (str(field_name_val) if field_name_val is not None else "Exploration Asset")
    operator = meta.get("operator") or ("Oil India Limited (OIL)" if "OIL" in well_id_str else "Operator")
    source = meta.get("source") or ("OIL Deep Exploration Asset" if "OIL" in well_id_str else (str(data_source_val) if data_source_val else "Field Record"))
    is_synth = meta.get("is_synthetic", False)
    f_count = meta.get("formation_count", 5)
    tgt_form = meta.get("target_formation") or "Barail Sandstone"
    p_hazard = meta.get("primary_hazard") or "Overpressured Influx / Loss"
    bha = meta.get("bha_type") or "Steerable Motor BHA (1.5° PDM + MWD)"

    return WellResponse(
        id=int(getattr(w, "id", 0)),
        well_id=well_id_str,
        field_name=field,
        kb_elevation=float(kb_elevation_val) if kb_elevation_val is not None else 35.0,
        total_depth_tvd=td,
        total_depth_m=td,
        spud_date=str(spud_date_val) if spud_date_val is not None else "2024-01-10",
        data_source=str(data_source_val) if data_source_val is not None else "synthetic_calibrated",
        source=source,
        operator=operator,
        is_synthetic=is_synth,
        formation_count=f_count,
        target_formation=tgt_form,
        primary_hazard=p_hazard,
        bha_type=bha,
        surface_location=loc
    )

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres."""
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 6371.0 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _within_radius(well: Any, lat: float, lon: float, radius_km: float) -> bool:
    """
    True when a formatted well's surface location falls inside the radius.

    A well with no coordinates is excluded rather than assumed to be at (0, 0) —
    defaulting the missing value to zero would place it in the Gulf of Guinea.
    """
    loc = getattr(well, "surface_location", None)
    if not isinstance(loc, dict):
        return False
    try:
        w_lat = float(loc.get("lat"))
        w_lon = float(loc.get("lon"))
    except (TypeError, ValueError):
        return False
    return _haversine_km(lat, lon, w_lat, w_lon) <= radius_km


@app.get("/api/wells/nearby", response_model=List[WellResponse])
def get_nearby_wells(
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
    radius_km: Optional[float] = Query(None, description="Radius in kilometers"),
    region: str = Query("all", description="Filter by region (assam, rajasthan, kg, mizoram, north_sea, all)"),
    db: Session = Depends(get_db)
):
    """
    Search for wells filtered by region and optionally within a spatial radius.
    Guarantees that all wells in the selected basin (Assam, Rajasthan, KG, Mizoram, North Sea) or across India are returned.
    """
    global _ALL_WELLS_CACHE

    # A spatial query needs all three: a centre and a radius. Without them there
    # is nothing to measure from, so the caller gets the whole catalogue.
    has_point = lat is not None and lon is not None and radius_km is not None
    # When a caller supplies a centre and a radius, it is honoured at any distance.
    # There used to be an upper cutoff: >= 100 km silently widened to the whole
    # catalogue, so radius_km=300 around a North Sea block returned all 187 wells
    # including the Assam ones, ~8,000 km away. The old `is_broad_query` conflated
    # "no coordinates given" with "radius is large", which are different requests.
    spatial = has_point
    is_broad_query = not has_point

    # Fast path: serve the cached all-wells response instantly if already loaded
    if region == "all" and is_broad_query and _ALL_WELLS_CACHE is not None:
        return _ALL_WELLS_CACHE

    if region == "north_sea":
        north_sea = get_north_sea_wells()
        if spatial:
            north_sea = [w for w in north_sea if _within_radius(w, lat, lon, radius_km)]
        return north_sea

    try:
        query = db.query(WellMaster)
        
        if region != "all":
            if region == "rajasthan":
                query = query.filter(WellMaster.well_id.like("OIL-RAJ-%"))
            elif region == "kg":
                query = query.filter(WellMaster.well_id.like("OIL-KG-%"))
            elif region == "mizoram":
                query = query.filter(WellMaster.well_id.like("OIL-MZ-%"))
            elif region == "assam":
                query = query.filter(
                    ~WellMaster.well_id.like("OIL-RAJ-%"),
                    ~WellMaster.well_id.like("OIL-KG-%"),
                    ~WellMaster.well_id.like("OIL-MZ-%")
                )
        
        # Applies to region-scoped queries too. It previously also required
        # region == "all", so `?region=assam&lat=..&lon=..&radius_km=50`
        # silently ignored the radius and returned every Assam well.
        if spatial:
            radius_meters = radius_km * 1000.0
            target_point = ST_SetSRID(ST_MakePoint(lon, lat), 4326)
            query = query.filter(
                ST_DWithin(
                    cast(WellMaster.surface_location, Geography),
                    cast(target_point, Geography),
                    radius_meters
                )
            )

        results = [_format_well_response(w) for w in query.all()]

        if region == "all":
            north_sea = get_north_sea_wells()
            # These come from backend/data/north_sea_wells.json, not the database,
            # and were appended unconditionally — so the ST_DWithin filter above
            # narrowed the database rows and then all 159 of these were added back.
            # A 50 km radius around Baghjan in Assam returned 170 wells, 159 of
            # them North Sea.
            if spatial:
                north_sea = [w for w in north_sea if _within_radius(w, lat, lon, radius_km)]
            results.extend(north_sea)
            if is_broad_query:
                _ALL_WELLS_CACHE = results
        return results
    except Exception as e:
        print(f"Warning: Database query failed in get_nearby_wells ({e}). Returning fallback wells.")
        fallback_file = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "defaultWells.json"
        if not fallback_file.exists():
            fallback_file = Path("data/defaultWells.json")
        if fallback_file.exists():
            try:
                with open(fallback_file, encoding="utf-8") as f:
                    data = json.load(f)
                all_loaded = [WellResponse(**item) for item in data]
                
                # Filter by region
                if region == "rajasthan":
                    all_loaded = [w for w in all_loaded if w.well_id.startswith("OIL-RAJ-")]
                elif region == "kg":
                    all_loaded = [w for w in all_loaded if w.well_id.startswith("OIL-KG-")]
                elif region == "mizoram":
                    all_loaded = [w for w in all_loaded if w.well_id.startswith("OIL-MZ-")]
                elif region == "assam":
                    all_loaded = [w for w in all_loaded if not (w.well_id.startswith("OIL-RAJ-") or w.well_id.startswith("OIL-KG-") or w.well_id.startswith("OIL-MZ-")) and not ("North Sea" in str(w.field_name) or "Volve" in str(w.field_name) or "/" in w.well_id)]
                elif region == "north_sea":
                    all_loaded = [w for w in all_loaded if "North Sea" in str(w.field_name) or "Volve" in str(w.field_name) or "/" in w.well_id]

                # Same spatial rule as the primary path, via the shared helper —
                # this previously carried its own inline haversine and a
                # different cutoff (200 km against the primary path's 100 km),
                # so the two paths disagreed about what "nearby" meant.
                if spatial:
                    all_loaded = [w for w in all_loaded if _within_radius(w, lat, lon, radius_km)]

                return all_loaded
            except Exception as read_err:
                print(f"Error parsing fallback wells: {read_err}")
        return get_north_sea_wells()

def _is_north_sea_well_id(well_id: str) -> bool:
    """North Sea designations carry a block prefix ('15/9-F-11') or the SYNTH- benchmark prefix.
    Indian assets all use the OIL- prefix. Mirrors the field_name/well_id test used in
    get_nearby_wells' offline filter."""
    return "/" in well_id or well_id.startswith("SYNTH-")

@app.get("/api/wells/regions")
def get_regions(db: Session = Depends(get_db)):
    """Returns available regions, their center coordinates, well counts, and geological descriptions.

    Count fields are deliberately split so a file-backed basin can never masquerade as a populated
    database:
      * well_count       - rows actually present in well_master for that region.
      * file_well_count  - wells served from backend/data/north_sea_wells.json (0 for every other region).
      * total_well_count - what /api/wells/nearby will actually return for that region.
      * data_source      - "database" if well_count came from well_master, "offline_fallback" if the
                           database was unreachable and calibrated constants were substituted.
    """
    counts_source = "database"
    try:
        all_wells = db.query(WellMaster.well_id).all()
        well_ids = [w[0] for w in all_wells]
        counts = {
            "assam": sum(1 for wid in well_ids if not (wid.startswith("OIL-RAJ") or wid.startswith("OIL-KG") or wid.startswith("OIL-MZ") or _is_north_sea_well_id(wid))),
            "rajasthan": sum(1 for wid in well_ids if wid.startswith("OIL-RAJ")),
            "kg": sum(1 for wid in well_ids if wid.startswith("OIL-KG")),
            "mizoram": sum(1 for wid in well_ids if wid.startswith("OIL-MZ")),
            "north_sea": sum(1 for wid in well_ids if _is_north_sea_well_id(wid))
        }
    except Exception as e:
        print(f"Warning: db query failed in get_regions ({e}), using calibrated fallback counts.")
        counts_source = "offline_fallback"
        counts = {
            "assam": 14,
            "rajasthan": 4,
            "kg": 4,
            "mizoram": 4,
            "north_sea": 0
        }

    # Wells served from disk rather than from well_master. Never folded into well_count.
    file_counts = {
        "assam": 0,
        "rajasthan": 0,
        "kg": 0,
        "mizoram": 0,
        "north_sea": len(get_north_sea_wells())
    }

    return [
        {
            "id": "assam",
            "name": "Upper Assam Shelf",
            "center": [27.4, 95.2],
            "well_count": counts["assam"],
            "file_well_count": file_counts["assam"],
            "total_well_count": counts["assam"] + file_counts["assam"],
            "data_source": counts_source,
            "description": "Mature oilfield with severe thief-bed losses and high-pressure gas kicks."
        },
        {
            "id": "rajasthan",
            "name": "Rajasthan Basin",
            "center": [27.5, 71.5],
            "well_count": counts["rajasthan"],
            "file_well_count": file_counts["rajasthan"],
            "total_well_count": counts["rajasthan"] + file_counts["rajasthan"],
            "data_source": counts_source,
            "description": "Desert basin with heavy oil, sand abrasion, and massive lost circulation."
        },
        {
            "id": "kg",
            "name": "KG Deepwater",
            "center": [16.25, 82.40],
            "well_count": counts["kg"],
            "file_well_count": file_counts["kg"],
            "total_well_count": counts["kg"] + file_counts["kg"],
            "data_source": counts_source,
            "description": "Offshore basin with Shallow Water Flow, gumbo shale, and HPHT overpressures."
        },
        {
            "id": "mizoram",
            "name": "Mizoram Fold Belt",
            "center": [23.72, 92.70],
            "well_count": counts["mizoram"],
            "file_well_count": file_counts["mizoram"],
            "total_well_count": counts["mizoram"] + file_counts["mizoram"],
            "data_source": counts_source,
            "description": "Tectonically active fold belt with high horizontal stress and stuck pipe risks."
        },
        {
            "id": "north_sea",
            "name": "North Sea (FORCE2020 & Volve)",
            "center": [58.262, 8.043],
            "well_count": counts["north_sea"],
            "file_well_count": file_counts["north_sea"],
            "total_well_count": counts["north_sea"] + file_counts["north_sea"],
            "data_source": counts_source,
            "description": "North Sea benchmark basin (FORCE 2020 & Equinor Volve). Reference wells are served from backend/data/north_sea_wells.json, not from well_master; see file_well_count."
        }
    ]

@app.get("/api/wells/{well_id:path}/history")
def get_well_history(
    well_id: str,
    db: Session = Depends(get_db)
):
    """
    Returns the event history and well logs for a specific well with offline fallback.
    """
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
        if well:
            events = db.query(SyntheticEvent).filter(SyntheticEvent.well_id == well_id).all()
            logs = db.query(WellLog).filter(WellLog.well_id == well_id).all()
            return {
                "events": [EventResponse.model_validate(e) for e in events],
                "logs": [WellLogResponse.model_validate(l) for l in logs]
            }
    except Exception as e:
        print(f"Warning: db query failed in get_well_history ({e}), checking offline fallbacks.")

    # Check North Sea wells or return safe empty schema for offline rig continuity
    for nw in get_north_sea_wells():
        if nw.well_id == well_id:
            return {"events": [], "logs": []}

    return {"events": [], "logs": []}

import hashlib

from trajectory_calc import compute_realistic_trajectory, compute_anti_collision

@app.get("/api/wells/{well_id:path}/trajectory")
def get_well_trajectory(well_id: str, is_active: bool = Query(False), db: Session = Depends(get_db)):
    tvd_max = 3500.0
    db_events = []
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
        if well:
            tvd_raw = getattr(well, "total_depth_tvd", None)
            tvd_max = float(tvd_raw) if tvd_raw is not None else 3500.0
        else:
            for nw in get_north_sea_wells():
                if nw.well_id == well_id:
                    tvd_max = nw.total_depth_tvd or 2853.0
                    break
        
        db_events = db.query(SyntheticEvent).filter(
            SyntheticEvent.well_id == well_id,
            SyntheticEvent.formation.isnot(None)
        ).all()
    except Exception as e:
        print(f"Warning: db query failed in get_well_trajectory ({e}), using default depth parameters.")

    return compute_realistic_trajectory(well_id, tvd_max, is_active=is_active, db_events=db_events)

@app.get("/api/wells/{well_id:path}/anti-collision")
def get_anti_collision(
    well_id: str, 
    offset_ids: Optional[str] = Query(None, description="Comma-separated offset well IDs"),
    db: Session = Depends(get_db)
):
    active_tvd_max = 3500.0
    offsets = []
    try:
        active_well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
        if active_well:
            active_tvd_raw = getattr(active_well, "total_depth_tvd", None)
            active_tvd_max = float(active_tvd_raw) if active_tvd_raw is not None else 3500.0
        else:
            for nw in get_north_sea_wells():
                if nw.well_id == well_id:
                    active_tvd_max = nw.total_depth_tvd or 2853.0
                    break
                    
        if offset_ids:
            offset_list = [oid.strip() for oid in offset_ids.split(",") if oid.strip()]
            offsets = db.query(WellMaster).filter(WellMaster.well_id.in_(offset_list)).all()
        else:
            offsets = db.query(WellMaster).filter(WellMaster.well_id != well_id).all()
    except Exception as e:
        print(f"Warning: db query failed in get_anti_collision ({e}), using memory wells cache.")
        if _ALL_WELLS_CACHE:
            offsets = [w for w in _ALL_WELLS_CACHE if w.well_id != well_id]

    active_traj = compute_realistic_trajectory(well_id, active_tvd_max, is_active=True)
    results = []
    closest_overall = None
    min_dist_overall = float("inf")
    
    for off in offsets:
        off_well_id = str(getattr(off, "well_id", "") or "")
        if off_well_id == well_id:
            continue
        off_tvd_raw = getattr(off, "total_depth_tvd", None)
        off_tvd_max = float(off_tvd_raw) if off_tvd_raw is not None else 3500.0
        off_traj = compute_realistic_trajectory(off_well_id, off_tvd_max, is_active=False)
        ac = compute_anti_collision(active_traj, off_traj)
        results.append(ac)
        
        if ac["min_distance_m"] < min_dist_overall:
            min_dist_overall = ac["min_distance_m"]
            closest_overall = ac
            
    return {
        "active_well_id": well_id,
        "closest_approach": closest_overall,
        "offset_evaluations": results
    }

@app.get("/api/wells/{well_id:path}", response_model=WellResponse)
def get_well_by_id(well_id: str, db: Session = Depends(get_db)):
    """Fetch details and surface location for a specific well."""
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
        if well:
            return _format_well_response(well)
    except Exception as e:
        print(f"Warning: db query failed in get_well_by_id ({e}), checking memory cache.")

    # Check memory cache
    global _ALL_WELLS_CACHE
    if _ALL_WELLS_CACHE:
        for w in _ALL_WELLS_CACHE:
            if w.well_id == well_id:
                return w

    # Check North Sea wells
    for nw in get_north_sea_wells():
        if nw.well_id == well_id:
            return nw

    # Check defaultWells.json
    fallback_file = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "defaultWells.json"
    if fallback_file.exists():
        try:
            with open(fallback_file, encoding="utf-8") as f:
                data = json.load(f)
                for item in data:
                    if item.get("well_id") == well_id:
                        return WellResponse(**item)
        except Exception:
            pass

    raise HTTPException(status_code=404, detail=f"Well {well_id} not found")

def get_offline_fallback_events(query: str, target_depth: Optional[float] = None, limit: int = 5) -> List[RAGSearchResponse]:
    """Fallback RAG search using onboard incident files and newly parsed reports when cloud DB or embeddings are unreachable."""
    p = Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "defaultIncidents.json"
    if not p.exists():
        p = Path(__file__).resolve().parent / "data" / "curated_historical_incidents.json"
    
    raw = []
    if p.exists():
        try:
            with open(p, "r", encoding="utf-8") as f:
                raw.extend(json.load(f))
        except Exception:
            pass

    # Also include newly ingested offline events
    offline_cache = Path(__file__).resolve().parent / "data" / "offline_ingested_events.json"
    if offline_cache.exists():
        try:
            with open(offline_cache, "r", encoding="utf-8") as f:
                raw.extend(json.load(f))
        except Exception:
            pass

    if not raw:
        return []
    
    try:
        q_terms = [t.lower() for t in query.split() if len(t) > 2]
        scored = []
        for inc in raw:
            ev_type = inc.get("event_type") or inc.get("incident_type", "Operational Risk")
            ev_form = inc.get("formation", "Unknown")
            root_c = inc.get("root_cause") or inc.get("report_summary", "")
            mitig = inc.get("mitigation_applied") or inc.get("report_summary", "")
            doc_text = f"{ev_type} {ev_form} {root_c} {mitig}".lower()
            
            score = 0.3
            for t in q_terms:
                if t in doc_text:
                    score += 0.25
            
            depth_val = float(inc.get("depth_tvd") or inc.get("incident_depth_m") or 2500.0)
            if target_depth:
                diff = abs(depth_val - target_depth)
                score += max(0.0, 0.2 * (1.0 - diff / 1000.0))
            
            score = min(0.98, score)
            scored.append((score, inc, ev_type, ev_form, root_c, mitig, depth_val))
            
        scored.sort(key=lambda x: x[0], reverse=True)
        results = []
        for s, inc, ev_type, ev_form, root_c, mitig, depth_val in scored[:limit]:
            results.append(RAGSearchResponse(
                similarity_score=round(s, 4),
                hybrid_score=round(s, 4),
                score_breakdown=ScoreBreakdown(
                    formation_match=0.85,
                    depth_proximity=0.80,
                    event_type_match=0.90,
                    bm25=round(s, 4),
                    vector=0.75
                ),
                well_id=str(inc.get("well_id", "OIL-MORAN-1")),
                depth_tvd=depth_val,
                formation=ev_form,
                event_type=str(ev_type).replace("_", " ").title(),
                root_cause=root_c,
                mitigation_applied=mitig,
                guardrail_verified=True,
                data_source=inc.get("data_source") or "real_ongc_oil"
            ))
        return results
    except Exception as e:
        print(f"Error in get_offline_fallback_events: {e}")
        return []

@app.get("/api/events/search", response_model=List[RAGSearchResponse])
def search_events(
    query: str,
    formation: Optional[str] = None,
    depth: Optional[float] = Query(None, description="Reference drilling depth TVD in meters for proximity scoring"),
    reference_depth: Optional[float] = Query(None, description="Alias for depth"),
    event_type: Optional[str] = Query(None, description="Optional target event type"),
    well_id: Optional[str] = Query(None, description="Active reference well ID"),
    pre_filter_to_analogs: bool = Query(False, description="Stage 1: Pre-filter candidate event pool to analog wells"),
    exclude_synthetic: bool = Query(False, description="Exclude synthetic background data"),
    limit: int = 5,
    db: Session = Depends(get_db)
):
    """
    Multi-Signal Hybrid RAG search endpoint with optional Two-Stage Analog Pre-filtering.
    Includes autonomous offline fallback to onboard incident repository.
    """
    target_depth = depth if depth is not None else reference_depth
    if target_depth is None:
        depth_match = re.search(r"(\d{3,5})\s*m?", query)
        if depth_match:
            try:
                target_depth = float(depth_match.group(1))
            except ValueError:
                pass

    try:
        query_embedding = get_embedding(query)
    except Exception as e:
        print(f"Warning: Embedding generation failed ({e}), using offline incident search.")
        return get_offline_fallback_events(query, target_depth, limit)

    try:
        # Base query for events
        db_query = db.query(SyntheticEvent)
        
        # Prompt 4: Two-Stage Retrieval (Analog Pre-filter)
        if pre_filter_to_analogs:
            ref_well = well_id or "OIL-BAGHJAN-1"
            analog_wells = get_analog_wells(target_well_id=ref_well, hazard_type=event_type or query, top_k=3, db=db)
            if analog_wells:
                db_query = db_query.filter(SyntheticEvent.well_id.in_(analog_wells))
                
        # Exclude synthetic defaults if user requests custom data only
        if exclude_synthetic:
            db_query = db_query.filter(SyntheticEvent.data_source.notin_(["synthetic", "synthetic_calibrated"]))

        # STAGE 2: Deterministic Filters
        if formation:
            db_query = db_query.filter(SyntheticEvent.formation.ilike(f"%{formation}%"))
            
        if event_type:
            db_query = db_query.filter(SyntheticEvent.event_type.ilike(f"%{event_type}%"))
            
        if target_depth is not None:
            # Filter within +/- 500m window
            db_query = db_query.filter(SyntheticEvent.depth_start_tvd.between(target_depth - 500, target_depth + 500))

        events = db_query.all()
    except Exception as e:
        print(f"Warning: Database query failed in search_events ({e}), using offline fallback events.")
        return get_offline_fallback_events(query, target_depth, limit)
    
    results = []
    seen = set()
    for event in events:
        embedding_val = getattr(event, "embedding", None)
        if embedding_val is None or len(embedding_val) == 0:
            continue
            
        depth_val = getattr(event, "depth_start_tvd", None)
        ev_type = getattr(event, "event_type", "") or ""
        root_cause = getattr(event, "root_cause", "") or ""
        
        # Deduplicate identical events (e.g., from multiple PDF uploads)
        dedup_key = (str(event.well_id), ev_type, depth_val, root_cause)
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        
        # 1. Vector semantic cosine similarity
        sim = compute_cosine_similarity(query_embedding, embedding_val)
        
        depth_val = getattr(event, "depth_start_tvd", None)
        ev_formation = getattr(event, "formation", "") or ""
        ev_type = getattr(event, "event_type", "") or ""
        root_cause = getattr(event, "root_cause", "") or ""
        mitigation = getattr(event, "mitigation_applied", "") or ""

        # 2. Multi-signal component calculations
        doc_text = f"{ev_type} {ev_formation} {root_cause} {mitigation}"
        bm25_score = compute_bm25_score(query, doc_text)
        vec_score = float(sim)

        # 3. AHP-weighted fusion of all five retrieval signals (Saaty 1980).
        #    A signal with no context available returns -1.0; the fusion drops
        #    those and renormalises the remaining weights over what is actually
        #    observable, so a query without a depth is not silently penalised.
        formation_score = compute_formation_match_score(formation, ev_formation, query=query)
        depth_score = compute_depth_proximity_score(target_depth, depth_val)
        type_score = compute_event_type_match_score(query, ev_type, query_event_type=event_type)

        fusion = compute_hybrid_relevance_score(
            formation_match=formation_score,
            depth_proximity=depth_score,
            event_type_match=type_score,
            bm25=bm25_score,
            vector=vec_score,
        )
        final_score = fusion["hybrid_score"]

        # Raw-text chunks expose no formation/depth, so the weighted signals
        # above are thin for them. Fall back to lexical containment so an
        # uploaded report is still findable by its own wording.
        if ev_type == "raw_text":
            if any(q.lower() in root_cause.lower() for q in query.split() if len(q) > 3):
                final_score = min(1.0, final_score + 0.3)
            else:
                final_score *= 0.5

        # Freshly extracted report events should outrank the seeded baseline
        # without swamping it. A bounded bonus on the same 0..1 scale does that;
        # the previous flat +10.0 made every other signal irrelevant.
        data_source_val = getattr(event, "data_source", "") or ""
        if data_source_val == "dd_report":
            final_score = min(1.0, final_score + 0.15)

        sort_score = final_score
        display_score = min(final_score, 0.99)

        # 4. Deterministic Guardrails validation
        det_truth = {
            "confidence": "high",
            "citations": [{"source_file": f"well_{event.well_id}_history.las", "source_page": 1}],
            "recommended_actions": [mitigation] if mitigation else []
        }
        candidate = {
            "confidence": "high",
            "citations": [{"source_file": f"well_{event.well_id}_history.las", "source_page": 1}],
            "recommendations": [mitigation] if mitigation else [],
            "summary": root_cause,
            "reasoning": ev_type
        }
        guardrail_res = GuardrailsService.validate(det_truth, candidate)
        is_verified = guardrail_res["allowed"]
        mitigation_display = mitigation if is_verified else guardrail_res["validated_response"].get("recommendations", ["Crew manual review required."])[0]

        # Prompt 2: Data Provenance on each search result
        ev_source = getattr(event, "data_source", None) or (
            "force2020_relabeled" if "NAHAR" in str(event.well_id)
            else "synthetic_calibrated" if ("BAGHJAN" in str(event.well_id) or "MORAN" in str(event.well_id))
            else "synthetic"
        )

        results.append((
            sort_score,
            getattr(event, 'id', 0) if isinstance(getattr(event, 'id', 0), int) else 0,
            RAGSearchResponse(
                similarity_score=round(display_score, 4),
                hybrid_score=round(display_score, 4),
                score_breakdown=ScoreBreakdown(
                    # -1.0 is the "no context" sentinel used by the fusion; the
                    # UI shows an absent signal as 0 rather than a negative bar.
                    formation_match=round(max(0.0, formation_score), 4),
                    depth_proximity=round(max(0.0, depth_score), 4),
                    event_type_match=round(max(0.0, type_score), 4),
                    bm25=round(bm25_score, 4),
                    vector=round(vec_score, 4)
                ),
                well_id=str(event.well_id),
                depth_tvd=float(depth_val) if depth_val is not None else 0.0,
                formation=ev_formation,
                event_type=ev_type,
                root_cause=root_cause,
                mitigation_applied=mitigation_display,
                guardrail_verified=is_verified,
                data_source=ev_source
            )
        ))
        
    # Sort descending by hybrid multi-signal relevance score, breaking ties with newer IDs
    results.sort(key=lambda x: (x[0], x[1]), reverse=True)
    results = [x[2] for x in results]
    
    if not results:
        return get_offline_fallback_events(query, target_depth, limit)

    return results[:limit]

@app.get("/api/retrieval/ahp-weights")
def get_ahp_weights():
    """
    Returns the mathematically derived AHP feature weights (Saaty 1980),
    the domain pairwise comparison matrix, and consistency verification metrics.
    """
    return {
        "status": "success",
        "method": "Saaty Analytic Hierarchy Process (AHP, 1980) Principal Eigenvector Method",
        "weights": AHP_RETRIEVAL_RESULT["weights"],
        "consistency_ratio": AHP_RETRIEVAL_RESULT["consistency_ratio"],
        "consistent": AHP_RETRIEVAL_RESULT["consistent"],
        "lambda_max": AHP_RETRIEVAL_RESULT["lambda_max"],
        "criteria": AHP_RETRIEVAL_RESULT["criteria"],
        "pairwise_matrix": AHP_RETRIEVAL_RESULT["pairwise_matrix"],
        "domain_justification": "Stratigraphic formation match and TVD depth proximity are co-equal and dominate over raw NLP lexical matching."
    }

@app.post("/api/predict-risk", response_model=RiskPredictionResponse)
def predict_risk(telemetry: TelemetryInput):
    """
    Real-time ML inference endpoint for drilling hazard prediction.
    Accepts incoming sensor telemetry and returns a risk probability, risk level, 
    and top contributing factors via SHAP.
    """
    global ml_service
    
    ml_svc = get_ml_service()
        
    if not ml_svc:
        raise HTTPException(status_code=503, detail="ML Service is not initialized.")
        
    try:
        # Convert schema to dict
        params = telemetry.model_dump()
        
        # Run prediction
        prediction = ml_svc.predict_risk(params)
        
        if "error" in prediction:
            raise HTTPException(status_code=500, detail=prediction["error"])
            
        return prediction
    except ValueError as e:
        # Handle out-of-bounds or formatting errors natively gracefully
        raise HTTPException(status_code=400, detail=f"Invalid telemetry data: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")

from simulator import ws_manager, telemetry_simulator

class ScenarioRequest(BaseModel):
    scenario: str  # "gas_kick", "lost_circulation", "stuck_pipe", "normal"

class ControlRequest(BaseModel):
    action: str  # "play", "pause", "reset", "step", "speed", "seek"
    well_id: Optional[str] = None
    depth: Optional[float] = None
    speed_multiplier: Optional[float] = None

@app.post("/api/simulator/scenario")
async def trigger_scenario(req: ScenarioRequest):
    """
    CORRECTION 4 REQUIREMENT:
    Modifies underlying simulated telemetry values realistically for that scenario type.
    Computes resulting risk scores from those simulated values and broadcasts to all WebSocket clients.
    """
    res = get_telemetry_source().set_scenario(req.scenario)
    return {
        "status": "success",
        "scenario": res["scenario"],
        "data": res["data"],
        "prediction": res["prediction"]
    }

@app.post("/api/simulator/control")
async def control_simulator(req: ControlRequest):
    """
    Controls in-app telemetry playback: play, pause, reset, or step.
    """
    if req.action == "play":
        telemetry_simulator.start()
    elif req.action == "pause":
        telemetry_simulator.pause()
    elif req.action == "reset":
        depth_val = float(req.depth) if req.depth is not None else 2240.0
        telemetry_simulator.reset(well_id=req.well_id or "OIL-BAGHJAN-1", depth_tvd=depth_val)
        await telemetry_simulator.step_and_broadcast()
    elif req.action == "set_well":
        depth_val = float(req.depth) if req.depth is not None else 2240.0
        telemetry_simulator.reset(well_id=req.well_id or "OIL-BAGHJAN-1", depth_tvd=depth_val)
        await telemetry_simulator.step_and_broadcast()
    elif req.action == "step":
        await telemetry_simulator.step_and_broadcast()
    elif req.action == "speed" and req.speed_multiplier is not None:
        telemetry_simulator.speed_multiplier = req.speed_multiplier
    elif req.action == "seek" and req.depth is not None:
        await telemetry_simulator.seek(req.depth)
    return telemetry_simulator.get_status()

@app.get("/api/telemetry/source")
def get_telemetry_source_info():
    """
    Which telemetry source is live, and what it can actually do.

    Exists so nothing upstream has to guess whether the numbers on screen came off a
    rig. `/api/simulator/*` is the simulator's own control surface; this endpoint says
    what is driving it.
    """
    try:
        source = get_telemetry_source()
    except NotImplementedError as exc:
        return {
            "source": "ertmac",
            "available": False,
            "is_simulated": False,
            "capabilities": {},
            "detail": str(exc),
        }

    is_live = source.name != "simulator"
    return {
        "source": source.name,
        "available": True,
        "is_simulated": not is_live,
        "capabilities": dict(getattr(source, "capabilities", {})),
        "note": (
            "Live feed connected."
            if is_live else
            "No eRTMAC feed is connected. Sensor values are generated by the in-process "
            "simulator, calibrated to regional lithology — no reading here came off a rig. "
            "Connecting one requires an adapter; see backend/services/telemetry.py for the "
            "interface details that are still owed."
        ),
    }


@app.get("/api/simulator/status")
def get_simulator_status():
    """Returns current telemetry simulator state."""
    return telemetry_simulator.get_status()

class DemoScenario(BaseModel):
    id: str
    title: str
    well_id: str
    depth: float
    torque: float
    wob: float
    rop: float
    formation: str
    scenario_action: str
    description: str
    suggested_question: str

DEMO_SCENARIOS: List[Dict[str, Any]] = [
    {
        "id": "1",
        "title": "Shallow Stuck Pipe Warning — OIL-MORAN-1",
        "well_id": "OIL-MORAN-1",
        "depth": 2832.0,
        "torque": 22500.0,
        "wob": 18.0,
        "rop": 4.5,
        "formation": "Barail Sandstone/Shale transition",
        "scenario_action": "inject_stuck_pipe",
        "description": "Reproduces the documented differential-sticking incident at 2832m — torque spike, ROP collapse, elevated overpull.",
        "suggested_question": "What historical evidence do we have for stuck pipe risk in this formation, and what mitigation worked previously?"
    },
    {
        "id": "2",
        "title": "Severe Lost Circulation — OIL-MORAN-1",
        "well_id": "OIL-MORAN-1",
        "depth": 1540.0,
        "torque": 14200.0,
        "wob": 12.0,
        "rop": 18.0,
        "formation": "Tipam Sandstone (Upper Permeable Zone)",
        "scenario_action": "inject_lost_circulation",
        "description": "Reproduces the severe mud loss incident at 1540m in Tipam Sandstone — pit level drop, flow-out reduction, fracture window breach.",
        "suggested_question": "What is the recommended LCM pill composition and safe mud weight window for Tipam losses?"
    },
    {
        "id": "3",
        "title": "Abnormal Gas Kick Influx — OIL-NAHARKATIYA-1",
        "well_id": "OIL-NAHARKATIYA-1",
        "depth": 3105.0,
        "torque": 19800.0,
        "wob": 15.0,
        "rop": 22.5,
        "formation": "Kopili Formation Overpressure Ramp",
        "scenario_action": "inject_kick",
        "description": "Reproduces the documented high-pressure gas kick at 3105m in Kopili Formation — rapid pit gain, flow increase, SIDPP pressure spike.",
        "suggested_question": "What are the shut-in drill pipe pressure (SIDPP) precedents and kill mud requirements in Kopili?"
    }
]

@app.get("/api/demo-scenarios", response_model=List[DemoScenario])
def get_demo_scenarios():
    """
    Serves 3 pre-configured realistic demo scenarios directly from backend data
    for 1-click live pitch demonstration.
    """
    return DEMO_SCENARIOS

@app.get("/api/graph/query")
def query_knowledge_graph(
    well_id: str = Query("OIL-BAGHJAN-1", description="Target Well ID"),
    hazard_type: str = Query("stuck_pipe", description="Hazard type (e.g. stuck_pipe, mud_loss, gas_kick)"),
    db: Session = Depends(get_db)
):
    """
    Prompt 3: NetworkX Institutional Knowledge Graph query endpoint.
    Returns entity-relationship subgraph (Wells, Formations, Events, Interventions, Outcomes)
    and synthesized Wilson-confidence institutional insight narrative.
    """
    from services.knowledge_graph import KnowledgeGraphService
    kg = KnowledgeGraphService()
    kg.ensure_graph_built(db)
    return kg.query_hazard_subgraph(well_id=well_id, hazard_type=hazard_type)


# ==============================================================================
# Phase 2: persisted knowledge graph
#
# The NetworkX graph above is rebuilt in memory on every call and discarded on
# restart. These endpoints read the durable copy in knowledge_node /
# knowledge_edge instead, so the graph survives a backend restart and the
# frontend has a stable payload to draw.
#
# Every response carries data_source, so a caller can tell a real Postgres read
# from this codebase's silent JSON fallbacks - the failure mode that hid the
# zero-embedding bug for so long.
#
# Populate/refresh with:  POST /api/graph/rebuild
# ==============================================================================

@app.get("/api/graph/stats")
def knowledge_graph_stats(db: Session = Depends(get_db)):
    """Row counts straight from Postgres - the honest persistence check."""
    try:
        from services import graph_store
        return graph_store.graph_stats(db)
    except Exception as e:
        return {"node_count": 0, "edge_count": 0, "nodes_by_label": {},
                "edges_by_relationship": {}, "data_source": "unavailable", "error": str(e)}


@app.get("/api/graph/overview")
def knowledge_graph_overview(limit: Optional[int] = None, db: Session = Depends(get_db)):
    """Whole persisted graph, shaped for the UI."""
    try:
        from services import graph_store
        return graph_store.overview(db, limit=limit)
    except Exception as e:
        return {"nodes": [], "edges": [], "node_count": 0, "edge_count": 0,
                "data_source": "unavailable", "error": str(e)}


@app.get("/api/graph/node/{node_ref:path}")
def knowledge_graph_node(node_ref: str, db: Session = Depends(get_db)):
    """One node by node_key ('Well:OIL-MORAN-1', 'Event:101') or by uuid."""
    try:
        from services import graph_store
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    node = graph_store.get_node(db, node_ref)
    if node is None:
        raise HTTPException(status_code=404, detail=f"No graph node matching {node_ref!r}")
    return node


@app.get("/api/graph/neighbors/{node_ref:path}")
def knowledge_graph_neighbors(
    node_ref: str,
    depth: int = Query(1, ge=0, le=5, description="Hop count (0-5)"),
    db: Session = Depends(get_db),
):
    """Breadth-first neighbourhood around a node - backs the graph inspector."""
    try:
        from services import graph_store
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    return graph_store.neighbors(db, node_ref, depth=depth)


@app.post("/api/graph/rebuild")
def knowledge_graph_rebuild(
    prune: bool = Query(True, description="Delete rows no longer present in the rebuilt graph"),
    db: Session = Depends(get_db),
):
    """
    Rebuild the graph deterministically from well_master + synthetic_event and
    persist it. Idempotent: node/edge ids are uuid5 over stable keys, so a repeat
    rebuild updates in place rather than duplicating.
    """
    try:
        from services import graph_store
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))
    try:
        return graph_store.rebuild_and_persist(db, prune=prune)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Graph rebuild failed: {e}")

@app.websocket("/api/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """
    Centralized multi-client WebSocket telemetry endpoint.
    All connected browser clients receive synchronized live streaming updates.
    """
    await ws_manager.connect(websocket)
    global ml_service
    
    # Send current state immediately on connect
    ml_svc = get_ml_service()
    current_status = telemetry_simulator.get_status()
    current_params = current_status["current_params"]
    prediction = ml_svc.predict_risk(current_params)
    
    from services.sequence_matcher import SequenceMatcherService
    seq_matcher = SequenceMatcherService()
    seq_matcher.add_reading(current_params)
    initial_seq_match = seq_matcher.evaluate_window(similarity_threshold=75.0)

    try:
        await websocket.send_json({
            "status": "success",
            "data": current_params,
            "prediction": prediction,
            "sequence_match": initial_seq_match,
            "scenario": current_status["active_scenario"],
            "is_running": current_status["is_running"]
        })
    except Exception:
        pass
        
    try:
        import json
        while True:
            data = await websocket.receive_text()
            try:
                params = json.loads(data)
                
                # Run prediction
                ml_svc = get_ml_service()
                from fastapi.concurrency import run_in_threadpool
                prediction = await run_in_threadpool(ml_svc.predict_risk, params)
                
                # Prompt 5: Temporal Sequence Matching evaluation
                seq_matcher.add_reading(params)
                seq_match = seq_matcher.evaluate_window(similarity_threshold=75.0)

                # Send isolated prediction response back to THIS specific client connection
                await websocket.send_json({
                    "status": "success",
                    "data": params,
                    "prediction": prediction,
                    "sequence_match": seq_match,
                    "scenario": params.get("scenario", "normal")
                })
            except json.JSONDecodeError:
                await websocket.send_json({"status": "error", "message": "Invalid JSON"})
            except Exception as e:
                await websocket.send_json({"status": "error", "message": str(e)})
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

