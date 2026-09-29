"""
Classical Statistical Change-Point & Anomaly Detection Service

Implements rolling Z-score detection and Cumulative Sum (CUSUM, Page 1954)
change-point detection across key telemetry channels (torque, ROP, flow_out_pct).
Operates as an independent transparent baseline alongside physics rules and ML models.
"""

from typing import List, Dict, Any, Optional
import numpy as np


def rolling_zscore(values: List[float], window: int = 20) -> float:
    """Returns the Z-score of the most recent value against a rolling window baseline."""
    if len(values) < window + 1:
        # Fallback: if we have at least 5 points, use available history
        if len(values) >= 5:
            baseline = values[:-1]
            mean = float(np.mean(baseline))
            std = float(np.std(baseline))
            if std < 1e-4:
                return 0.0
            return float((values[-1] - mean) / std)
        return 0.0

    baseline = values[-(window + 1):-1]
    mean, std = float(np.mean(baseline)), float(np.std(baseline))
    if std < 1e-4:
        return 0.0
    return float((values[-1] - mean) / std)


def cusum_detector(values: List[float], threshold: float = 5.0, drift: float = 0.5) -> Dict[str, Any]:
    """
    Classical CUSUM change-point detection (Page 1954).
    Returns whether a positive or negative persistent shift was detected.
    """
    if len(values) < 2:
        return {"triggered": False, "direction": None, "s_pos": 0.0, "s_neg": 0.0}

    mean = float(np.mean(values[:-1]))
    s_pos, s_neg = 0.0, 0.0

    for v in values:
        s_pos = max(0.0, s_pos + (v - mean - drift))
        s_neg = min(0.0, s_neg + (v - mean + drift))
        if s_pos > threshold:
            return {"triggered": True, "direction": "increasing", "s_pos": round(s_pos, 2), "s_neg": round(s_neg, 2)}
        if s_neg < -threshold:
            return {"triggered": True, "direction": "decreasing", "s_pos": round(s_pos, 2), "s_neg": round(s_neg, 2)}

    return {"triggered": False, "direction": None, "s_pos": round(s_pos, 2), "s_neg": round(s_neg, 2)}


class StatisticalAnomalyService:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(StatisticalAnomalyService, cls).__new__(cls)
        return cls._instance

    def __init__(self, baseline_window: int = 15, z_threshold: float = 2.5, cusum_threshold: float = 4.0):
        self.baseline_window = baseline_window
        self.z_threshold = z_threshold
        self.cusum_threshold = cusum_threshold
        # The rolling history is per-call-sequence state, but this class is a
        # singleton — so initialising it here (rather than in __new__, which
        # runs only once) is what guarantees a new caller starts from a clean
        # baseline. Previously the history survived across callers and one
        # well's telemetry silently contaminated the next one's Z-score/CUSUM
        # baseline. Callers that pass custom_history are unaffected.
        self.history = {"torque": [], "rop": [], "flow_out_pct": []}

    def reset(self):
        self.history = {"torque": [], "rop": [], "flow_out_pct": []}

    def add_reading(self, reading: Dict[str, Any]):
        t = float(reading.get("torque", 13000.0) or 13000.0)
        r = float(reading.get("rop", 15.0) or 15.0)
        f = float(reading.get("flow_out_pct", 100.0) or 100.0)

        self.history["torque"].append(t)
        self.history["rop"].append(r)
        self.history["flow_out_pct"].append(f)

        for k in self.history:
            if len(self.history[k]) > 40:
                self.history[k] = self.history[k][-40:]

    def evaluate_telemetry(
        self,
        current_reading: Dict[str, Any],
        custom_history: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """
        Evaluates rolling Z-score and CUSUM across torque, rop, and flow_out_pct.
        Surfaces an independent 'Statistical Anomaly Flag' without contaminating 80/20 physics/ML.
        """
        if custom_history is not None:
            torque_vals = [float(h.get("torque", 13000.0) or 13000.0) for h in custom_history]
            rop_vals = [float(h.get("rop", 15.0) or 15.0) for h in custom_history]
            flow_vals = [float(h.get("flow_out_pct", 100.0) or 100.0) for h in custom_history]
        else:
            self.add_reading(current_reading)
            torque_vals = self.history["torque"]
            rop_vals = self.history["rop"]
            flow_vals = self.history["flow_out_pct"]

        # Channel evaluations
        z_torque = round(rolling_zscore(torque_vals, window=15), 2)
        z_rop = round(rolling_zscore(rop_vals, window=15), 2)
        z_flow = round(rolling_zscore(flow_vals, window=15), 2)

        # CUSUM evaluations: torque threshold 4000 lbf-ft, ROP threshold 5 m/hr, flow threshold 8%
        c_torque = cusum_detector(torque_vals[-15:] if len(torque_vals) >= 15 else torque_vals, threshold=4000.0, drift=500.0)
        c_rop = cusum_detector(rop_vals[-15:] if len(rop_vals) >= 15 else rop_vals, threshold=5.0, drift=0.8)
        c_flow = cusum_detector(flow_vals[-15:] if len(flow_vals) >= 15 else flow_vals, threshold=8.0, drift=1.0)

        # Triggers if any channel has absolute Z-score >= 2.5 or CUSUM triggered
        torque_anom = bool(abs(z_torque) >= 2.5 or c_torque["triggered"])
        rop_anom = bool(abs(z_rop) >= 2.5 or c_rop["triggered"])
        flow_anom = bool(abs(z_flow) >= 2.5 or c_flow["triggered"])

        is_triggered = torque_anom or rop_anom or flow_anom

        reasons = []
        if torque_anom:
            reasons.append(f"Torque shift (Z={z_torque:+.1f}, CUSUM={c_torque.get('direction', 'none')})")
        if flow_anom:
            reasons.append(f"Flow-out shift (Z={z_flow:+.1f}, CUSUM={c_flow.get('direction', 'none')})")
        if rop_anom:
            reasons.append(f"ROP shift (Z={z_rop:+.1f}, CUSUM={c_rop.get('direction', 'none')})")

        return {
            "triggered": is_triggered,
            "anomaly_detected": is_triggered,
            "baseline_label": "Transparent Statistical Baseline (Z-score/CUSUM)",
            "summary": "; ".join(reasons) if reasons else "Nominal stationary baseline (all channels within ±2σ)",
            "z_scores": {
                "torque": z_torque,
                "rop": z_rop,
                "flow_out_pct": z_flow
            },
            "channels": {
                "torque": {"z_score": z_torque, "cusum": c_torque, "anomaly": torque_anom},
                "rop": {"z_score": z_rop, "cusum": c_rop, "anomaly": rop_anom},
                "flow_out_pct": {"z_score": z_flow, "cusum": c_flow, "anomaly": flow_anom}
            }
        }

    def evaluate_reading(self, reading: Dict[str, Any]) -> Dict[str, Any]:
        """Alias for evaluate_telemetry."""
        return self.evaluate_telemetry(reading)

