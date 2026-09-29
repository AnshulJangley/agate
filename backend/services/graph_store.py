"""
Postgres-backed persistence for the institutional knowledge graph.

services/knowledge_graph.py builds a real nx.MultiDiGraph from well_master and
synthetic_event, but rebuilds it in memory on every process and discards it on
restart. This module gives that graph durable storage in Postgres while keeping
NetworkX as the in-memory query layer over the persisted rows.

Design notes
------------
* No LLM is involved. The graph is derived deterministically from relational
  data, so the same inputs always produce the same nodes and edges.

* Primary keys are uuid5 values over stable keys rather than autoincrement
  integers. Rebuilding therefore MERGES onto existing rows (INSERT ... ON
  CONFLICT DO UPDATE) instead of duplicating them. Running a rebuild twice
  leaves node and edge counts unchanged.

* The existing label and edge vocabulary is reused verbatim - Well, Event,
  Formation, Hazard, Intervention, Outcome and DRILLED_THROUGH, HAD_EVENT,
  OCCURRED_IN, HAS_HAZARD, MITIGATED_BY, LED_TO, FOLLOWED_BY - so the
  knowledge-graph tests in tests/test_advanced_analytics.py keep passing and
  node ids such as "Event:101" round-trip unchanged.

* Postgres-native by decision. No Neo4j, no graph extension, no pgvector.
"""

import uuid
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

import networkx as nx
from sqlalchemy import select, func, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert

try:
    from models import KnowledgeNode, KnowledgeEdge
except ImportError:  # pragma: no cover - import style varies by entry point
    from backend.models import KnowledgeNode, KnowledgeEdge  # type: ignore

try:
    from services.knowledge_graph import KnowledgeGraphService
except ImportError:  # pragma: no cover
    try:
        from .knowledge_graph import KnowledgeGraphService
    except ImportError:
        from knowledge_graph import KnowledgeGraphService  # type: ignore


logger = logging.getLogger(__name__)


# Fixed namespace for all derived identifiers. Deriving it from a constant
# string keeps it stable across machines and self-documenting, and means the
# uuid for a given node is reproducible from the node key alone.
NAMESPACE_AGATE_GRAPH = uuid.uuid5(uuid.NAMESPACE_DNS, "agate.nwis.knowledge-graph")

# Node attribute carrying the label in the NetworkX graph.
_LABEL_ATTR = "type"

# Insert batch size. The graph is small (tens to low thousands of rows), but
# batching keeps a single statement from growing unbounded as the corpus does.
_BATCH = 500


# ------------------------------------------------------------------------------
# Deterministic identifiers
# ------------------------------------------------------------------------------

def node_uuid(node_key: str) -> uuid.UUID:
    """Stable uuid5 for a NetworkX node id such as 'Well:OIL-MORAN-1'."""
    return uuid.uuid5(NAMESPACE_AGATE_GRAPH, f"node:{node_key}")


def edge_uuid(src_key: str, rel_type: str, dst_key: str) -> uuid.UUID:
    """
    Stable uuid5 for an edge.

    Parallel edges of the same relationship between the same pair collapse to a
    single row by construction - see the KnowledgeEdge docstring for why that is
    the desired behaviour rather than data loss.
    """
    return uuid.uuid5(NAMESPACE_AGATE_GRAPH, f"edge:{src_key}|{rel_type}|{dst_key}")


# ------------------------------------------------------------------------------
# Serialisation helpers
# ------------------------------------------------------------------------------

def _jsonable(value: Any) -> Any:
    """Coerce a node/edge attribute into something JSONB will accept."""
    if value is None or isinstance(value, (str, bool, int, float)):
        return value
    if isinstance(value, dict):
        return {str(k): _jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_jsonable(v) for v in value]
    # numpy scalars and anything else exotic
    item = getattr(value, "item", None)
    if callable(item):
        try:
            return _jsonable(item())
        except Exception:
            pass
    return str(value)


