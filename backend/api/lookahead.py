from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import math
import numpy as np
from geoalchemy2.shape import to_shape

from database import get_db
from models import WellMaster, SyntheticEvent, DrillingParam
from ml.service import HazardPredictionService

router = APIRouter()

# Field & Well-specific formation top specifications for the Upper Assam Shelf Basin
WELL_FORMATION_HORIZONS: Dict[str, List[Dict[str, Any]]] = {
    "OIL-BAGHJAN-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1200.0, "color": "#BBBBBB", "lithology": "Permeable Sandstone / Freshwater Aquifer", "primary_risk": "Seepage & Differential Sticking"},
        {"name": "Barail Formation", "tvd_top": 2400.0, "color": "#9A9A9A", "lithology": "Overpressured Sandstone-Shale Sequence", "primary_risk": "Gas Kick & Severe Lost Circulation"},
        {"name": "Kopili Formation", "tvd_top": 2950.0, "color": "#808080", "lithology": "Deep Marine Fissile Shale", "primary_risk": "Shale Swelling & Tight Hole / Packoff"}
    ],
    "OIL-BAGHJAN-4": [
        {"name": "Tipam Sandstone", "tvd_top": 1215.0, "color": "#BBBBBB", "lithology": "Permeable Sandstone / Freshwater Aquifer", "primary_risk": "Differential Sticking"},
        {"name": "Barail Formation", "tvd_top": 2420.0, "color": "#9A9A9A", "lithology": "Overpressured Gas Sandstone & Coal Sequence", "primary_risk": "Gas Kick & Severe Lost Circulation"},
        {"name": "Kopili Formation", "tvd_top": 2965.0, "color": "#808080", "lithology": "Deep Marine Fissile Shale", "primary_risk": "Packoff & Tight Pull"}
    ],
    "OIL-NAHARKATIYA-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1050.0, "color": "#BBBBBB", "lithology": "Permeable Coarse Sandstone", "primary_risk": "Differential Sticking"},
        {"name": "Barail Formation", "tvd_top": 2040.0, "color": "#9A9A9A", "lithology": "Sand-Shale Alternations with Coal Streaks", "primary_risk": "Gas Kick & Wellbore Instability"},
        {"name": "Kopili Formation", "tvd_top": 2820.0, "color": "#808080", "lithology": "Fissile Splintery Shales", "primary_risk": "Severe Lost Circulation & Packoff"}
    ],
    "OIL-MORAN-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1420.0, "color": "#BBBBBB", "lithology": "Massive Bedded Sandstone", "primary_risk": "Loss of Circulation"},
        {"name": "Barail Formation", "tvd_top": 2580.0, "color": "#9A9A9A", "lithology": "Interbedded Sandstones & Carbonaceous Shale", "primary_risk": "High Pore Pressure Kick & Tight Hole"},
        {"name": "Kopili Formation", "tvd_top": 3080.0, "color": "#808080", "lithology": "Dense Overpressured Marine Shale", "primary_risk": "Differential & Mechanical Sticking"}
    ],
    "OIL-DIKOM-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1160.0, "color": "#BBBBBB", "lithology": "Channel Sandstone with Siltstones", "primary_risk": "Mud Loss & Seepage"},
        {"name": "Barail Formation", "tvd_top": 2240.0, "color": "#9A9A9A", "lithology": "Oligocene Sandstone Reservoirs", "primary_risk": "Kick & Fluid Breakout"},
        {"name": "Kopili Formation", "tvd_top": 2620.0, "color": "#808080", "lithology": "Calcareous Shale and Siltstone", "primary_risk": "Lost Circulation"}
    ],
    "OIL-TENGAKHAT-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1100.0, "color": "#BBBBBB", "lithology": "Sub-surface Aquifer Sand", "primary_risk": "Differential Sticking"},
        {"name": "Barail Formation", "tvd_top": 2120.0, "color": "#9A9A9A", "lithology": "Barail Main Sand Interval", "primary_risk": "Gas Influx"},
        {"name": "Kopili Formation", "tvd_top": 2780.0, "color": "#808080", "lithology": "Swelling & Sloughing Shale", "primary_risk": "Tight Pull & Packoff"}
    ],
    "OIL-KOTHALONI-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1250.0, "color": "#BBBBBB", "lithology": "Fluvial Sandstone", "primary_risk": "Filtrate Loss"},
        {"name": "Barail Formation", "tvd_top": 2320.0, "color": "#9A9A9A", "lithology": "Argillaceous Sandstone", "primary_risk": "Shale Instability & Kick"},
        {"name": "Kopili Formation", "tvd_top": 2720.0, "color": "#808080", "lithology": "Fissile Shale", "primary_risk": "Pipe Sticking"}
    ],
    "OIL-HAPJAN-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1280.0, "color": "#BBBBBB", "lithology": "Massive Aquifer Sands", "primary_risk": "Seepage Loss"},
        {"name": "Barail Formation", "tvd_top": 2360.0, "color": "#9A9A9A", "lithology": "Barail Coal-Shale Sequence", "primary_risk": "Gas Kick & Overpressure"},
        {"name": "Kopili Formation", "tvd_top": 2890.0, "color": "#808080", "lithology": "Marine Mudstone", "primary_risk": "Wellbore Cavings"}
    ],
    "OIL-SHALMARI-1": [
        {"name": "Tipam Sandstone", "tvd_top": 1140.0, "color": "#BBBBBB", "lithology": "Coarse Grained Sand", "primary_risk": "Differential Sticking"},
        {"name": "Barail Formation", "tvd_top": 2210.0, "color": "#9A9A9A", "lithology": "Laminated Sand-Shale", "primary_risk": "Lost Circulation"},
        {"name": "Kopili Formation", "tvd_top": 2690.0, "color": "#808080", "lithology": "Compact Shale", "primary_risk": "Tight Hole"}
    ],
}

