from sqlalchemy import Column, Integer, String, Float, DateTime, Date, ForeignKey, Index, Boolean, Text, func
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from database import Base

class WellMaster(Base):
    __tablename__ = 'well_master'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(String, unique=True, index=True, nullable=False)
    field_name = Column(String)
    kb_elevation = Column(Float)
    total_depth_tvd = Column(Float)
    # Using String for dates based on processed data (e.g., '2024-01-01'). 
    # This could be switched to Date or DateTime as necessary.
    spud_date = Column(String) 
    
    # PostGIS spatial column (Point, WGS84)
    surface_location = Column(Geometry(geometry_type='POINT', srid=4326))
    # Was defaulted to 'volve_relabeled'. That stamped every unspecified well with a
    # claim that it was derived from Equinor's Volve dataset, which no data supported —
    # `data/raw/` is empty and the log builder generates synthetic data. A provenance
    # default must not name a dataset that was never loaded.
    data_source = Column(String, default='synthetic_calibrated')
    
    # Bi-directional relationships to related tables
    drilling_params = relationship("DrillingParam", back_populates="well", cascade="all, delete-orphan")
    well_logs = relationship("WellLog", back_populates="well", cascade="all, delete-orphan")
    synthetic_events = relationship("SyntheticEvent", back_populates="well", cascade="all, delete-orphan")


class DrillingParam(Base):
    __tablename__ = 'drilling_param'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(String, ForeignKey('well_master.well_id'), nullable=False, index=True)
    timestamp = Column(DateTime, index=True)
    depth_md = Column(Float)
    depth_tvd = Column(Float)
    rop = Column(Float)
    wob = Column(Float)
    rpm = Column(Float)
    torque = Column(Float)
    mud_weight = Column(Float)
    ecd = Column(Float)
    mse = Column(Float)
    d_xc = Column(Float)
    
    # Back-reference
    well = relationship("WellMaster", back_populates="drilling_params")


class WellLog(Base):
    __tablename__ = 'well_log'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(String, ForeignKey('well_master.well_id'), nullable=False, index=True)
    depth_tvd = Column(Float, index=True)
    gamma_ray = Column(Float)
    resistivity = Column(Float)
    sonic = Column(Float)
    density = Column(Float)
    formation_top = Column(String, index=True)
    
    # Back-reference
    well = relationship("WellMaster", back_populates="well_logs")


class SyntheticEvent(Base):
    __tablename__ = 'synthetic_event'
    __table_args__ = {'extend_existing': True}
    
    id = Column(Integer, primary_key=True, index=True)
    well_id = Column(String, ForeignKey('well_master.well_id'), nullable=False, index=True)
    depth_start_tvd = Column(Float)
    depth_end_tvd = Column(Float)
    formation = Column(String)
    event_type = Column(String, index=True)
    severity = Column(String)
    root_cause = Column(String)
    mitigation_applied = Column(String)
    npt_hours = Column(Float)
    
    # Casing and Cementing operations
    casing_type = Column(String, nullable=True)
    casing_size = Column(String, nullable=True)
    cement_slurry = Column(String, nullable=True)
    toc_depth = Column(Float, nullable=True)
    
    data_source = Column(String, default='synthetic')
    
    # Fallback to standard Postgres Array since pgvector compilation failed
    embedding = Column(ARRAY(Float))

    # Back-reference
    well = relationship("WellMaster", back_populates="synthetic_events")


# ==============================================================================
# Phase 2: Persisted Knowledge Graph
#
# The NetworkX graph in services/knowledge_graph.py is rebuilt in memory on every
# process and discarded on restart. These two tables give it durable storage.
#
# Primary keys are uuid5 values derived from stable node/edge keys rather than
# autoincrement integers, so re-running a build MERGES onto existing rows instead
# of duplicating them. See services/graph_store.py for the derivation.
# ==============================================================================

class KnowledgeNode(Base):
    __tablename__ = 'knowledge_node'
    __table_args__ = {'extend_existing': True}

    # uuid5(NAMESPACE_AGATE_GRAPH, node_key) - deterministic, so rebuilds upsert
    id = Column(UUID(as_uuid=True), primary_key=True)

    # The NetworkX node identifier, e.g. "Well:OIL-MORAN-1" or "Event:101".
    # Kept alongside the uuid so the persisted graph can be reloaded into
    # NetworkX using the exact node ids the existing query layer expects.
    node_key = Column(String, unique=True, index=True, nullable=False)

    # Well | Event | Formation | Hazard | Intervention | Outcome
    label = Column(String, index=True, nullable=False)
    name = Column(String, index=True)

    # Remaining NetworkX node attributes (well_id, depth_tvd, root_cause, ...)
    properties = Column(JSONB, default=dict)