def _split_node_attrs(node_key: str, attrs: Dict[str, Any]) -> Tuple[str, Optional[str], Dict[str, Any]]:
    """
    Split NetworkX node attributes into (label, name, properties).

    Falls back to the node key prefix for the label and the suffix for the name,
    which covers Event nodes - they carry no explicit 'name' attribute.
    """
    working = dict(attrs or {})

    label = working.pop(_LABEL_ATTR, None)
    if not label:
        label = node_key.split(":", 1)[0] if ":" in node_key else "Unknown"

    name = working.pop("name", None)
    if not name:
        name = node_key.split(":", 1)[1] if ":" in node_key else node_key

    return str(label), (str(name) if name is not None else None), {k: _jsonable(v) for k, v in working.items()}


# ------------------------------------------------------------------------------
# Persistence
# ------------------------------------------------------------------------------

def persist_graph(db, graph: nx.MultiDiGraph, prune: bool = False,
                  preserve_existing_nodes: bool = False) -> Dict[str, Any]:
    """
    Write a NetworkX graph into knowledge_node / knowledge_edge.

    Upserts by deterministic uuid, so calling this repeatedly with the same
    source data is idempotent. Nodes are written before edges to satisfy the
    foreign keys.

    prune=True additionally deletes rows that are no longer present in the
    supplied graph, which is what a full deterministic rebuild wants. It
    defaults to False so that incremental writes (for example from document
    ingestion) cannot silently delete the rest of the graph.
    """
    if graph is None:
        return {"nodes_written": 0, "edges_written": 0, "nodes_pruned": 0, "edges_pruned": 0}

    node_rows: List[Dict[str, Any]] = []
    seen_node_ids: Set[uuid.UUID] = set()

    for node_key, attrs in graph.nodes(data=True):
        key = str(node_key)
        nid = node_uuid(key)
        if nid in seen_node_ids:
            continue
        seen_node_ids.add(nid)

        label, name, properties = _split_node_attrs(key, attrs)
        node_rows.append({
            "id": nid,
            "node_key": key,
            "label": label,
            "name": name,
            "properties": properties,
        })

    edge_rows: List[Dict[str, Any]] = []
    seen_edge_ids: Set[uuid.UUID] = set()

    for src, dst, attrs in graph.edges(data=True):
        src_key, dst_key = str(src), str(dst)
        working = dict(attrs or {})
        rel_type = str(working.pop("relationship", None) or "RELATED_TO")
        weight = working.pop("weight", 1.0)

        eid = edge_uuid(src_key, rel_type, dst_key)
        if eid in seen_edge_ids:
            # Parallel duplicate within this same build - collapse it.
            continue
        seen_edge_ids.add(eid)

        try:
            weight_val = float(weight)
        except (TypeError, ValueError):
            weight_val = 1.0

        edge_rows.append({
            "id": eid,
            "src_id": node_uuid(src_key),
            "dst_id": node_uuid(dst_key),
            "rel_type": rel_type,
            "weight": weight_val,
            "properties": {k: _jsonable(v) for k, v in working.items()},
        })

    # An edge endpoint may be a node this call is not writing - for example a
    # Document node linked to a Well that a previous rebuild already persisted.
    # Resolve those against the table before deciding an edge is dangling, so an
    # incremental merge is not silently discarded. A genuinely absent endpoint
    # still gets dropped, because the FK would reject it.
    candidate_ids = {e["src_id"] for e in edge_rows} | {e["dst_id"] for e in edge_rows}
    unknown = candidate_ids - seen_node_ids
    known_ids = set(seen_node_ids)
    if unknown:
        table = KnowledgeNode.__table__
        existing = db.execute(
            select(table.c.id).where(table.c.id.in_(list(unknown)))
        ).all()
        known_ids |= {row[0] for row in existing}

    valid_edges = [e for e in edge_rows if e["src_id"] in known_ids and e["dst_id"] in known_ids]
    dropped = len(edge_rows) - len(valid_edges)
    if dropped:
        logger.warning("graph_store: dropped %d edge(s) with missing endpoints", dropped)

    nodes_written = _upsert_nodes(db, node_rows, preserve_existing=preserve_existing_nodes)
    edges_written = _upsert_edges(db, valid_edges)

    nodes_pruned = 0
    edges_pruned = 0
    if prune:
        # A deterministic rebuild only knows about well/event nodes, so pruning
        # blindly would delete every Document node and its edges - throwing away
        # the Phase 4 ingestion links on each rebuild. Those are protected.
        protected_nodes = _document_node_ids(db)
        protected_edges = _edge_ids_touching(db, protected_nodes)
        edges_pruned = _prune(db, KnowledgeEdge, seen_edge_ids, protected_edges)
        nodes_pruned = _prune(db, KnowledgeNode, seen_node_ids, protected_nodes)

    db.commit()

    return {
        "nodes_written": nodes_written,
        "edges_written": edges_written,
        "edges_dropped_dangling": dropped,
        "nodes_pruned": nodes_pruned,
        "edges_pruned": edges_pruned,
    }