DEFAULT_HORIZONS: List[Dict[str, Any]] = [
    {"name": "Tipam Sandstone", "tvd_top": 1200.0, "color": "#BBBBBB", "lithology": "Permeable Sandstone / Aquifer", "primary_risk": "Differential Sticking"},
    {"name": "Barail Formation", "tvd_top": 2400.0, "color": "#9A9A9A", "lithology": "Overpressured Sandstone-Shale", "primary_risk": "Gas Kick & Lost Circulation"},
    {"name": "Kopili Formation", "tvd_top": 2950.0, "color": "#808080", "lithology": "Deep Marine Fissile Shale", "primary_risk": "Shale Swelling & Packoff"}
]

RAJASTHAN_HORIZONS: List[Dict[str, Any]] = [
    {"name": "Pariwar Formation", "tvd_top": 1200.0, "color": "#D7D7D7", "lithology": "Abrasive Sandstone", "primary_risk": "Sand Abrasion & Bit Wear"},
    {"name": "Baisakhi Formation", "tvd_top": 1800.0, "color": "#A2A2A2", "lithology": "Tight Shale / Siltstone", "primary_risk": "Tight Hole & Overpull"},
    {"name": "Jodhpur Sandstone", "tvd_top": 2300.0, "color": "#909090", "lithology": "Heavy Oil Sandstone", "primary_risk": "Viscous Drag & Differential Sticking"},
    {"name": "Bilara Carbonates", "tvd_top": 2800.0, "color": "#A2A2A2", "lithology": "Cavernous Dolomite/Limestone", "primary_risk": "Catastrophic Lost Circulation"}
]

