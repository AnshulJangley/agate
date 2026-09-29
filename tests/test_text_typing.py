"""
Typing tests for the layers that normalise free text into canonical values.

Three functions decide how raw, human-written drilling text lands in the knowledge
layer, and all three failed silently before — a wrong value produced a plausible
graph node rather than an error:

  * `detect_doc_type`   — every upload was stamped "ddr", so a Well Completion Report
                          was filed as a Daily Drilling Report.
  * `normalize_formation` — "Barail Formation" and "Barail" became two separate
                          formation nodes, splitting one formation in two.
  * `classify_hazard`   — had no bucket for cementing or fishing events, so they fell
                          into `general_drilling_event`.

The regression cases below are the specific inputs that were wrong at some point.
"""

from nlp.extractor import detect_doc_type, normalize_formation
from services.knowledge_graph import classify_hazard


# ---------------------------------------------------------------------------
# Document typing
# ---------------------------------------------------------------------------

DOC_TYPE_CASES = [
    # (filename, head text, expected)
    ("OIL_Tengakhat_DDR_Well_01.pdf", None, "ddr"),
    ("SAMPLE_representative_OIL_Baghjan_DDR_Well_04.pdf", None, "ddr"),
    ("OIL_Baghjan_WCR_05.pdf", None, "wcr"),
    ("OIL-Naharkatiya-1_Well_Completion_Report.pdf", None, "wcr"),
    ("scan_0042.pdf", "OIL INDIA LIMITED\nWELL COMPLETION REPORT\nWell: OIL-DIKOM-1", "wcr"),
    ("scan_0043.pdf", "DAILY DRILLING REPORT\nReport No: DDR-1", "ddr"),
    ("scan_0044.pdf", "MUD LOGGING REPORT\nGas chromatograph readings", "mud_log"),
    ("scan_0045.pdf", "CASING PROGRAM\n9-5/8 inch intermediate string", "program"),
    # A DDR that references a WCR further down. This is the case that was wrong: the
    # header tuples were checked in a fixed order, so "wcr" matched first and a daily
    # report was typed as a completion report.
    (
        "scan_0046.pdf",
        "OIL INDIA LIMITED\nDAILY DRILLING REPORT\nref: Well Completion Report of offset wells",
        "ddr",
    ),
    ("random.pdf", "a scanned page with no recognisable header", "unknown"),
]


def test_detect_doc_type():
    for filename, text, expected in DOC_TYPE_CASES:
        got = detect_doc_type(filename, text)
        assert got == expected, f"{filename!r} -> {got!r}, expected {expected!r}"


def test_unrecognised_document_is_not_labelled_ddr():
    """
    "unknown" is the honest answer, and the whole point of the fix. Falling back to
    "ddr" is what made a mis-filed document invisible.
    """
    assert detect_doc_type("scan_9999.pdf", "illegible scan") == "unknown"


def test_filename_wins_over_body_text():
    """A WCR quotes the DDRs it summarises, so the filename must take precedence."""
    assert detect_doc_type("OIL-Baghjan-WCR.pdf", "DAILY DRILLING REPORT") == "wcr"


# ---------------------------------------------------------------------------
# Formation canonicalisation
# ---------------------------------------------------------------------------

FORMATION_CASES = [
    ("Barail Formation", "Barail"),
    ("Tipam Sandstone", "Tipam"),
    ("Upper Tipam Sandstone", "Tipam"),
    ("Kopili Marine Shale", "Kopili"),
    ("Barail", "Barail"),
    ("Girujan Clay", "Girujan"),
    ("Langpar Sand", "Langpar"),
    ("Narpuh Sand", "Narpuh"),
]


def test_normalize_formation_collapses_qualifiers():
    for raw, expected in FORMATION_CASES:
        assert normalize_formation(raw) == expected, f"{raw!r} -> {normalize_formation(raw)!r}"


def test_normalize_formation_preserves_absence():
    """
    None must stay None. Returning a string such as "Unknown" invents a formation and
    hangs every unrecorded event off it — the Pasarlapudi record genuinely has no
    formation in its public source.
    """
    assert normalize_formation(None) is None
    assert normalize_formation("   ") is None


# ---------------------------------------------------------------------------
# Hazard classification
# ---------------------------------------------------------------------------

def test_new_hazards_are_classified():
    assert classify_hazard("Fishing Operation") == "fishing"
    assert classify_hazard("Overshot Run") == "fishing"
    assert classify_hazard("Cement Plug Failure") == "cementing"
    assert classify_hazard("Casing/Cementing Operation") == "cementing"


def test_gas_migration_through_cement_is_a_cementing_failure():
    """
    Zonal-isolation failure, not a kick. `gas_kick` claims it on the "gas" keyword
    unless `cementing` is checked first — and this is the Baghjan-5 failure mode.
    """
    assert classify_hazard("Gas Migration Through Cement") == "cementing"


def test_existing_classifications_are_unchanged():
    """
    Adding a hazard must not reclassify anything already in the database.
    """
    for event_type, expected in [
        ("Kick", "gas_kick"),
        ("Gas Kick", "gas_kick"),
        ("Lost Circulation", "mud_loss"),
        ("Severe Mud Loss", "mud_loss"),
        ("Stuck Pipe", "stuck_pipe"),
        ("Torque Spike", "torque_spike"),
        ("Equipment Failure", "general_drilling_event"),
        ("Wellbore Instability", "general_drilling_event"),
        ("raw_text", "general_drilling_event"),
    ]:
        assert classify_hazard(event_type) == expected, (
            f"{event_type!r} regressed to {classify_hazard(event_type)!r}"
        )
