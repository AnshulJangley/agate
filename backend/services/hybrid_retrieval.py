import re
import math
from typing import Dict, Any, List, Optional, Set
try:
    from services.ahp_weights import (
        AHP_WEIGHTS,
        AHP_CONSISTENCY_RATIO,
        AHP_IS_CONSISTENT,
        AHP_RETRIEVAL_RESULT
    )
except ImportError:
    try:
        from .ahp_weights import (
            AHP_WEIGHTS,
            AHP_CONSISTENCY_RATIO,
            AHP_IS_CONSISTENT,
            AHP_RETRIEVAL_RESULT
        )
    except ImportError:
        from ahp_weights import (  # type: ignore
            AHP_WEIGHTS,
            AHP_CONSISTENCY_RATIO,
            AHP_IS_CONSISTENT,
            AHP_RETRIEVAL_RESULT
        )

# Replace hand-picked constant weights with mathematically rigorous AHP-derived weights (Saaty 1980)
DEFAULT_WEIGHTS = AHP_WEIGHTS

EVENT_FAMILY_KEYWORDS = {
    "kick": ["kick", "influx", "pit gain", "sidpp", "sicp", "gas", "flow", "well control", "blowout"],
    "stuck pipe": ["stuck", "sticking", "pipe stuck", "free point", "overpull", "jarring"],
    "differential sticking": ["differential", "sticking", "filter cake", "overbalance", "depleted"],
    "mechanical packoff": ["packoff", "pack-off", "tight hole", "bridging", "drag", "cuttings", "hole cleaning", "annular packoff"],
    "lost circulation": ["loss", "losses", "lost circulation", "mud loss", "thief", "seepage", "partial loss", "total loss"],
    "equipment failure": ["failure", "twist-off", "washout", "mwd", "bha", "bit", "downhole tool"]
}


def compute_bm25_score(query: str, text: str) -> float:
    """Computes bounded BM25-like lexical matching score between query and document text."""
    query_terms = set(re.findall(r"\w+", (query or "").lower()))
    text_terms = re.findall(r"\w+", (text or "").lower())
    if not query_terms or not text_terms:
        return 0.0
    doc_len = len(text_terms)
    avg_len = 200.0
    k1, b = 1.5, 0.75
    term_counts = {}
    for t in text_terms:
        term_counts[t] = term_counts.get(t, 0) + 1
    score = 0.0
    for qt in query_terms:
        freq = term_counts.get(qt, 0)
        if freq > 0:
            tf = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (doc_len / avg_len)))
            score += tf
    return min(1.0, score / 4.0)


def compute_depth_proximity_score(query_depth: Optional[float], event_depth: Optional[float], max_range: float = 500.0) -> float:
    """Calculates linear decay proximity score between reference drilling depth and historical event depth."""
    if query_depth is None or event_depth is None:
        return -1.0  # signal absence of context
    diff = abs(float(query_depth) - float(event_depth))
    return max(0.0, 1.0 - (diff / max_range))


def jaccard_similarity(set_a: set, set_b: set) -> float:
    """Intersection over union — standard set-similarity metric."""
    if not set_a and not set_b:
        return 0.0
    norm_a = {str(x).strip().lower() for x in set_a if x is not None and str(x).strip()}
    norm_b = {str(x).strip().lower() for x in set_b if x is not None and str(x).strip()}
    if not norm_a and not norm_b:
        return 0.0
    intersection = len(norm_a & norm_b)
    union = len(norm_a | norm_b)
    return float(intersection / union) if union > 0 else 0.0


def _extract_formation_set(formation_input: Any) -> Set[str]:
    """Extracts a normalized set of canonical formation names from strings, sets, or lists."""
    if not formation_input:
        return set()
    if isinstance(formation_input, (set, list, tuple)):
        result = set()
        for item in formation_input:
            result.update(_extract_formation_set(item))
        return result

    raw_str = str(formation_input).strip().lower()
    if not raw_str:
        return set()

    # Known regional formation names across all 4 Indian basins
    known_formations = [
        # Upper Assam Shelf
        "dihing", "tipam", "surma", "barail", "kopili", "disang", "girujan", "jaintia",
        # Rajasthan Basin
        "pariwar", "baisakhi", "jodhpur", "bilara", "marwar", "shumar",
        # KG Deepwater
        "shallow marine", "gumbo", "godavari", "ravva", "cretaceous", "matsya", "vadaparru",
        # Mizoram Fold Belt
        "bokabil", "bhuban", "upper bhuban", "middle bhuban", "lower bhuban", "flysch"
    ]
    detected = {k for k in known_formations if k in raw_str}
    if detected:
        return detected

    # Fallback: split by delimiters and clean common geologic terms
    tokens = [t.strip() for t in re.split(r"[,/;\+]+", raw_str) if t.strip()]
    cleaned = set()
    for token in tokens:
        c = re.sub(r"\b(formation|sandstone|sand|shale|gravels|group|member|transition|sediments|carbonates|clay)\b", "", token).strip()
        cleaned.add(c if c else token)
    return cleaned


