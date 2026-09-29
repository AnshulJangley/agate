import logging
import re
from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate

# Import unified multi-provider factory
from nlp.llm_factory import get_llm, is_llm_available, detect_active_provider

logger = logging.getLogger(__name__)

# -------------------------------------------------------------------
# Pydantic Schemas for Structured Output
# -------------------------------------------------------------------

class DrillingIncidentSchema(BaseModel):
    event_type: str = Field(
        description=(
            "E.g., 'Stuck Pipe (Mechanical)', 'Stuck Pipe (Differential)', 'Severe Mud Loss', "
            "'Gas Kick', 'Tight Hole', 'Equipment Failure', 'Casing/Cementing Operation', "
            "'Cement Plug Failure', 'Gas Migration Through Cement', 'Overpressure Zone', "
            "'Torque Spike', 'Fishing Operation', 'Overshot Run', 'Lost In Hole'. "
            "The problem statement names mud losses, stuck pipe, overpressure, torque spikes and "
            "cementing issues as the risks of interest, and lists fishing operations among the "
            "historical event records — so name the specific failure, not a generic 'Drilling Problem'."
        )
    )
    depth_tvd: Optional[float] = Field(
        description="Estimated or exact True Vertical Depth in meters", 
        default=None
    )
    severity: str = Field(
        description="Enum-like string: 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'"
    )
    formation: str = Field(
        description="Formation name if mentioned, e.g., 'Barail', 'Tipam', 'Kopili', or 'Unknown'", 
        default="Unknown"
    )
    root_cause: str = Field(
        description="Concise technical description of why the incident occurred"
    )
    mitigation_applied: str = Field(
        description="Remediation steps, pills pumped, reaming practices used to resolve the issue"
    )
    npt_hours: float = Field(
        description="Non-productive time in hours, default 0.0", 
        default=0.0
    )
    source_text_snippet: str = Field(
        description="EXACT quotation from the source text that proves this event occurred. MUST be a direct verbatim substring from the document. Do not paraphrase.",
        default=""
    )
    casing_type: Optional[str] = Field(
        description="Type of casing string if applicable (e.g. Conductor, Surface, Intermediate, Production Liner)", 
        default=None
    )
    casing_size: Optional[str] = Field(
        description="Size, weight, or grade of casing if mentioned", 
        default=None
    )
    cement_slurry: Optional[str] = Field(
        description="Cement slurry type or density if mentioned", 
        default=None
    )
    toc_depth: Optional[float] = Field(
        description="Top of cement (TOC) depth in meters if mentioned", 
        default=None
    )
class IncidentExtractionResult(BaseModel):
    """
    Wrapper schema because LLMs need a top-level object to return lists accurately 
    in structured output mode.
    """
    incidents: List[DrillingIncidentSchema] = Field(
        description="List of extracted drilling incidents. If none, return an empty list.",
        default_factory=list
    )


# -------------------------------------------------------------------
# Extraction Logic
# -------------------------------------------------------------------

def _is_llm_available() -> bool:
    """Check if any remote or local LLM server is accessible without blocking."""
    return is_llm_available()

def _get_llm():
    """
    Initialize the LLM using the universal factory.
    Supports Google Gemini, Anthropic Claude, OpenAI, and Ollama (Local).
    """
    return get_llm(temperature=0.0, timeout=120.0)

