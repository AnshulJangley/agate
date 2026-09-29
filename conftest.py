"""Repo-root pytest configuration.

Guard rail for AGATE_HANDOFF.md section 7.9.  A ``test_*.py`` file sitting at the
repository root has historically been a stray manual script rather than a test
(``test_upload_tengakhat.py`` fired a live PDF upload at import time, so pytest's
*collection* alone wrote ~7 rows into ``synthetic_event`` on every run).

The real tests live in ``tests/`` and ``backend/tests/``; nothing at the repo
root is meant to be collected.  Ignoring root-level ``test_*.py`` here means a
similarly shaped file reappearing at the root cannot silently do that again.

This is the third layer of defence, alongside ``testpaths`` in ``pyproject.toml``
and the scripts themselves living in ``scripts/manual_upload_check.py`` behind an
``if __name__ == "__main__"`` guard.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_ROOT = Path(__file__).parent

# Paths are relative to this conftest's directory, i.e. the repo root.
collect_ignore = [path.name for path in sorted(_ROOT.glob("test_*.py"))]


@pytest.fixture(autouse=True)
def _reset_app_dependency_overrides():
    """Clear FastAPI dependency overrides after every test.

    ``backend.main.app`` is a module-level singleton, so an override installed by
    one test stays installed for every test that runs afterwards in the same
    process.  ``tests/test_lookahead_live_ingestion.py`` injects a MagicMock
    database via ``app.dependency_overrides[get_db]`` and never removes it, which
    left every later test talking to a mock instead of Postgres.

    That leak was previously invisible purely by accident of collection order:
    ``backend/tests/`` happened to run before ``tests/``.  Pinning ``testpaths``
    for the section 7.9 fix reversed that order and exposed it -- the DB-backed
    assertions in ``backend/tests/test_multi_region_calibration.py`` began
    receiving an empty database and failing.

    Clearing unconditionally here fixes the whole class of leak rather than
    patching the one offending file, and keeps the suite order-independent.
    """
    yield

    backend_dir = str(_ROOT / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    try:
        from main import app  # type: ignore

        app.dependency_overrides.clear()
    except Exception:
        # Never let teardown of an unrelated test mask a real failure with an
        # import error of its own.
        pass
