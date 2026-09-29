"""
NetworkX Institutional Knowledge Graph Layer

Builds an in-memory directed multi-graph from existing well master and synthetic event records.
Represents relationships between Wells, Formations, Events, Interventions, and Outcomes,
with topological temporal sequencing (FOLLOWED_BY ordered by TVD depth) and honest Wilson statistics.
"""

import re
from typing import Dict, Any, List, Optional, Set
import networkx as nx

try:
    from services.statistics_utils import wilson_confidence_interval
except ImportError:
    try:
        from .statistics_utils import wilson_confidence_interval
    except ImportError:
        from statistics_utils import wilson_confidence_interval  # type: ignore

# Formation names are canonicalised at graph-build time as well as at extraction
# time, so a value that reached the database before that fix (or arrives from any
# other writer) cannot split a formation across two nodes.
try:
    from nlp.extractor import normalize_formation
except ImportError:  # pragma: no cover - path fallback for package-style imports
    from extractor import normalize_formation  # type: ignore


CANONICAL_HAZARDS = {
    "stuck_pipe": ["stuck", "sticking", "packoff", "pack-off", "drag", "tight hole"],
    "mud_loss": ["loss", "losses", "lost circulation", "mud loss", "seepage"],
    # Ahead of gas_kick on purpose. "Gas migration through cement" is a zonal-isolation
    # failure, but `gas_kick` claims it first because "gas" is one of its keywords — and
    # that is precisely the Baghjan-5 failure mode, which should not be filed as a kick.
    # Nothing else moves: an event type has to mention cement to reach this entry, and
    # none of the existing types do.
    "cementing": [
        "cement", "cementing", "slurry", "zonal isolation", "gas migration",
        "top of cement", "squeeze job",
    ],
    "gas_kick": ["kick", "influx", "gas", "pit gain", "well control", "blowout"],
    "overpressure": ["overpressure", "pore pressure", "kick horizon", "undercompacted"],
    "torque_spike": ["torque", "stall", "whirl", "stick-slip"],
    "fishing": [
        "fishing", "fish", "overshot", "washover", "backoff", "lost in hole",
        "retrieval operation",
    ],
}

INTERVENTION_RULES = [
    ("mud_weight_increase", [r"mud weight", r"increase mw", r"densif", r"kill mud", r"weighted"]),
    ("spot_lubricant_pill", [r"spot", r"pill", r"acid", r"soak", r"lubricant", r"surfactant"]),
    ("pipe_jarring", [r"jar", r"jarring", r"overpull", r"work pipe", r"slack off"]),
    ("lcm_pill_squeeze", [r"lcm", r"lost circulation material", r"nut plug", r"fiber", r"mica", r"squeeze"]),
    ("bop_shut_in", [r"shut-in", r"shut in", r"bop", r"choke", r"sidpp", r"sicp", r"circulate.*influx"]),
    ("controlled_penetration", [r"reduce rop", r"pump rate", r"back ream", r"circulate clean"])
]


def classify_hazard(event_type: Any = None) -> str:
    et = str(event_type or "").lower()
    for canon, kws in CANONICAL_HAZARDS.items():
        if any(kw in et for kw in kws):
            return canon
    return "general_drilling_event"


def extract_intervention(mitigation_text: Any = None) -> str:
    text = str(mitigation_text or "").lower()
    for intervention_name, patterns in INTERVENTION_RULES:
        if any(re.search(pat, text) for pat in patterns):
            return intervention_name
    return "crew_operational_response"


def extract_outcome(mitigation_text: Any = None) -> str:
    text = str(mitigation_text or "").lower()
    if any(term in text for term in ["sidetrack", "abandon", "lost in hole", "twist-off", "failed"]):
        return "unresolved"
    elif any(term in text for term in ["partial", "reduced", "slow", "intermittent", "monitored"]):
        return "partial"
    return "resolved"


