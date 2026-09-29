# sample_reports — these are NOT real Oil India documents

Read this before showing any file in this folder to anyone.

## What these are

| File | What it actually is |
|---|---|
| `SAMPLE_representative_OIL_Baghjan_DDR_Well_04.pdf` | **Generated.** Written by `backend/scripts/generate_sample_ddr.py`. |
| `SAMPLE_representative_OIL_Tengakhat_DDR_Well_01.pdf` | **Generated.** Written by `scripts/generate_tengakhat_sample_report.py`. |
| `test_pymupdf.pdf` | A 3-line smoke-test fixture for the PDF parser. |

Both DDRs are **format-faithful but content-illustrative**. They imitate the layout,
section ordering and vocabulary of a Daily Drilling Report. The wells, depths, incidents,
NPT hours and remediation narratives in them were written to exercise the extraction
pipeline, not transcribed from any archive.

**Oil India's actual DDRs are confidential and are not in this repository.** Nothing here
came from Oil India, and no figure in these files should be quoted as a real drilling record.

## Why the filenames are prefixed

The prefix exists so the disclosure is visible at the one moment it matters — when a file
is selected in the upload dialog during a demo. A note buried in a README does not travel
with the filename someone reads off a screen.

The file **contents are unchanged** — the rename deliberately did not regenerate them, so
the SHA-256 of the Tengakhat fixture still matches the `document` row created when it was
ingested. Regenerating it would change the hash, and re-uploading would then create a
second set of events instead of being correctly detected as a duplicate.

## What is real

The *real* Indian incident data lives in `data/processed/india_real_events.json`, not here:
the Baghjan-5 blowout of 27 May 2020 and the Pasarlapudi blowout of 1995, both quoted from
public sources (NGT Katakey Committee reports, OISD findings, SPE-206602-MS). Those records
render with a green **Verified** provenance badge in the app.

If a judge or evaluator asks whether the documents in this folder are genuine Oil India
reports, the answer is **no** — they are representative samples built to demonstrate the
OCR and extraction pipeline. Say that plainly; the pipeline demo still works, and claiming
otherwise would be a false statement about a real organisation's records.
