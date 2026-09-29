import os
import sys
import random
import numpy as np

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, "..", ".env"))

from database import SessionLocal
from models import WellMaster, SyntheticEvent, WellLog
from nlp.config import get_embedding, _pseudo_embedding

def seed_regional_data():
    db = SessionLocal()
    try:
        # 1. Regional events specification
        regional_events_defs = {
            # RAJASTHAN BASIN
            "rajasthan": [
                {
                    "formation": "Pariwar Formation",
                    "depth_start_tvd": 1140.0,
                    "depth_end_tvd": 1180.0,
                    "event_type": "Lost Circulation",
                    "severity": "MEDIUM",
                    "root_cause": "Permeable shallow quartz sand interval with high filtrate loss and thief zone seepage.",
                    "mitigation_applied": "Spotted 25 bbl medium-grade calcium carbonate LCM pill and optimized mud filter cake.",
                    "npt_hours": 6.5,
                },
                {
                    "formation": "Baisakhi Formation",
                    "depth_start_tvd": 1650.0,
                    "depth_end_tvd": 1690.0,
                    "event_type": "Tight Hole",
                    "severity": "HIGH",
                    "root_cause": "Tectonic stress pinching and swelling reactive laminated siltstone causing drillstring drag.",
                    "mitigation_applied": "Back-reamed tight interval with high flow rate and elevated rotary speed to 110 RPM.",
                    "npt_hours": 9.0,
                },
                {
                    "formation": "Jodhpur Sandstone",
                    "depth_start_tvd": 2180.0,
                    "depth_end_tvd": 2220.0,
                    "event_type": "Differential Sticking",
                    "severity": "HIGH",
                    "root_cause": "High viscous drag in heavy crude oil pay sand with excessive mud overbalance on stationary BHA.",
                    "mitigation_applied": "Spotted 30 bbl pipe-freeing hydrocarbon surfactant soaking pill and reduced mud weight by 0.3 ppg.",
                    "npt_hours": 21.5,
                },
                {
                    "formation": "Bilara Carbonates",
                    "depth_start_tvd": 2720.0,
                    "depth_end_tvd": 2770.0,
                    "event_type": "Lost Circulation",
                    "severity": "CRITICAL",
                    "root_cause": "Encountered cavernous karst vugs in Bilara dolomite with complete loss of mud returns (110 bbl/hr).",
                    "mitigation_applied": "Pumped coarse fibrous blend LCM pill (50 ppb) followed by thixotropic bentonite-diesel oil squeeze.",
                    "npt_hours": 32.0,
                }
            ],
            # KG DEEPWATER
            "kg": [
                {
                    "formation": "Shallow Marine Sediments",
                    "depth_start_tvd": 710.0,
                    "depth_end_tvd": 750.0,
                    "event_type": "Gas Kick",
                    "severity": "HIGH",
                    "root_cause": "Shallow Water Flow (SWF) aquifer sand breached at low overburden stress causing saltwater/methane influx.",
                    "mitigation_applied": "Pumped 20 bbl 12.2 ppg kill mud pill and weighted active system to suppress flowline bubbling.",
                    "npt_hours": 12.0,
                },
                {
                    "formation": "Godavari Gumbo",
                    "depth_start_tvd": 1540.0,
                    "depth_end_tvd": 1580.0,
                    "event_type": "Stuck Pipe",
                    "severity": "HIGH",
                    "root_cause": "Smectite-rich Godavari gumbo hydration resulting in massive bit balling and annular cuttings collar.",
                    "mitigation_applied": "Injected polyalkylene glycol clouding anti-balling agent into active pits and washed out annular packoff.",
                    "npt_hours": 16.5,
                },
                {
                    "formation": "Ravva Formation",
                    "depth_start_tvd": 2980.0,
                    "depth_end_tvd": 3020.0,
                    "event_type": "Gas Kick",
                    "severity": "CRITICAL",
                    "root_cause": "Subsea deepwater turbidite gas influx (22 bbl pit gain, 460 psi SIDPP) in ultra-narrow PP-FG corridor.",
                    "mitigation_applied": "Shut in on subsea annular preventer, circulated out gas bubble using Driller's Method, increased mud to 13.8 ppg.",
                    "npt_hours": 28.0,
                },
                {
                    "formation": "Cretaceous Basement",
                    "depth_start_tvd": 3950.0,
                    "depth_end_tvd": 4010.0,
                    "event_type": "Overpressure",
                    "severity": "CRITICAL",
                    "root_cause": "HPHT extreme pore pressure ramp with bottomhole temperature reaching 165 C causing mud thermal degradation.",
                    "mitigation_applied": "Conditioned synthetic invert emulsion mud with high-temperature deflocculants and raised MW to 14.9 ppg.",
                    "npt_hours": 24.0,
                }
            ],
            # MIZORAM FOLD BELT
            "mizoram": [
                {
                    "formation": "Bokabil Formation",
                    "depth_start_tvd": 1380.0,
                    "depth_end_tvd": 1420.0,
                    "event_type": "Tight Hole",
                    "severity": "MEDIUM",
                    "root_cause": "Compressional tectonic stress anisotropy causing cross-sectional wellbore ovalization and sloughing.",
                    "mitigation_applied": "Raised mud weight by 0.5 ppg to increase radial borehole wall support and reduced trip speed.",
                    "npt_hours": 7.5,
                },
                {
                    "formation": "Upper Bhuban",
                    "depth_start_tvd": 2240.0,
                    "depth_end_tvd": 2280.0,
                    "event_type": "Stuck Pipe",
                    "severity": "HIGH",
                    "root_cause": "Extreme horizontal compressive tectonic stress breakout causing splintery shale cavings on bottom.",
                    "mitigation_applied": "Circulated high-density tandem sweeps and worked drillstring with 90 klbf overpull.",
                    "npt_hours": 14.0,
                },
                {
                    "formation": "Middle Bhuban",
                    "depth_start_tvd": 3140.0,
                    "depth_end_tvd": 3190.0,
                    "event_type": "Stuck Pipe",
                    "severity": "CRITICAL",
                    "root_cause": "Bedding plane slippage across 45-degree dipping anisotropic shale layers, wedging the BHA.",
                    "mitigation_applied": "Activated hydraulic drilling jars with 120 klbf upward impact; spotted lubricating ester pill to free collars.",
                    "npt_hours": 36.5,
                },
                {
                    "formation": "Disang Flysch",
                    "depth_start_tvd": 3880.0,
                    "depth_end_tvd": 3930.0,
                    "event_type": "Gas Kick",
                    "severity": "CRITICAL",
                    "root_cause": "Tectonically sheared crushed flysch zone with sudden high-pressure hydrocarbon gas breakout into wellbore.",
                    "mitigation_applied": "Immediate BOP space-out and shut-in; killed well using Engineer's Method with 14.2 ppg kill mud.",
                    "npt_hours": 30.0,
                }
            ]
        }

        # Query all wells
        wells = db.query(WellMaster).all()
        print(f"Total wells in database: {len(wells)}")

        new_events = []
        new_logs = []

        for w in wells:
            wid = w.well_id.upper()
            if wid.startswith("OIL-RAJ"):
                reg = "rajasthan"
            elif wid.startswith("OIL-KG"):
                reg = "kg"
            elif wid.startswith("OIL-MZ"):
                reg = "mizoram"
            else:
                continue

            # Check if this well already has events
            ev_count = db.query(SyntheticEvent).filter(SyntheticEvent.well_id == w.well_id).count()
            if ev_count == 0:
                defs = regional_events_defs.get(reg, [])
                for d in defs:
                    # Slightly jitter depth per well
                    seed_offset = (int(sum(ord(c) for c in w.well_id)) % 30) - 15.0
                    d_start = max(100.0, round(d["depth_start_tvd"] + seed_offset, 1))
                    d_end = round(d_start + (d["depth_end_tvd"] - d["depth_start_tvd"]), 1)
                    
                    text_for_embed = f"{d['event_type']} {d['formation']} {d['root_cause']} {d['mitigation_applied']}"
                    try:
                        emb = get_embedding(text_for_embed)
                    except Exception:
                        emb = _pseudo_embedding(text_for_embed)

                    ev = SyntheticEvent(
                        well_id=w.well_id,
                        depth_start_tvd=d_start,
                        depth_end_tvd=d_end,
                        formation=d["formation"],
                        event_type=d["event_type"],
                        severity=d["severity"],
                        root_cause=d["root_cause"],
                        mitigation_applied=d["mitigation_applied"],
                        npt_hours=d["npt_hours"],
                        data_source="synthetic_calibrated",
                        embedding=emb
                    )
                    new_events.append(ev)

            # Check if this well already has logs
            log_count = db.query(WellLog).filter(WellLog.well_id == w.well_id).count()
            if log_count == 0:
                tvd_max = float(w.total_depth_tvd or 3500.0)
                depths = np.linspace(100.0, tvd_max, 120)
                for z in depths:
                    # Generate geologically realistic logs based on region
                    if reg == "rajasthan":
                        # Pariwar sand (low GR 35-55), Baisakhi shale (high GR 90-130), Jodhpur sand (medium GR 45-70, high res 25-60), Bilara carbonate (low GR 20-40, high res 80-200)
                        if z < 1200:
                            form = "Pariwar Formation"
                            gr = 45.0 + 15.0 * np.sin(z / 40.0) + random.uniform(-5, 5)
                            res = 8.0 + random.uniform(-1, 2)
                        elif z < 1800:
                            form = "Baisakhi Formation"
                            gr = 105.0 + 20.0 * np.cos(z / 50.0) + random.uniform(-8, 8)
                            res = 4.0 + random.uniform(-0.5, 1)
                        elif z < 2300:
                            form = "Jodhpur Sandstone"
                            gr = 58.0 + 12.0 * np.sin(z / 30.0) + random.uniform(-6, 6)
                            res = 35.0 + 15.0 * np.cos(z / 45.0) + random.uniform(-3, 3)
                        else:
                            form = "Bilara Carbonates"
                            gr = 28.0 + 8.0 * np.sin(z / 60.0) + random.uniform(-4, 4)
                            res = 95.0 + 35.0 * np.sin(z / 50.0) + random.uniform(-10, 10)
                    elif reg == "kg":
                        # Deepwater marine silt (60-80), Gumbo clay (very high GR 120-160, low res 1.5-3), Ravva sand (low GR 40-65, high gas res 40-120), Cretaceous basement (variable 70-110)
                        if z < 800:
                            form = "Shallow Marine Sediments"
                            gr = 68.0 + 10.0 * np.sin(z / 50.0) + random.uniform(-6, 6)
                            res = 2.5 + random.uniform(-0.4, 0.4)
                        elif z < 1800:
                            form = "Godavari Gumbo"
                            gr = 135.0 + 15.0 * np.sin(z / 40.0) + random.uniform(-8, 8)
                            res = 2.0 + random.uniform(-0.3, 0.3)
                        elif z < 3200:
                            form = "Ravva Formation"
                            gr = 52.0 + 14.0 * np.cos(z / 35.0) + random.uniform(-5, 5)
                            res = 55.0 + 25.0 * np.sin(z / 30.0) + random.uniform(-5, 5)
                        else:
                            form = "Cretaceous Basement"
                            gr = 90.0 + 20.0 * np.sin(z / 70.0) + random.uniform(-7, 7)
                            res = 20.0 + 8.0 * np.cos(z / 40.0) + random.uniform(-2, 2)
                    else: # mizoram
                        # Bokabil (75-95), Upper Bhuban (90-120), Middle Bhuban hard dipping shale (115-145), Disang flysch (85-110)
                        if z < 1500:
                            form = "Bokabil Formation"
                            gr = 85.0 + 12.0 * np.sin(z / 45.0) + random.uniform(-5, 5)
                            res = 6.0 + random.uniform(-1, 1)
                        elif z < 2500:
                            form = "Upper Bhuban"
                            gr = 105.0 + 15.0 * np.cos(z / 50.0) + random.uniform(-6, 6)
                            res = 8.5 + random.uniform(-1, 2)
                        elif z < 3400:
                            form = "Middle Bhuban"
                            gr = 125.0 + 18.0 * np.sin(z / 40.0) + random.uniform(-7, 7)
                            res = 14.0 + random.uniform(-2, 3)
                        else:
                            form = "Disang Flysch"
                            gr = 98.0 + 16.0 * np.cos(z / 60.0) + random.uniform(-6, 6)
                            res = 18.0 + random.uniform(-2, 4)

                    sonic = 185.0 * np.exp(-0.0003 * z) + (gr / 3.0) + random.uniform(-3, 3)
                    density = 2.1 + (z / 6000.0) + random.uniform(-0.04, 0.04)

                    wl = WellLog(
                        well_id=w.well_id,
                        depth_tvd=round(float(z), 1),
                        gamma_ray=round(float(max(10.0, gr)), 2),
                        resistivity=round(float(max(0.2, res)), 2),
                        sonic=round(float(sonic), 2),
                        density=round(float(density), 3),
                        formation_top=form
                    )
                    new_logs.append(wl)

        if new_events:
            print(f"Adding {len(new_events)} regional synthetic events to database...")
            db.bulk_save_objects(new_events)
            db.commit()
            print("Successfully seeded regional events!")
        else:
            print("Regional events already up to date.")

        if new_logs:
            print(f"Adding {len(new_logs)} regional well logs to database...")
            db.bulk_save_objects(new_logs)
            db.commit()
            print("Successfully seeded regional well logs!")
        else:
            print("Regional logs already up to date.")

    except Exception as e:
        db.rollback()
        print(f"Error seeding regional data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_regional_data()