def compute_formation_match_score(
    context_formation: Any,
    event_formation: Any,
    query: str = ""
) -> float:
    """
    Computes Jaccard similarity over formation sets (intersection over union).
    Produces a continuous, principled 0-1 score based on actual formation overlap
    rather than arbitrary tier boundaries.
    """
    set_event = _extract_formation_set(event_formation)
    set_context = _extract_formation_set(context_formation)

    # If context formation is absent, try to infer formation names from query string
    if not set_context and query:
        set_context = _extract_formation_set(query)

    if not set_context:
        return -1.0 # signal absence of context
        
    if not set_event:
        return 0.0

    return round(jaccard_similarity(set_context, set_event), 3)


def compute_equipment_jaccard_similarity(active_equipment: Any, offset_equipment: Any) -> float:
    """Computes Jaccard similarity between two equipment, BHA, or casing component sets."""
    set_a = {str(x).strip().lower() for x in (active_equipment if isinstance(active_equipment, (list, set, tuple)) else [active_equipment]) if x}
    set_b = {str(x).strip().lower() for x in (offset_equipment if isinstance(offset_equipment, (list, set, tuple)) else [offset_equipment]) if x}
    return round(jaccard_similarity(set_a, set_b), 3)


def compute_event_type_match_score(
    query: str,
    candidate_event_type: str,
    query_event_type: Optional[str] = None
) -> float:
    """
    Returns:
    - 1.0 if explicit match with candidate event_type
    - 0.6-0.8 for strong synonym/family match
    - 0.4 for related hazard domain
    - 0.0 otherwise
    """
    cand = (candidate_event_type or "").strip().lower()
    q = (query or "").lower()
    q_type = (query_event_type or "").strip().lower()

    if not cand:
        return 0.0

    # 1. Direct match with inferred event type parameter
    if q_type:
        if q_type == cand or q_type in cand or cand in q_type:
            return 1.0

    # 2. Direct string containment
    if cand in q:
        return 1.0

    # 3. Check domain hazard families
    cand_family = None
    for family, kws in EVENT_FAMILY_KEYWORDS.items():
        if any(kw in cand for kw in kws):
            cand_family = family
            break

    if cand_family:
        matching_kws = [kw for kw in EVENT_FAMILY_KEYWORDS[cand_family] if kw in q]
        if matching_kws:
            return 0.8

    # Check for related stuck pipe / packoff families
    stuck_group = {"stuck pipe", "differential sticking", "mechanical packoff"}
    if cand_family in stuck_group:
        if any(any(kw in q for kw in EVENT_FAMILY_KEYWORDS[f]) for f in stuck_group):
            return 0.5

    return 0.0


def compute_hybrid_relevance_score(
    formation_match: float,
    depth_proximity: float,
    event_type_match: float,
    bm25: float,
    vector: float,
    weights: Optional[Dict[str, float]] = None
) -> Dict[str, Any]:
    """
    Combines multi-signal relevance features into a weighted hybrid score
    and returns the final score alongside a comprehensive breakdown.
    """
    w = weights or DEFAULT_WEIGHTS
    
    score_breakdown = {
        "formation_match": float(formation_match),
        "depth_proximity": float(depth_proximity),
        "event_type_match": float(event_type_match),
        "bm25": float(bm25),
        "vector": float(vector),
    }

    # Normalize weights dynamically for excluded signals
    active_weights = {}
    for key, weight_val in w.items():
        if score_breakdown[key] >= 0:
            active_weights[key] = weight_val

    total_active_weight = sum(active_weights.values())
    if total_active_weight > 0:
        normalized_weights = {k: v / total_active_weight for k, v in active_weights.items()}
    else:
        normalized_weights = {}

    hybrid_score = 0.0
    for key in normalized_weights:
        hybrid_score += score_breakdown[key] * normalized_weights[key]

    return {
        "hybrid_score": float(hybrid_score),
        "score_breakdown": score_breakdown,
        "weights": w,
        "normalized_weights": normalized_weights,
        "ahp_metadata": {
            "consistency_ratio": float(AHP_CONSISTENCY_RATIO),
            "consistent": bool(AHP_IS_CONSISTENT),
            "derivation_method": "Saaty Principal Eigenvector (1980)",
        }
    }