def _upsert_nodes(db, rows: List[Dict[str, Any]], preserve_existing: bool = False) -> int:
    written = 0
    table = KnowledgeNode.__table__
    for start in range(0, len(rows), _BATCH):
        chunk = rows[start:start + _BATCH]
        if not chunk:
            continue
        stmt = pg_insert(table).values(chunk)
        if preserve_existing:
            # Incremental merges must never rewrite a node they did not mean to
            # own. NetworkX implicitly creates a bare node for every edge
            # endpoint, so linking a Document to "Well:X" would otherwise
            # overwrite Well:X's properties with an empty dict.
            stmt = stmt.on_conflict_do_nothing(index_elements=[table.c.id])
        else:
            stmt = stmt.on_conflict_do_update(
                index_elements=[table.c.id],
                set_={
                    "node_key": stmt.excluded.node_key,
                    "label": stmt.excluded.label,
                    "name": stmt.excluded.name,
                    "properties": stmt.excluded.properties,
                },
            )
        db.execute(stmt)
        written += len(chunk)
    return written


def _upsert_edges(db, rows: List[Dict[str, Any]]) -> int:
    written = 0
    table = KnowledgeEdge.__table__
    for start in range(0, len(rows), _BATCH):
        chunk = rows[start:start + _BATCH]
        if not chunk:
            continue
        stmt = pg_insert(table).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=[table.c.id],
            set_={
                "src_id": stmt.excluded.src_id,
                "dst_id": stmt.excluded.dst_id,
                "rel_type": stmt.excluded.rel_type,
                "weight": stmt.excluded.weight,
                "properties": stmt.excluded.properties,
            },
        )
        db.execute(stmt)
        written += len(chunk)
    return written


def _prune(db, model, keep_ids: Set[uuid.UUID],
           protected_ids: Optional[Set[uuid.UUID]] = None) -> int:
    """Delete rows of `model` whose id is not in keep_ids.

    `protected_ids` are never deleted even when absent from keep_ids - used to
    carry the Phase 4 Document nodes and their edges across a full rebuild,
    which knows nothing about them.
    """
    existing = {row[0] for row in db.execute(select(model.id)).all()}
    stale = existing - keep_ids - (protected_ids or set())
    if not stale:
        return 0
    stale_list = list(stale)
    for start in range(0, len(stale_list), _BATCH):
        chunk = stale_list[start:start + _BATCH]
        db.query(model).filter(model.id.in_(chunk)).delete(synchronize_session=False)
    return len(stale)


def _document_node_ids(db) -> Set[uuid.UUID]:
    """Ids of every persisted Document node."""
    rows = db.execute(
        select(KnowledgeNode.__table__.c.id).where(KnowledgeNode.__table__.c.label == "Document")
    ).all()
    return {row[0] for row in rows}


