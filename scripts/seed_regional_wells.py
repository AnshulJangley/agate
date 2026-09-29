import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from database import SessionLocal
from models import WellMaster
from sqlalchemy import text

REGIONAL_WELLS = [
    # -------------------------------------------------------------
    # 1. Upper Assam Basin (Mature Shelf, Depleted Sands, Overpressure Barail)
    # -------------------------------------------------------------
    {
        "well_id": "OIL-BAGHJAN-1",
        "field_name": "Upper Assam",
        "kb_elevation": 35.0,
        "total_depth_tvd": 3520.0,
        "spud_date": "2024-01-10",
        "surface_lat": 27.58,
        "surface_lon": 95.37,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-BAGHJAN-4",
        "field_name": "Baghjan Field",
        "kb_elevation": 38.0,
        "total_depth_tvd": 3540.0,
        "spud_date": "2024-01-20",
        "surface_lat": 27.417,
        "surface_lon": 95.187,
        "data_source": "synthetic"
    },
    {
        "well_id": "OIL-NAHARKATIYA-1",
        "field_name": "Upper Assam",
        "kb_elevation": 40.5,
        "total_depth_tvd": 3490.0,
        "spud_date": "2024-02-15",
        "surface_lat": 27.28,
        "surface_lon": 95.33,
        "data_source": "force2020_relabeled"
    },
    {
        "well_id": "OIL-MORAN-1",
        "field_name": "Upper Assam",
        "kb_elevation": 30.0,
        "total_depth_tvd": 3600.0,
        "spud_date": "2024-03-05",
        "surface_lat": 27.18,
        "surface_lon": 94.93,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-DIKOM-1",
        "field_name": "Upper Assam",
        "kb_elevation": 38.0,
        "total_depth_tvd": 3550.0,
        "spud_date": "2024-04-12",
        "surface_lat": 27.43,
        "surface_lon": 95.07,
        "data_source": "synthetic"
    },
    {
        "well_id": "OIL-TENGAKHAT-1",
        "field_name": "Upper Assam",
        "kb_elevation": 42.0,
        "total_depth_tvd": 3650.0,
        "spud_date": "2024-05-20",
        "surface_lat": 27.30,
        "surface_lon": 95.25,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-KOTHALONI-1",
        "field_name": "Upper Assam",
        "kb_elevation": 37.5,
        "total_depth_tvd": 3700.0,
        "spud_date": "2024-06-18",
        "surface_lat": 27.35,
        "surface_lon": 95.35,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-HAPJAN-1",
        "field_name": "Upper Assam",
        "kb_elevation": 36.0,
        "total_depth_tvd": 3450.0,
        "spud_date": "2024-07-22",
        "surface_lat": 27.45,
        "surface_lon": 95.40,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-SHALMARI-1",
        "field_name": "Upper Assam",
        "kb_elevation": 39.0,
        "total_depth_tvd": 3800.0,
        "spud_date": "2024-08-11",
        "surface_lat": 27.38,
        "surface_lon": 95.12,
        "data_source": "synthetic_calibrated"
    },
    {
        "well_id": "OIL-KUSIJAN-1",
        "field_name": "Upper Assam",
        "kb_elevation": 36.5,
        "total_depth_tvd": 3580.0,
        "spud_date": "2024-08-25",
        "surface_lat": 27.52,
        "surface_lon": 95.42,
        "data_source": "upper_assam"
    },
    {
        "well_id": "OIL-HEBEDA-1",
        "field_name": "Upper Assam",
        "kb_elevation": 41.0,
        "total_depth_tvd": 3620.0,
        "spud_date": "2024-09-02",
        "surface_lat": 27.32,
        "surface_lon": 95.28,
        "data_source": "upper_assam"
    },

    # -------------------------------------------------------------
    # 2. Rajasthan Basin (Heavy Oil, Sand Abrasion, Cavernous Losses)
    # -------------------------------------------------------------
    {
        "well_id": "OIL-RAJ-BAGHEWALA-1",
        "field_name": "Rajasthan Basin",
        "kb_elevation": 180.0,
        "total_depth_tvd": 3100.0,
        "spud_date": "2024-03-15",
        "surface_lat": 27.95,
        "surface_lon": 72.10,
        "data_source": "rajasthan_basin"
    },
    {
        "well_id": "OIL-RAJ-BAGHEWALA-2",
        "field_name": "Rajasthan Basin",
        "kb_elevation": 182.0,
        "total_depth_tvd": 3180.0,
        "spud_date": "2024-04-02",
        "surface_lat": 27.98,
        "surface_lon": 72.15,
        "data_source": "rajasthan_basin"
    },
    {
        "well_id": "OIL-RAJ-TANOT-1",
        "field_name": "Rajasthan Basin",
        "kb_elevation": 140.0,
        "total_depth_tvd": 2900.0,
        "spud_date": "2024-04-10",
        "surface_lat": 27.30,
        "surface_lon": 70.80,
        "data_source": "jaisalmer_basin"
    },
    {
        "well_id": "OIL-RAJ-TANOT-2",
        "field_name": "Rajasthan Basin",
        "kb_elevation": 142.0,
        "total_depth_tvd": 2950.0,
        "spud_date": "2024-05-18",
        "surface_lat": 27.35,
        "surface_lon": 70.85,
        "data_source": "jaisalmer_basin"
    },
    {
        "well_id": "OIL-RAJ-DANDEWALA-1",
        "field_name": "Rajasthan Basin",
        "kb_elevation": 145.0,
        "total_depth_tvd": 3050.0,
        "spud_date": "2024-06-05",
        "surface_lat": 27.48,
        "surface_lon": 71.02,
        "data_source": "jaisalmer_basin"
    },

    # -------------------------------------------------------------
    # 3. Krishna-Godavari Deepwater (Shallow Water Flow, Gumbo Shale, HPHT)
    # -------------------------------------------------------------
    {
        "well_id": "OIL-KG-DEEPWATER-1",
        "field_name": "KG Deepwater",
        "kb_elevation": 25.0,
        "total_depth_tvd": 4500.0,
        "spud_date": "2024-05-01",
        "surface_lat": 16.25,
        "surface_lon": 82.40,
        "data_source": "kg_deepwater"
    },
    {
        "well_id": "OIL-KG-DWN-98-2",
        "field_name": "KG Deepwater",
        "kb_elevation": 28.0,
        "total_depth_tvd": 4680.0,
        "spud_date": "2024-05-25",
        "surface_lat": 16.35,
        "surface_lon": 82.52,
        "data_source": "kg_deepwater"
    },
    {
        "well_id": "OIL-KG-D6-OFFSHORE",
        "field_name": "KG Deepwater",
        "kb_elevation": 30.0,
        "total_depth_tvd": 4850.0,
        "spud_date": "2024-06-15",
        "surface_lat": 16.12,
        "surface_lon": 82.60,
        "data_source": "kg_deepwater"
    },
    {
        "well_id": "OIL-KG-YANAM-1",
        "field_name": "KG Deepwater",
        "kb_elevation": 15.0,
        "total_depth_tvd": 4100.0,
        "spud_date": "2024-07-01",
        "surface_lat": 16.65,
        "surface_lon": 82.25,
        "data_source": "kg_shelf"
    },
    {
        "well_id": "OIL-KG-AMALAPURAM-1",
        "field_name": "KG Deepwater",
        "kb_elevation": 12.0,
        "total_depth_tvd": 3950.0,
        "spud_date": "2024-07-20",
        "surface_lat": 16.58,
        "surface_lon": 82.02,
        "data_source": "kg_coastal"
    },

    # -------------------------------------------------------------
    # 4. Mizoram Fold Belt (Tectonic Stresses, Dipping Beds, Stuck Pipe)
    # -------------------------------------------------------------
    {
        "well_id": "OIL-MZ-AIZAWL-1",
        "field_name": "Mizoram Fold Belt",
        "kb_elevation": 950.0,
        "total_depth_tvd": 4200.0,
        "spud_date": "2024-06-12",
        "surface_lat": 23.72,
        "surface_lon": 92.70,
        "data_source": "mizoram_belt"
    },
    {
        "well_id": "OIL-MZ-MAMIT-1",
        "field_name": "Mizoram Fold Belt",
        "kb_elevation": 880.0,
        "total_depth_tvd": 4350.0,
        "spud_date": "2024-07-05",
        "surface_lat": 23.93,
        "surface_lon": 92.49,
        "data_source": "mizoram_belt"
    },
    {
        "well_id": "OIL-MZ-KOLASIB-1",
        "field_name": "Mizoram Fold Belt",
        "kb_elevation": 720.0,
        "total_depth_tvd": 4100.0,
        "spud_date": "2024-07-22",
        "surface_lat": 24.23,
        "surface_lon": 92.68,
        "data_source": "mizoram_belt"
    },
    {
        "well_id": "OIL-MZ-LUNGLEI-1",
        "field_name": "Mizoram Fold Belt",
        "kb_elevation": 1020.0,
        "total_depth_tvd": 4400.0,
        "spud_date": "2024-08-08",
        "surface_lat": 22.88,
        "surface_lon": 92.74,
        "data_source": "mizoram_belt"
    },
    {
        "well_id": "OIL-MZ-CHAMPHAI-1",
        "field_name": "Mizoram Fold Belt",
        "kb_elevation": 1150.0,
        "total_depth_tvd": 4500.0,
        "spud_date": "2024-08-28",
        "surface_lat": 23.47,
        "surface_lon": 93.33,
        "data_source": "mizoram_belt"
    }
]

