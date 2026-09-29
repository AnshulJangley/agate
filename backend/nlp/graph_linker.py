"""
Phase 4: link an ingested document into the persisted knowledge graph.

The Phase 2 graph is built deterministically from `well_master` + `synthetic_event`
by `services/knowledge_graph.py`, which owns the Well / Event / Formation / Hazard /
Intervention / Outcome vocabulary. This module deliberately does **not** build those
nodes - it adds a single `Document:` node per ingested file and edges from it into
the nodes that already exist.

That distinction matters because `graph_store.persist_graph` upserts node properties
wholesale. Re-declaring `Well:OIL-MORAN-1` here would overwrite the richer properties
the main builder wrote with the thin set this module happens to know. Adding only the
Document node and its edges leaves the rest of the graph untouched.

Writes are incremental (`prune=False`), so a document link can never delete the graph.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Iterable, List, Optional

import networkx as nx

logger = logging.getLogger(__name__)

# Relationship vocabulary introduced by documents. Kept separate from the
# well/event relationships in knowledge_graph.py so a consumer can tell
# provenance edges from operational ones.
REL_MENTIONS = "MENTIONS"     # Document -> Well
REL_DISCUSSES = "DISCUSSES"   # Document -> Formation
REL_REPORTS = "REPORTS"       # Document -> Hazard


def _document_key(sha256: str) -> str:
    """Stable node key. Truncated - the full hash is carried in properties."""
    return f"Document:{(sha256 or 'unknown')[:12]}"


def link_document(db, document, events: Optional[Iterable[Any]] = None) -> Dict[str, Any]:
    """
    Merge one :class:`models.Document` and its extracted events into the graph.

    ``events`` are the ``SyntheticEvent`` rows produced from this document; only
    their well/formation/hazard values are read, so a list of plain dicts with
    the same keys also works.

    Returns the ``persist_graph`` result plus a count of the edges contributed.
    """
    from services import graph_store

    if document is None or not getattr(document, "sha256", None):
        return {"status": "skipped", "reason": "document has no sha256", "edges_linked": 0}

    graph = nx.MultiDiGraph()

    doc_key = _document_key(document.sha256)
    graph.add_node(
        doc_key,
        type="Document",
        name=getattr(document, "filename", None) or doc_key,
        sha256=document.sha256,
        well_id=getattr(document, "well_id", None),
        doc_type=getattr(document, "doc_type", None) or "ddr",
        chunk_count=getattr(document, "chunk_count", 0) or 0,
        ocr_triggered=bool(getattr(document, "ocr_triggered", False)),
    )

    edges_added = 0

    # Document -> Well. The well node is NOT declared here on purpose: the
    # endpoint is resolved against the existing table by persist_graph, so this
    # cannot overwrite the main builder's Well properties.
    well_id = getattr(document, "well_id", None)
    if well_id:
        graph.add_edge(doc_key, f"Well:{well_id}", relationship=REL_MENTIONS)
        edges_added += 1

    # Document -> Formation / Hazard, derived from the events extracted from it.
    seen_formations = set()
    seen_hazards = set()

    for event in (events or []):
        formation = _get(event, "formation")
        if formation and formation not in seen_formations:
            seen_formations.add(formation)
            graph.add_edge(doc_key, f"Formation:{formation}", relationship=REL_DISCUSSES)
            edges_added += 1

        event_type = _get(event, "event_type")
        hazard = _classify(event_type)
        if hazard and hazard not in seen_hazards:
            seen_hazards.add(hazard)
            graph.add_edge(doc_key, f"Hazard:{hazard}", relationship=REL_REPORTS)
            edges_added += 1

    try:
        # preserve_existing_nodes: NetworkX creates a bare node for every edge
        # endpoint, so without this the Well / Formation / Hazard nodes above
        # would be rewritten with empty properties, wiping what the main graph
        # builder stored. Observed doing exactly that before this flag existed.
        result = graph_store.persist_graph(db, graph, prune=False, preserve_existing_nodes=True)
    except Exception as exc:
        logger.warning("Could not link document %s into the graph: %s", doc_key, exc)
        db.rollback()
        return {"status": "failed", "reason": str(exc), "edges_linked": 0}

    result.update({
        "status": "linked",
        "document_node": doc_key,
        "edges_linked": edges_added,
        "formations": sorted(seen_formations),
        "hazards": sorted(seen_hazards),
    })
    return result


def unlink_document(db, sha256: str) -> Dict[str, Any]:
    """
    Remove a Document node and its edges.

    Deliberately narrow: it deletes only the `Document:` node. The Well /
    Formation / Hazard endpoints it pointed at are shared with the rest of the
    graph and are never removed here.
    """
    from models import KnowledgeNode
    from services.graph_store import node_uuid

    key = _document_key(sha256)
    row = db.query(KnowledgeNode).filter(KnowledgeNode.node_key == key).first()
    if row is None:
        return {"status": "absent", "document_node": key}
    db.delete(row)
    db.commit()
    return {"status": "unlinked", "document_node": key, "uuid": str(node_uuid(key))}


# ------------------------------------------------------------------------------
# helpers
# ------------------------------------------------------------------------------

def _get(obj: Any, key: str, default: Any = None) -> Any:
    """Read an attribute or a dict key, so ORM rows and plain dicts both work."""
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _classify(event_type: Optional[str]) -> Optional[str]:
    """
    Canonicalise an event type to the hazard vocabulary the graph already uses.

    Reuses ``knowledge_graph.classify_hazard`` rather than carrying a second
    keyword table that would drift out of sync with it.
    """
    if not event_type:
        return None
    try:
        from services.knowledge_graph import classify_hazard

        return classify_hazard(str(event_type))
    except Exception:
        return None