def _edge_ids_touching(db, node_ids: Set[uuid.UUID]) -> Set[uuid.UUID]:
    """Ids of every edge with an endpoint in `node_ids`."""
    if not node_ids:
        return set()
    table = KnowledgeEdge.__table__
    rows = db.execute(
        select(table.c.id).where(
            or_(table.c.src_id.in_(list(node_ids)), table.c.dst_id.in_(list(node_ids)))
        )
    ).all()
    return {row[0] for row in rows}


# ------------------------------------------------------------------------------
# Rebuild and load
# ------------------------------------------------------------------------------

def rebuild_and_persist(db, prune: bool = True) -> Dict[str, Any]:
    """
    Rebuild the graph deterministically from well_master + synthetic_event and
    persist it. This is the entry point a startup hook or an admin endpoint
    should call.
    """
    from models import WellMaster, SyntheticEvent

    wells = db.query(WellMaster).all()
    events = db.query(SyntheticEvent).all()

    kg = KnowledgeGraphService()
    stats = kg.build_graph(wells, events)

    result = persist_graph(db, kg.graph, prune=prune)
    result.update({
        "source_wells": stats.get("wells", len(wells)),
        "source_events": stats.get("events", len(events)),
        "graph_nodes": stats.get("nodes", 0),
        "graph_edges": stats.get("edges", 0),
    })
    return result


def load_graph(db) -> nx.MultiDiGraph:
    """
    Reload the persisted graph into NetworkX, restoring the original node ids
    ("Well:...", "Event:101") and the 'relationship' edge attribute the existing
    query layer reads.
    """
    graph = nx.MultiDiGraph()

    id_to_key: Dict[uuid.UUID, str] = {}
    for node in db.query(KnowledgeNode).all():
        attrs = dict(node.properties or {})
        attrs[_LABEL_ATTR] = node.label
        if node.name is not None:
            attrs["name"] = node.name
        graph.add_node(node.node_key, **attrs)
        id_to_key[node.id] = node.node_key

    missing = 0
    for edge in db.query(KnowledgeEdge).all():
        src = id_to_key.get(edge.src_id)
        dst = id_to_key.get(edge.dst_id)
        if src is None or dst is None:
            missing += 1
            continue
        attrs = dict(edge.properties or {})
        attrs["relationship"] = edge.rel_type
        if edge.weight is not None:
            attrs["weight"] = edge.weight
        graph.add_edge(src, dst, **attrs)

    if missing:
        logger.warning("graph_store: %d persisted edge(s) referenced unknown nodes", missing)

    return graph


def graph_stats(db) -> Dict[str, Any]:
    """Row-level counts straight from Postgres - the honest persistence check."""
    node_count = db.execute(select(func.count()).select_from(KnowledgeNode.__table__)).scalar() or 0
    edge_count = db.execute(select(func.count()).select_from(KnowledgeEdge.__table__)).scalar() or 0

    by_label = {
        label: count
        for label, count in db.execute(
            select(KnowledgeNode.label, func.count()).group_by(KnowledgeNode.label)
        ).all()
    }
    by_rel = {
        rel: count
        for rel, count in db.execute(
            select(KnowledgeEdge.rel_type, func.count()).group_by(KnowledgeEdge.rel_type)
        ).all()
    }

    return {
        "node_count": int(node_count),
        "edge_count": int(edge_count),
        "nodes_by_label": by_label,
        "edges_by_relationship": by_rel,
        "data_source": "postgres",
    }


# ------------------------------------------------------------------------------
# Traversal helpers - these back the /api/graph/* endpoints
# ------------------------------------------------------------------------------

def get_node(db, node_ref: str) -> Optional[Dict[str, Any]]:
    """Fetch one node by node_key ('Event:101') or by uuid string."""
    row = db.query(KnowledgeNode).filter(KnowledgeNode.node_key == node_ref).first()
    if row is None:
        try:
            row = db.query(KnowledgeNode).filter(KnowledgeNode.id == uuid.UUID(str(node_ref))).first()
        except (ValueError, AttributeError, TypeError):
            row = None
    if row is None:
        return None
    return _node_payload(row)