KG_HORIZONS: List[Dict[str, Any]] = [
    {"name": "Shallow Marine Sediments", "tvd_top": 800.0, "color": "#B1B1B1", "lithology": "Unconsolidated Silt/Hydrates", "primary_risk": "Shallow Water Flow / Slumping"},
    {"name": "Godavari Gumbo", "tvd_top": 1800.0, "color": "#585858", "lithology": "Highly Reactive Gumbo Shale", "primary_risk": "Bit Balling & Annular Packing"},
    {"name": "Ravva Formation", "tvd_top": 3200.0, "color": "#727272", "lithology": "Deep Turbidite Sandstone", "primary_risk": "Narrow PP-FG Margin & Gas Influx"},
    {"name": "Cretaceous Basement", "tvd_top": 4200.0, "color": "#676767", "lithology": "HPHT Fractured Shale-Sand", "primary_risk": "Overpressured HPHT Gas Kick"}
]

MIZORAM_HORIZONS: List[Dict[str, Any]] = [
    {"name": "Bokabil Formation", "tvd_top": 1500.0, "color": "#B1B1B1", "lithology": "Interbedded Sand-Shale", "primary_risk": "Borehole Ovalization"},
    {"name": "Upper Bhuban", "tvd_top": 2500.0, "color": "#6F6F6F", "lithology": "High Stress Marine Shale", "primary_risk": "Tectonic Stress Breakout"},
    {"name": "Middle Bhuban", "tvd_top": 3400.0, "color": "#494949", "lithology": "Steeply Dipping Hard Shales", "primary_risk": "Bedding Plane Splintering & Severe Stuck Pipe"},
    {"name": "Disang Flysch", "tvd_top": 4100.0, "color": "#545454", "lithology": "Crushed Tectonic Flysch", "primary_risk": "Abnormal Pore Pressure & Severe Sloughing"}
]

NORTH_SEA_HORIZONS: List[Dict[str, Any]] = [
    {"name": "Nordland Group", "tvd_top": 800.0, "color": "#B1B1B1", "lithology": "Unconsolidated Sands & Clays", "primary_risk": "Shallow Gas Hazard"},
    {"name": "Hordaland & Rogaland", "tvd_top": 1500.0, "color": "#A2A2A2", "lithology": "Reactive Smectitic Shales", "primary_risk": "Borehole Swelling & Tight Hole"},
    {"name": "Shetland Chalk Group", "tvd_top": 2100.0, "color": "#B1B1B1", "lithology": "Dense Micro-crystalline Chalk", "primary_risk": "Mud Losses & Bit Chipping"},
    {"name": "Draupne & Heather (Viking)", "tvd_top": 2550.0, "color": "#848484", "lithology": "Overpressured Organic Hot Shale", "primary_risk": "Kick Influx & Wellbore Instability"},
    {"name": "Brent Group Sandstone", "tvd_top": 2800.0, "color": "#A3A3A3", "lithology": "High Permeability Sand Reservoir", "primary_risk": "Differential Sticking in Depleted Zones"}
]

# Baseline depths when opening each well if telemetry is not yet active
WELL_BASE_DEPTHS = {
    "OIL-BAGHJAN-1": 2240.0,
    "OIL-BAGHJAN-4": 2260.0,
    "OIL-NAHARKATIYA-1": 1920.0,
    "OIL-MORAN-1": 2460.0,
    "OIL-DIKOM-1": 2120.0,
    "OIL-TENGAKHAT-1": 1990.0,
    "OIL-KOTHALONI-1": 2200.0,
    "OIL-HAPJAN-1": 2230.0,
    "OIL-SHALMARI-1": 2080.0,
    "OIL-KUSIJAN-1": 2250.0,
    "OIL-HEBEDA-1": 2180.0,
    "OIL-RAJ-BAGHEWALA-1": 2100.0,
    "OIL-RAJ-BAGHEWALA-2": 2150.0,
    "OIL-RAJ-TANOT-1": 1950.0,
    "OIL-RAJ-TANOT-2": 2000.0,
    "OIL-RAJ-DANDEWALA-1": 2050.0,
    "OIL-KG-DEEPWATER-1": 3200.0,
    "OIL-KG-DWN-98-2": 3300.0,
    "OIL-KG-D6-OFFSHORE": 3400.0,
    "OIL-KG-YANAM-1": 2900.0,
    "OIL-KG-AMALAPURAM-1": 2800.0,
    "OIL-MZ-AIZAWL-1": 2800.0,
    "OIL-MZ-MAMIT-1": 2900.0,
    "OIL-MZ-KOLASIB-1": 2750.0,
    "OIL-MZ-LUNGLEI-1": 3100.0,
    "OIL-MZ-CHAMPHAI-1": 3250.0,
    "16/7-6": 2240.0,
    "16/7-5": 2250.0,
    "16/7-4": 2200.0,
    "16/8-1": 2150.0,
    "16/2-6": 2300.0,
    "16/2-7": 2280.0,
    "7/1-1": 2100.0,
    "7/1-2 S": 2120.0,
    "35/9-7": 2400.0,
    "35/9-8": 2450.0,
    "VOLVE-15/9-F-12": 2400.0,
    "VOLVE-15/9-F-14": 2450.0,
    "VOLVE-15/9-F-1": 2350.0,
}

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two GPS coordinates in kilometers."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0)**2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(R * c, 1)