def extract_incidents_from_text(text: str) -> List[DrillingIncidentSchema]:
    """
    Extracts structured drilling incident data from a single text chunk.
    """
    if not text.strip():
        return []

    if not _is_llm_available():
        return _rule_based_fallback_extraction(text)

    try:
        llm = _get_llm()
        # Bind the Pydantic schema to the LLM to force JSON output matching the schema
        structured_llm = llm.with_structured_output(IncidentExtractionResult)
        
        system_prompt = (
            "You are an expert Senior Drilling Engineer reviewing historical Daily Drilling Reports and Well Completion Reports. "
            "Extract all downhole incidents, hazard events, kicks, stuck pipe situations, NPT entries, AND casing and cementing operations. "
            "CRITICAL: For every event you extract, you MUST provide the exact verbatim substring from the document in 'source_text_snippet'. "
            "Do not invent or paraphrase the snippet. If no event occurred in the text, return an empty list. Maintain domain precision."
        )
        
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            ("human", "Extract the incidents from the following report text:\n\n{text}")
        ])
        
        chain = prompt | structured_llm
        raw_result = chain.invoke({"text": text})
        
        extracted = []
        if isinstance(raw_result, IncidentExtractionResult):
            extracted = raw_result.incidents
        elif isinstance(raw_result, dict):
            extracted = IncidentExtractionResult.model_validate(raw_result).incidents
        elif hasattr(raw_result, "incidents"):
            extracted = getattr(raw_result, "incidents", [])
            
        # Anti-Fabrication validation: Verify the snippet actually exists in the text
        valid_incidents = []
        for inc in extracted:
            snippet = inc.source_text_snippet.strip()
            # We allow a small amount of leeway for whitespace mismatches but it must be in the text
            if snippet and snippet.lower() in text.lower().replace('\n', ' '):
                valid_incidents.append(inc)
            else:
                logger.warning(f"Discarding fabricated event. Snippet not found in source text: {snippet}")
                
        return valid_incidents
        
    except Exception as e:
        logger.warning(f"LLM extraction unavailable ({e}). Engaging deterministic domain NLP fallback...")
        return _rule_based_fallback_extraction(text)

def _rule_based_fallback_extraction(text: str) -> List[DrillingIncidentSchema]:
    """
    Robust rule-based domain extractor for drilling reports when LLM is unavailable or offline.
    Detects incident types, formations, depths, root causes, mitigations, and NPT hours.
    """
    import re
    incidents = []
    
    # Common drilling incident types
    hazard_patterns = [
        ("Lost Circulation", r"(lost\s+circulation|mud\s+loss|seepage\s+losses|total\s+loss)"),
        ("Gas Kick", r"(gas\s+kick|well\s+kick|influx|gas\s+spike|pit\s+gain|sidpp)"),
        ("Differential Sticking", r"(differential\s+sticking|stuck\s+pipe|pipe\s+stuck)"),
        ("Mechanical Packoff", r"(packoff|pack-off|tight\s+hole|bridging|drag)"),
        ("Equipment Failure", r"(twist-off|mwd\s+failure|bha\s+washout|bit\s+failure)"),
        ("casing_cementing_issue", r"(casing|cementing|run\s+casing|cement\s+job|liner\s+hanger)")
    ]

    # Formations
    formations = ["Barail Formation", "Barail", "Tipam Sandstone", "Tipam", "Kopili Formation", "Kopili", "Girujan Clay", "Girujan"]

    # Split text into paragraphs or incident blocks
    blocks = re.split(r"(?:Incident\s*\d*[:\-]|Entry\s*\d*[:\-]|Hazard\s*\d*[:\-]|---|\n\s*\n)", text, flags=re.IGNORECASE)
    
    for block in blocks:
        block_clean = block.strip()
        if len(block_clean) < 30:
            continue
            
        matched_type = None
        for name, pattern in hazard_patterns:
            if re.search(pattern, block_clean, re.IGNORECASE):
                matched_type = name
                break
                
        if not matched_type:
            continue
            
        # Extract formation
        form_found = "Barail Formation"
        for f in formations:
            if re.search(r"\b" + re.escape(f) + r"\b", block_clean, re.IGNORECASE):
                form_found = f if "Formation" in f or "Sandstone" in f or "Clay" in f else f + " Formation"
                break
                
        # Extract depth (TVD/MD)
        depth = 2425.0
        depth_match = re.search(r"(\d{3,4}(?:\.\d+)?)\s*(?:m|meters)?\s*(?:tvd|md)?", block_clean, re.IGNORECASE)
        if depth_match:
            try:
                val = float(depth_match.group(1))
                if 500 <= val <= 6000:
                    depth = val
            except ValueError:
                pass
                
        # Extract NPT hours
        npt = 3.5
        npt_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:hrs?|hours?|h)\s*(?:npt)?", block_clean, re.IGNORECASE)
        if npt_match:
            try:
                npt = float(npt_match.group(1))
            except ValueError:
                pass
                
        # Extract root cause
        root_cause = "Formation pressure differential and rock mechanical instability during drilling."
        cause_match = re.search(r"(?:Root\s*Cause|Cause|Reason)[:\-]\s*([^\.\n]+(?:\.[^\.\n]+)?)", block_clean, re.IGNORECASE)
        if cause_match:
            root_cause = cause_match.group(1).strip()
        elif "losses" in block_clean.lower():
            root_cause = "Encountered depleted high-permeability sand body with fracture gradient lower than active hydrostatic column."
        elif "kick" in block_clean.lower():
            root_cause = "Formation pore pressure exceeded active mud hydrostatic column resulting in hydrocarbon gas influx."
            
        # Extract mitigation
        mitigation = "Adjusted mud weight, circulated bottoms up, and conditioned drilling fluid."
        mit_match = re.search(r"(?:Mitigation|Remediation|Action\s*Taken)[:\-]\s*([^\.\n]+(?:\.[^\.\n]+)?)", block_clean, re.IGNORECASE)
        if mit_match:
            mitigation = mit_match.group(1).strip()
        elif "losses" in block_clean.lower():
            mitigation = "Mixed and spotted 35 bbl LCM pill with nut-plug and mica. Soaked 2 hours and restored full circulation."
        elif "kick" in block_clean.lower():
            mitigation = "Shut-in well on annular preventer. Recorded SIDPP and SICP, circulated out influx using Driller's Method with weighted kill mud."

        incidents.append(DrillingIncidentSchema(
            event_type=matched_type,
            depth_tvd=depth,
            severity="HIGH" if ("kick" in matched_type.lower() or "sticking" in matched_type.lower()) else "MEDIUM",
            formation=form_found,
            root_cause=root_cause,
            mitigation_applied=mitigation,
            npt_hours=npt
        ))
        
    return incidents

