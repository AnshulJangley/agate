import sys
import os
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from ml.service import HazardPredictionService
from simulator import TelemetrySimulator, WebSocketConnectionManager
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_physics_formulas():
    """Verify Teale MSE, Jorden & Shirley d_xc, and Eaton FG calculations."""
    svc = HazardPredictionService()
    
    # 1. Teale (1965) MSE in kpsi
    # Normal drilling: wob=14 klbf, rpm=105, rop=16.5 m/hr (~54.1 ft/hr), torque=13200 ft-lbf
    mse = svc.calculate_mse(wob=14.0, rpm=105.0, rop=16.5, torque=13200.0)
    assert mse > 0, "MSE must be positive"
    assert 200.0 < mse < 600.0, f"MSE {mse} kpsi out of realistic field range"
    # Hand-calculated exact expected value:
    # A_b = (pi/4)*8.5^2 = 56.7450 sq in
    # axial_psi = (14.0 * 1000) / 56.7450 = 246.72 psi
    # rop_ft_hr = 16.5 * 3.28084 = 54.13386 ft/hr
    # rotary_psi = (120 * pi * 105 * 13200) / (56.7450 * 54.13386) = 170094.79 psi
    # total_mse_psi = 246.72 + (170094.79 / 0.35) = 486231.84 psi -> 486.24 kpsi
    assert abs(mse - 486.24) < 0.05, f"Expected hand-calculated MSE 486.24 kpsi, got {mse}"

    # 2. Jorden & Shirley (1966) Corrected d-exponent (d_xc)
    d_xc = svc.calculate_d_xc(rop=16.5, rpm=105.0, wob=14.0, ecd=11.6)
    assert 0.5 <= d_xc <= 3.0, f"d_xc {d_xc} out of expected shale compaction trend range"

    # 3. Eaton (1969) Fracture Gradient Margin
    fg, margin = svc.calculate_fracture_gradient_margin(depth_tvd=2400.0, ecd=11.6, pore_pressure_ppg=10.2)
    assert fg > 11.6, f"Fracture gradient {fg} should exceed normal ECD"
    assert margin > 0, f"Margin {margin} ppg should be positive under safe conditions"

# Every hazard /api/predict-risk reports. The composite risk_probability is computed
# over all of these: the problem statement names mud losses, stuck pipe, overpressure,
# torque spikes AND cementing as risks to identify, so the headline number must not
# silently ignore two of them.
HAZARD_KEYS = (
    'gas_kick', 'lost_circulation', 'stuck_pipe', 'torque_drag',
    'overpressure', 'cementing',
)