def seed_regional_wells():
    session = SessionLocal()
    try:
        print("Upserting regional expansion wells into well_master...")
        for w in REGIONAL_WELLS:
            existing = session.query(WellMaster).filter(WellMaster.well_id == w["well_id"]).first()
            point_wkt = f"SRID=4326;POINT({w['surface_lon']} {w['surface_lat']})"
            
            if existing:
                print(f"Updating existing well: {w['well_id']}")
                existing.field_name = w["field_name"]
                existing.kb_elevation = w["kb_elevation"]
                existing.total_depth_tvd = w["total_depth_tvd"]
                existing.spud_date = w["spud_date"]
                existing.data_source = w["data_source"]
                existing.surface_location = point_wkt
            else:
                print(f"Inserting new well: {w['well_id']}")
                new_well = WellMaster(
                    well_id=w["well_id"],
                    field_name=w["field_name"],
                    kb_elevation=w["kb_elevation"],
                    total_depth_tvd=w["total_depth_tvd"],
                    spud_date=w["spud_date"],
                    data_source=w["data_source"],
                    surface_location=point_wkt
                )
                session.add(new_well)
        session.commit()
        print("Successfully seeded all regional wells!")
        
        # Verify
        all_wells = session.query(WellMaster).all()
        print(f"Total wells in database: {len(all_wells)}")
        for aw in all_wells:
            print(f" - {aw.well_id} ({aw.field_name})")
    except Exception as e:
        session.rollback()
        print(f"Error seeding regional wells: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    seed_regional_wells()