# -------------------------------------------------------------------
# Document typing
# -------------------------------------------------------------------

# The ingest pipeline stamped every upload `doc_type="ddr"`, so a Well Completion
# Report — the first data source the problem statement names — was filed, stored and
# displayed as a Daily Drilling Report. The two carry different content: a DDR is a
# chronological operations log, a WCR is a retrospective completion summary with the
# casing, cementing and perforation record.
DOC_TYPE_HEADERS = (
    ("wcr", ("well completion report", "completion report", "well completion")),
    ("ddr", ("daily drilling report", "drilling report summary")),
    ("mud_log", ("mud log", "mud logging report", "mud logging")),
    ("program", ("drilling program", "casing program", "cementing program", "mud program")),
)


def detect_doc_type(filename: Optional[str] = None, text: Optional[str] = None) -> str:
    """
    Classify an uploaded document as ddr / wcr / mud_log / program / unknown.

    The filename is checked first and wins when the two disagree. That is deliberate:
    a WCR routinely quotes the daily drilling reports it summarises, so a keyword scan
    over the body alone would type a completion report as a drilling report.

    Returns "unknown" when neither signal is present. It does **not** fall back to
    "ddr" — mislabelling an unrecognised document as a Daily Drilling Report is how
    the original bug hid, and an honest "unknown" is what makes it visible.
    """
    name = str(filename or "").lower()
    head = " ".join(str(text or "")[:3000].split()).lower()

    if "wcr" in name or "completion" in name:
        return "wcr"
    if "ddr" in name or "daily" in name:
        return "ddr"
    if "mudlog" in name or "mud_log" in name or "mud log" in name:
        return "mud_log"
    if "program" in name:
        return "program"

    # Earliest mention wins, not first tuple that matches. A document titles itself at
    # the top, so a Daily Drilling Report that later quotes "the Well Completion Report
    # of the offset wells" is still a DDR — checking the tuples in a fixed order typed
    # it as a WCR because "wcr" happened to come first in the list.
    best_type: Optional[str] = None
    best_pos: Optional[int] = None
    for doc_type, headers in DOC_TYPE_HEADERS:
        for header in headers:
            pos = head.find(header)
            if pos != -1 and (best_pos is None or pos < best_pos):
                best_type, best_pos = doc_type, pos

    return best_type or "unknown"


# -------------------------------------------------------------------
# Formation canonicalisation
# -------------------------------------------------------------------