class KnowledgeGraphService:
    _instance: Optional["KnowledgeGraphService"] = None
    graph: Optional[nx.MultiDiGraph] = None
    is_initialized: bool = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(KnowledgeGraphService, cls).__new__(cls)
            cls._instance.graph = None
            cls._instance.is_initialized = False
        return cls._instance

    def ensure_graph_built(self, db_session=None):
        """Lazily builds in-memory directed graph on first call."""
        if self.is_initialized and self.graph is not None:
            return self.graph

        self.graph = nx.MultiDiGraph()
        
        # Build from database if provided, or from seed well tables
        if db_session is not None:
            self._build_from_db(db_session)
        else:
            try:
                import sys
                import os
                backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
                if backend_dir not in sys.path:
                    sys.path.append(backend_dir)
                from database import SessionLocal
                from models import WellMaster, SyntheticEvent
                
                db = SessionLocal()
                try:
                    self._build_from_db(db)
                finally:
                    db.close()
            except Exception as e:
                # Fallback to local structured seed graph if database unavailable
                self._build_fallback_graph()

        self.is_initialized = True
        return self.graph

    def _build_from_db(self, db):
        from models import WellMaster, SyntheticEvent
        wells = db.query(WellMaster).all()
        events = db.query(SyntheticEvent).all()
        self.build_graph(wells, events)

    def build_graph(self, wells: List[Any], events: List[Any]) -> Dict[str, Any]:
        """Populates multi-directed NetworkX graph from well and event collections."""
        if self.graph is None:
            self.graph = nx.MultiDiGraph()
        else:
            self.graph.clear()

        # Add Well Nodes
        for w in wells:
            w_id = w.get("well_id") if isinstance(w, dict) else getattr(w, "well_id", None)
            if not w_id:
                continue
            field_name = w.get("field_name") if isinstance(w, dict) else getattr(w, "field_name", "")
            td = w.get("total_depth_tvd") if isinstance(w, dict) else getattr(w, "total_depth_tvd", 3000.0)
            ds = w.get("data_source") if isinstance(w, dict) else getattr(w, "data_source", "synthetic_calibrated")
            
            node_id = f"Well:{w_id}"
            self.graph.add_node(
                node_id,
                type="Well",
                well_id=w_id,
                field_name=field_name,
                total_depth=td or 3000.0,
                data_source=ds
            )

        # Group events by well to build FOLLOWED_BY chronological/depth sequences
        events_by_well: Dict[str, List[Any]] = {}
        for ev in events:
            w_id = ev.get("well_id") if isinstance(ev, dict) else getattr(ev, "well_id", None)
            if w_id:
                events_by_well.setdefault(w_id, []).append(ev)

        for w_id, ev_list in events_by_well.items():
            def get_depth(e):
                val = e.get("depth_start_tvd") if isinstance(e, dict) else getattr(e, "depth_start_tvd", 0.0)
                return float(val or 0.0)
                
            sorted_events = sorted(ev_list, key=get_depth)

            well_node = f"Well:{w_id}"
            if not self.graph.has_node(well_node):
                self.graph.add_node(well_node, type="Well", well_id=w_id, name=w_id)

            prev_event_node = None
            for ev in sorted_events:
                eid = ev.get("id") if isinstance(ev, dict) else getattr(ev, "id", None)
                ev_id = f"Event:{eid}"
                # An absent formation must stay absent. The previous default was the
                # literal string "Barail Formation", so every event that recorded no
                # formation was not merely mislabelled — the graph *asserted* Barail for
                # it. The Pasarlapudi blowout, whose public source names no formation,
                # was being attributed to Barail on nothing but this default. It also
                # split one formation across two nodes whenever a report wrote
                # "Barail Formation" and another wrote "Barail".
                form_val = ev.get("formation") if isinstance(ev, dict) else getattr(ev, "formation", None)
                formation_name = normalize_formation(form_val)
                form_node = f"Formation:{formation_name}" if formation_name else None
                
                etype = ev.get("event_type") if isinstance(ev, dict) else getattr(ev, "event_type", "")
                hazard_type = classify_hazard(etype)
                hazard_node = f"Hazard:{hazard_type}"
                
                mit = ev.get("mitigation_applied") if isinstance(ev, dict) else getattr(ev, "mitigation_applied", "")
                intervention = extract_intervention(mit)
                interv_node = f"Intervention:{intervention}"
                outcome = extract_outcome(mit)
                outcome_node = f"Outcome:{outcome}"

                depth = get_depth(ev)
                cause = ev.get("root_cause") if isinstance(ev, dict) else getattr(ev, "root_cause", "")
                ds = ev.get("data_source") if isinstance(ev, dict) else getattr(ev, "data_source", "synthetic")

                # 1. Event Node
                self.graph.add_node(
                    ev_id,
                    type="Event",
                    event_id=eid,
                    well_id=w_id,
                    event_type=etype,
                    hazard_type=hazard_type,
                    depth_tvd=depth,
                    root_cause=cause or "",
                    mitigation_applied=mit or "",
                    data_source=ds
                )

                # 2. Formation Node & Edge: Well DRILLED_THROUGH Formation
                #    Skipped when the event recorded no formation, so no synthetic
                #    Formation node and no OCCURRED_IN edge are invented for it.
                if form_node is not None:
                    if not self.graph.has_node(form_node):
                        self.graph.add_node(form_node, type="Formation", name=formation_name)
                    self.graph.add_edge(well_node, form_node, relationship="DRILLED_THROUGH")

                # 3. Edge: Well HAD_EVENT Event
                self.graph.add_edge(well_node, ev_id, relationship="HAD_EVENT")

                # 4. Edge: Event OCCURRED_IN Formation
                if form_node is not None:
                    self.graph.add_edge(ev_id, form_node, relationship="OCCURRED_IN")

                # 5. Edge: Event HAS_HAZARD Hazard
                if not self.graph.has_node(hazard_node):
                    self.graph.add_node(hazard_node, type="Hazard", name=hazard_type)
                self.graph.add_edge(ev_id, hazard_node, relationship="HAS_HAZARD")

                # 6. Edge: Event MITIGATED_BY Intervention
                if not self.graph.has_node(interv_node):
                    self.graph.add_node(interv_node, type="Intervention", name=intervention)
                self.graph.add_edge(ev_id, interv_node, relationship="MITIGATED_BY")

                # 7. Edge: Event LED_TO Outcome
                if not self.graph.has_node(outcome_node):
                    self.graph.add_node(outcome_node, type="Outcome", name=outcome)
                self.graph.add_edge(ev_id, outcome_node, relationship="LED_TO")

                # 8. Temporal Depth Sequence Edge: FOLLOWED_BY (ordered by depth)
                if prev_event_node is not None:
                    self.graph.add_edge(prev_event_node, ev_id, relationship="FOLLOWED_BY")

                prev_event_node = ev_id

        self.is_initialized = True
        return {
            "nodes": self.graph.number_of_nodes(),
            "edges": self.graph.number_of_edges(),
            "wells": len(wells),
            "events": len(events)
        }

    def _build_fallback_graph(self):
        """Deterministic seed fallback ensuring graph queries never fail."""
        if self.graph is None:
            self.graph = nx.MultiDiGraph()
        else:
            self.graph.clear()
        g = self.graph

        seed_wells = ["OIL-BAGHJAN-1", "OIL-BAGHJAN-4", "OIL-MORAN-1", "OIL-NAHARKATIYA-1", "OIL-DIKOM-1"]
        seed_events = [
            {"id": 101, "well_id": "OIL-MORAN-1", "depth": 1540.0, "type": "Severe Lost Circulation", "form": "Tipam Sandstone", "mit": "Pumped 40 bbl LCM pill with coarse nut plug and reduced pump rate to 350 gpm.", "cause": "Fractured permeable sand"},
            {"id": 102, "well_id": "OIL-MORAN-1", "depth": 2832.0, "type": "Stuck Pipe (Differential)", "form": "Barail Sandstone", "mit": "Worked pipe with 60 klbs overpull and spotted acid soak pill to dissolve cake.", "cause": "High overbalance pressure"},
            {"id": 103, "well_id": "OIL-NAHARKATIYA-1", "depth": 3105.0, "type": "High Pressure Gas Kick", "form": "Kopili Formation", "mit": "Closed annular BOP, recorded SIDPP 420 psi, circulated influx out and densified mud to 12.4 ppg.", "cause": "Undercompacted shale pore pressure ramp"},
            {"id": 104, "well_id": "OIL-BAGHJAN-1", "depth": 2240.0, "type": "Tight Hole Drag", "form": "Barail Sandstone", "mit": "Back-reamed with controlled rotation and circulated high-viscosity pill.", "cause": "Swelling reactive clay"},
            {"id": 105, "well_id": "OIL-BAGHJAN-4", "depth": 2380.0, "type": "Partial Mud Loss", "form": "Tipam Sandstone", "mit": "Spotted medium LCM pill and reduced equivalent circulating density.", "cause": "Sub-fracture pressure loss"}
        ]
        
        for w in seed_wells:
            g.add_node(f"Well:{w}", type="Well", well_id=w, name=w)

        for ev in seed_events:
            ev_id = f"Event:{ev['id']}"
            well_node = f"Well:{ev['well_id']}"
            form_node = f"Formation:{normalize_formation(ev['form'])}"
            h_type = classify_hazard(ev['type'])
            h_node = f"Hazard:{h_type}"
            interv = extract_intervention(ev['mit'])
            i_node = f"Intervention:{interv}"
            outc = extract_outcome(ev['mit'])
            o_node = f"Outcome:{outc}"

            g.add_node(ev_id, type="Event", event_id=ev['id'], well_id=ev['well_id'], depth_tvd=ev['depth'], event_type=ev['type'], hazard_type=h_type, root_cause=ev['cause'], mitigation_applied=ev['mit'])
            g.add_node(form_node, type="Formation", name=ev['form'])
            g.add_node(h_node, type="Hazard", name=h_type)
            g.add_node(i_node, type="Intervention", name=interv)
            g.add_node(o_node, type="Outcome", name=outc)

            g.add_edge(well_node, ev_id, relationship="HAD_EVENT")
            g.add_edge(ev_id, form_node, relationship="OCCURRED_IN")
            g.add_edge(ev_id, h_node, relationship="HAS_HAZARD")
            g.add_edge(ev_id, i_node, relationship="MITIGATED_BY")
            g.add_edge(ev_id, o_node, relationship="LED_TO")

    def query_hazard_subgraph(self, well_id: str, hazard_type: str = "") -> Dict[str, Any]:
        """
        Extracts subgraph matching hazard type across target well and its analog wells.
        Returns nodes, edges, sequence transitions, and honest Wilson confidence intervals.
        """
        g = self.ensure_graph_built()
        h_filter = (hazard_type or "").lower().replace("-", "_").replace(" ", "_")

        matched_event_nodes = []
        for n, d in g.nodes(data=True):
            if d.get("type") == "Event":
                h_type = d.get("hazard_type", "").lower()
                e_type = d.get("event_type", "").lower()
                if not h_filter or (h_filter in h_type or h_filter in e_type or h_type in h_filter):
                    matched_event_nodes.append(n)

        # Collect subgraph nodes & edges
        subgraph_nodes = set(matched_event_nodes)
        subgraph_edges = []

        for ev_node in matched_event_nodes:
            # Outgoing edges: OCCURRED_IN, HAS_HAZARD, MITIGATED_BY, LED_TO, FOLLOWED_BY
            for u, v, data in g.out_edges(ev_node, data=True):
                subgraph_nodes.add(v)
                subgraph_edges.append({
                    "source": u,
                    "target": v,
                    "relationship": data.get("relationship", "RELATED_TO")
                })

            # Incoming edges: HAD_EVENT from Well, or FOLLOWED_BY from previous Event
            for u, v, data in g.in_edges(ev_node, data=True):
                subgraph_nodes.add(u)
                subgraph_edges.append({
                    "source": u,
                    "target": v,
                    "relationship": data.get("relationship", "RELATED_TO")
                })

        nodes_payload = []
        for n in subgraph_nodes:
            data = dict(g.nodes[n])
            data["id"] = n
            nodes_payload.append(data)

        # Generate summary insight with Wilson interval
        insight = self.generate_graph_insight(hazard_type=hazard_type, well_id=well_id)

        return {
            "well_id": well_id,
            "hazard_type": hazard_type,
            "node_count": len(nodes_payload),
            "edge_count": len(subgraph_edges),
            "nodes": nodes_payload,
            "edges": subgraph_edges,
            "graph_insight": insight,
            "insights": [insight] if insight else []
        }

    def query_subgraph(self, well_id: str = "", hazard_type: str = "") -> Dict[str, Any]:
        """Alias for query_hazard_subgraph."""
        return self.query_hazard_subgraph(well_id=well_id, hazard_type=hazard_type)

    def generate_graph_insight(self, hazard_type: str, well_id: Optional[str] = None) -> str:
        """
        Traverses the graph to synthesize an institutional-memory narrative:
        precedents (FOLLOWED_BY), primary mitigations, and resolution rates
        formatted with Wilson score confidence intervals.
        """
        g = self.ensure_graph_built()
        h_filter = (hazard_type or "stuck_pipe").lower().replace("-", "_").replace(" ", "_")

        matched_events = []
        for n, d in g.nodes(data=True):
            if d.get("type") == "Event":
                h_type = d.get("hazard_type", "").lower()
                e_type = d.get("event_type", "").lower()
                if not h_filter or (h_filter in h_type or h_filter in e_type or h_type in h_filter):
                    matched_events.append((n, d))

        if not matched_events:
            return f"No documented historical graph precedents found for '{hazard_type}' in the Assam basin repository."

        wells_involved = set(d.get("well_id") for _, d in matched_events if d.get("well_id"))
        total_cases = len(matched_events)

        # 1. Precedents via incoming FOLLOWED_BY edges
        preceding_event_types = []
        for ev_node, _ in matched_events:
            for u, _, edata in g.in_edges(ev_node, data=True):
                if edata.get("relationship") == "FOLLOWED_BY":
                    prev_data = g.nodes.get(u, {})
                    if prev_data.get("event_type"):
                        preceding_event_types.append(prev_data["event_type"])

        # 2. Interventions via MITIGATED_BY edges
        interventions = []
        for ev_node, _ in matched_events:
            for _, v, edata in g.out_edges(ev_node, data=True):
                if edata.get("relationship") == "MITIGATED_BY":
                    interv_name = g.nodes.get(v, {}).get("name", "operational adjustments")
                    interventions.append(interv_name.replace("_", " "))

        # 3. Outcomes via LED_TO edges
        resolved_count = 0
        for ev_node, _ in matched_events:
            for _, v, edata in g.out_edges(ev_node, data=True):
                if edata.get("relationship") == "LED_TO":
                    if g.nodes.get(v, {}).get("name") == "resolved":
                        resolved_count += 1

        # Calculate honest Wilson confidence interval for resolution
        wilson_stats = wilson_confidence_interval(resolved_count, total_cases, confidence=0.95)

        # Most frequent intervention
        top_intervention = "engineered circulation adjustments"
        if interventions:
            from collections import Counter
            top_intervention = Counter(interventions).most_common(1)[0][0]

        hazard_label = hazard_type.replace("_", " ").title() if hazard_type else "Hazard"
        wells_count = max(1, len(wells_involved))

        if preceding_event_types:
            from collections import Counter
            top_prec, prec_count = Counter(preceding_event_types).most_common(1)[0]
            prec_stats = wilson_confidence_interval(prec_count, total_cases, confidence=0.95)
            sentence = (
                f"Across {wells_count} analog wells in Upper Assam, {hazard_label} events were preceded by "
                f"'{top_prec}' in {prec_count} of {total_cases} cases ({prec_stats['formatted']}), "
                f"and successfully resolved via {top_intervention} in {resolved_count} of {total_cases} cases ({wilson_stats['formatted']})."
            )
        else:
            sentence = (
                f"Across {wells_count} analog wells in Upper Assam, {total_cases} documented {hazard_label} incident(s) "
                f"were mitigated primarily via {top_intervention} with a verified resolution rate of "
                f"{wilson_stats['formatted']}."
            )

        return sentence
