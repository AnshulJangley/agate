import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient

import sys
import os
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from database import get_db
from main import app
from models import SyntheticEvent
from nlp.config import EMBEDDING_DIM

client = TestClient(app)

def test_live_ingestion_multi_hazard_lookahead():
    """
    Simulates ingesting a multi-hazard document (mud loss, gas kick, stuck pipe at different depths)
    and verifies that the Look-Ahead Radar correctly surfaces each distinct hazard as it enters the window.
    """
    mock_db = MagicMock()
    
    # 1. Simulate extraction of 3 distinct events from a single multi-hazard report
    event1 = SyntheticEvent(
        well_id="OIL-MULTI-HAZARD-1",
        depth_start_tvd=1800.0,
        depth_end_tvd=1800.0,
        formation="Tipam",
        event_type="Severe Mud Loss",
        severity="HIGH",
        root_cause="Highly permeable depleted zone",
        mitigation_applied="Pumped LCM pill",
        npt_hours=12.0,
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    event2 = SyntheticEvent(
        well_id="OIL-MULTI-HAZARD-1",
        depth_start_tvd=2100.0,
        depth_end_tvd=2100.0,
        formation="Barail",
        event_type="Gas Kick",
        severity="CRITICAL",
        root_cause="Unexpected overpressure sand",
        mitigation_applied="Shut-in and circulated kill weight mud",
        npt_hours=36.0,
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    event3 = SyntheticEvent(
        well_id="OIL-MULTI-HAZARD-1",
        depth_start_tvd=2245.0,
        depth_end_tvd=2245.0,
        formation="Barail",
        event_type="Differential Sticking",
        severity="HIGH",
        root_cause="High overbalance across permeable zone",
        mitigation_applied="Worked pipe and spotted freeing pill",
        npt_hours=24.0,
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    # Configure mock to return our multi-event list
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = [event1, event2, event3]
    
    app.dependency_overrides[get_db] = lambda: mock_db

    # 2. Query Look-Ahead Radar such that all 3 events fall into the window
    # e.g. currently at 1750m, window is 500m (covers 1750m - 2250m)
    response = client.get(
        "/api/wells/OIL-BAGHJAN-1/lookahead",
        params={
            "current_depth": 1750.0,
            "window_meters": 500.0
        }
    )
    
    assert response.status_code == 200
    data = response.json()
    
    offset_events = data.get("events", [])
    
    # 3. Assert all 3 distinct hazards are correctly returned
    extracted_types = [ev["event_type"] for ev in offset_events if ev["well_id"] == "OIL-MULTI-HAZARD-1"]
    
    assert "Severe Mud Loss" in extracted_types
    assert "Gas Kick" in extracted_types
    assert "Differential Sticking" in extracted_types
    assert len(extracted_types) == 3
    
    # Print out the events to confirm for the user
    import json
    print("\n\n=== MULTI-HAZARD LOOK-AHEAD RESPONSE ===")
    print(json.dumps(offset_events, indent=2))
    print("========================================\n")


def test_cross_region_lookahead_boundaries():
    """
    Verifies Look-Ahead Radar correctly surfaces multi-hazard events within a region,
    never across regions, and correctly sets the data_source label based on region.
    """
    mock_db = MagicMock()
    
    # 4 distinct wells in 4 different regions
    ev_assam = SyntheticEvent(
        well_id="OIL-BAGHJAN-4",
        depth_start_tvd=1800.0,
        depth_end_tvd=1800.0,
        formation="Tipam",
        event_type="Severe Mud Loss",
        severity="HIGH",
        data_source="synthetic",
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    ev_raj = SyntheticEvent(
        well_id="OIL-RAJ-BAGHEWALA-1",
        depth_start_tvd=1900.0,
        depth_end_tvd=1900.0,
        formation="Jodhpur Sandstone",
        event_type="Gas Kick",
        severity="CRITICAL",
        data_source="synthetic_uncalibrated",
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    ev_kg = SyntheticEvent(
        well_id="OIL-KG-DEEPWATER-1",
        depth_start_tvd=2000.0,
        depth_end_tvd=2000.0,
        formation="Godavari Gumbo",
        event_type="Tight Hole",
        severity="HIGH",
        data_source="synthetic_uncalibrated",
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    ev_mizo = SyntheticEvent(
        well_id="OIL-MZ-AIZAWL-1",
        depth_start_tvd=2100.0,
        depth_end_tvd=2100.0,
        formation="Bhuban",
        event_type="Packoff",
        severity="CRITICAL",
        data_source="synthetic_uncalibrated",
        embedding=[0.0] * EMBEDDING_DIM
    )
    
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.all.return_value = [ev_assam, ev_raj, ev_kg, ev_mizo]
    
    app.dependency_overrides[get_db] = lambda: mock_db
    
    # 1. Query from an Assam well
    resp_assam = client.get("/api/wells/OIL-BAGHJAN-1/lookahead", params={"current_depth": 1700.0, "window_meters": 1000.0})
    events_assam = resp_assam.json().get("events", [])
    assert len(events_assam) == 1
    assert events_assam[0]["well_id"] == "OIL-BAGHJAN-4"
    assert events_assam[0]["data_source"] == "synthetic"
    
    # 2. Query from a Rajasthan well
    resp_raj = client.get("/api/wells/OIL-RAJ-TANOT-1/lookahead", params={"current_depth": 1700.0, "window_meters": 1000.0})
    events_raj = resp_raj.json().get("events", [])
    assert len(events_raj) == 1
    assert events_raj[0]["well_id"] == "OIL-RAJ-BAGHEWALA-1"
    assert events_raj[0]["data_source"] == "synthetic_uncalibrated"
    
    # 3. Query from a KG well
    resp_kg = client.get("/api/wells/OIL-KG-DWN-98-2/lookahead", params={"current_depth": 1700.0, "window_meters": 1000.0})
    events_kg = resp_kg.json().get("events", [])
    assert len(events_kg) == 1
    assert events_kg[0]["well_id"] == "OIL-KG-DEEPWATER-1"
    assert events_kg[0]["data_source"] == "synthetic_uncalibrated"
    
    # 4. Query from a Mizoram well
    resp_mizo = client.get("/api/wells/OIL-MZ-MAMIT-1/lookahead", params={"current_depth": 1700.0, "window_meters": 1000.0})
    events_mizo = resp_mizo.json().get("events", [])
    assert len(events_mizo) == 1
    assert events_mizo[0]["well_id"] == "OIL-MZ-AIZAWL-1"
    assert events_mizo[0]["data_source"] == "synthetic_uncalibrated"
    
    import json
    print("\n\n=== CROSS-REGION BOUNDARY TEST RESPONSE ===")
    print("Assam View:", json.dumps(events_assam[0], indent=2))
    print("Rajasthan View:", json.dumps(events_raj[0], indent=2))
    print("KG View:", json.dumps(events_kg[0], indent=2))
    print("Mizoram View:", json.dumps(events_mizo[0], indent=2))
    print("===========================================\n")
