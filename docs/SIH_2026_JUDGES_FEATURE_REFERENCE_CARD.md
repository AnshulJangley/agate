# AGATE (Nearby Wells Intelligence System) — Judges Feature Reference Card

> **Smart India Hackathon (SIH 2026)**  
> **Problem Title:** AGATE: An AI-Powered Offset Well Knowledge and Decision Support Platform for Drilling Operations  
> **Organization:** Oil India Limited (OIL), Ministry of Petroleum and Natural Gas

---

## ⏱️ 60-Second Demo Flow for Evaluators

When presenting or demonstrating the live web application to judges, follow this high-impact 6-step sequence:

```
[1. Geospatial Map] ──▶ [2. 3D Subsurface] ──▶ [3. Live Simulation] ──▶ [4. Proactive Lookahead] ──▶ [5. RAG Search] ──▶ [6. Pre-Spud Dossier]
```

1. **Geospatial Field Map (Bottom-Left):**
   * Drag the **Search Radius Slider** (e.g., 25 km &rarr; 50 km).
   * Show how neighboring Assam-Arakan wells (`OIL-BAGHJAN-1`, `OIL-NAHARKATIYA-1`, etc.) are detected via PostGIS spatial queries.
2. **3D Subsurface Trajectory Visualizer (Click "View 3D Subsurface"):**
   * Freely **rotate, pan, and zoom** in 3D around the wellbores.
   * Demonstrate the **Anti-Collision Radar** computing 3D Euclidean clearance and Separation Factor (SF).
   * Show realistic formation tops (Tipam, Girujan, Barail, Kopili) and 3D reservoir hydrocarbon targets.
3. **Live Telemetry & Scenario Injection (Top-Left):**
   * Click **Play (`▶`)** to stream real-time sensor dials (ROP, WOB, RPM, Torque, Pit Gain, Mud Weight).
   * Change scenario from **Normal** to **Gas Kick** or **Stuck Pipe**.
   * Show the instantaneous mechanical response: Pit gain surging, flow-out spiking, and the red emergency hazard banner appearing.
4. **Proactive Lookahead & Hazard Corridor:**
   * Scrub depth to ~2,230m or ~2,680m.
   * Highlight the **Amber Proactive Banner** that alerts drillers 50 meters *before* hitting hazard-prone formations encountered in offset wells.
5. **AI NLP/OCR Ingestion & Semantic RAG Search:**
   * Click **"Knowledge Search"** &rarr; Type `"high torque while drilling Kopili shale"` &rarr; Show semantic match score, historical root cause, and proven mitigation.
   * Click **"Ingest Document"** &rarr; Upload `sample_reports/SAMPLE_representative_OIL_Baghjan_DDR_Well_04.pdf` (a **representative sample**, not a real Oil India DDR) &rarr; Demonstrate automated OCR and tabular extraction into institutional memory.
6. **Executive Pre-Spud Dossier & PPFG Safe Window:**
   * Click **"Pre-Spud Dossier"** to view the consolidated offset intelligence report and export to CSV.
   * Click **"PPFG Window"** to display Eaton’s Pore Pressure vs. Fracture Gradient mud window.

---

## 🎯 Problem vs. Solution Feature Matrix

| Problem Statement Requirement | Feature Implemented | Tech Stack Behind It |
| :--- | :--- | :--- |
| **Geospatial proximity to offset wells** | Interactive Map with dynamic radius circle (5–50 km) | Leaflet / MapLibre + PostGIS `ST_DWithin` |
| **Institutional memory loss & PDF archives** | AI PDF/DDR Ingestion Pipeline with OCR & table parsing | `pdfplumber` + PyMuPDF + EasyOCR |
| **Fast, natural-language incident retrieval** | Semantic RAG Search Engine across historical incidents | Gemini `gemini-embedding-001` (768-dim) + cosine sim |
| **Cross-well stratigraphic correlation** | Side-by-side well log comparison (GR, RES, DT, RHOB) | Matplotlib/Plotly + FastDTW curve alignment |
| **Early warning before entering hazard zones** | 50m Proactive Lookahead Corridor Banner | Depth lookahead window against offset formation tops |
| **Real-time hazard prediction on live rigs** | Multi-parameter ML + physics risk classifier | Random Forest/LightGBM + physical drilling mechanics |
| **Safe drilling fluid density management** | Eaton Pore Pressure & Fracture Gradient (PPFG) window | Eaton sonic/resistivity ratio equations |
| **Crowded pad collision & magnetic interference** | 3D Subsurface Trajectory Visualizer & Radar | WebGL / Three.js / Plotly 3D directional surveys |
| **Pre-drilling engineering collation** | One-click Pre-Spud Intelligence Briefing Dossier | Dynamic SQLAlchemy aggregation + CSV export |
| **Role ergonomics for Rig vs. Office** | Field Engineer vs. Office Reviewer interface modes | React role-state routing |

