"""Manual, human-run upload checks against a locally running AGATE backend.

These were previously ``test_upload_tengakhat.py`` and ``test_upload.py`` at the
repository root.  Neither is a test: each performs a real
``POST /api/upload-report``, which ingests a PDF and INSERTS rows into the live
database (and burns real Gemini embedding calls).

Because their filenames matched ``test_*.py`` pytest collected them, and
collection *imports* a module -- the ``requests.post`` calls sat at module level,
so the upload fired during collection on every ``pytest`` run, adding ~7 rows to
``synthetic_event`` each time.  See AGATE_HANDOFF.md section 7.9.

They now live here under a non-``test_`` name, and every request is inside a
function behind ``if __name__ == "__main__"``.  Importing this module can no
longer send anything.

Run explicitly, from the repo root, with the backend already running:

    ./venv/Scripts/python.exe scripts/manual_upload_check.py tengakhat
    ./venv/Scripts/python.exe scripts/manual_upload_check.py dummy
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parent.parent

# From the original test_upload_tengakhat.py -- the real backend on port 8000.
# This one really does ingest and really does write to the database.
TENGAKHAT_URL = "http://localhost:8000/api/upload-report"
TENGAKHAT_PDF = REPO_ROOT / "sample_reports" / "SAMPLE_representative_OIL_Tengakhat_DDR_Well_01.pdf"

# From the original test_upload.py -- port 10001, which nothing listens on, so
# this check only ever errors out.  Left pointing at 10001 deliberately:
# repointing it at 8000 would turn it into a second live-ingest path.
DUMMY_URL = "http://localhost:10001/api/upload-report"


def upload_tengakhat() -> None:
    """Upload the real Tengakhat DDR sample report (writes to the live DB)."""
    try:
        with open(TENGAKHAT_PDF, "rb") as f:
            files = {"file": (TENGAKHAT_PDF.name, f, "application/pdf")}
            data = {"well_id": "OIL-TENGAKHAT-1"}
            response = requests.post(TENGAKHAT_URL, files=files, data=data)

        print(f"Status Code: {response.status_code}")
        try:
            print(f"Response: {json.dumps(response.json(), indent=2)}")
        except Exception:
            print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")


def upload_dummy() -> None:
    """Post a dummy non-PDF payload at port 10001 (expected to fail to connect)."""
    files = {"file": ("test_report.pdf", b"dummy content", "application/pdf")}
    data = {"well_id": "OIL-BAGHJAN-1"}
    try:
        response = requests.post(DUMMY_URL, files=files, data=data)
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
    except Exception as e:
        print(f"Error: {e}")


CHECKS = {
    "tengakhat": upload_tengakhat,
    "dummy": upload_dummy,
}


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Manual upload checks. These send real HTTP requests; 'tengakhat' "
            "ingests a PDF and writes rows to the live database."
        )
    )
    parser.add_argument(
        "check",
        choices=sorted(CHECKS),
        help="which check to run (no default -- must be chosen explicitly)",
    )
    args = parser.parse_args()

    print(
        f"[manual_upload_check] running '{args.check}' -- this sends a REAL "
        "request and may write to the live database."
    )
    CHECKS[args.check]()


if __name__ == "__main__":
    main()
