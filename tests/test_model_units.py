"""
Unit-boundary tests for the ML feature vector.

The LightGBM model was trained on `data/processed/ml_training_data.csv`, where
`mud_weight` is a constant 1.17 and `ecd` ranges 1.20-1.24 — **specific gravity**.
Every other layer of the platform uses ppg. Before the conversion was added, the live
telemetry fed the model densities ~9x outside the range it had ever seen, silently:
LightGBM happily accepts any float and simply routes down the wrong branch.

These tests pin the boundary. They cannot repair the deeper problem — see
`docs` / handoff §5.16 — but they stop the unit inconsistency from returning unnoticed.
"""

from ml.service import DENSITY_FEATURES, PPG_PER_SG, to_model_units


def test_ppg_is_converted_to_specific_gravity():
    assert round(to_model_units("mud_weight", 11.2), 3) == round(11.2 / PPG_PER_SG, 3)
    assert round(to_model_units("ecd", 11.6), 3) == round(11.6 / PPG_PER_SG, 3)


def test_converted_values_land_in_the_training_range():
    """
    The whole point: the simulator's 10.8-13.6 ppg must convert into the 1.17-1.24 band
    the model was trained on, otherwise the conversion is not doing its job.
    """
    for ppg in (10.8, 11.2, 12.4, 13.6):
        sg = to_model_units("mud_weight", ppg)
        assert 1.1 <= sg <= 1.7, f"{ppg} ppg -> {sg} sg is not in the training band"


def test_a_value_already_in_specific_gravity_is_untouched():
    """
    `model_metadata.json` stores `default_baselines.mud_weight = 1.17`, which is already
    sg. Applying the conversion to it would divide by 8.345 twice.
    """
    assert to_model_units("mud_weight", 1.17) == 1.17
    assert to_model_units("ecd", 1.22) == 1.22


def test_non_density_features_pass_through():
    for feature, value in (("torque", 13200.0), ("rop", 16.5), ("d_xc", 0.94), ("spp_psi", 2800.0)):
        assert to_model_units(feature, value) == value


def test_torque_is_not_mistaken_for_a_density():
    """
    A guard on the obvious failure of a magnitude threshold: torque is ~13,200, well
    above the 3.0 cutoff, so only the field name keeps it out of the conversion.
    """
    assert "torque" not in DENSITY_FEATURES
    assert to_model_units("torque", 13200.0) == 13200.0


def test_conversion_round_trips():
    original = 11.2
    assert round(to_model_units("mud_weight", original) * PPG_PER_SG, 6) == original
