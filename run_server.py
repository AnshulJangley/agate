import os
import sys
from pathlib import Path

# Ensure paths are set
BASE_DIR = Path(__file__).resolve().parent
sys.path.extend([str(BASE_DIR), str(BASE_DIR / "backend")])

import uvicorn

if __name__ == "__main__":
    # Render assigns PORT (default 10000)
    raw_port = os.environ.get("PORT", "10000")
    try:
        port = int(raw_port)
    except ValueError:
        port = 10000

    print(f"[AGATE] Starting server on 0.0.0.0:{port}...", flush=True)

    # Import app after paths are configured
    from backend.main import app
    print("[AGATE] FastAPI app imported successfully, starting Uvicorn...", flush=True)

    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
