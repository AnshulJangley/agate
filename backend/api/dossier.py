from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from database import get_db
from models import WellMaster, SyntheticEvent
from trajectory_calc import compute_realistic_trajectory, compute_anti_collision
from services.statistics_utils import format_wilson_insight, wilson_confidence_interval

router = APIRouter()

@router.get("/api/wells/{well_id:path}/pre-spud-dossier")
@router.get("/api/wells/{well_id:path}/dossier")
def get_pre_spud_dossier(
    well_id: str,
    radius_km: float = Query(25.0, description="Offset well search radius in km"),
    db: Session = Depends(get_db)
):
    """
    1-Click Pre-Spud Offset Well Risk Dossier (SIH 2026 Mandate):
    Compiles an executive engineering report aggregating offset well history,
    formation-specific NPT challenges, casing program recommendations,
    and 3D anti-collision clearance using the exact shared calculation engine.
    """
    from simulator import get_well_region_tag
    region = get_well_region_tag(well_id)

    all_wells = []
    all_db_events = []
    well = None
    try:
        well = db.query(WellMaster).filter(WellMaster.well_id == well_id).first()
        all_wells = db.query(WellMaster).all()
        all_db_events = db.query(SyntheticEvent).all()
    except Exception as e:
        print(f"Warning: db query failed in dossier ({e}). Using offline defaults.")

    if well is None or not all_wells:
        import json
        from pathlib import Path
        p_wells = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "data" / "defaultWells.json"
        if not p_wells.exists():
            p_wells = Path(__file__).resolve().parent.parent / "data" / "defaultWells.json"
        if p_wells.exists():
            try:
                with open(p_wells, "r", encoding="utf-8") as f:
                    raw_wells = json.load(f)
                class MockWell:
                    def __init__(self, d):
                        self.well_id = d.get("well_id")
                        self.field_name = d.get("field_name")
                        self.kb_elevation = d.get("kb_elevation") or 115.0
                        self.total_depth_tvd = d.get("total_depth_tvd") or d.get("total_depth_m") or 3500.0
                        self.spud_date = d.get("spud_date") or "Planned"
                mock_list = [MockWell(w) for w in raw_wells]
                if not all_wells:
                    all_wells = mock_list
                if well is None:
                    well = next((w for w in mock_list if w.well_id == well_id), None)
            except Exception as read_err:
                print(f"Error loading default wells in dossier: {read_err}")

    if well is None:
        class DefaultWell:
            well_id = well_id
            field_name = f"{region.capitalize()} Field"
            kb_elevation = 115.0
            total_depth_tvd = 3500.0
            spud_date = "Planned"
        well = DefaultWell()

    if not all_db_events:
        import json
        from pathlib import Path
        p_inc = Path(__file__).resolve().parent.parent.parent / "frontend" / "src" / "data" / "defaultIncidents.json"
        if not p_inc.exists():
            p_inc = Path(__file__).resolve().parent.parent / "data" / "curated_historical_incidents.json"
        if p_inc.exists():
            try:
                with open(p_inc, "r", encoding="utf-8") as f:
                    raw_inc = json.load(f)
                class MockEvent:
                    def __init__(self, d):
                        self.well_id = d.get("well_id", "OIL-MORAN-1")
                        self.formation = d.get("formation", "Unknown")
                        self.event_type = d.get("event_type", "Drilling Hazard")
                        self.depth_start_tvd = float(d.get("depth_tvd") or 2400.0)
                        self.severity = d.get("severity", "MEDIUM")
                        self.root_cause = d.get("root_cause", "")
                        self.mitigation_applied = d.get("mitigation_applied", "")
                        self.npt_hours = float(d.get("npt_hours", 4.0))
                all_db_events = [MockEvent(i) for i in raw_inc]
            except Exception as inc_err:
                print(f"Error loading default incidents in dossier: {inc_err}")

    # 1. Fetch nearby offset wells within the active regional basin
    offsets = [w for w in all_wells if str(w.well_id) != well_id and get_well_region_tag(str(w.well_id)) == region]
    if not offsets and all_wells:
        offsets = [w for w in all_wells if str(w.well_id) != well_id]

    offset_summaries = []
    for off in offsets:
        offset_summaries.append({
            "well_id": off.well_id,
            "field_name": off.field_name or f"{region.capitalize()} Field",
            "total_depth_tvd": off.total_depth_tvd or 3600.0,
            "spud_date": str(off.spud_date) if off.spud_date is not None else "Historical",
            "kb_elevation": off.kb_elevation or 115.0
        })

    # 2. Historical NPT Incidents grouped by active regional formations
    basin_well_ids = {w.well_id for w in offsets} | {well_id}
    events = [e for e in all_db_events if getattr(e, "well_id", "") in basin_well_ids]
    if not events:
        events = all_db_events

    if region == "rajasthan":
        formation_names = ["Pariwar Formation", "Baisakhi Formation", "Jodhpur Sandstone", "Bilara Carbonates", "General / Other"]
        primary_threat = "Bilara Cavernous Carbonate Total Lost Circulation & Jodhpur Heavy Oil Differential Sticking."
        casing_recommendations = [
            {
                "string": 'Conductor (24")',
                "planned_depth_tvd": "50 m",
                "formation": "Desert Sand / Dune Deposits",
                "mud_weight": "8.4 - 8.8 ppg",
                "objective": "Stabilize loose desert dune sands and establish cellar integrity."
            },
            {
                "string": 'Surface Casing (16")',
                "planned_depth_tvd": "550 m",
                "formation": "Pariwar Aquifer",
                "mud_weight": "8.8 - 9.2 ppg",
                "objective": "Isolate shallow brackish aquifers and superficial gravels."
            },
            {
                "string": 'Intermediate Casing (10-3/4")',
                "planned_depth_tvd": "1,750 m",
                "formation": "Baisakhi Tight Shale",
                "mud_weight": "9.4 - 10.0 ppg",
                "objective": "Isolate abrasive quartzose shale before penetrating heavy oil pay."
            },
            {
                "string": 'Production Casing (7-5/8")',
                "planned_depth_tvd": f"{min(2750, int(getattr(well, 'total_depth_tvd', 3000) or 3000) - 100)} m",
                "formation": "Jodhpur Sand into Bilara",
                "mud_weight": "10.2 - 10.6 ppg",
                "objective": "Seat shoe above cavernous Bilara loss zone; prepare LCM pills before drilling ahead."
            }
        ]
    elif region == "kg":
        formation_names = ["Shallow Marine Sediments", "Godavari Gumbo", "Ravva Formation", "Cretaceous Basement", "General / Other"]
        primary_threat = "Shallow Water Flow (SWF) in shallow sand lenses and Narrow PP-FG Margin Gas Influx in Ravva Formation."
        casing_recommendations = [
            {
                "string": 'Structural Casing (30")',
                "planned_depth_tvd": "120 m",
                "formation": "Seafloor Slump Sediments",
                "mud_weight": "8.8 - 9.0 ppg",
                "objective": "Establish deepwater subsea wellhead and structural conductor foundation."
            },
            {
                "string": 'Conductor Casing (20")',
                "planned_depth_tvd": "650 m",
                "formation": "Shallow Marine SWF Sands",
                "mud_weight": "9.2 - 9.8 ppg",
                "objective": "Isolate high-risk Shallow Water Flow (SWF) overpressured sand bodies."
            },
            {
                "string": 'Surface Casing (13-3/8")',
                "planned_depth_tvd": "1,750 m",
                "formation": "Godavari Gumbo Clay",
                "mud_weight": "10.5 - 11.8 ppg",
                "objective": "Case off severe swelling, hydratable gumbo shales to avoid bit balling."
            },
            {
                "string": 'Intermediate Liner (9-7/8")',
                "planned_depth_tvd": "3,150 m",
                "formation": "Ravva Pay Sandstone",
                "mud_weight": "12.5 - 13.8 ppg",
                "objective": "Isolate narrow-margin gas kick window before penetrating Cretaceous HPHT basement."
            },
            {
                "string": 'Production Liner (7")',
                "planned_depth_tvd": f"{min(4150, int(getattr(well, 'total_depth_tvd', 4200) or 4200) - 100)} m",
                "formation": "Cretaceous HPHT Pay",
                "mud_weight": "14.2 - 15.0 ppg",
                "objective": "Contain HPHT hydrocarbon reservoir with high-temperature resilient slurry."
            }
        ]
    elif region == "mizoram":
        formation_names = ["Bokabil Formation", "Upper Bhuban", "Middle Bhuban", "Disang Flysch", "General / Other"]
        primary_threat = "Middle Bhuban Dipping Bed Packoff, Severe Tectonic Borehole Ovalization & Disang Flysch Overpressure."
        casing_recommendations = [
            {
                "string": 'Conductor (20")',
                "planned_depth_tvd": "80 m",
                "formation": "Mountain Valley Wash / Gravels",
                "mud_weight": "8.6 - 9.0 ppg",
                "objective": "Establish structural surface wellhead stability in steep terrain."
            },
            {
                "string": 'Surface Casing (13-3/8")',
                "planned_depth_tvd": "750 m",
                "formation": "Upper Bokabil Dipping Sand",
                "mud_weight": "9.2 - 9.8 ppg",
                "objective": "Isolate steeply dipping shallow sandstone-shale beds and prevent surface sloughing."
            },
            {
                "string": 'Intermediate Casing (9-5/8")',
                "planned_depth_tvd": "2,450 m",
                "formation": "Upper Bhuban Stress Zone",
                "mud_weight": "10.8 - 11.8 ppg",
                "objective": "Set casing shoe before entering high-torque Middle Bhuban tectonic packoff zone."
            },
            {
                "string": 'Production Casing (7")',
                "planned_depth_tvd": f"{min(3800, int(getattr(well, 'total_depth_tvd', 4000) or 4000) - 100)} m",
                "formation": "Middle Bhuban into Disang Flysch",
                "mud_weight": "12.6 - 13.6 ppg",
                "objective": "Isolate tectonic overpressures and fractured hydrocarbon pay intervals."
            }
        ]
    else:
        # Upper Assam Shelf
        formation_names = ["Tipam Sandstone", "Girujan Clay", "Barail Formation", "Kopili Formation", "General / Other"]
        primary_threat = "Barail Formation Gas Kick & Abnormal Overpressure Ramp between 2,200m and 2,650m TVD."
        casing_recommendations = [
            {
                "string": 'Conductor (20")',
                "planned_depth_tvd": "65 m",
                "formation": "Alluvium / Dihing Gravels",
                "mud_weight": "8.6 - 9.0 ppg",
                "objective": "Isolate superficial gravels and establish structural foundation."
            },
            {
                "string": 'Surface Casing (13-3/8")',
                "planned_depth_tvd": "650 m",
                "formation": "Upper Tipam",
                "mud_weight": "9.2 - 9.6 ppg",
                "objective": "Case off shallow permeable freshwater aquifers. Install Diverter / BOP."
            },
            {
                "string": 'Intermediate Casing (9-5/8")',
                "planned_depth_tvd": "2,250 m",
                "formation": "Top Barail Kick Transition",
                "mud_weight": "10.4 - 11.2 ppg",
                "objective": "Seat shoe immediately above abnormal pressure ramp. Essential barrier for deep section."
            },
            {
                "string": 'Production Liner (7")',
                "planned_depth_tvd": f"{round(float(getattr(well, 'total_depth_tvd', 3500.0) or 3500.0) - 100.0, 0)} m",
                "formation": "Barail Pay Sand into Kopili",
                "mud_weight": "11.8 - 12.4 ppg",
                "objective": "Isolate high-pressure hydrocarbon gas/condensate pay zones. Cement with gas-tight slurry."
            }
        ]

    events_by_formation = {fname: [] for fname in formation_names}

    total_npt_hours = 0.0
    critical_events_count = 0

    for ev in events:
        f_key = "General / Other"
        form = (getattr(ev, "formation", "") or "").lower()
        for candidate_fname in formation_names:
            if candidate_fname == "General / Other":
                continue
            token = candidate_fname.lower().split()[0]
            if token in form:
                f_key = candidate_fname
                break

        npt = float(getattr(ev, "npt_hours", 0.0) or 0.0)
        total_npt_hours += npt
        if (getattr(ev, "severity", "") or "").upper() in ["HIGH", "CRITICAL"]:
            critical_events_count += 1

        events_by_formation[f_key].append({
            "well_id": getattr(ev, "well_id", ""),
            "event_type": getattr(ev, "event_type", ""),
            "depth_tvd": getattr(ev, "depth_start_tvd", 0.0),
            "severity": getattr(ev, "severity", "MEDIUM") or "MEDIUM",
            "root_cause": getattr(ev, "root_cause", ""),
            "mitigation_applied": getattr(ev, "mitigation_applied", ""),
            "npt_hours": npt
        })

    # 3. Directional 3D Anti-Collision Clearance
    active_tvd: float = float(getattr(well, "total_depth_tvd", 3500.0) or 3500.0)
    active_events = [e for e in events if getattr(e, "well_id", "") == well_id]
    active_traj = compute_realistic_trajectory(well_id, active_tvd, is_active=True, db_events=active_events)

    anti_collision_evals = []
    min_overall_dist = 9999.0
    closest_well_id = None
    most_critical_status = "SAFE"

    for off in offsets:
        off_well_id = str(getattr(off, "well_id", ""))
        off_events = [e for e in events if getattr(e, "well_id", "") == off_well_id]
        off_tvd: float = float(getattr(off, "total_depth_tvd", 3400.0) or 3400.0)
        off_traj = compute_realistic_trajectory(off_well_id, off_tvd, is_active=False, db_events=off_events)
        
        ac = compute_anti_collision(active_traj, off_traj)
        anti_collision_evals.append({
            "offset_well_id": ac["offset_well_id"],
            "min_distance_m": ac["min_distance_m"],
            "separation_factor": ac["separation_factor"],
            "status": ac["status"],
            "color": ac["color"],
            "active_depth_md": ac["closest_point_active"]["md"],
            "offset_depth_md": ac["closest_point_offset"]["md"]
        })

        if ac["min_distance_m"] < min_overall_dist:
            min_overall_dist = ac["min_distance_m"]
            closest_well_id = ac["offset_well_id"]
            most_critical_status = ac["status"]

    # 4. Wilson Score Confidence Interval on mitigation effectiveness
    mitigated_events = [e for e in events if e.mitigation_applied is not None and len(str(e.mitigation_applied).strip()) > 3]
    total_events_count = len(events)
    overall_wilson = format_wilson_insight(len(mitigated_events), total_events_count, "Overall offset mitigation success")

    formation_stats = {}
    for fname, fevents in events_by_formation.items():
        f_mitigated = sum(1 for e in fevents if e.get("mitigation_applied") and len(str(e["mitigation_applied"]).strip()) > 3)
        formation_stats[fname] = format_wilson_insight(f_mitigated, len(fevents), f"{fname} mitigation success")

    return {
        "report_metadata": {
            "title": "PRE-SPUD OFFSET WELL HAZARD & ENGINEERING DOSSIER",
            "basin": region.capitalize(),
            "institution": "AGATE",
            "generated_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S UTC"),
            "document_id": f"AGATE-DOSSIER-{well_id}",
            "confidentiality": "RESTRICTED / OPERATIONAL"
        },
        "target_well": {
            "well_id": well.well_id,
            "region": region,
            "field_name": well.field_name or f"{region.capitalize()} Field",
            "planned_td_tvd_m": active_tvd,
            "planned_td_md_m": active_traj["total_md"],
            "kb_elevation_m": well.kb_elevation or 115.0,
            "spud_date": str(well.spud_date) if well.spud_date is not None else "Planned Q3",
            "search_radius_km": radius_km
        },
        "executive_summary": {
            "basin": region.capitalize(),
            "offset_wells_analyzed": len(offsets),
            "historical_incidents_recorded": len(events),
            "total_offset_npt_hours": round(total_npt_hours, 1),
            "critical_events_count": critical_events_count,
            "closest_approach_distance_m": round(min_overall_dist, 1) if closest_well_id else None,
            "closest_approach_offset_well": closest_well_id,
            "overall_collision_status": most_critical_status,
            "key_primary_threat": primary_threat,
            "mitigation_wilson_stats": overall_wilson
        },
        "offset_wells": offset_summaries,
        "formation_hazard_breakdown": events_by_formation,
        "formation_wilson_stats": formation_stats,
        "anti_collision_clearance": anti_collision_evals,
        "casing_and_mud_program": casing_recommendations
    }
