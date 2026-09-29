# Contributing to AGATE

Thank you for your interest in contributing to **AGATE (Nearby Wells Intelligence System)** for the Smart India Hackathon (SIH) 2026! We welcome contributions that improve system accuracy, UI/UX responsiveness, and subsurface data integration.

---

## 1. Prerequisites

Before setting up your development environment, ensure you have installed:

- **Python**: Version 3.10 or higher (Python 3.10–3.14 verified)
- **Node.js**: Version 18.x or higher with `npm`
- **Git**: For version control
- **PostgreSQL** *(Optional for local dev with SQLite fallback, recommended for spatial indexing)*: PostgreSQL 14+ with `PostGIS` and `pgvector` extensions enabled

---

## 2. Setting Up the Development Environment

### 2.1. Backend Setup

1. **Create and activate a virtual environment**:
   - **Windows (PowerShell)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - **Linux / macOS**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

2. **Install pinned dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment variables**:
   Copy `.env.example` to create your local `.env`:
   ```bash
   cp .env.example .env
   ```
   Configure your database credentials and optional AI provider keys (`GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY`). If no API key is provided, the platform automatically defaults to local rule-based NLP and deterministic physics models without crashing.

4. **Initialize and seed sample data**:
   ```bash
   python scripts/run_pipeline.py
   python scripts/seed_database.py
   ```

### 2.2. Frontend Setup

1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## 3. Running the Application

### Option A: Simultaneous Launch (Recommended)
You can start both backend and frontend concurrently from the repository root:

- **Cross-Platform (npm)**:
  ```bash
  npm install
  npm run dev
  ```
- **Windows Batch Script**:
  ```cmd
  .\start.bat
  ```

### Option B: Individual Processes
- **Backend Server**:
  ```bash
  uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
  ```
- **Frontend Dev Server**:
  ```bash
  cd frontend
  npm run dev
  ```
The dashboard will be accessible at `http://localhost:5173` with API documentation at `http://localhost:8000/docs`.

---

## 4. Running Tests Before Submitting Changes

To maintain production stability, you must verify that all backend tests and the frontend build pass before submitting any pull request:

### 4.1. Run the Backend Test Suite
```bash
python -m pytest tests/
```
Ensure all 44+ automated tests pass, including:
- `test_advanced_analytics.py` (FastDTW correlation and multi-hazard detection)
- `test_backtest_runner.py` (Causal historical replay and Wilson confidence interval)
- `test_ertmac_decision_support.py` (eRTMAC telemetry and decision alerts)
- `test_guardrails_and_hybrid_retrieval.py` (Safety gates and AHP hybrid scoring)
- `test_lookahead_live_ingestion.py` (PDF DDR extraction and radar projection)
- `test_multi_llm_providers.py` (Multi-provider AI factory and graceful fallbacks)

### 4.2. Verify Frontend Production Build
```bash
cd frontend
npm run build
```
Verify that Vite compiles without JavaScript, JSX, or CSS bundling errors.

---

## 5. Code Style & Engineering Standards

1. **Python Standards**:
   - Follow [PEP 8](https://peps.python.org/pep-0008/) naming and formatting conventions.
   - Use defensive programming: wrap I/O, external network calls, and file parsers in structured `try/except` blocks with safe default fallbacks so the backend **never crashes** during live rig monitoring.
   - Maintain clear docstrings on new API endpoints, calculations, and services.

2. **Frontend Standards**:
   - Write clean React 19 functional components utilizing standard hooks (`useState`, `useEffect`, `useCallback`).
   - Use established Tailwind CSS variables and glassmorphism styling tokens rather than arbitrary ad-hoc inline styles.
   - Ensure mobile responsiveness for all new modals and telemetry components.

3. **Physics & Domain Integrity**:
   - Any modifications to drilling calculations must strictly cite and follow published literature:
     - **Eaton (1975, SPE-5544-MS)** for pore pressure gradients.
     - **Teale (1965)** and **Dupriest & Koederitz (2005, SPE-92576)** for Mechanical Specific Energy.
     - **Jorden & Shirley (1966, SPE-1407)** with **Rehm & McClendon (1971)** for corrected $d$-exponent ($d_{xc}$).
   - Do not alter physical conversion constants ($120\pi$ for MSE, $9.0\text{ ppg}$ normal water gradient).

4. **AI Safety & Guardrails**:
   - All LLM-generated recommendations must route through `GuardrailsService`.
   - Never allow recommendations suggesting direct or autonomous rig hardware control (e.g. actuating BOPs, modifying pump strokes, or overriding the driller).

5. **Transparency & Provenance**:
   - Preserve `SourceTag` honesty labeling (`Volve`, `FORCE20`, `Synthetic`, or `Regionally Calibrated`) when adding or modifying subsurface data models.

---

## 6. Pull Request Process

1. Create a descriptive feature branch:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make atomic, well-documented commits:
   ```bash
   git commit -m "feat(radar): add custom depth range filtering to Look-Ahead Radar"
   ```
3. Run the automated test suites (`pytest tests/` and `npm run build`).
4. Push your branch and open a Pull Request against `main` with a summary of changes and testing evidence.