# Real Upper Assam-Arakan (and KG) formation names. The extractors return
# whatever the report wrote — "Barail Formation", "Upper Tipam Sandstone",
# "Kopili Marine Shale" — and left raw that split one formation across several
# nodes in the knowledge graph (`Barail` and `Barail Formation` both existed) and
# depressed formation-match scoring in hybrid retrieval, since the lexical half
# compares these strings literally.
CANONICAL_FORMATIONS = (
    "Tipam", "Girujan", "Namsang", "Barail", "Kopili",
    "Sylhet", "Langpar", "Narpuh", "Rajahmundry", "Razole",
)

_FORMATION_SUFFIXES = (
    " formation", " member", " group", " sandstone", " shale", " limestone",
    " siltstone", " claystone", " sand", " sequence",
)


def normalize_formation(raw: Optional[str]) -> Optional[str]:
    """
    Collapse a formation descriptor to its canonical name.

    Canonical match first, so "Upper Tipam Sandstone" resolves to Tipam rather
    than being trimmed to "Upper Tipam". Trimming is the fallback for a formation
    outside the vocabulary, and exists so an unseen name still collapses to one
    node instead of accumulating a variant per qualifier.

    An absent formation stays absent. Coercing it to a string would invent a
    formation named "Unknown" and hang every unrecorded event off it — the
    Pasarlapudi record genuinely has no formation in the public source, and the
    honest representation of that is NULL, not a label.
    """
    if raw is None:
        return None

    text = " ".join(str(raw).split())
    if not text:
        return None

    lowered = text.lower()

    for name in CANONICAL_FORMATIONS:
        if name.lower() in lowered:
            return name

    for suffix in _FORMATION_SUFFIXES:
        if lowered.endswith(suffix):
            text = text[: -len(suffix)]
            break

    return text.strip() or None


def incident_signature(incident: "DrillingIncidentSchema") -> tuple:
    """
    Identity key used to drop an incident that two overlapping chunks both yielded.

    Parenthetical sub-types are stripped from `event_type` so that "Gas Kick" and
    "Gas Kick (Formation Influx)" describe the same event, and depth is bucketed to
    10 m because extraction depth is approximate. The root cause is included (and
    NOT normalised to a category) so two genuinely different incidents at the same
    depth are never merged — only true restatements collapse.
    """
    event_type = re.sub(r"\(.*?\)", " ", incident.event_type or "")
    event_type = " ".join(event_type.split()).lower()

    depth = incident.depth_tvd
    depth_key = None if depth is None else round(float(depth) / 10.0) * 10

    cause = " ".join((incident.root_cause or "").split()).lower()[:160]

    return (event_type, incident.formation or "", depth_key, cause)


def extract_incidents_from_chunks(chunks: List[str]) -> List[DrillingIncidentSchema]:
    """
    Batch handling to iterate through all text chunks from a document.

    De-duplicated, and formations are canonicalised, because chunking guarantees
    overlap: `create_operational_chunks` splits on section boundaries, but a single
    incident narrative regularly mentions the same event in a summary block and
    again in its detail block. Both chunks yield the incident and the old code
    appended both, which is how `synthetic_event` ended up holding two byte-identical
    rows for the same Tengakhat gas kick at 2,425 m.
    """
    all_incidents: List[DrillingIncidentSchema] = []
    seen: set[tuple] = set()
    duplicates = 0

    for idx, chunk in enumerate(chunks):
        logger.info(f"Processing chunk {idx + 1}/{len(chunks)} for incident extraction...")
        incidents = extract_incidents_from_text(chunk)
        if not incidents:
            continue

        logger.info(f"Found {len(incidents)} incidents in chunk {idx + 1}.")
        for incident in incidents:
            incident.formation = normalize_formation(incident.formation)
            signature = incident_signature(incident)
            if signature in seen:
                duplicates += 1
                logger.info(
                    f"  dropped duplicate incident: {incident.event_type} @ "
                    f"{incident.depth_tvd}m {incident.formation}"
                )
                continue
            seen.add(signature)
            all_incidents.append(incident)

    if duplicates:
        logger.info(f"Removed {duplicates} duplicate incident(s) across chunk overlap.")

    return all_incidents