def test_hazard_disaggregation_and_backward_compatibility():
    """
    Verify multi-hazard disaggregation:
    1. Gas Kick scenario elevates gas_kick probability and single risk_probability
    2. Stuck Pipe scenario elevates stuck_pipe probability and single risk_probability
    3. Backward-compatible risk_probability remains strictly consistent with gauges.
    """
    svc = HazardPredictionService()

    # Normal drilling
    normal_res = svc.predict_risk({
        'wob': 14.0, 'rpm': 105.0, 'rop': 16.5, 'torque': 13200.0,
        'mud_weight': 11.2, 'ecd': 11.6, 'flow_out_pct': 100.0,
        'pit_gain_bbl': 0.0, 'spp_psi': 2800.0
    })
    assert set(normal_res['hazards']) == set(HAZARD_KEYS), (
        f"hazard set changed: {sorted(normal_res['hazards'])} - update HAZARD_KEYS"
    )
    assert normal_res['risk_level'] == 'LOW', f"Normal drilling should be LOW risk, got {normal_res['risk_level']}"
    assert normal_res['hazards']['gas_kick']['probability'] < 0.35
    assert normal_res['hazards']['stuck_pipe']['probability'] < 0.35
    norm_probs = [normal_res['hazards'][h]['probability'] for h in HAZARD_KEYS]
    expected_norm_comp = round(0.70 * max(norm_probs) + 0.30 * (sum(norm_probs) / len(HAZARD_KEYS)), 3)
    assert normal_res['risk_probability'] == expected_norm_comp, "Normal risk_probability must strictly match composite formula"

    # Gas Kick influx
    kick_res = svc.predict_risk({
        'wob': 13.5, 'rpm': 105.0, 'rop': 24.5, 'torque': 14200.0,
        'mud_weight': 11.2, 'ecd': 11.1, 'flow_out_pct': 118.5,
        'pit_gain_bbl': 15.2, 'spp_psi': 2450.0
    })
    assert kick_res['hazards']['gas_kick']['probability'] >= 0.70, "Gas kick probability should be HIGH/CRITICAL"
    assert kick_res['hazards']['gas_kick']['level'] in ['HIGH', 'CRITICAL']
    # Prove ML model is actively contributing:
    # Max possible physics score is 0.96. 80% of 0.96 = 0.768.
    # If final probability > 0.768, the ML model MUST have output a strong positive signal (20% weight).
    assert kick_res['hazards']['gas_kick']['probability'] > 0.768, "ML model must contribute to elevate probability above the 80% physics ceiling"
    
    # Backward compatibility: single risk_probability must be elevated
    assert kick_res['risk_probability'] >= 0.70, f"Backward compatible risk_probability {kick_res['risk_probability']} should be >= 0.70"
    kick_probs = [kick_res['hazards'][h]['probability'] for h in HAZARD_KEYS]
    expected_kick_comp = round(0.70 * max(kick_probs) + 0.30 * (sum(kick_probs) / len(HAZARD_KEYS)), 3)
    assert kick_res['risk_probability'] == expected_kick_comp, (
        f"risk_probability {kick_res['risk_probability']} does not match composite formula "
        f"0.70*max + 0.30*mean ({expected_kick_comp})"
    )

    # Stuck pipe
    stuck_res = svc.predict_risk({
        'wob': 18.5, 'rpm': 25.0, 'rop': 0.3, 'torque': 29500.0,
        'mud_weight': 11.2, 'ecd': 11.6, 'flow_out_pct': 97.0,
        'pit_gain_bbl': 0.0, 'spp_psi': 3350.0
    })
    assert stuck_res['hazards']['stuck_pipe']['probability'] >= 0.75, "Stuck pipe probability should be HIGH/CRITICAL"
    assert stuck_res['risk_probability'] >= 0.75, f"Backward compatible risk_probability {stuck_res['risk_probability']} should be >= 0.75"
    stuck_probs = [stuck_res['hazards'][h]['probability'] for h in HAZARD_KEYS]
    expected_stuck_comp = round(0.70 * max(stuck_probs) + 0.30 * (sum(stuck_probs) / len(HAZARD_KEYS)), 3)
    assert stuck_res['risk_probability'] == expected_stuck_comp, (
        f"risk_probability {stuck_res['risk_probability']} does not match composite formula "
        f"0.70*max + 0.30*mean ({expected_stuck_comp})"
    )

def test_simulator_realistic_scenario_injection():
    """
    CORRECTION 4 REQUIREMENT:
    Scenario injector must modify underlying simulated telemetry realistically.
    Must NOT directly overwrite or fake the risk score.
    """
    sim = TelemetrySimulator()
    
    # Inject Gas Kick
    kick_state = sim.set_scenario("gas_kick")
    assert kick_state['data']['flow_out_pct'] > 110.0, "Gas kick must elevate flow_out_pct"
    assert kick_state['data']['pit_gain_bbl'] > 10.0, "Gas kick must show pit expansion"
    assert kick_state['data']['spp_psi'] < 2600.0, "Gas kick must show standpipe pressure drop"
    assert kick_state['prediction']['hazards']['gas_kick']['probability'] >= 0.70

    # Inject Lost Circulation
    loss_state = sim.set_scenario("lost_circulation")
    assert loss_state['data']['flow_out_pct'] < 80.0, "Lost circulation must drop flow_out_pct"
    assert loss_state['data']['pit_gain_bbl'] < -10.0, "Lost circulation must drop pit volume"
    assert loss_state['prediction']['hazards']['lost_circulation']['probability'] >= 0.65

    # Inject Stuck Pipe
    stuck_state = sim.set_scenario("stuck_pipe")
    assert stuck_state['data']['torque'] > 25000.0, "Stuck pipe must spike surface torque"
    assert stuck_state['data']['rop'] < 1.0, "Stuck pipe must collapse ROP to near zero"
    assert stuck_state['prediction']['hazards']['stuck_pipe']['probability'] >= 0.70

