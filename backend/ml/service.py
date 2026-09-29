import os
import json
import joblib
import pandas as pd
import numpy as np

#: Pounds per gallon in one unit of specific gravity.
PPG_PER_SG = 8.345

#: Model features that are densities, and therefore unit-sensitive.
DENSITY_FEATURES = ("mud_weight", "ecd")


def to_model_units(feature: str, value: float) -> float:
    """
    Convert a platform density value (ppg) into the unit the model was trained in (sg).

    `ml_training_data.csv` carries mud_weight as a constant 1.17 and ecd as 1.20-1.24 —
    specific gravity — while every other layer of the platform uses ppg. The model is fed
    through this function so it sees values in its own units.

    The 3.0 threshold separates the scales unambiguously: drilling mud weights are 8-20
    ppg and 1-2 sg, with nothing in between. A value already in sg — including the 1.17
    baseline from model_metadata.json — passes through untouched, so this is safe to
    apply unconditionally.
    """
    if feature in DENSITY_FEATURES and value > 3.0:
        return value / PPG_PER_SG
    return value


class HazardPredictionService:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(HazardPredictionService, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        """Initializes empty placeholders. Artifacts are loaded lazily on first prediction."""
        self.model = None
        self.explainer = None
        self.metadata = {}

    def _ensure_artifacts_loaded(self):
        """Loads model artifacts from disk on first use (lazy loading)."""
        if self.model is not None and self.metadata:
            return
            
        base_dir = os.path.dirname(os.path.abspath(__file__))
        artifacts_dir = os.path.join(base_dir, 'artifacts')
        
        # Load Model
        if self.model is None:
            model_path = os.path.join(artifacts_dir, 'lgbm_hazard_model.joblib')
            if os.path.exists(model_path):
                self.model = joblib.load(model_path)
                
        # Load Metadata
        if not self.metadata:
            meta_path = os.path.join(artifacts_dir, 'model_metadata.json')
            if os.path.exists(meta_path):
                with open(meta_path, 'r') as f:
                    self.metadata = json.load(f)
                    
        # Load SHAP Explainer
        if self.explainer is None:
            shap_path = os.path.join(artifacts_dir, 'shap_explainer.joblib')
            if os.path.exists(shap_path):
                try:
                    self.explainer = joblib.load(shap_path)
                except Exception:
                    pass

    def calculate_mse(self, wob: float, rpm: float, rop: float, torque: float, bit_diameter_in: float = 8.5) -> float:
        """
        Calculates Mechanical Specific Energy (MSE) in kpsi.
        Formula Source: Teale, R. (1965), "The Concept of Specific Energy in Rock Drilling", 
                        International Journal of Rock Mechanics and Mining Sciences & Geomechanics Abstracts, 
                        Vol. 2, No. 1, pp. 57-73.
        
        Oilfield Formula:
            MSE = (WOB / A_b) + (120 * pi * N * T) / (A_b * ROP)
        where:
            WOB = Weight on bit in lbf (input wob in klbf, multiplied by 1000)
            A_b = Area of drill bit in sq in = (pi / 4) * D_bit^2
            N   = Rotary speed in RPM
            T   = Torque in ft-lbf
            ROP = Rate of penetration in ft/hr (converted from m/hr: m/hr * 3.28084)
            D_b = Drill bit diameter in inches
        """
        if rop <= 0.05:
            return 115.0  # High MSE limit during stalling / packoff
            
        # ESTIMATED: standard 8.5 inch bit diameter assumed when unlogged in operational telemetry
        d_bit = bit_diameter_in if bit_diameter_in and bit_diameter_in > 0 else 8.5
        
        # Bit area in square inches: A_b = (pi / 4) * D^2
        area_sq_in = (np.pi / 4.0) * (d_bit ** 2)
        
        # Convert WOB from klbf (thousand pounds-force) to lbf
        wob_lbf = wob * 1000.0
        
        # Convert ROP from m/hr to ft/hr (standard field unit for Teale equation)
        rop_ft_hr = rop * 3.28084
        
        # Axial thrust component (psi)
        axial_psi = wob_lbf / area_sq_in
        
        # Rotary torque component (psi)
        # 120 * pi * N * T / (A_b * ROP)
        rotary_psi = (120.0 * np.pi * rpm * torque) / (area_sq_in * rop_ft_hr)
        
        # ESTIMATED: mechanical drill bit efficiency factor eta ~ 0.35 not sourced from real formation core data
        eta = 0.35
        
        # Total MSE in kpsi (thousands of psi)
        total_mse_psi = axial_psi + (rotary_psi / eta)
        return float(round(total_mse_psi / 1000.0, 2))

    def calculate_d_xc(self, rop: float, rpm: float, wob: float, ecd: float, bit_diameter_in: float = 8.5) -> float:
        """
        Calculates Corrected d-exponent (d_xc) for formation pore pressure & overpressure detection.
        Formula Source: Jorden, J.R. and Shirley, O.J. (1966), "Application of Drilling Performance Data 
                        to Overpressure Detection", SPE-1407, Journal of Petroleum Technology, 18(11), pp. 1387-1394.
        
        Oilfield Formula:
            d   = log10(ROP / (60 * N)) / log10(12 * WOB / (10^6 * D_bit))
            d_xc = d * (rho_normal / ECD)
        where:
            ROP        = Rate of penetration in ft/hr (converted from m/hr: m/hr * 3.28084)
            N          = Rotary speed in RPM
            WOB        = Weight on bit in klbf
            D_bit      = Bit diameter in inches (default 8.5 in)
            rho_normal = Normal pore pressure gradient equivalent mud weight (9.0 ppg)
            ECD        = Equivalent circulating density in ppg
        """
        if rpm <= 0.5 or wob <= 0.5 or rop <= 0.05:
            return 1.40  # Baseline normal shale compaction trend default
            
        # Convert ROP from m/hr to ft/hr
        rop_ft_hr = rop * 3.28084
        
        # ESTIMATED: standard bit diameter 8.5 inches assumed when bit size is unlogged
        d_bit = bit_diameter_in if bit_diameter_in and bit_diameter_in > 0 else 8.5
        
        # Numerator: log10(ROP / (60 * N))
        arg_num = rop_ft_hr / (60.0 * rpm)
        if arg_num <= 0:
            return 1.40
        log_num = np.log10(arg_num)
        
        # Denominator: log10(12 * WOB / (10^6 * D_bit))
        # Note: WOB in lbf = wob_klbf * 1000 -> 12 * (wob * 1000) / (10^6 * D_bit) = 12 * wob / (1000 * D_bit)
        arg_den = (12.0 * wob) / (1000.0 * d_bit)
        if arg_den <= 0 or arg_den == 1.0:
            return 1.40
        log_den = np.log10(arg_den)
        
        raw_d = log_num / log_den
        
        # ESTIMATED: normal pore pressure gradient assumed at 9.0 ppg (fresh/brackish formation water gradient) not sourced from real formation data
        rho_normal = 9.0  # ppg
        
        eff_ecd = ecd if ecd and ecd > 5.0 else 10.5
        d_xc = raw_d * (rho_normal / eff_ecd)
        
        # Clamp to realistic physical range [0.4, 3.5]
        return float(round(max(0.4, min(3.5, d_xc)), 3))

    def regional_geomechanics(self, depth_tvd: float, pore_pressure_ppg: float = 10.2,
                              well_id: str = "") -> tuple:
        """
        Region-calibrated pore pressure, overburden gradient and Poisson's ratio.

        Extracted from calculate_fracture_gradient_margin, which needed all three to
        derive a fracture gradient. Overpressure and cementing risk need the *pore
        pressure* equivalent directly: an overpressured zone is one where pore
        pressure is closing on the mud column, which a fracture margin alone cannot
        express.

        Returns (pp_ppg, obg_ppg, nu).
        """
        wid = (well_id or "").upper()
        if "KG" in wid:
            obg_ppg = 17.6  # Deepwater reduced overburden
            nu = 0.42       # Higher Poisson's ratio for marine gumbo
            pp = pore_pressure_ppg if pore_pressure_ppg and pore_pressure_ppg > 5.0 else (13.0 if depth_tvd > 2500 else 11.0)
        elif "RAJ" in wid:
            obg_ppg = 18.8  # Desert basin sandstone-carbonate
            nu = 0.32 if depth_tvd > 2200 else 0.38  # Bilara carbonates have lower Poisson ratio
            pp = pore_pressure_ppg if pore_pressure_ppg and pore_pressure_ppg > 5.0 else 9.6
        elif "MZ" in wid or "MIZO" in wid:
            obg_ppg = 19.8  # Compressive fold belt tectonic horizontal stress
            nu = 0.41
            pp = pore_pressure_ppg if pore_pressure_ppg and pore_pressure_ppg > 5.0 else (13.2 if depth_tvd > 2500 else 10.5)
        else:
            obg_ppg = 19.23
            nu = 0.40
            pp = pore_pressure_ppg if pore_pressure_ppg and pore_pressure_ppg > 5.0 else 10.2
        return float(pp), float(obg_ppg), float(nu)

    def calculate_fracture_gradient_margin(self, depth_tvd: float, ecd: float, pore_pressure_ppg: float = 10.2, well_id: str = "") -> tuple:
        """
        Calculates Formation Fracture Gradient (FG) and current drilling margin in ppg.
        Formula Source: Eaton, B.A. (1969), "Fracture Gradient Prediction and Its Application in
        Deep Drilling Operations", SPE-2163-PA, Journal of Petroleum Technology, 21(10), pp. 1353-1360.
        Calibrated to regional geomechanical regimes across Indian basins.
        """
        pp, obg_ppg, nu = self.regional_geomechanics(depth_tvd, pore_pressure_ppg, well_id)

        stress_ratio = nu / (1.0 - nu)
        fg_ppg = pp + stress_ratio * (obg_ppg - pp)
        current_ecd = ecd if ecd and ecd > 5.0 else (pp + 0.5)
        margin_ppg = fg_ppg - current_ecd
        return float(round(fg_ppg, 2)), float(round(margin_ppg, 2))

    def get_feature_description(self, feature_name, is_positive):
        """Generates human-readable descriptions for SHAP factors based on impact direction."""
        direction = "Elevated" if is_positive else "Reduced"
        
        descriptions = {
            'torque': f"{direction} surface torque",
            'rop': f"{direction} rate of penetration",
            'wob': f"{direction} weight on bit",
            'rpm': f"{direction} rotary speed",
            'mud_weight': f"{direction} mud weight",
            'ecd': f"{direction} equivalent circulating density",
            'mse': f"{direction} mechanical specific energy",
            'd_xc': f"{direction} corrected d-exponent",
            'flow_out_pct': f"{direction} delta flow return rate",
            'pit_gain_bbl': f"{direction} active pit volume",
            'spp_psi': f"{direction} standpipe pressure",
            'torque_roll_std_5': f"{direction} torque volatility",
            'rop_roll_mean_5': f"{direction} rolling rate of penetration",
        }
        
        return descriptions.get(feature_name, f"{direction} {feature_name.replace('_', ' ')}")

    def predict_risk(self, current_params: dict, history_params: list | None = None) -> dict:
        """
        Runs unified ML prediction, physics-based multi-hazard disaggregation, and SHAP explainability.
        Computes 4 disaggregated hazards (Gas Kick, Lost Circulation, Stuck Pipe, Torque & Drag)
        and preserves a meaningful, backward-compatible single risk_probability.
        """
        self._ensure_artifacts_loaded()
        if not self.model or not self.metadata:
            return {"error": "Model artifacts not loaded."}
            
        features_required = self.metadata.get("features", [])
        baselines = self.metadata.get("default_baselines", {})
        
        # 1. Parameter parsing
        wob = float(current_params.get('wob') if current_params.get('wob') is not None else baselines.get('wob', 12.0))
        rpm = float(current_params.get('rpm') if current_params.get('rpm') is not None else baselines.get('rpm', 100.0))
        rop = float(current_params.get('rop') if current_params.get('rop') is not None else baselines.get('rop', 15.0))
        torque = float(current_params.get('torque') if current_params.get('torque') is not None else baselines.get('torque', 12000.0))
        mud_weight = float(current_params.get('mud_weight') if current_params.get('mud_weight') is not None else baselines.get('mud_weight', 10.8))
        ecd = float(current_params.get('ecd') if current_params.get('ecd') is not None else (mud_weight + 0.4))
        depth_tvd = float(current_params.get('depth_tvd') if current_params.get('depth_tvd') is not None else 2200.0)
        
        # Extended physical sensor telemetry
        flow_out_pct = float(current_params.get('flow_out_pct') if current_params.get('flow_out_pct') is not None else 100.0)
        pit_gain_bbl = float(current_params.get('pit_gain_bbl') if current_params.get('pit_gain_bbl') is not None else 0.0)
        spp_psi = float(current_params.get('spp_psi') if current_params.get('spp_psi') is not None else 2800.0)
        
        # 2. Rigorous Physics Calculations
        mse_kpsi = self.calculate_mse(wob, rpm, rop, torque)
        d_xc = self.calculate_d_xc(rop, rpm, wob, ecd)
        fg_ppg, fg_margin_ppg = self.calculate_fracture_gradient_margin(depth_tvd, ecd, well_id=str(current_params.get('well_id', '')))
        
        current_params['mse'] = current_params.get('mse', mse_kpsi)
        current_params['d_xc'] = current_params.get('d_xc', d_xc)
        
        # Rolling metrics
        if history_params and len(history_params) >= 4:
            history_rop = [float(h.get('rop', 0)) for h in history_params] + [rop]
            history_torque = [float(h.get('torque', 0)) for h in history_params] + [torque]
            current_params['rop_roll_mean_5'] = float(np.mean(history_rop[-5:]))
            current_params['torque_roll_std_5'] = float(np.std(history_torque[-5:]))
        else:
            current_params['rop_roll_mean_5'] = current_params.get('rop_roll_mean_5', rop)
            current_params['torque_roll_std_5'] = current_params.get('torque_roll_std_5', 450.0)
            
        torque_roll_std = float(current_params['torque_roll_std_5'])
        
        # 3. Vectorize inputs for LightGBM
        #
        # Unit boundary. The model was trained on data/processed/ml_training_data.csv, in
        # which mud_weight is a constant 1.17 and ecd ranges 1.20-1.24 — SPECIFIC GRAVITY.
        # Every other layer of this platform uses ppg: the physics functions (rho_normal
        # 9.0 ppg, regional pore pressures in ppg), the simulator (10.8-13.6), and the
        # seeded events. Feeding ppg straight through put those two features ~9x outside
        # the range the model ever saw.
        #
        # Converted here, at the single point the model is fed, rather than changing either
        # side's native units. The 3.0 threshold separates the two scales cleanly — ppg mud
        # weights are 8-20, specific gravities are 1-2 — so a value already in sg (including
        # the 1.17 baseline below) is left alone.
        #
        # BE HONEST ABOUT THE REMAINDER: this fixes mud_weight and ecd only. d_xc is still
        # fed ~0.94 against a training range of 8.22-8.24, and depth/rop/wob/rpm/torque are
        # outside a training set that spans only 2850-2890 m. Three declared features
        # (flow_out_pct, pit_gain_bbl, spp_psi) are absent from the training CSV entirely.
        # The 20% ML weight is therefore nominal on this corpus — the 80% physics term is
        # carrying the result. See §5.16 in the handoff.
        input_data = {}
        for f in features_required:
            val = current_params.get(f)
            raw = float(val) if val is not None else float(baselines.get(f, 0.0))
            input_data[f] = [to_model_units(f, raw)]

        df_input = pd.DataFrame(input_data)
        
        # 4. Base ML Model Prediction
        ml_probs = self.model.predict_proba(df_input)[0]
        classes = list(self.model.classes_)
        
        ml_kick = float(ml_probs[classes.index('Gas Kick')]) if 'Gas Kick' in classes else 0.0
        ml_loss = float(ml_probs[classes.index('Lost Circulation')]) if 'Lost Circulation' in classes else 0.0
        ml_stuck = float(ml_probs[classes.index('Stuck Pipe')]) if 'Stuck Pipe' in classes else 0.0
        ml_torque = float(ml_probs[classes.index('Torque & Drag')]) if 'Torque & Drag' in classes else 0.0
        
        # 5. Physics-Driven Multi-Hazard Disaggregation
        
        # 5.1 Gas Kick Risk
        # Physical drivers: flow_out > 100%, positive pit gain, SPP decrease, low d_xc (abnormal pressure)
        kick_score = 0.08
        kick_reasons = []
        if flow_out_pct > 103.0:
            delta_flow = flow_out_pct - 100.0
            kick_score += min(0.45, delta_flow * 0.032)
            kick_reasons.append(f"Delta-flow out +{delta_flow:.1f}% indicates formation influx")
        if pit_gain_bbl > 2.0:
            kick_score += min(0.40, pit_gain_bbl * 0.025)
            kick_reasons.append(f"Pit volume expansion +{pit_gain_bbl:.1f} bbl")
        if spp_psi < 2650.0:
            kick_score += 0.15
            kick_reasons.append(f"Standpipe pressure decrease (-{2800.0 - spp_psi:.0f} psi)")
        if d_xc < 1.10:
            kick_score += 0.20
            kick_reasons.append(f"d_xc drop ({d_xc:.2f}) indicates abnormal transition zone")
        if rop > 22.0 and wob > 12.0:
            kick_score += 0.10
            kick_reasons.append("Drilling break detected in permeable interval")
            
        physics_kick_prob = float(round(max(0.04, min(0.96, kick_score)), 3))
        kick_prob = float(round(0.80 * physics_kick_prob + 0.20 * ml_kick, 3))
        kick_level = "CRITICAL" if kick_prob >= 0.80 else "HIGH" if kick_prob >= 0.65 else "MEDIUM" if kick_prob >= 0.35 else "LOW"
        kick_reason = "; ".join(kick_reasons) if kick_reasons else "Normal circulating parameters; no influx detected"
        
        # 5.2 Lost Circulation Risk
        # Physical drivers: flow_out < 97%, negative pit gain, low FG margin (ECD approaching FG)
        loss_score = 0.07
        loss_reasons = []
        if flow_out_pct < 97.0:
            deficit_flow = 100.0 - flow_out_pct
            loss_score += min(0.50, deficit_flow * 0.035)
            loss_reasons.append(f"Flow-out deficit -{deficit_flow:.1f}% (fluid seepage)")
        if pit_gain_bbl < -2.0:
            loss_score += min(0.40, abs(pit_gain_bbl) * 0.025)
            loss_reasons.append(f"Active pit volume loss ({pit_gain_bbl:.1f} bbl)")
        if fg_margin_ppg < 0.60:
            loss_score += 0.30
            loss_reasons.append(f"Low fracture margin ({fg_margin_ppg:.2f} ppg to breakdown)")
        elif fg_margin_ppg < 0.0:
            loss_score += 0.60
            loss_reasons.append(f"ECD exceeds formation fracture gradient by {abs(fg_margin_ppg):.2f} ppg")
            
        physics_loss_prob = float(round(max(0.03, min(0.96, loss_score)), 3))
        loss_prob = float(round(0.80 * physics_loss_prob + 0.20 * ml_loss, 3))
        loss_level = "CRITICAL" if loss_prob >= 0.80 else "HIGH" if loss_prob >= 0.65 else "MEDIUM" if loss_prob >= 0.35 else "LOW"
        loss_reason = "; ".join(loss_reasons) if loss_reasons else "Adequate fracture gradient margin; wellbore sealed"
        
        # 5.3 Stuck Pipe Risk
        # Physical drivers: torque spike, sudden ROP drop to ~0, extreme MSE, torque volatility
        stuck_score = 0.06
        stuck_reasons = []
        if torque > 20000.0:
            over_torque = torque - 20000.0
            stuck_score += min(0.50, over_torque / 16000.0)
            stuck_reasons.append(f"High surface torque ({torque:.0f} ft-lbf)")
        if rop < 2.0 and wob > 8.0:
            stuck_score += 0.35
            stuck_reasons.append("Zero/minimal ROP with high WOB on bottom (packoff risk)")
        if mse_kpsi > 750.0:
            stuck_score += min(0.30, (mse_kpsi - 750.0) / 500.0)
            stuck_reasons.append(f"Inefficient rock failure (MSE {mse_kpsi:.1f} kpsi)")
        if torque_roll_std > 1800.0:
            stuck_score += 0.20
            stuck_reasons.append(f"High torque volatility (std {torque_roll_std:.0f} ft-lbf)")
            
        physics_stuck_prob = float(round(max(0.04, min(0.97, stuck_score)), 3))
        stuck_prob = float(round(0.80 * physics_stuck_prob + 0.20 * ml_stuck, 3))
        stuck_level = "CRITICAL" if stuck_prob >= 0.80 else "HIGH" if stuck_prob >= 0.65 else "MEDIUM" if stuck_prob >= 0.35 else "LOW"
        stuck_reason = "; ".join(stuck_reasons) if stuck_reasons else "Torque and drag within normal mechanical limits"
        
        # 5.4 Torque & Drag Risk
        # Physical drivers: torque standard deviation, sustained drag, RPM fluctuations
        torque_score = 0.08
        torque_reasons = []
        if torque > 16500.0:
            torque_score += min(0.45, (torque - 16500.0) / 15000.0)
            torque_reasons.append(f"Sustained rotary torque ({torque:.0f} ft-lbf)")
        if torque_roll_std > 1200.0:
            torque_score += min(0.35, (torque_roll_std - 1200.0) / 3000.0)
            torque_reasons.append(f"Torque oscillation variance (+/- {torque_roll_std:.0f} ft-lbf)")
        if rpm < 60.0 and torque > 14000.0:
            torque_score += 0.25
            torque_reasons.append("Rotary stall tendency detected")
            
        physics_torque_prob = float(round(max(0.05, min(0.95, torque_score)), 3))
        torque_prob = float(round(0.80 * physics_torque_prob + 0.20 * ml_torque, 3))
        torque_level = "CRITICAL" if torque_prob >= 0.80 else "HIGH" if torque_prob >= 0.65 else "MEDIUM" if torque_prob >= 0.35 else "LOW"
        torque_reason = "; ".join(torque_reasons) if torque_reasons else "Smooth rotary drillstring rotation"
        
        # 5.5 Overpressure Risk
        # Physical driver: the d-exponent. Under normal compaction d_xc rises with
        # depth, so a *reversal* is the classic real-time overpressure indicator
        # (Jorden & Shirley 1966) — the same reference calculate_d_xc cites. The
        # kick scorer touches d_xc as a secondary hint; overpressure is the hazard
        # it actually measures.
        well_id_str = str(current_params.get('well_id', '') or '')
        pp_ppg, _obg_ppg, _nu = self.regional_geomechanics(depth_tvd, well_id=well_id_str)
        pp_margin_ppg = ecd - pp_ppg  # > 0 means the mud column is overbalanced

        op_score = 0.05
        op_reasons = []
        if d_xc < 1.10:
            op_score += min(0.45, (1.10 - d_xc) * 1.5)
            op_reasons.append(f"d_xc reversal ({d_xc:.2f}) below the normal compaction trend")
        if pp_margin_ppg < 0.50:
            op_score += 0.30
            op_reasons.append(f"Pore pressure {pp_ppg:.2f} ppg closing on the {ecd:.2f} ppg mud column")
        if rop > 22.0 and d_xc < 1.25:
            op_score += 0.15
            op_reasons.append("Drilling break coincident with low d_xc")

        physics_op_prob = float(round(max(0.03, min(0.95, op_score)), 3))
        # Physics-only: the model's four trained labels do not include overpressure,
        # so there is no ML term to blend. Reported as `basis: physics` rather than
        # dressed up as model-backed.
        op_prob = physics_op_prob
        op_level = "CRITICAL" if op_prob >= 0.80 else "HIGH" if op_prob >= 0.65 else "MEDIUM" if op_prob >= 0.35 else "LOW"
        op_reason = "; ".join(op_reasons) if op_reasons else "Normal compaction trend; pore pressure within the mud column"

        # 5.6 Cementing Risk
        # Drivers are ordered as a cement job actually fails:
        #   1. losses while placing — slurry goes into the formation and the top of
        #      cement lands below the shoe, leaving the annulus unisolated;
        #   2. ECD at or above the fracture gradient at the shoe;
        #   3. a thin pore-pressure margin, which is what lets gas channel through
        #      unset cement.
        # (3) is the failure mode of the Baghjan-5 blowout of May 2020: the plug never
        # set, the cement column behaved as a water column, and gas percolated up it.
        cem_score = 0.05
        cem_reasons = []
        if flow_out_pct < 97.0:
            cem_score += min(0.30, (100.0 - flow_out_pct) * 0.022)
            cem_reasons.append(f"Returns deficit {100.0 - flow_out_pct:.1f}% — slurry loss to formation")
        if pit_gain_bbl < -2.0:
            cem_score += min(0.25, abs(pit_gain_bbl) * 0.016)
            cem_reasons.append(f"Active pit loss {pit_gain_bbl:.1f} bbl during placement")
        if fg_margin_ppg < 0.60:
            cem_score += 0.25
            cem_reasons.append(f"ECD within {fg_margin_ppg:.2f} ppg of the fracture gradient")
        if pp_margin_ppg < 0.50:
            cem_score += 0.25
            cem_reasons.append(f"Thin pore-pressure margin ({pp_margin_ppg:.2f} ppg) — gas channelling risk through unset cement")
        if spp_psi > 3200.0:
            cem_score += 0.15
            cem_reasons.append(f"Elevated standpipe pressure ({spp_psi:.0f} psi) — annular restriction during placement")
        if pit_gain_bbl > 2.0:
            cem_score += 0.15
            cem_reasons.append(f"Pit gain {pit_gain_bbl:.1f} bbl — influx into unset cement")

        physics_cem_prob = float(round(max(0.03, min(0.95, cem_score)), 3))
        cem_prob = physics_cem_prob  # physics-only, same reason as overpressure
        cem_level = "CRITICAL" if cem_prob >= 0.80 else "HIGH" if cem_prob >= 0.65 else "MEDIUM" if cem_prob >= 0.35 else "LOW"
        cem_reason = "; ".join(cem_reasons) if cem_reasons else "No barrier-placement indicators; annulus isolation not degraded"

        # Assemble hazard metrics
        hazards_dict = {
            "gas_kick": {
                "probability": kick_prob,
                "level": kick_level,
                "trigger_reason": kick_reason,
                "key_indicator": f"Flow: {flow_out_pct:.1f}%, Pit: {pit_gain_bbl:+.1f} bbl",
                "margin": round(fg_margin_ppg, 2),
                "basis": "physics+ml"
            },
            "lost_circulation": {
                "probability": loss_prob,
                "level": loss_level,
                "trigger_reason": loss_reason,
                "key_indicator": f"Flow: {flow_out_pct:.1f}%, FG Margin: {fg_margin_ppg:+.2f} ppg",
                "margin": round(fg_margin_ppg, 2),
                "basis": "physics+ml"
            },
            "stuck_pipe": {
                "probability": stuck_prob,
                "level": stuck_level,
                "trigger_reason": stuck_reason,
                "key_indicator": f"Torque: {torque:.0f} ft-lbf, MSE: {mse_kpsi:.1f} kpsi",
                "margin": round(mse_kpsi, 2),
                "basis": "physics+ml"
            },
            "torque_drag": {
                "probability": torque_prob,
                "level": torque_level,
                "trigger_reason": torque_reason,
                "key_indicator": f"Torque Std: {torque_roll_std:.0f} ft-lbf",
                "margin": round(torque, 1),
                "basis": "physics+ml"
            },
            "overpressure": {
                "probability": op_prob,
                "level": op_level,
                "trigger_reason": op_reason,
                "key_indicator": f"d_xc: {d_xc:.2f}, PP margin: {pp_margin_ppg:+.2f} ppg",
                "margin": round(pp_margin_ppg, 2),
                "basis": "physics"
            },
            "cementing": {
                "probability": cem_prob,
                "level": cem_level,
                "trigger_reason": cem_reason,
                "key_indicator": f"FG margin: {fg_margin_ppg:+.2f} ppg, PP margin: {pp_margin_ppg:+.2f} ppg",
                "margin": round(min(fg_margin_ppg, pp_margin_ppg), 2),
                "basis": "physics"
            }
        }

        # Also provide alias keys for automated tests expecting {kick, loss, stuck_pipe, torque}
        hazard_breakdown_dict = {
            "kick": hazards_dict["gas_kick"],
            "loss": hazards_dict["lost_circulation"],
            "stuck_pipe": hazards_dict["stuck_pipe"],
            "torque": hazards_dict["torque_drag"],
            "gas_kick": hazards_dict["gas_kick"],
            "lost_circulation": hazards_dict["lost_circulation"],
            "torque_drag": hazards_dict["torque_drag"],
            "overpressure": hazards_dict["overpressure"],
            "cementing": hazards_dict["cementing"]
        }
        
        # 6. Backward Compatibility: Meaningful single composite risk_probability
        # Guarantee: risk_probability is strictly responsive to whichever hazard peaks,
        # never disconnected or stale.
        all_hazards = (kick_prob, loss_prob, stuck_prob, torque_prob, op_prob, cem_prob)
        max_hazard = max(all_hazards)
        mean_hazard = sum(all_hazards) / len(all_hazards)
        composite_hazard = 0.70 * max_hazard + 0.30 * mean_hazard
        
        final_risk_prob = float(round(composite_hazard, 3))
        final_risk_prob = max(0.04, min(0.98, final_risk_prob))
        
        if final_risk_prob >= 0.75:
            overall_risk_level = "HIGH"
        elif final_risk_prob >= 0.40:
            overall_risk_level = "MEDIUM"
        else:
            overall_risk_level = "LOW"
            
        # 7. Local SHAP Values Calculation
        top_shap_factors = []
        if self.explainer is not None:
            try:
                shap_values = self.explainer.shap_values(df_input)
                
                # Extract SHAP array for predicted class
                predicted_class_idx = int(np.argmax(ml_probs))
                if isinstance(shap_values, list):
                    sv = shap_values[predicted_class_idx][0]
                elif len(shap_values.shape) == 3:
                    sv = shap_values[0, :, predicted_class_idx]
                elif len(shap_values.shape) == 2:
                    sv = shap_values[0, :]
                else:
                    sv = shap_values
                        
                feature_impacts = []
                for i, feature in enumerate(features_required):
                    if i < len(sv):
                        feature_impacts.append({
                            'feature': feature,
                            'impact': float(sv[i]),
                            'abs_impact': abs(float(sv[i]))
                        })
                        
                # Sort by absolute impact and take top 3
                feature_impacts.sort(key=lambda x: x['abs_impact'], reverse=True)
                
                for item in feature_impacts[:3]:
                    is_positive_impact = item['impact'] > 0
                    top_shap_factors.append({
                        'feature': item['feature'],
                        'impact': float(item['abs_impact']),
                        'direction': 'INCREASES_RISK' if is_positive_impact else 'DECREASES_RISK'
                    })
            except Exception as e:
                pass
                
        # Physical explainability: when an active hazard is detected, highlight the physical driver
        physical_factors = []
        if kick_prob >= 0.45:
            physical_factors.append({'feature': 'flow_out_pct', 'impact': 0.45, 'direction': 'INCREASES_RISK'})
            if pit_gain_bbl > 1.0:
                physical_factors.append({'feature': 'pit_gain_bbl', 'impact': 0.35, 'direction': 'INCREASES_RISK'})
            if d_xc < 1.10:
                physical_factors.append({'feature': 'd_xc', 'impact': 0.20, 'direction': 'DECREASES_RISK'})
        elif loss_prob >= 0.45:
            physical_factors.append({'feature': 'flow_out_pct', 'impact': 0.48, 'direction': 'DECREASES_RISK'})
            if pit_gain_bbl < -1.0:
                physical_factors.append({'feature': 'pit_gain_bbl', 'impact': 0.32, 'direction': 'DECREASES_RISK'})
            physical_factors.append({'feature': 'ecd', 'impact': 0.20, 'direction': 'INCREASES_RISK'})
        elif stuck_prob >= 0.45:
            physical_factors.append({'feature': 'torque', 'impact': 0.55, 'direction': 'INCREASES_RISK'})
            physical_factors.append({'feature': 'rop', 'impact': 0.35, 'direction': 'DECREASES_RISK'})
            if mse_kpsi > 750.0:
                physical_factors.append({'feature': 'mse', 'impact': 0.25, 'direction': 'INCREASES_RISK'})
        elif torque_prob >= 0.45:
            physical_factors.append({'feature': 'torque', 'impact': 0.40, 'direction': 'INCREASES_RISK'})
            physical_factors.append({'feature': 'torque_roll_std_5', 'impact': 0.35, 'direction': 'INCREASES_RISK'})

        if physical_factors:
            top_factors_to_report = physical_factors[:3]
        elif overall_risk_level == "LOW":
            top_factors_to_report = [
                {'feature': 'flow_out_pct', 'impact': 0.05, 'direction': 'DECREASES_RISK'},
                {'feature': 'torque', 'impact': 0.04, 'direction': 'DECREASES_RISK'}
            ]
        else:
            top_factors_to_report = top_shap_factors[:3] if top_shap_factors else []

        # Prompt 7: Classical Statistical Change-Point Baseline (Independent Signal)
        try:
            from services.statistical_anomaly import StatisticalAnomalyService
            stat_svc = StatisticalAnomalyService()
            stat_anomaly = stat_svc.evaluate_telemetry(current_params, custom_history=history_params)
        except Exception:
            stat_anomaly = {
                "triggered": False,
                "baseline_label": "Transparent Statistical Baseline (Z-score/CUSUM)",
                "summary": "Nominal stationary baseline",
                "channels": {}
            }
                
        return {
            'risk_probability': final_risk_prob,
            'risk_score': final_risk_prob,  # Alias for lookahead.py
            'risk_level': overall_risk_level,
            'hazard_level': overall_risk_level,  # Alias for lookahead.py
            'top_factors': top_factors_to_report,
            'hazards': hazards_dict,
            'hazard_breakdown': hazard_breakdown_dict,
            'mse_kpsi': mse_kpsi,
            'd_xc': d_xc,
            'fracture_gradient_ppg': fg_ppg,
            'fracture_margin_ppg': fg_margin_ppg,
            'statistical_anomaly': stat_anomaly
        }
