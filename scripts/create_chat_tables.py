"""
Create the Phase 3 chat tables. Idempotent, and deliberately narrow.

Companion to scripts/create_graph_tables.py, which does the same job for the
Phase 2 knowledge-graph tables. Both exist instead of scripts/seed_database.py
because seed_database.py calls Base.metadata.create_all() and then RE-SEEDS the
well and event tables - running it to get two new tables would rewrite live data.

This script issues DDL for chat_session and chat_message only, touches no other
table, and inserts nothing. create_all() is a no-op for tables that already
exist, so re-running is safe.

Usage:
    ./venv/Scripts/python.exe scripts/create_chat_tables.py
    ./venv/Scripts/python.exe scripts/create_chat_tables.py --dry-run
"""

import os
import sys
import argparse

from dotenv import load_dotenv

# The DATABASE_URL default baked into backend/database.py points at port 5432.
# The real PostGIS container listens on 5433, so .env must be loaded BEFORE
# database.py is imported - the engine is constructed at import time.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(REPO_ROOT, ".env"))

BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from sqlalchemy import inspect  # noqa: E402

from database import engine, Base  # noqa: E402
from models import ChatSession, ChatMessage  # noqa: E402


TARGET_TABLES = [ChatSession.__table__, ChatMessage.__table__]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would be created without issuing DDL.")
    args = parser.parse_args()

    # Redact credentials before printing - this runs against the live database.
    url = engine.url
    print(f"Target: {url.render_as_string(hide_password=True)}")

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())

    for table in TARGET_TABLES:
        state = "exists" if table.name in existing else "MISSING"
        print(f"  {table.name:<18} {state}")

    missing = [t for t in TARGET_TABLES if t.name not in existing]

    if not missing:
        print("\nBoth tables already present. Nothing to do.")
        return 0

    if args.dry_run:
        print(f"\n--dry-run: would create {', '.join(t.name for t in missing)}")
        return 0

    print(f"\nCreating {', '.join(t.name for t in missing)} ...")
    Base.metadata.create_all(bind=engine, tables=TARGET_TABLES)

    # Verify against a fresh inspector rather than trusting the call returned.
    after = set(inspect(engine).get_table_names())
    still_missing = [t.name for t in TARGET_TABLES if t.name not in after]
    if still_missing:
        print(f"FAILED: {', '.join(still_missing)} still absent after create_all")
        return 1

    print("OK: chat_session and chat_message are present.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