def _node_payload(row) -> Dict[str, Any]:
    payload = dict(row.properties or {})
    payload.update({
        "id": row.node_key,
        "uuid": str(row.id),
        "type": row.label,
        "label": row.label,
        "name": row.name,
    })
    return payload


def neighbors(db, node_ref: str, depth: int = 1, graph: Optional[nx.MultiDiGraph] = None) -> Dict[str, Any]:
    """
    Breadth-first neighbourhood around a node, out to `depth` hops, traversing
    edges in both directions.

    Loads the persisted graph into NetworkX and walks it there - the corpus is
    small enough that this is faster and far simpler than a recursive CTE, and
    it keeps NetworkX as the single traversal implementation.
    """
    g = graph if graph is not None else load_graph(db)

    start = str(node_ref)
    if not g.has_node(start):
        resolved = get_node(db, node_ref)
        if resolved is None:
            return {"root": node_ref, "found": False, "depth": depth, "nodes": [], "edges": [],
                    "node_count": 0, "edge_count": 0, "data_source": "postgres"}
        start = resolved["id"]
        if not g.has_node(start):
            return {"root": start, "found": False, "depth": depth, "nodes": [], "edges": [],
                    "node_count": 0, "edge_count": 0, "data_source": "postgres"}

    try:
        hops = max(0, int(depth))
    except (TypeError, ValueError):
        hops = 1

    undirected = g.to_undirected(as_view=True)
    reached: Set[str] = {start}
    frontier: Set[str] = {start}
    for _ in range(hops):
        nxt: Set[str] = set()
        for n in frontier:
            nxt.update(undirected.neighbors(n))
        nxt -= reached
        if not nxt:
            break
        reached.update(nxt)
        frontier = nxt

    edges = [
        {"source": u, "target": v, "relationship": d.get("relationship", "RELATED_TO")}
        for u, v, d in g.edges(data=True)
        if u in reached and v in reached
    ]

    nodes = []
    for n in reached:
        attrs = dict(g.nodes[n])
        attrs["id"] = n
        attrs.setdefault("label", attrs.get("type"))
        nodes.append(attrs)

    return {
        "root": start,
        "found": True,
        "depth": hops,
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "data_source": "postgres",
    }


def overview(db, limit: Optional[int] = None) -> Dict[str, Any]:
    """
    The whole persisted graph, shaped for the UI.

    Returns data_source='postgres' so a caller can tell a real database read
    from an offline fallback - every other DB endpoint in this codebase
    degrades silently to JSON, and that is exactly how the zero-embedding bug
    stayed hidden.
    """
    g = load_graph(db)

    nodes = []
    for n, attrs in g.nodes(data=True):
        payload = dict(attrs)
        payload["id"] = n
        payload.setdefault("label", payload.get("type"))
        nodes.append(payload)

    edges = [
        {"source": u, "target": v, "relationship": d.get("relationship", "RELATED_TO")}
        for u, v, d in g.edges(data=True)
    ]

    truncated = False
    if limit is not None and limit > 0 and len(nodes) > limit:
        keep = {n["id"] for n in nodes[:limit]}
        nodes = [n for n in nodes if n["id"] in keep]
        edges = [e for e in edges if e["source"] in keep and e["target"] in keep]
        truncated = True

    stats = graph_stats(db)

    return {
        "nodes": nodes,
        "edges": edges,
        "node_count": len(nodes),
        "edge_count": len(edges),
        "truncated": truncated,
        "persisted": {"node_count": stats["node_count"], "edge_count": stats["edge_count"]},
        "nodes_by_label": stats["nodes_by_label"],
        "edges_by_relationship": stats["edges_by_relationship"],
        "data_source": "postgres",
    }
