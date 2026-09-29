from pydantic import BaseModel, ConfigDict, field_validator
from typing import Optional, List, Any
from datetime import datetime
from geoalchemy2.elements import WKBElement

class DrillingParamResponse(BaseModel):
    id: int
    well_id: str
    timestamp: Optional[datetime] = None
    depth_md: Optional[float] = None
    depth_tvd: Optional[float] = None
    rop: Optional[float] = None
    wob: Optional[float] = None
    rpm: Optional[float] = None
    torque: Optional[float] = None
    mud_weight: Optional[float] = None
    ecd: Optional[float] = None
    mse: Optional[float] = None
    d_xc: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)

from pydantic import BaseModel, ConfigDict, computed_field

class EventResponse(BaseModel):
    id: int
    well_id: str
    depth_start_tvd: Optional[float] = None
    depth_end_tvd: Optional[float] = None
    formation: Optional[str] = None
    event_type: Optional[str] = None
    severity: Optional[str] = None
    root_cause: Optional[str] = None
    mitigation_applied: Optional[str] = None
    npt_hours: Optional[float] = None
    data_source: Optional[str] = "synthetic"

    @computed_field
    @property
    def depth_tvd(self) -> Optional[float]:
        return self.depth_start_tvd

    model_config = ConfigDict(from_attributes=True)

class WellLogResponse(BaseModel):
    id: int
    well_id: str
    depth_tvd: Optional[float] = None
    gamma_ray: Optional[float] = None
    resistivity: Optional[float] = None
    sonic: Optional[float] = None
    density: Optional[float] = None
    formation_top: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class WellResponse(BaseModel):
    id: int
    well_id: str
    field_name: Optional[str] = None
    kb_elevation: Optional[float] = None
    total_depth_tvd: Optional[float] = None
    spud_date: Optional[str] = None
    data_source: Optional[str] = "synthetic_calibrated"
    source: Optional[str] = None
    operator: Optional[str] = None
    is_synthetic: Optional[bool] = False
    formation_count: Optional[int] = None
    target_formation: Optional[str] = None
    primary_hazard: Optional[str] = None
    total_depth_m: Optional[float] = None
    bha_type: Optional[str] = None
    
    # We will output this as a dictionary {"lat": y, "lon": x}
    surface_location: Any = None

    @field_validator('surface_location', mode='before')
    @classmethod
    def extract_lat_lon(cls, v):
        if isinstance(v, WKBElement) or hasattr(v, 'data'):
            try:
                from geoalchemy2.shape import to_shape
                shape = to_shape(v)
                return {"lat": getattr(shape, "y", 0.0), "lon": getattr(shape, "x", 0.0)}
            except Exception:
                # If shapely is missing or parse fails, return string rep
                return str(v)
        return v

    model_config = ConfigDict(from_attributes=True)

class TelemetryInput(BaseModel):
    depth_tvd: float
    rop: float
    wob: float
    rpm: float
    torque: float
    mud_weight: float
    ecd: Optional[float] = None
    flow_out_pct: Optional[float] = None
    pit_gain_bbl: Optional[float] = None
    spp_psi: Optional[float] = None

class SHAPFactor(BaseModel):
    feature: str
    impact: float
    direction: str

class HazardMetric(BaseModel):
    probability: float
    level: str
    trigger_reason: str
    key_indicator: Optional[str] = None
    margin: Optional[float] = None
    # "physics+ml" when a trained model class backs the score; "physics" when it comes
    # from drilling mechanics alone. Overpressure and cementing are physics-only —
    # the model's four trained labels do not include them — and saying so in the
    # payload is better than letting them look model-backed.
    basis: Optional[str] = None

class HazardBreakdown(BaseModel):
    # A schema that lists a fixed set of keys silently DROPS any the service adds:
    # `HazardBreakdown` knew four hazards, so `overpressure` and `cementing` were
    # computed, returned by the service, and then stripped here before reaching the
    # client. The endpoint looked healthy and reported four hazards. When adding a
    # hazard to ml/service.py, add it here too, or it will vanish the same way.
    gas_kick: HazardMetric
    lost_circulation: HazardMetric
    stuck_pipe: HazardMetric
    torque_drag: HazardMetric
    overpressure: HazardMetric
    cementing: HazardMetric

class RiskPredictionResponse(BaseModel):
    risk_probability: float
    risk_level: str
    top_factors: List[SHAPFactor]
    hazards: Optional[HazardBreakdown] = None
    hazard_breakdown: Optional[HazardBreakdown] = None
    mse_kpsi: Optional[float] = None
    d_xc: Optional[float] = None
