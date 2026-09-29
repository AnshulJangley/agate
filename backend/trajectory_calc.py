import hashlib
import numpy as np
from typing import Dict, List, Tuple, Callable, Any, Optional, TypedDict

class RegionGeology(TypedDict):
    formations: List[Tuple[str, float, str, str]]
    risk_curve: Callable[[Any], Any]

REGIONAL_GEOLOGY_CONFIG: Dict[str, RegionGeology] = {
    "assam": {
        "formations": [
            ("Tipam Sandstone", 1450.0, "#BBBBBB", "Freshwater permeable sand reservoir, severe thief-bed mud loss"),
            ("Girujan Clay", 2000.0, "#585858", "Sloughing/caving shale"),
            ("Barail Formation", 2400.0, "#9A9A9A", "Overpressured sand-shale (Known Kick Zone & differential sticking)"),
            ("Kopili Formation", 2950.0, "#808080", "Deep marine shale transition, swelling reactive shale")
        ],
        "risk_curve": lambda z: (
            0.12 + 0.08 * np.sin(z / 200.0) if z < 1400 else
            0.35 + 0.15 * np.sin(z / 150.0) if z < 2100 else
            0.55 + 0.38 * np.exp(-((z - 2480.0) / 200.0) ** 2) if z < 2750 else
            0.42 + 0.12 * np.sin(z / 180.0)
        )
    },
    "rajasthan": {
        "formations": [
            ("Pariwar Formation", 1200.0, "#D7D7D7", "Sand abrasion & filtration loss"),
            ("Baisakhi Formation", 1800.0, "#A2A2A2", "Tight hole"),
            ("Jodhpur Sandstone", 2300.0, "#909090", "Heavy oil viscous drag & differential sticking"),
            ("Bilara Carbonates", 2800.0, "#A2A2A2", "Massive cavernous lost circulation & torque vibration")
        ],
        "risk_curve": lambda z: (
            0.15 + 0.1 * np.sin(z / 300.0) if z < 1200 else
            0.30 + 0.15 * np.sin(z / 200.0) if z < 1800 else
            0.60 + 0.3 * np.exp(-((z - 2300.0) / 150.0) ** 2) if z < 2500 else
            0.70 + 0.25 * np.exp(-((z - 2800.0) / 100.0) ** 2)
        )
    },
    "kg": {
        "formations": [
            ("Shallow Marine Sediments", 800.0, "#B1B1B1", "Shallow Water Flow / gas hydrates"),
            ("Godavari Gumbo", 1800.0, "#585858", "Gumbo bit balling & plugging"),
            ("Ravva Formation", 3200.0, "#727272", "Narrow PP-FG window & rapid gas influx"),
            ("Cretaceous", 4200.0, "#676767", "HPHT overpressures")
        ],
        "risk_curve": lambda z: (
            0.40 + 0.2 * np.exp(-((z - 600.0) / 200.0) ** 2) if z < 1200 else
            0.50 + 0.15 * np.sin(z / 250.0) if z < 2500 else
            0.80 + 0.18 * np.exp(-((z - 3200.0) / 300.0) ** 2) if z < 3800 else
            0.85 + 0.1 * np.sin(z / 200.0)
        )
    },
    "mizoram": {
        "formations": [
            ("Bokabil Formation", 1500.0, "#B1B1B1", "Tectonic ovalization"),
            ("Upper Bhuban", 2500.0, "#6F6F6F", "High horizontal stress breakout"),
            ("Middle Bhuban", 3400.0, "#494949", "Steeply dipping bedding-plane packoff & catastrophic stuck pipe"),
            ("Disang Flysch", 4100.0, "#545454", "Tectonic crushed rock overpressure")
        ],
        "risk_curve": lambda z: (
            0.30 + 0.1 * np.sin(z / 300.0) if z < 1500 else
            0.55 + 0.2 * np.sin(z / 200.0) if z < 2500 else
            0.75 + 0.2 * np.exp(-((z - 3400.0) / 250.0) ** 2) if z < 3800 else
            0.85 + 0.1 * np.sin(z / 150.0)
        )
    }
}

