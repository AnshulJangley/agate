"""
Build the historical-incident table.

Two tiers, deliberately separated so that nothing synthetic can be mistaken for
something real:

  1. REAL events — publicly documented Indian drilling incidents, read verbatim
     from `data/processed/india_real_events.json`. Every field is either sourced
     or explicitly null. They carry `data_source='incident_report_real'`.

  2. SYNTHETIC events — generated filler, flagged `data_source='synthetic'`.

Why the synthetic tier was rewritten: it used to emit

    root_cause         = f"Synthetic cause for {event_type}"
    mitigation_applied = f"Standard mitigation for {event_type}"

which made the two most valuable columns in the table semantically empty. Every
row carried the same string, so `nlp/extractors.extract_intervention()` matched
no rule and fell through to its `crew_operational_response` default for 100% of
events, and `extract_outcome()` returned `resolved` for all of them. "What
mitigation worked in the offset wells?" was unanswerable — not because the
pipeline was broken, but because the input text was placeholder text.

The synthetic tier now draws from a paired library: each entry is a
(cause, response) tuple, so a top-drive failure can never be answered with a mud
pump repair. Causes and mitigations are written in the vocabulary a DDR
narrative uses, so the extractors have something to actually classify.

Output schema is unchanged apart from one appended column (`data_source`), which
already exists on the `SyntheticEvent` model.
"""

import json
import random

import pandas as pd

from config import PROCESSED_DATA_DIR, logger

SCHEMA = [
    'event_id', 'well_id', 'depth_start_tvd', 'depth_end_tvd', 'formation',
    'event_type', 'severity', 'root_cause', 'mitigation_applied', 'npt_hours',
    'data_source',
]

# Model columns only — `source_citation` / `notes` live in the JSON for humans and
# must not reach the CSV, or bulk_insert_mappings will reject the unknown keys.
REAL_EVENT_COLUMNS = list(SCHEMA)

REAL_EVENTS_PATH = PROCESSED_DATA_DIR / "india_real_events.json"

# Upper Assam lithostratigraphy, by TVD, matching the bands the rest of the app uses.
FORMATION_BANDS = [(1500.0, "Tipam"), (2500.0, "Barail"), (float("inf"), "Kopili")]

SEVERITIES = ['Low', 'Medium', 'High', 'Critical']

# Regional-expansion wells (Rajasthan / KG / Mizoram, added later by
# scripts/seed_regional_wells.py) never had incidents generated for them — the
# committed 19-row CSV covers the Upper Assam wells only. Synthetic generation
# is held to that same scope on purpose: this change is about replacing
# placeholder *content*, not about inflating the table to 50+ rows and moving
# every graph and search baseline that was verified against 19.
REGIONAL_MARKERS = ('RAJ-', 'KG-', 'MZ-')

# event_type -> list of (root_cause, mitigation_applied) pairs. The pairing is
# the point: a cause is only ever emitted with the response that actually
# addresses it.
INCIDENT_LIBRARY = {
    'Lost Circulation': [
        (
            "Drilled into a depleted, micro-fractured sandstone where the formation fracture gradient fell below the hydrostatic mud column, initiating partial losses into the thief zone.",
            "Mixed and spotted a 35 bbl LCM pill of nut plug and mica across the loss zone, soaked for two hours, and restored full circulation before drilling ahead.",
        ),
        (
            "Sub-hydrostatic high-permeability vugular interval penetrated under high overbalance; dynamic losses started once the fracture breakdown gradient was exceeded.",
            "Reduced mud weight to the minimum safe overbalance for the section and pumped a high-fluid-loss LCM squeeze to seal the fractured interval.",
        ),
        (
            "Natural fracture network intersected while drilling ahead on a connection, causing an immediate reduction in returns at the shakers.",
            "Stopped drilling and pumped a coarse LCM sweep, re-established returns, then resumed with reduced flow rate and a monitored pit level.",
        ),
    ],
    'Kick': [
        (
            "Formation pore pressure exceeded the active mud hydrostatic column when an overpressured sand stringer was penetrated, allowing formation gas to enter the wellbore.",
            "Shut in the well on the annular preventer, recorded SIDPP and SICP, and circulated the influx out using the Driller's Method with weighted kill mud.",
        ),
        (
            "Abnormal formation pressure encountered below the last casing shoe with insufficient mud weight to maintain the required trip margin.",
            "Shut in, confirmed the influx by pit gain, and killed the well using the Wait and Weight method while holding casing pressure constant.",
        ),
    ],
    'Stuck Pipe': [
        (
            "Differential sticking: high hydrostatic overbalance embedded the drill collars in a thick filter cake across a permeable sand while the string was stationary.",
            "Spotted a fresh-water soak pill across the stuck interval, worked the string free with jarring, and reduced mud weight to cut the differential overbalance.",
        ),
        (
            "Reactive shale sloughing caused a wellbore packoff at the drill collars after insufficient inhibition through the reactive interval.",
            "Increased KCl and polymer inhibition, controlled ROP through the reactive interval, and back-reamed out of the tight hole.",
        ),
        (
            "Keyseat developed on the low side of the build section, and the drill pipe hung up while tripping out of the hole.",
            "Reamed the tight spot, ran a keyseat wiper, and reduced tripping speed through the build section before continuing.",
        ),
    ],
    'Wellbore Instability': [
        (
            "Borehole collapse in fissile shale following a mud-weight reduction, with cavings observed at the shakers and a tight hole on connections.",
            "Weighted the mud up to the minimum of the safe PPFG window, raised KCl concentration, and reamed the tight section before drilling ahead.",
        ),
        (
            "Clay swelling and hole enlargement through a water-sensitive interval due to insufficient KCl inhibition in the water-based mud.",
            "Raised KCl and polymer concentration, reduced open-hole exposure time, and back-reamed each connection until cavings at the shakers cleared.",
        ),
    ],
    'Equipment Failure': [
        (
            "Top drive rotary bearing failure under sustained high-torque drilling; surface torque exceeded the make-up limit before the stall was detected.",
            "Laid down and replaced the failed top drive assembly, re-established circulation, and resumed drilling only after a satisfactory functional test.",
        ),
        (
            "Mud pump fluid-end washout during a high-rate circulation, causing a loss of standpipe pressure and an unscheduled flow interruption.",
            "Repaired the damaged fluid end, pressure-tested the pump, and confirmed standpipe pressure before drilling ahead.",
        ),
    ],
}

