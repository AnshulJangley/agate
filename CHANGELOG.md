# Changelog

All notable changes to the **AGATE (Nearby Wells Intelligence System)** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.5.0] - 2026-09-24

### Added
- **Explicit Provenance & Honesty Labeling**: Introduced `SourceTag` visual badges across well info cards, trajectory plots, and radar views (`Volve`, `FORCE20`, `Synthetic`, and `Regionally Calibrated`) for complete operational transparency.
- **Offline RAG Resilience**: Added in-memory fallback for document retrieval when vector search or external embedding services experience connection latency.
- **Regional Boundary Enforcement**: Enforced strict basin geomechanical boundaries on Look-Ahead Radar to prevent cross-basin lithology blending.

### Changed
- **Eaton Citation Realignment**: Aligned Eaton pore pressure citation to Eaton, B.A. (1975), *"The Equation for Geopressure Prediction from Well Logs"*, SPE-5544-MS across backend calculations (`backend/api/ppfg.py`), test assertions, UI dialogs, and technical documentation.
- **Dependency Pinning**: Pinned exact dependency versions in `requirements.txt` to eliminate environment drift across deployment targets.

### Fixed
- **Hazard Banner Probability**: Resolved a floating-point formatting issue that could display `NaN%` in the hazard probability banner during sudden sensor dropouts.
- **Look-Ahead Target Well Exclusion**: Filtered out the active well itself from offset-well radar incident queries to eliminate self-referential alerts.
- **Navigation State Retention**: Preserved module overview state when launching and closing dedicated full-screen module tabs.

---

## [1.4.0] - 2026-09-18

### Added
- **EasyOCR Document Fallback**: Migrated OCR engine from Tesseract to EasyOCR with 150 DPI page rasterization in `backend/nlp/parser.py`, significantly improving character recognition on scanned, vintage typewritten daily drilling reports.
- **Casing & Cementing Extraction**: Expanded `DrillingIncidentSchema` to parse casing sizes, grades, shoe depths, cement slurry types, and Top of Cement (TOC) depths from WCRs and DDRs.
- **DD Report UI Badge**: Added prominent visual indicator badges for user-uploaded Daily Drilling Reports in knowledge search results and upload confirmation toasts.

### Changed
- **Hybrid Search Scoring Boost**: Tuned retrieval scoring to prioritize custom user-uploaded drilling reports over synthetic baseline logs.
- **LLM Timeout Optimization**: Increased HTTP client and LLM gateway timeouts to prevent premature fallbacks during dense document parsing.

---

## [1.3.0] - 2026-09-10

### Added
- **AI Safety & Guardrails Validation Layer**: Implemented `GuardrailsService` (`backend/guardrails/guardrails_service.py`) enforcing four deterministic safety gates:
  1. *Confidence Inflation Gate*: Prevents LLMs from upgrading confidence beyond deterministic ground-truth evidence.
  2. *Citation Fabrication Gate*: Cross-references all cited files and pages against retrieved source documents.
  3. *Autonomous Rig Action Gate*: Regex-filters any recommendation attempting physical rig actuation (BOP activation, pump shutdown, WOB/RPM override).
  4. *Prompt Injection Detector*: Blocks prompt injection and instruction override patterns.
  5. *Safe Reversion*: Automatically reverts to deterministic engineering actions upon any guardrail violation.
- **Multi-Signal Hybrid Retrieval Engine**: Implemented `backend/services/hybrid_retrieval.py` combining 5 signals: Formation Jaccard similarity, Depth linear decay, Event taxonomy match, BM25 lexical search, and BGE-small dense vector cosine similarity.
- **Analytic Hierarchy Process (AHP) Weighting**: Derived hybrid retrieval weights using Saaty's (1980) principal eigenvector method (`ahp_weights.py`) with a verified Consistency Ratio ($CR = 0.038 < 0.10$).
- **Universal Multi-LLM Provider Support**: Added `nlp/llm_factory.py` supporting Google Gemini, Anthropic Claude, OpenAI, and local Ollama with zero-configuration automatic provider detection (`LLM_PROVIDER=auto`).