class KnowledgeEdge(Base):
    __tablename__ = 'knowledge_edge'
    __table_args__ = (
        Index('ix_knowledge_edge_src_rel', 'src_id', 'rel_type'),
        Index('ix_knowledge_edge_dst_rel', 'dst_id', 'rel_type'),
        {'extend_existing': True},
    )

    # uuid5(NAMESPACE_AGATE_GRAPH, "src_key|rel_type|dst_key")
    #
    # This deliberately collapses parallel edges of the same relationship between
    # the same pair into one row. build_graph() emits DRILLED_THROUGH once per
    # event, so a well with five events in one formation produces five identical
    # parallel edges in the MultiDiGraph; persisting them as a single row is both
    # correct and what makes a rebuild idempotent.
    id = Column(UUID(as_uuid=True), primary_key=True)

    src_id = Column(UUID(as_uuid=True), ForeignKey('knowledge_node.id', ondelete='CASCADE'), nullable=False, index=True)
    dst_id = Column(UUID(as_uuid=True), ForeignKey('knowledge_node.id', ondelete='CASCADE'), nullable=False, index=True)

    # DRILLED_THROUGH | HAD_EVENT | OCCURRED_IN | HAS_HAZARD | MITIGATED_BY | LED_TO | FOLLOWED_BY
    rel_type = Column(String, nullable=False, index=True)

    weight = Column(Float, default=1.0)
    properties = Column(JSONB, default=dict)


# ==============================================================================
# Phase 3: Chat sessions
#
# Multi-turn conversation state for /api/chat. Messages are persisted rather than
# held in the client so a session can be reopened, and so the citation set that
# backed each answer stays auditable after the fact - the guardrail verifier is
# only meaningful if you can still see what the model was allowed to cite.
# ==============================================================================

class ChatSession(Base):
    __tablename__ = 'chat_session'
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Optional anchor - the well the conversation is about, if any.
    well_id = Column(String, index=True)

    title = Column(String)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.id",
    )


class ChatMessage(Base):
    __tablename__ = 'chat_message'
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey('chat_session.id', ondelete='CASCADE'),
                        nullable=False, index=True)

    # 'user' | 'assistant'
    role = Column(String, nullable=False)

    content = Column(Text)

    # Sources the answer was allowed to draw on, stored as a list of
    # {source_file, source_page, well_id, depth_tvd} objects.
    citations = Column(JSONB, default=list)

    # Whether GuardrailsService accepted the answer, plus what it rejected.
    guardrail_verified = Column(Boolean, default=True)
    guardrail_violations = Column(JSONB, default=list)

    provider = Column(String)
    model = Column(String)
    created_at = Column(DateTime, server_default=func.now(), index=True)

    session = relationship("ChatSession", back_populates="messages")


# ==============================================================================
# Phase 4: Document ingestion into the knowledge layer
#
# Until now an uploaded PDF was parsed, mined for incidents, and then the text
# was thrown away - only the extracted events survived. That makes the source
# unquotable and un-reprocessable: if extraction improves, or a question is
# asked about a paragraph that held no incident, there is nothing to go back to.
# These two tables keep the document and its chunk-level vectors.
#
# sha256 is UNIQUE and is the whole idempotency mechanism: re-uploading the same
# file resolves to the existing Document instead of creating a second one. The
# 42 duplicate rows that polluted this database (§7.9) came from exactly that
# gap.
# ==============================================================================

class Document(Base):
    __tablename__ = 'document'
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True)

    well_id = Column(String, index=True)
    filename = Column(String)
    doc_type = Column(String, default='ddr')

    # Content hash - the dedupe key. Indexed and unique.
    sha256 = Column(String(64), unique=True, index=True, nullable=False)

    page_count = Column(Integer, default=0)
    ocr_triggered = Column(Boolean, default=False)
    char_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)

    # 'ingested' | 'failed'
    status = Column(String, default='ingested')

    created_at = Column(DateTime, server_default=func.now(), index=True)

    chunks = relationship(
        "DocumentChunk",
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentChunk.chunk_index",
    )


class DocumentChunk(Base):
    __tablename__ = 'document_chunk'
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, autoincrement=True)
    document_id = Column(Integer, ForeignKey('document.id', ondelete='CASCADE'),
                         nullable=False, index=True)

    chunk_index = Column(Integer, nullable=False)
    text = Column(Text)

    # Chunk-level vector, same provider and EMBEDDING_DIM as every other
    # embedding in this app. Stored as ARRAY(Float) for the same reason
    # SyntheticEvent.embedding is - see the note above that column.
    embedding = Column(ARRAY(Float))

    created_at = Column(DateTime, server_default=func.now())

    document = relationship("Document", back_populates="chunks")