def compute_realistic_trajectory(well_id: str, tvd_max: float, is_active: bool = False, db_events: Optional[list] = None):
    """
    Computes a realistic 3D directional borehole trajectory.
    Uses deterministic pseudo-random seed from well_id so each well has a unique,
    consistent azimuth, build-up rate, and KOP, but fans out realistically.
    """
    seed = int(hashlib.md5(well_id.encode('utf-8')).hexdigest()[:8], 16)
    rng = np.random.RandomState(seed)
    
    # Surface wellhead position (Z=0)
    if is_active:
        x0, y0 = 0.0, 0.0
        kop = float(rng.uniform(420.0, 620.0))
        max_drift = float(rng.uniform(300.0, 500.0))
        azimuth_deg = float(rng.uniform(35.0, 75.0)) # Active rig drifts NE
    else:
        # Offsets are placed in realistic pad/cluster positions around active rig (160m - 520m)
        surface_dist = float(rng.uniform(160.0, 520.0))
        surface_az = float(rng.uniform(0.0, 2.0 * np.pi))
        x0 = surface_dist * np.sin(surface_az)
        y0 = surface_dist * np.cos(surface_az)
        kop = float(rng.uniform(320.0, 780.0))
        max_drift = float(rng.uniform(200.0, 620.0))
        azimuth_deg = float(rng.uniform(0.0, 360.0)) # Offsets fan out across all 360 degrees
        
    azimuth_rad = np.radians(azimuth_deg)
    drift_power = float(rng.uniform(1.15, 1.55))
    turn_rate = float(rng.uniform(-12.0, 12.0))
    
    num_points = 100
    depths_z = np.linspace(0, tvd_max, num_points)
    xs = np.full_like(depths_z, x0)
    ys = np.full_like(depths_z, y0)
    
    for i, z in enumerate(depths_z):
        if z > kop:
            prog = (z - kop) / max(1.0, (tvd_max - kop))
            # S-curve build and hold profile with individual curvature power
            drift = max_drift * (np.sin(prog * np.pi / 2.0) ** drift_power)
            # Subtle realistic azimuth walk / dogleg
            az_cur = azimuth_rad + np.radians(turn_rate * np.sin(prog * np.pi))
            xs[i] = x0 + drift * np.sin(az_cur)
            ys[i] = y0 + drift * np.cos(az_cur)
            
    # Differential steps along trajectory
    dx = np.diff(xs, prepend=xs[0])
    dy = np.diff(ys, prepend=ys[0])
    dz = np.diff(depths_z, prepend=depths_z[0])
    step_md = np.sqrt(dx**2 + dy**2 + dz**2)
    md = np.cumsum(step_md)
    
    # Inclination: angle from vertical (degrees)
    inc = np.degrees(np.arctan2(np.sqrt(dx**2 + dy**2), dz + 1e-6))
    
    # Azimuth: direction from North (degrees)
    az = (np.degrees(np.arctan2(dx, dy + 1e-6)) + 360.0) % 360.0
    
    # Determine region based on well_id
    well_prefix = well_id.upper()
    if "RAJ" in well_prefix:
        region = "rajasthan"
    elif "KG" in well_prefix:
        region = "kg"
    elif "MZ" in well_prefix or "MIZO" in well_prefix:
        region = "mizoram"
    else:
        region = "assam"
        
    geo_config = REGIONAL_GEOLOGY_CONFIG[region]

    # Depth-indexed risk score (0.0 to 1.0) along trajectory
    risk_scores = []
    for z in depths_z:
        r = geo_config["risk_curve"](z)
        risk_scores.append(round(float(np.clip(r, 0.05, 0.98)), 3))
        
    # Formation tops for this well
    formation_specs = []
    for f in geo_config["formations"]:
        # Dynamically scale slightly based on tvd_max if needed, or just use hardcoded tops
        formation_specs.append((f[0], min(tvd_max * (f[1]/max(tvd_max, 4500.0)), f[1]), f[2], f[3]))
    
    # Check if we have specific events with formation depths
    if db_events:
        for ev in db_events:
            if ev.formation and ev.depth_start_tvd and ev.depth_start_tvd < tvd_max:
                fname = f"{ev.formation} Top"
                fcolor = "#848484" if "kick" in (ev.event_type or "").lower() else "#B1B1B1"
                fdesc = f"Historical {ev.event_type} at {round(ev.depth_start_tvd, 1)}m"
                formation_specs.append((fname, ev.depth_start_tvd, fcolor, fdesc))
                
    formation_tops = []
    seen_depths = set()
    for name, target_tvd, color, desc in formation_specs:
        if target_tvd < tvd_max:
            idx = int(np.argmin(np.abs(depths_z - target_tvd)))
            tvd_val = round(float(depths_z[idx]), 1)
            if tvd_val in seen_depths:
                continue
            seen_depths.add(tvd_val)
            formation_tops.append({
                "name": name,
                "tvd": tvd_val,
                "md": round(float(md[idx]), 1),
                "x": round(float(xs[idx]), 1),
                "y": round(float(ys[idx]), 1),
                "z": tvd_val,
                "color": color,
                "description": desc
            })
            
    return {
        "well_id": well_id,
        "is_active": is_active,
        "surface": {"x": round(float(x0), 1), "y": round(float(y0), 1), "z": 0.0},
        "tvd_max": round(float(tvd_max), 1),
        "total_md": round(float(md[-1]), 1),
        "kop": round(float(kop), 1),
        "trajectory": {
            "x": [round(float(val), 2) for val in xs],
            "y": [round(float(val), 2) for val in ys],
            "z": [round(float(val), 2) for val in depths_z],
            "md": [round(float(val), 2) for val in md],
            "inclination": [round(float(val), 1) for val in inc],
            "azimuth": [round(float(val), 1) for val in az],
            "risk_scores": risk_scores
        },
        "formation_tops": formation_tops
    }