EVENT_TYPES = list(INCIDENT_LIBRARY.keys())


def formation_for_depth(depth: float) -> str:
    for ceiling, name in FORMATION_BANDS:
        if depth < ceiling:
            return name
    return "Kopili"


def is_regional_expansion(well_id: str) -> bool:
    return any(marker in well_id.upper() for marker in REGIONAL_MARKERS)


def load_real_events() -> list[dict]:
    """Real, cited incidents. An absent file is a warning, not an error."""
    if not REAL_EVENTS_PATH.exists():
        logger.warning(f"{REAL_EVENTS_PATH} not found — emitting synthetic events only.")
        return []

    payload = json.loads(REAL_EVENTS_PATH.read_text(encoding="utf-8"))
    rows = []
    for ev in payload.get("events", []):
        row = {col: ev.get(col) for col in REAL_EVENT_COLUMNS}
        row["data_source"] = "incident_report_real"
        rows.append(row)
    logger.info(f"Loaded {len(rows)} real Indian incident(s) from {REAL_EVENTS_PATH.name}.")
    return rows


def build_synthetic_events(well_ids: list[str]) -> list[dict]:
    random.seed(42)  # reproducible
    events = []
    counter = 1
    for well_id in well_ids:
        used: set[tuple[str, str]] = set()  # one well must not repeat a cause/response pair
        for _ in range(random.randint(1, 3)):
            # Pick from pairs this well has not used. Retrying random.choice() was
            # wrong: with only two pairs per type, two draws can both land on the
            # used one. Filtering first makes the guarantee real.
            types_available = [
                t for t in EVENT_TYPES
                if any(p not in used for p in INCIDENT_LIBRARY[t])
            ]
            event_type = random.choice(types_available or EVENT_TYPES)
            available = [p for p in INCIDENT_LIBRARY[event_type] if p not in used]
            pair = random.choice(available or INCIDENT_LIBRARY[event_type])
            used.add(pair)
            root_cause, mitigation = pair
            depth_start = random.uniform(1000, 3500)
            events.append({
                'event_id': f"EVT-{counter:04d}",
                'well_id': well_id,
                'depth_start_tvd': round(depth_start, 2),
                'depth_end_tvd': round(depth_start + random.uniform(10, 100), 2),
                'formation': formation_for_depth(depth_start),
                'event_type': event_type,
                'severity': random.choice(SEVERITIES),
                'root_cause': root_cause,
                'mitigation_applied': mitigation,
                'npt_hours': round(random.uniform(1.0, 48.0), 1),
                'data_source': 'synthetic',
            })
            counter += 1
    return events


def build_events():
    logger.info("Building historical incidents (events)...")

    wells_master_path = PROCESSED_DATA_DIR / "wells_master.csv"
    if wells_master_path.exists():
        well_ids = pd.read_csv(wells_master_path)['well_id'].unique().tolist()
    else:
        logger.warning(f"{wells_master_path} not found. Using default mock wells.")
        well_ids = ["OIL-BAGHJAN-1", "OIL-NAHARKATIYA-1"]

    real_events = load_real_events()

    # A real event whose well is absent from well_master would violate the foreign
    # key at seed time, so report it here rather than letting the seed fail silently.
    known = set(well_ids)
    for ev in real_events:
        if ev['well_id'] not in known:
            logger.warning(
                f"Real event {ev['event_id']} references well {ev['well_id']}, "
                f"which is not in wells_master.csv — the seed will fail its FK constraint."
            )

    # Synthetic filler skips wells that real incidents already cover, so a well
    # never appears with both a real and an invented incident at once.
    real_well_ids = {ev['well_id'] for ev in real_events}
    synthetic_well_ids = [
        w for w in well_ids
        if w not in real_well_ids and not is_regional_expansion(w)
    ]

    events = real_events + build_synthetic_events(synthetic_well_ids)

    output_path = PROCESSED_DATA_DIR / "synthetic_events.csv"
    pd.DataFrame(events, columns=SCHEMA).to_csv(output_path, index=False)

    n_real = len(real_events)
    logger.info(
        f"Wrote {output_path} — {len(events)} events "
        f"({n_real} real/cited, {len(events) - n_real} synthetic)."
    )


if __name__ == "__main__":
    build_events()
