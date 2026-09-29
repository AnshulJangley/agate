"""
Backfill dense embeddings for existing synthetic_event rows.

The seeded corpus predates the remote embedding provider, so every row's
``embedding`` column is NULL — which is why /api/events/search silently fell
through to its offline JSON fallback and returned identical hardcoded scores
for every query. This script embeds each event using the *same* context-string
convention as ``nlp.ingest.py`` so backfilled vectors occupy the same space as
future uploads:

    f"{event_type} in {formation} at {depth}m TVD. Root cause: {cause}. Mitigation: {mit}"

Idempotent: rows whose embedding already matches EMBEDDING_DIM are skipped
unless --force is passed.

Usage (from the repo root, with the venv interpreter):

    ./venv/Scripts/python.exe scripts/backfill_embeddings.py
    ./venv/Scripts/python.exe scripts/backfill_embeddings.py --force
    ./venv/Scripts/python.exe scripts/backfill_embeddings.py --dry-run
"""

from __future__ import annotations

import argparse
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(REPO_ROOT, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(REPO_ROOT, ".env"))

from database import SessionLocal  # noqa: E402
from models import SyntheticEvent  # noqa: E402
from nlp.config import EMBEDDING_DIM  # noqa: E402
from nlp.embeddings import EmbeddingService  # noqa: E402


def build_context(event: SyntheticEvent) -> str:
    """Mirrors the context-string convention used by nlp/ingest.py."""
    event_type = (event.event_type or "Unknown event").strip()
    formation = (event.formation or "unknown formation").strip()
    depth = event.depth_start_tvd if event.depth_start_tvd is not None else 0.0
    cause = (event.root_cause or "not recorded").strip()
    mitigation = (event.mitigation_applied or "not recorded").strip()
    return (
        f"{event_type} in {formation} at {depth}m TVD. "
        f"Root cause: {cause}. Mitigation: {mitigation}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill event embeddings.")
    parser.add_argument("--force", action="store_true",
                        help="Re-embed rows that already have a vector.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Report what would change without writing.")
    args = parser.parse_args()

    service = EmbeddingService()
    status = service.status()

    print("=" * 68)
    print("Event embedding backfill")
    print("=" * 68)
    print(f"  provider      : {status['provider']}")
    print(f"  model         : {status['model']}")
    print(f"  target dim    : {EMBEDDING_DIM}")
    print(f"  dry run       : {args.dry_run}")
    print("-" * 68)

    if not service.is_available():
        print("  WARNING: no embedding provider is configured (no GEMINI_API_KEY).")
        print("  Rows will be filled with the deterministic SURROGATE, whose")
        print("  vectors carry no semantic meaning. Search will fall back to")
        print("  lexical BM25 ranking only. Set GEMINI_API_KEY and re-run")
        print("  with --force to produce real embeddings.")

    db = SessionLocal()
    try:
        events = db.query(SyntheticEvent).order_by(SyntheticEvent.id).all()
        if not events:
            print("  No events found. Nothing to do.")
            return 0

        pending = []
        skipped = 0
        for event in events:
            existing = getattr(event, "embedding", None)
            if (
                not args.force
                and existing is not None
                and len(existing) == EMBEDDING_DIM
            ):
                skipped += 1
                continue
            pending.append(event)

        print(f"  total events  : {len(events)}")
        print(f"  already at {EMBEDDING_DIM}d : {skipped}")
        print(f"  to embed      : {len(pending)}")
        print("-" * 68)

        if not pending:
            print("  Nothing to embed. Use --force to rewrite existing vectors.")
            return 0

        if args.dry_run:
            for event in pending[:10]:
                print(f"    [{event.id}] {event.well_id}: {build_context(event)[:96]}")
            if len(pending) > 10:
                print(f"    ... and {len(pending) - 10} more")
            print("  Dry run — no changes written.")
            return 0

        contexts = [build_context(e) for e in pending]
        vectors = service.embed_batch(contexts)

        if len(vectors) != len(pending):
            print(f"  ERROR: got {len(vectors)} vectors for {len(pending)} events.")
            return 1

        written = 0
        for event, vector in zip(pending, vectors):
            if len(vector) != EMBEDDING_DIM:
                print(f"  ERROR: event {event.id} got {len(vector)} dims, expected {EMBEDDING_DIM}.")
                return 1
            event.embedding = vector
            written += 1

        db.commit()
        print(f"  Committed {written} embeddings at {EMBEDDING_DIM} dimensions.")
        print(f"  Provider used: {service.status()['provider']}")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"  FAILED: {exc}")
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