def compute_anti_collision(active_traj: dict, offset_traj: dict):
    pts_a = np.column_stack([active_traj["trajectory"]["x"], active_traj["trajectory"]["y"], active_traj["trajectory"]["z"]])
    pts_b = np.column_stack([offset_traj["trajectory"]["x"], offset_traj["trajectory"]["y"], offset_traj["trajectory"]["z"]])
    
    # Evaluate subsurface points (below surface casing, Z >= 30m) to isolate directional borehole convergence
    sub_mask_a = np.array(active_traj["trajectory"]["z"]) >= 30.0
    sub_mask_b = np.array(offset_traj["trajectory"]["z"]) >= 30.0
    
    if np.any(sub_mask_a) and np.any(sub_mask_b):
        pts_a_eval = pts_a[sub_mask_a]
        pts_b_eval = pts_b[sub_mask_b]
        indices_a = np.where(sub_mask_a)[0]
        indices_b = np.where(sub_mask_b)[0]
    else:
        pts_a_eval = pts_a
        pts_b_eval = pts_b
        indices_a = np.arange(len(pts_a))
        indices_b = np.arange(len(pts_b))

    # Pairwise 3D Euclidean distances
    diff = pts_a_eval[:, np.newaxis, :] - pts_b_eval[np.newaxis, :, :]
    dist_matrix = np.sqrt(np.sum(diff**2, axis=-1))
    
    min_idx_flat = np.argmin(dist_matrix)
    idx_a_eval, idx_b_eval = np.unravel_index(min_idx_flat, dist_matrix.shape)
    
    orig_idx_a = indices_a[idx_a_eval]
    orig_idx_b = indices_b[idx_b_eval]
    min_dist = float(dist_matrix[idx_a_eval, idx_b_eval])
    
    # Standard directional drilling error-ellipse separation factor
    # SF = D / (uncertainty_a + uncertainty_b)
    # ISCWSA error model simplified: sigma ~ 1.5m per 1000m MD
    md_a = active_traj["trajectory"]["md"][orig_idx_a]
    md_b = offset_traj["trajectory"]["md"][orig_idx_b]
    sigma_combined = max(5.0, (md_a + md_b) * 0.0018)
    separation_factor = round(min_dist / sigma_combined, 2)
    
    # Industry status: SF < 1.5 -> CRITICAL; 1.5 <= SF < 3.0 -> CAUTION; >= 3.0 -> SAFE
    if separation_factor < 1.5:
        status = "CRITICAL"
        color = "#848484"
    elif separation_factor < 3.0:
        status = "CAUTION"
        color = "#B1B1B1"
    else:
        status = "SAFE"
        color = "#A3A3A3"
        
    return {
        "offset_well_id": offset_traj["well_id"],
        "min_distance_m": round(min_dist, 1),
        "separation_factor": separation_factor,
        "status": status,
        "color": color,
        "closest_point_active": {
            "x": active_traj["trajectory"]["x"][orig_idx_a],
            "y": active_traj["trajectory"]["y"][orig_idx_a],
            "z": active_traj["trajectory"]["z"][orig_idx_a],
            "md": md_a,
            "tvd": active_traj["trajectory"]["z"][orig_idx_a]
        },
        "closest_point_offset": {
            "x": offset_traj["trajectory"]["x"][orig_idx_b],
            "y": offset_traj["trajectory"]["y"][orig_idx_b],
            "z": offset_traj["trajectory"]["z"][orig_idx_b],
            "md": md_b,
            "tvd": offset_traj["trajectory"]["z"][orig_idx_b]
        },
        "active_point": {
            "x": active_traj["trajectory"]["x"][orig_idx_a],
            "y": active_traj["trajectory"]["y"][orig_idx_a],
            "z": active_traj["trajectory"]["z"][orig_idx_a],
            "md": md_a,
            "tvd": active_traj["trajectory"]["z"][orig_idx_a]
        },
        "offset_point": {
            "x": offset_traj["trajectory"]["x"][orig_idx_b],
            "y": offset_traj["trajectory"]["y"][orig_idx_b],
            "z": offset_traj["trajectory"]["z"][orig_idx_b],
            "md": md_b,
            "tvd": offset_traj["trajectory"]["z"][orig_idx_b]
        }
    }