---

## [1.2.0] - 2026-09-02

### Added
- **Time-Travel Backtest Validation Framework**: Implemented `backend/services/backtest_runner.py` to replay historical drilling telemetry causally (row-by-row, depth-by-depth) without look-ahead data leakage:
  - Validated on historical incidents: OIL-MORAN-1 stuck pipe ($2832.0\text{m}$ TVD) and OIL-BAGHJAN-4 gas kick ($2460.0\text{m}$ TVD).
  - Added statistical rigor with Wilson score confidence intervals (Wilson, 1927).
  - Integrated `BacktestResultsModal.jsx` in the frontend dashboard.
- **Multi-Basin Regional Geomechanical Calibration**: Calibrated 26 wells across 4 major Indian sedimentary basins:
  - *Upper Assam Shelf*: 11 wells (Baghjan, Moran, Naharkatiya, Dikom, Tengakhat).
  - *Rajasthan Basin*: 5 wells (Baghewala, Tanot, Dandewala).
  - *KG Deepwater*: 5 wells (Deepwater-1, DWN, Yanam, Amalapuram).
  - *Mizoram Fold Belt*: 5 wells (Aizawl, Mamit, Kolasib).
- **Jaccard Formation Similarity**: Added set-theoretic formation matching over Indian stratigraphic taxonomies.

---

## [1.1.0] - 2026-08-20

### Added
- **Client-Isolated Simulation State**: Re-engineered telemetry simulation loop to maintain client-side session state in React, allowing multiple field engineers to test distinct scenarios simultaneously on phones and laptops without cross-device collisions.
- **Mobile-First Ergonomic UI**: Built dedicated responsive shell for handheld field devices, including compact mobile headers, floating HUD bit depth indicators, and bottom navigation bar.
- **Carto Dark Matter & Offline Basemap**: Switched basemap to Carto Dark Matter with an automated local raster tile caching script (`scripts/download_tiles.py`) and OpenStreetMap offline fallback.
- **3D Trajectory Viewer & Anti-Collision**: Implemented Plotly WebGL 3D directional wellbore viewer with Minimum Curvature method, stratigraphic layer slabs, and offset-well clearance alerts.

---

## [1.0.0] - 2026-08-05

### Added
- **Hybrid Physics + ML Hazard Engine**:
  - Implemented Teale (1965) Mechanical Specific Energy (MSE) calculation.
  - Implemented Jorden & Shirley (1966) Corrected $d$-exponent ($d_{xc}$) with Rehm & McClendon (1971) normalization.
  - Implemented Eaton (1975) pore pressure gradient and Eaton (1969) fracture gradient calculation.
  - Built 80/20 weighted scoring combining empirical physics ($0.80$) with LightGBM classification ($0.20$).
  - Integrated local SHAP (TreeExplainer) for human-readable driller feature attribution.
- **Look-Ahead Hazard Radar**: Proactive depth-projected offset well hazard visualizer.
- **FastDTW Well Log Correlation**: Dynamic Time Warping alignment of Gamma Ray and Resistivity curves across offset wells.
- **Pre-Spud Engineering Risk Dossier**: One-click PDF-ready executive summary aggregating offset NPT history, casing clearances, and lithological risks.
- **Tactical Telemetry Matrix**: 6-sensor real-time drilling matrix displaying WOB, RPM, SPP, Flow Out %, Pit Volume Delta, and ECD.

---

## [0.1.0] - 2026-07-15

### Added
- Initial project scaffold for Smart India Hackathon (SIH) 2026.
- Database models for `WellMaster`, `SyntheticEvent`, `DrillingParam`, and `WellLog` via SQLAlchemy and PostGIS.
- Basic FastAPI backend with CORS middleware and static asset serving.
- Initial React 19 + Vite frontend setup with geospatial map visualizer.