---

## 💡 Quick Answers to Tough Judge Questions

### Q1: *"Did you test this with real oilfield data?"*
> **Answer:** *"Two answers, and we'll be precise about which is which. **Real:** our knowledge base contains two publicly documented Indian drilling incidents — the Baghjan-5 blowout of 27 May 2020 (Assam) and the Pasarlapudi blowout of 1995 (Krishna-Godavari) — with depth, root cause and mitigation quoted from the NGT Katakey Committee reports, OISD findings and SPE-206602-MS. Those records render with a green **Verified** provenance badge in the app. **Synthetic:** the live telemetry you're watching is simulated, because Oil India's rig data is confidential and eRTMAC is not connected yet — it is labelled **SIMULATED FEED** on screen. Proprietary data is not releasable to a hackathon team, so we calibrated the mechanical physics to the published Assam-Arakan stratigraphy (Tipam, Girujan, Barail, Kopili) and made every reading's provenance visible rather than implying more than we have."*

### Q2: *"How does the system scale if OIL has thousands of legacy PDF reports?"*
> **Answer:** *"Ingestion is chunked and deduplicated — each document is hashed (SHA-256) so re-uploading the same report is detected rather than re-ingested, and chunks are embedded in batches. On scale, be honest about the current shape: the corpus today is small (one DDR ingested end-to-end, producing four structured events), and retrieval is an **exact cosine scan over a native Postgres `ARRAY(Float)` column, not an ANN index**, because the PostGIS image we run does not ship the `pgvector` extension. That is O(n) per query and fine at thousands of rows, not millions. The production path is to move the vector column to pgvector with an HNSW index and push the lexical half into Postgres full-text search — the ranking code (`services/hybrid_retrieval.py`) is already separated from the storage layer, so that is a storage swap rather than a rewrite."*

### Q3: *"Can this run offline on an offshore rig with no internet connection?"*
> **Answer:** *"Partly, and we'd rather tell you which part. The physics engine (Teale MSE, Jorden d-exponent, Eaton PPFG), the ML risk classifier, the PostGIS map, the knowledge graph and the React frontend all run locally — and the frontend has a genuine rig-edge mode that keeps scoring hazards from local physics when the backend is unreachable. **What is not local is semantic embedding.** We deliberately removed the bundled local model (`fastembed`/BGE-small) because it was heavy and slow on laptop-class hardware; embeddings now come from the Gemini API at 768 dimensions. If the key is absent the service falls back to a deterministic surrogate encoder, which keeps search running but is lexical, not semantic — the code logs a loud warning when that happens rather than silently degrading. For true air-gapped deployment you would reinstate a local encoder or precompute embeddings onshore."*

---

## 🏗️ Architecture Summary

* **Frontend:** React 19, Vite, Tailwind CSS, Lucide Icons, Plotly.js / MapLibre GL.
* **Backend:** Python 3.14, FastAPI (asynchronous REST + WebSockets).
* **Database:** PostgreSQL 16 with PostGIS (geospatial indexing). Dense embeddings are stored as a native `ARRAY(Float)` column, not pgvector — see Q2.
* **ML / Analytics:** Scikit-Learn, Eaton PPFG physics formulas, FastDTW, NetworkX.
* **NLP & OCR:** Gemini `gemini-embedding-001` (768-dim) for embeddings, `pdfplumber` + PyMuPDF for text/table extraction, EasyOCR only as a scanned-page fallback.
* **Portability:** Self-contained seed datasets in `data/processed/` (a few hundred KB, no downloads at seed time). Semantic embedding is the one component that calls out to a network — plan for that if you go air-gapped.