def test_api_endpoints():
    """Verify all required API endpoints for AGATE decision suite."""
    # Mock the DB to prevent real connections (e.g. Supabase) from failing the test
    from database import get_db
    mock_db = MagicMock()
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.first.return_value = None
    app.dependency_overrides[get_db] = lambda: mock_db
    
    # 1. Multi-hazard prediction
    pred_res = client.post("/api/predict-risk", json={
        "depth_tvd": 2240.0, "rop": 16.5, "wob": 14.0, "rpm": 105.0,
        "torque": 13200.0, "mud_weight": 11.2, "ecd": 11.6,
        "flow_out_pct": 100.0, "pit_gain_bbl": 0.0, "spp_psi": 2800.0
    })
    assert pred_res.status_code == 200
    pdata = pred_res.json()
    assert "risk_probability" in pdata
    assert "hazard_breakdown" in pdata or "hazards" in pdata
    assert "mse_kpsi" in pdata
    assert "d_xc" in pdata

    # 2. Simulator Scenario Injection
    scen_res = client.post("/api/simulator/scenario", json={"scenario": "gas_kick"})
    assert scen_res.status_code == 200
    assert scen_res.json()["scenario"] == "gas_kick"

    # 3. Simulator Control Play/Pause/Reset
    ctrl_res = client.post("/api/simulator/control", json={"action": "play"})
    assert ctrl_res.status_code == 200
    assert ctrl_res.json()["is_running"] is True

    ctrl_res2 = client.post("/api/simulator/control", json={"action": "pause"})
    assert ctrl_res2.status_code == 200
    assert ctrl_res2.json()["is_running"] is False

    # 4. Casing & Cementing Correlation
    casing_res = client.get("/api/wells/casing-cement-correlation?active_well=OIL-BAGHJAN-1")
    assert casing_res.status_code == 200
    cdata = casing_res.json()
    assert "comparison" in cdata
    assert len(cdata["comparison"]) >= 2
    assert "recommended_practices" in cdata

    # 5. Stratigraphic Cross-Section (3 Wells Fence Diagram)
    strat_res = client.get("/api/wells/stratigraphic-cross-section?active_well=OIL-BAGHJAN-1")
    assert strat_res.status_code == 200
    sdata = strat_res.json()
    assert len(sdata["wells"]) == 3, "Must display exactly 3 wells side-by-side"
    assert "tie_lines" in sdata
    assert len(sdata["tie_lines"]) >= 3

    # 6. Lookahead Radar (Reused by Proactive Proximity Warning)
    lookahead_res = client.get("/api/wells/OIL-BAGHJAN-1/lookahead?current_depth=2370&window_meters=250")
    assert lookahead_res.status_code == 200
    ldata = lookahead_res.json()
    assert "distance_to_next_formation_m" in ldata
    assert "next_formation" in ldata

    # 7. Pre-Spud Dossier
    dossier_res = client.get("/api/wells/OIL-BAGHJAN-1/dossier")
    assert dossier_res.status_code == 200

    # 8. Eaton's Method PPFG Safe Window
    ppfg_res = client.get("/api/wells/OIL-BAGHJAN-1/ppfg")
    assert ppfg_res.status_code == 200
    ppdata = ppfg_res.json()
    assert "pore_pressure_ppg" in ppdata
    assert "fracture_gradient_ppg" in ppdata
    assert "eaton_metadata" in ppdata
    assert ppdata["eaton_metadata"]["eaton_exponent_N"] == 3.0
    assert ppdata["eaton_metadata"]["overburden_gradient_ppg"] == 19.2
    assert ppdata["eaton_metadata"]["hydrostatic_gradient_ppg"] == 8.6
    assert "Eaton's method (1975)" in ppdata["eaton_metadata"]["notes"]

    # Hydrostatic behavior above ~1200m
    depths = ppdata["depths_tvd"]
    pp_vals = ppdata["pore_pressure_ppg"]
    fg_vals = ppdata["fracture_gradient_ppg"]
    for d, p in zip(depths, pp_vals):
        if d < 1200.0:
            assert abs(p - 8.6) < 0.05, f"Pore pressure above 1200m should be ~8.6 ppg hydrostatic, got {p} at {d}m"

    # Overpressure regime through 2200-2800m
    deep_pp = [p for d, p in zip(depths, pp_vals) if 2200.0 <= d <= 2800.0]
    assert max(deep_pp) >= 11.5, f"Expected overpressure peak in Barail zone (2200-2800m), max was {max(deep_pp)}"
    # Verify fracture gradient exceeds pore pressure throughout
    for p, f in zip(pp_vals, fg_vals):
        assert f > p, f"Fracture gradient ({f}) must exceed pore pressure ({p})"
        
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_multi_client_websocket_broadcast():
    """Verify centralized WebSocket manager broadcasts simultaneously to all clients."""
    manager = WebSocketConnectionManager()
    
    mock_ws1 = AsyncMock()
    mock_ws2 = AsyncMock()
    mock_ws3 = AsyncMock()
    
    await manager.connect(mock_ws1)
    await manager.connect(mock_ws2)
    await manager.connect(mock_ws3)
    
    assert len(manager.active_connections) == 3
    
    test_msg = {"status": "success", "scenario": "gas_kick", "data": {"depth_tvd": 2380.0}}
    await manager.broadcast(test_msg)
    
    mock_ws1.send_json.assert_awaited_once_with(test_msg)
    mock_ws2.send_json.assert_awaited_once_with(test_msg)
    mock_ws3.send_json.assert_awaited_once_with(test_msg)
    
    manager.disconnect(mock_ws2)
    assert len(manager.active_connections) == 2