def get_analog_wells(
    target_well_id: str,
    hazard_type: str = "",
    top_k: int = 10,
    db: Any = None
) -> List[str]:
    """
    Ranks other wells by geological and hazard-specific similarity to target_well_id across India.
    Combines basin affinity (strong preference for proximate wells within the same geologic basin)
    with historical hazard incidence and formation correlation.
    """
    all_candidate_wells = []
    if db is not None:
        try:
            from models import WellMaster
            db_wells = db.query(WellMaster.well_id).all()
            all_candidate_wells = [w[0] for w in db_wells if w[0]]
        except Exception:
            all_candidate_wells = []

    if not all_candidate_wells:
        # Full pan-India 26 well inventory
        all_candidate_wells = [
            # Upper Assam (11 wells)
            "OIL-BAGHJAN-1", "OIL-BAGHJAN-4", "OIL-MORAN-1", "OIL-NAHARKATIYA-1", "OIL-DIKOM-1",
            "OIL-DULIAJAN-1", "OIL-KUMCHAI-1", "OIL-KHARSANG-1", "OIL-SHALMARI-1", "OIL-TENGAKHAT-1", "OIL-MAKUM-1",
            # Rajasthan (5 wells)
            "OIL-RAJ-BAGHEWALA-1", "OIL-RAJ-TANOT-1", "OIL-RAJ-DANDEWALA-1", "OIL-RAJ-TAVRIWALA-1", "OIL-RAJ-CHINNEWALA-1",
            # KG Deepwater (5 wells)
            "OIL-KG-DEEPWATER-1", "OIL-KG-DWN-1", "OIL-KG-YANAM-1", "OIL-KG-AMALAPURAM-1", "OIL-KG-GODAVARI-1",
            # Mizoram Fold Belt (5 wells)
            "OIL-MZ-AIZAWL-1", "OIL-MZ-MAMIT-1", "OIL-MZ-KOLASIB-1", "OIL-MZ-LUNGLEI-1", "OIL-MZ-CHAMPHAI-1"
        ]

    # Filter out target well itself
    candidates = [w for w in all_candidate_wells if w != target_well_id]
    if not candidates:
        return all_candidate_wells[:top_k]

    def _get_basin(wid: str) -> str:
        u = wid.upper()
        if "RAJ" in u or "BAGHEWALA" in u or "TANOT" in u or "DANDEWALA" in u:
            return "rajasthan"
        if "KG" in u or "DEEPWATER" in u or "DWN" in u or "YANAM" in u or "AMALAPURAM" in u:
            return "kg"
        if "MZ" in u or "MIZO" in u or "AIZAWL" in u or "MAMIT" in u or "KOLASIB" in u or "LUNGLEI" in u or "CHAMPHAI" in u:
            return "mizoram"
        return "assam"

    target_basin = _get_basin(target_well_id)
    h_type = (hazard_type or "").lower()

    # Documented hazard associations by well
    hazard_affinity = {
        "stuck_pipe": {
            "OIL-MORAN-1": 1.0, "OIL-DIKOM-1": 0.85, "OIL-MZ-AIZAWL-1": 0.95,
            "OIL-MZ-MAMIT-1": 0.90, "OIL-MZ-KOLASIB-1": 0.88, "OIL-RAJ-JODHPUR-1": 0.80
        },
        "kick": {
            "OIL-NAHARKATIYA-1": 1.0, "OIL-BAGHJAN-1": 0.95, "OIL-BAGHJAN-4": 0.90,
            "OIL-KG-DEEPWATER-1": 0.95, "OIL-KG-DWN-1": 0.92, "OIL-KG-YANAM-1": 0.88
        },
        "gas_kick": {
            "OIL-NAHARKATIYA-1": 1.0, "OIL-BAGHJAN-1": 0.95, "OIL-BAGHJAN-4": 0.90,
            "OIL-KG-DEEPWATER-1": 0.95, "OIL-KG-DWN-1": 0.92, "OIL-KG-YANAM-1": 0.88
        },
        "lost_circulation": {
            "OIL-MORAN-1": 1.0, "OIL-BAGHJAN-4": 0.85, "OIL-RAJ-BAGHEWALA-1": 0.98,
            "OIL-RAJ-TANOT-1": 0.92, "OIL-RAJ-DANDEWALA-1": 0.90
        },
        "mud_loss": {
            "OIL-MORAN-1": 1.0, "OIL-BAGHJAN-4": 0.85, "OIL-RAJ-BAGHEWALA-1": 0.98,
            "OIL-RAJ-TANOT-1": 0.92, "OIL-RAJ-DANDEWALA-1": 0.90
        }
    }

    scored_wells = []
    for cand in candidates:
        cand_basin = _get_basin(cand)
        # 1. Geographic and stratigraphic basin affinity
        if cand_basin == target_basin:
            geo_score = 0.92  # Same basin -> strong stratigraphic analog
        else:
            geo_score = 0.35  # Cross-basin -> secondary analog

        # 2. Hazard profile affinity
        haz_score = 0.5
        for key, aff_dict in hazard_affinity.items():
            # An absent hazard_type must stay neutral. "" is a substring of every
            # key, so without the `h_type and` guard the `h_type in key` test fired
            # for the first table (stuck_pipe) and silently reordered the analog
            # pool as though a stuck-pipe hazard had been requested.
            if h_type and (key in h_type or h_type in key):
                if cand in aff_dict:
                    haz_score = aff_dict[cand]
                    break
                elif cand_basin == target_basin:
                    haz_score = 0.7

        composite = 0.65 * geo_score + 0.35 * haz_score
        scored_wells.append((cand, composite))

    scored_wells.sort(key=lambda x: x[1], reverse=True)
    return [w[0] for w in scored_wells][:top_k]

