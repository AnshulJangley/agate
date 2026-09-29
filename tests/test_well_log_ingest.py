"""
Well-log parsing tests.

`well_log` had no ingestion path at all — only the seed script wrote to it — so the
"drilling and mud logging databases" data source had no way in. These cover the LAS
and CSV parsers added for it, including the two behaviours that matter most: the LAS
null sentinel, and reporting curves that have no column rather than dropping them.
"""

from api.well_logs import _parse_csv, _parse_las

LAS_SAMPLE = """
~Version Information
VERS.   2.0 : CWLS log ASCII Standard -VERSION 2.0
WRAP.    NO : One line per depth step
~Well Information
STRT.M            0.00000 : Start Depth
STOP.M         2900.00000 : Stop Depth
NULL.            -999.25 : Null Value
COMP.       Oil India Limited : Company
WELL.            OIL-HAPJAN-1 : Well Name
~Curve Information
DEPT.M     : Measured Depth
GR  .API   : Gamma Ray
RHOB.G/C3  : Bulk Density
NPHI.V/V   : Neutron Porosity
DTC .US/F  : Sonic Compressional Travel Time
RES .OHMM  : Deep Resistivity
~ASCII
0.0000   75.32   2.40   0.310   110.20   0.660
0.5000   78.11   2.41   0.300   111.05   0.640
1.0000  -999.25   2.42   0.290   112.30   0.630
"""


def test_las_parses_curves_and_header():
    mnemonics, rows, null_value, header = _parse_las(LAS_SAMPLE)
    assert mnemonics == ["dept", "gr", "rhob", "nphi", "dtc", "res"]
    assert len(rows) == 3
    assert null_value == -999.25
    assert header["WELL"] == "OIL-HAPJAN-1"
    assert header["COMP"] == "Oil India Limited"


def test_las_null_sentinel_becomes_none():
    """
    -999.25 is the universal LAS null. Stored as a number it would drag every
    correlation that reads the curve, so it has to become None.
    """
    from api.well_logs import _to_float

    assert _to_float("-999.25", -999.25) is None
    assert _to_float("-999.25", None) is None  # sentinel recognised even if NULL is unset
    assert _to_float("nan", None) is None
    assert _to_float("75.32", -999.25) == 75.32
    assert _to_float("garbage", None) is None


def test_csv_parses_header_and_rows():
    mnemonics, rows, null_value, _ = _parse_csv("DEPT,GR,RES,DT,RHOB,NPHI\n1500.0,71.2,0.71,108.4,2.38,0.31\n")
    assert mnemonics == ["dept", "gr", "res", "dt", "rhob", "nphi"]
    assert len(rows) == 1
    assert null_value is None


def test_curve_aliases_cover_vendor_variants():
    """Mnemonics differ by vendor and era; all of these should reach a column."""
    from api.well_logs import CURVE_ALIASES

    assert CURVE_ALIASES["gr"] == "gamma_ray"
    assert CURVE_ALIASES["rild"] == "resistivity"
    assert CURVE_ALIASES["lld"] == "resistivity"
    assert CURVE_ALIASES["dtc"] == "sonic"
    assert CURVE_ALIASES["rhob"] == "density"
    for depth_alias in ("dept", "depth", "md", "tvd"):
        assert CURVE_ALIASES[depth_alias] == "depth_tvd"


def test_neutron_porosity_is_not_silently_dropped():
    """
    The table has no NPHI column. It must be reported as unmapped rather than
    disappearing, or a user assumes their neutron log landed somewhere.
    """
    from api.well_logs import CURVE_ALIASES

    assert "nphi" not in CURVE_ALIASES
