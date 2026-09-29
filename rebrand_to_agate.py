"""
One-shot rebrand: PetrolQ -> AGATE.

Ordered replacements matter. Longer, more specific tokens are replaced before the
generic ones, and the Docker *volume* name is shielded behind a sentinel because
a volume cannot be renamed in place - rewriting its references would leave the
documentation pointing at a volume that does not exist.

Run from the repo root:  ./venv/Scripts/python.exe rebrand_to_agate.py
"""

import os

ROOT = os.path.dirname(os.path.abspath(__file__))

SKIP_DIRS = {
    '.git', 'node_modules', 'venv', '.venv', 'dist', 'build',
    '__pycache__', 'logs', '.pytest_cache', 'artifacts',
}

# Files where "PetrolQ" is a historical fact (this repo *was* PetrolQ, and was
# merged with a separate project called agate) rather than branding.
SKIP_FILES = {
    os.path.join(ROOT, 'AGATE_HANDOFF.md'),
    os.path.abspath(__file__),
}

SKIP_EXT = {'.pyc', '.log', '.joblib', '.png', '.jpg', '.svg', '.pdf', '.las', '.parquet'}

# The Docker volume `petrolq_pgdata` cannot be renamed in place, so it stays.
# Shielded so the generic lowercase rule below cannot touch it.
SENTINEL = '__AGATE_PGDATA_SENTINEL__'

REPLACEMENTS = [
    ('petrolq_pgdata', SENTINEL),

    # Infrastructure identifiers that DO get renamed (with matching live changes).
    ('petrolq_nwis', 'agate_nwis'),
    ('petrolq-postgres', 'agate-postgres'),

    # App-internal keys. Renaming these resets stored preferences once, which is
    # acceptable; the cached-wells key simply refetches.
    ('petrolq_telemetry_collapsed', 'agate_telemetry_collapsed'),
    ('petrolq_offline_event_queue', 'agate_offline_event_queue'),
    ('petrolq_cached_wells_v2', 'agate_cached_wells_v2'),
    ('petrolq_basemap_style', 'agate_basemap_style'),
    ('petrolq_theme', 'agate_theme'),
    ('petrolq-rig-edge-v1', 'agate-rig-edge-v1'),

    # Deploy / package identifiers.
    ('petrolq-api', 'agate-api'),
    ('petrolq-nwis', 'agate-nwis'),
    ('petrolq.onrender.com', 'agate.onrender.com'),
    ('petrolq@rig-edge', 'agate@rig-edge'),

    # Branding, longest first.
    ('PetrolQ', 'AGATE'),
    ('PETROLQ', 'AGATE'),

    # Catch-all for any remaining lowercase form.
    ('petrolq', 'agate'),

    # Restore the shielded Docker volume name, which is unchanged in reality.
    (SENTINEL, 'petrolq_pgdata'),
]


def should_skip_dir(name):
    return name in SKIP_DIRS


def main():
    changed = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if not should_skip_dir(d)]
        for filename in filenames:
            if os.path.splitext(filename)[1].lower() in SKIP_EXT:
                continue
            path = os.path.join(dirpath, filename)
            if os.path.abspath(path) in SKIP_FILES:
                continue
            try:
                with open(path, 'r', encoding='utf-8') as fh:
                    original = fh.read()
            except (UnicodeDecodeError, PermissionError, OSError):
                continue

            updated = original
            for old, new in REPLACEMENTS:
                updated = updated.replace(old, new)

            if updated != original:
                with open(path, 'w', encoding='utf-8') as fh:
                    fh.write(updated)
                changed.append(os.path.relpath(path, ROOT))

    print(f"Rebranded {len(changed)} file(s):")
    for path in sorted(changed):
        print(f"  {path}")


if __name__ == '__main__':
    main()