@router.get("/api/wells/{well_id:path}/lookahead")
def get_lookahead_advisory(
    well_id: str,
    current_depth: Optional[float] = Query(None, description="Current bit TVD depth in meters"),
    window_meters: float = Query(250.0, description="Look-ahead window depth in meters"),
    db: Session = Depends(get_db)
):
    """
    Ahead-of-the-Bit Predictive Hazard Radar:
    Scans the upcoming depth window [current_depth, current_depth + window_meters]
    to forecast formation transitions, correlate historical offset events from geographically
    proximate offset wells, and derive driller recommendations using the unified ML hazard model.
    """
    well = None
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
    except Exception as e:
        print(f"Warning: db query failed in lookahead for {well_id} ({e}).")

    if not well:
        # Check if well exists in calibrated list or defaultWells.json
        import json
        from pathlib import Path
        p_wells = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "data" / "defaultWells.json"
        if p_wells.exists():
            try:
                with open(p_wells, "r", encoding="utf-8") as f:
                    wells_data = json.load(f)
                match = next((w for w in wells_data if w.get("well_id") == well_id), None)
                if match:
                    class DummyWell:
                        well_id = match.get("well_id")
                        field_name = match.get("field_name")
                    well = DummyWell()
            except Exception:
                pass
        if not well:
            class DefaultWell:
                pass
            well = DefaultWell()
            setattr(well, "well_id", well_id)
            setattr(well, "field_name", "Regional Field")

    # Determine depth to use if not explicitly specified
    if current_depth is None or current_depth <= 0:
        current_depth = WELL_BASE_DEPTHS.get(well_id, 2240.0)

    target_depth = current_depth + window_meters

    # 1. Identify upcoming formations specifically for this well
    wid = well_id.upper()
    if wid in WELL_FORMATION_HORIZONS:
        horizons = WELL_FORMATION_HORIZONS[wid]
    elif "RAJ" in wid:
        horizons = RAJASTHAN_HORIZONS
    elif "KG" in wid:
        horizons = KG_HORIZONS
    elif "MZ" in wid or "MIZO" in wid:
        horizons = MIZORAM_HORIZONS
    elif "VOLVE" in wid or "FORCE" in wid or "/" in wid:
        horizons = NORTH_SEA_HORIZONS
    else:
        horizons = DEFAULT_HORIZONS
    upcoming_formations = []
    next_formation: Optional[str] = None
    dist_to_next_formation: Optional[float] = None

    for f in horizons:
        tvd_top = float(f["tvd_top"])
        if tvd_top > current_depth:
            dist = round(tvd_top - current_depth, 1)
            if dist_to_next_formation is None or dist < dist_to_next_formation:
                next_formation = str(f["name"])
                dist_to_next_formation = dist
            
            if tvd_top <= target_depth:
                upcoming_formations.append({
                    "name": f["name"],
                    "tvd_top": tvd_top,
                    "distance_ahead_m": dist,
                    "color": f["color"],
                    "lithology": f["lithology"],
                    "primary_risk": f["primary_risk"]
                })

    # 2. Geospatially correlate offset wells and calculate distances
    well_coords: Dict[str, tuple] = {}
    try:
        all_wells = db.query(WellMaster).all()
        for w in all_wells:
            if w.surface_location is not None:
                try:
                    geom: Any = to_shape(w.surface_location)  # type: ignore
                    well_coords[str(w.well_id)] = (float(geom.y), float(geom.x))  # (lat, lon)
                except Exception:
                    pass
    except Exception as e:
        print(f"Warning: db query failed in lookahead well_coords ({e}). Using default coordinates.")
        try:
            from main import INDIAN_WELLS_METADATA
            # Extract fallback coords from some known well geometries, mapping roughly by basin
            well_coords = {}
            for wid in INDIAN_WELLS_METADATA.keys():
                if "BAGHJAN" in wid or "NAHAR" in wid or "MORAN" in wid or "DIKOM" in wid or "TENGAKHAT" in wid or "KUSIJAN" in wid or "HAPJAN" in wid or "HEBEDA" in wid or "SHALMARI" in wid or "KOTHALONI" in wid:
                    well_coords[wid] = (27.5, 95.3) # Assam approx
                elif "RAJ" in wid:
                    well_coords[wid] = (27.5, 71.5) # Rajasthan approx
                elif "KG" in wid:
                    well_coords[wid] = (16.25, 82.4) # KG approx
                elif "MZ" in wid or "MIZO" in wid:
                    well_coords[wid] = (23.72, 92.7) # Mizoram approx
                else:
                    well_coords[wid] = (27.5, 95.3) # Default
        except:
            well_coords = {
                "OIL-BAGHJAN-1": (27.58, 95.34),
                "OIL-BAGHJAN-4": (27.59, 95.35),
                "OIL-MORAN-1": (27.18, 94.92),
                "OIL-NAHARKATIYA-1": (27.28, 95.35)
            }

    # Ensure North Sea wells are present in well_coords
    try:
        from main import get_north_sea_wells
        for nw in get_north_sea_wells():
            loc = nw.surface_location
            if loc and isinstance(loc, dict) and "lat" in loc and "lon" in loc:
                well_coords[str(nw.well_id)] = (float(loc["lat"]), float(loc["lon"]))
    except Exception:
        pass

    active_lat_lon = well_coords.get(well_id)

    # Compute distances from active well to all other wells
    offset_distances: Dict[str, float] = {}
    for other_id, (lat, lon) in well_coords.items():
        if other_id != well_id and active_lat_lon:
            offset_distances[other_id] = haversine_km(active_lat_lon[0], active_lat_lon[1], lat, lon)
        else:
            offset_distances[other_id] = 0.0

    # Query offset events in this depth window
    candidate_events = []
    try:
        candidate_events = db.query(SyntheticEvent).filter(
            SyntheticEvent.depth_start_tvd <= target_depth,
            SyntheticEvent.depth_end_tvd >= current_depth
        ).all()
    except Exception as e:
        print(f"Warning: db query failed in lookahead candidate_events ({e}).")

    if not candidate_events:
        import json
        from pathlib import Path
        raw_inc = []
        p_inc = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "data" / "defaultIncidents.json"
        if not p_inc.exists():
            p_inc = Path(__file__).resolve().parent.parent / "data" / "curated_historical_incidents.json"
        if p_inc.exists():
            try:
                with open(p_inc, "r", encoding="utf-8") as f:
                    raw_inc.extend(json.load(f))
            except Exception as read_err:
                pass
                
        # Also include newly ingested offline events
        offline_cache = Path(__file__).resolve().parent.parent / "data" / "offline_ingested_events.json"
        if offline_cache.exists():
            try:
                with open(offline_cache, "r", encoding="utf-8") as f:
                    raw_inc.extend(json.load(f))
            except Exception:
                pass

        if raw_inc:
            try:
                class MockEvent:
                    def __init__(self, d):
                        self.well_id = d.get("well_id", "OIL-MORAN-1")
                        self.formation = d.get("formation", "Unknown")
                        self.event_type = d.get("event_type", "Drilling Hazard")
                        self.depth_start_tvd = float(d.get("depth_tvd") or 2400.0)
                        self.depth_end_tvd = float(d.get("depth_tvd") or 2400.0) + 20.0
                        self.severity = d.get("severity", "MEDIUM")
                        self.root_cause = d.get("root_cause", "")
                        self.mitigation_applied = d.get("mitigation_applied", "")
                        self.npt_hours = float(d.get("npt_hours", 4.0))
                matching = []
                for item in raw_inc:
                    d = float(item.get("depth_tvd") or 2400.0)
                    if d >= current_depth - 150 and d <= target_depth + 300:
                        matching.append(MockEvent(item))
                candidate_events = matching[:6]
            except Exception as read_err:
                print(f"Error loading offline lookahead incidents: {read_err}")


    # Separate events into true offsets and prioritize wells within the same basin (< 300 km)
    # ENFORCE REGIONAL BOUNDARY: Never cross-match regions
    from simulator import get_well_region_tag
    active_region = get_well_region_tag(well_id)
    
    scored_events = []
    for ev in candidate_events:
        ev_region = get_well_region_tag(str(ev.well_id))
        
        # Explicit boundary enforcement
        if ev_region != active_region:
            continue
            
        dist_km = offset_distances.get(str(ev.well_id), 999.0)
        is_self = (str(ev.well_id) == well_id)
        
        # EXCLUDE self well (Target well) from lookahead radar (User Request)
        if is_self:
            continue
            
        # Prioritize same basin (distance < 350km)
        if dist_km < 350.0:
            scored_events.append({
                "event": ev,
                "distance_km": dist_km,
                "is_self": is_self
            })

    # Fallback if no proximate offsets found in region
    if not scored_events:
        for ev in candidate_events:
            ev_region = get_well_region_tag(str(ev.well_id))
            is_self = (str(ev.well_id) == well_id)
            
            # EXCLUDE self well (Target well) from lookahead radar
            if ev_region != active_region or is_self:
                continue
                
            dist_km = offset_distances.get(str(ev.well_id), 999.0)
            scored_events.append({
                "event": ev,
                "distance_km": dist_km,
                "is_self": is_self
            })

    # Sort candidates: non-self first, proximity, severity
    severity_order = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    scored_events.sort(key=lambda x: (
        1 if x["is_self"] else 0,
        x["distance_km"],
        severity_order.get((x["event"].severity or "MEDIUM").upper(), 2)
    ))

    # Formatted events list
    horizon_events = []
    kick_count = 0
    loss_count = 0
    stuck_count = 0

    for item in scored_events[:10]:
        ev = item["event"]
        dist_km = item["distance_km"]
        etype = ev.event_type or "Operational Incident"
        lower_type = etype.lower()
        if "kick" in lower_type: kick_count += 1
        elif "loss" in lower_type or "lost" in lower_type: loss_count += 1
        elif "stuck" in lower_type or "tight" in lower_type: stuck_count += 1

        mitig_val = getattr(ev, "mitigation_applied", None) or getattr(ev, "mitigation", None)
        if not mitig_val or not str(mitig_val).strip():
            if "kick" in lower_type:
                mitig_val = "Shut-in well on annular preventer; recorded SIDPP and SICP, circulated out influx using Driller's Method with weighted kill mud."
            elif "stuck" in lower_type or "sticking" in lower_type or "tight" in lower_type:
                mitig_val = "Pumped 40 bbl surfactant soaking pill, applied allowable overpull, and worked drillstring to free differential sticking."
            elif "loss" in lower_type or "lost" in lower_type:
                mitig_val = "Mixed and spotted 35 bbl LCM pill with nut-plug and mica, soaked 2 hours, and restored full circulation."
            else:
                mitig_val = "Circulated bottoms-up, conditioned drilling fluid, and monitored standpipe pressure."

        npt_val = getattr(ev, "npt_hours", None) or 4.0

        horizon_events.append({
            "well_id": ev.well_id,
            "depth_tvd": ev.depth_start_tvd,
            "event_type": etype,
            "severity": ev.severity or "MEDIUM",
            "formation": ev.formation or "Unassigned Formation",
            "root_cause": ev.root_cause or "Geological transition anomaly",
            "mitigation": mitig_val,
            "mitigation_applied": mitig_val,
            "npt_hours": npt_val,
            "offset_distance_km": dist_km,
            "is_offset": not item["is_self"],
            "data_source": getattr(ev, "data_source", "synthetic")
        })

    # 3. Derive live ML hazard prediction
    latest_param = db.query(DrillingParam).filter(
        DrillingParam.well_id == well_id
    ).order_by(DrillingParam.timestamp.desc()).first()

    if latest_param:
        current_telemetry = {
            "wob": latest_param.wob or 14.0,
            "rpm": latest_param.rpm or 105.0,
            "rop": latest_param.rop or 16.0,
            "torque": latest_param.torque or 13200.0,
            "mud_weight": latest_param.mud_weight or 11.2,
            "ecd": latest_param.ecd or 11.6,
            "depth_tvd": current_depth,
            "well_id": well_id
        }
    else:
        # Load from calibrated baselines
        from simulator import get_well_calibrated_baseline
        current_telemetry = get_well_calibrated_baseline(well_id)
        current_telemetry["depth_tvd"] = current_depth
        current_telemetry["well_id"] = well_id

    # Format offset events for the ML hazard service
    ml_offset_records = [
        {
            "event_type": e["event_type"],
            "depth_start_tvd": e["depth_tvd"],
            "severity": e["severity"],
            "formation": e["formation"]
        }
        for e in horizon_events[:8]
    ]

    # Shared unified ML hazard prediction
    ml_service = HazardPredictionService()
    ml_pred = ml_service.predict_risk(current_telemetry, ml_offset_records)
    
    # Base risk score from ML model
    risk_score = ml_pred.get("risk_score", 0.45)
    hazard_level = ml_pred.get("hazard_level", "MODERATE")
    top_factors = ml_pred.get("top_factors", [])

    # 4. Proactive Driller Advisory Recommendations (Region & Formation Aware)
    advisory_actions = []
    if dist_to_next_formation is not None and dist_to_next_formation <= 250.0:
        nf_lower = (next_formation or "").lower()
        if "barail" in nf_lower:
            advisory_actions.append({
                "category": "MUD_SYSTEM",
                "priority": "HIGH",
                "action": f"Entering overpressured Barail sequence in {dist_to_next_formation}m for {well_id}. Pre-treat active mud pits to 11.6–12.0 ppg. Verify barite reserve stock."
            })
            advisory_actions.append({
                "category": "WELL_CONTROL",
                "priority": "HIGH",
                "action": "Line up trip tank, function-test annular BOP, and conduct flow check prior to top-of-formation."
            })
        elif "tipam" in nf_lower:
            advisory_actions.append({
                "category": "DRILLING_FLUID",
                "priority": "MEDIUM",
                "action": f"Approaching permeable Tipam Sandstone in {dist_to_next_formation}m. Prepare 30 bbl calcium carbonate LCM pill to prevent thief zone mud losses."
            })
        elif "kopili" in nf_lower:
            advisory_actions.append({
                "category": "SHALE_STABILITY",
                "priority": "HIGH",
                "action": f"Entering reactive Kopili Shale in {dist_to_next_formation}m. Increase PHPA / glycol inhibitor levels to minimize swelling and packoff."
            })
        elif "bilara" in nf_lower:
            advisory_actions.append({
                "category": "LOST_CIRCULATION",
                "priority": "CRITICAL",
                "action": f"Approaching cavernous Bilara Carbonates in {dist_to_next_formation}m. Stage 50 bbl coarse walnut shell/mica LCM blend on rig floor; reduce pump rate."
            })
        elif "jodhpur" in nf_lower:
            advisory_actions.append({
                "category": "TORQUE_DRAG",
                "priority": "HIGH",
                "action": f"Entering Jodhpur heavy oil sand in {dist_to_next_formation}m. Monitor rotary torque for viscous drag; avoid prolonged stationary drillstring periods."
            })
        elif "ravva" in nf_lower:
            advisory_actions.append({
                "category": "WELL_CONTROL",
                "priority": "CRITICAL",
                "action": f"Approaching Ravva overpressured gas turbidite in {dist_to_next_formation}m. Narrow PP-FG window (<0.8 ppg). Pre-charge subsea accumulator and test chokes."
            })
        elif "gumbo" in nf_lower:
            advisory_actions.append({
                "category": "BIT_BALLING",
                "priority": "HIGH",
                "action": f"Entering highly reactive Godavari Gumbo in {dist_to_next_formation}m. Treat active mud with clouding anti-accretion polymer and increase shaker mesh monitoring."
            })
        elif "bhuban" in nf_lower:
            advisory_actions.append({
                "category": "MECHANICAL_STABILITY",
                "priority": "CRITICAL",
                "action": f"Approaching steeply dipping Bhuban shales in {dist_to_next_formation}m. High risk of bedding plane collapse. Limit reaming speed and stage high-viscosity sweeps."
            })
        elif "disang" in nf_lower:
            advisory_actions.append({
                "category": "PRESSURE_RAMP",
                "priority": "CRITICAL",
                "action": f"Entering tectonically sheared Disang Flysch in {dist_to_next_formation}m. Watch for abnormal pore pressure ramp and splintery cavings."
            })
    
    # Top nearby offset well info
    nearest_offset_str = ""
    for ev in horizon_events:
        if ev.get("is_offset") and ev.get("offset_distance_km", 0) > 0:
            nearest_offset_str = f" Closest offset is {ev['well_id']} ({ev['offset_distance_km']} km away)."
            break

    if kick_count > 0:
        advisory_actions.append({
            "category": "DETECTION",
            "priority": "CRITICAL",
            "action": f"{kick_count} historical kick(s) recorded in nearby offset wells within this depth corridor.{nearest_offset_str} Monitor delta-flow and pit gain thresholds."
        })
    if loss_count > 0:
        advisory_actions.append({
            "category": "HYDRAULICS",
            "priority": "MEDIUM",
            "action": f"{loss_count} historical loss event(s) in offset wells.{nearest_offset_str} Limit flow rate to maintain ECD below formation breakdown pressure."
        })
    if stuck_count > 0:
        advisory_actions.append({
            "category": "MECHANICS",
            "priority": "MEDIUM",
            "action": f"Historical pipe sticking reported in nearby offsets.{nearest_offset_str} Perform wiper trips every 90m and avoid stationary pipe on bottom."
        })

    if not advisory_actions:
        advisory_actions.append({
            "category": "NORMAL_DRILLING",
            "priority": "LOW",
            "action": f"Drilling corridor stable for {well_id}. No critical offset incidents within {window_meters}m window. Maintain standard ROP."
        })

    return {
        "well_id": well_id,
        "current_depth_tvd": round(current_depth, 1),
        "target_depth_tvd": round(target_depth, 1),
        "window_meters": window_meters,
        "next_formation": next_formation,
        "distance_to_next_formation_m": dist_to_next_formation,
        "upcoming_formations": upcoming_formations,
        "horizon_events_count": len(horizon_events),
        "kick_events_count": kick_count,
        "loss_events_count": loss_count,
        "stuck_events_count": stuck_count,
        "events": horizon_events[:8],
        "ml_risk_assessment": {
            "risk_score": risk_score,
            "hazard_level": hazard_level,
            "dominant_threat": ml_pred.get("dominant_threat", "GAS_KICK" if kick_count > 0 else "NORMAL"),
            "top_factors": top_factors
        },
        "advisory_actions": advisory_actions
    }

