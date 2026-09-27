# P13/P14 Reconciliation — Offline Scoring & AI Vision Brief vs. Repo Reality

Date: 2026-09-27
Status: Signed off (see Sign-off checklist)
Source brief: product-roadmap P13 (Workstream A) / P14 (Workstream B) + agent brief.

This note records where the P13/P14 implementation brief conflicts with the existing repo, and
the proposed resolution for each. No implementation code starts until the two `Open` items below
are signed off.

## 1. Package manager — RESOLVED

- Brief says `pnpm`.
- Repo uses **npm** (`web/package-lock.json` present, no `pnpm-lock.yaml`, no `packageManager`).
- **Decision (user-approved): use `npm`.**

## 2. Referenced design docs — RESOLVED (they exist)

The brief lists docs "already in the repo". They are present at different paths:

| Brief reference | Actual path |
| --- | --- |
| `PROJECT_REPORT.md` | `PROJECT_REPORT.md` (repo root) |
| `AI_VISION_ARCHITECTURE.md` | `documentation/vision/AI_VISION_ARCHITECTURE.md` |
| `HUMAN_REVIEW_WORKFLOW.md` | `documentation/vision/HUMAN_REVIEW_WORKFLOW.md` |
| `COURT_CALIBRATION.md` | `documentation/vision/COURT_CALIBRATION.md` |
| `FOUR_POINT_SPATIAL_RULE.md` | `documentation/vision/FOUR_POINT_SPATIAL_RULE.md` |

`documentation/vision/` holds 25 documents in total (`CANONICAL_EVENT_ALIGNMENT.md`,
`VISION_WORKER_ARCHITECTURE.md`, `VISION_OBSERVATION_MODEL.md`, `VISION_MODEL_GOVERNANCE.md`,
`VISION_FAILURE_CASES.md`, etc.). These are the source of truth over the brief's summaries.

## 3. Write provenance — the `source` field (user asked to investigate first)

There is **no** `source = LIVE_UI | OFFLINE_SYNC | VISION_PROMOTED | MANUAL_ADMIN`. Provenance is
an existing enum, `StatDataSource` (`web/prisma/schema.prisma:211`), attached as:

| Column | Location |
| --- | --- |
| `GameEvent.source` | `schema.prisma:3439` |
| `Game.statSource` | `schema.prisma:3225` |
| `PlayerStat.statSource` | `schema.prisma:3561` |
| `TeamStat.statSource` | `schema.prisma:3607` |
| `GameMetricValue.statSource` | `schema.prisma:3709` |

Current `StatDataSource` values: `ULTRA_NATIVE_LIVE_SCORER`, `ULTRA_NATIVE_LIVE_STATISTICIAN`,
`FIBA_LIVESTATS_PDF_IMPORT`, `GENIUS_SPORTS_IMPORT`, `MANUAL_ADMIN_ENTRY`, `CSV_IMPORT`,
`EXTERNAL_PROVIDER`, `EVENT_DERIVED`.

Note: `RecordOrigin` (`schema.prisma:501`) is a *different* concept (SYSTEM/DEMO/REHEARSAL/
IMPORT/APPLICATION/ADMIN/ADMIN_OFFLINE_INTAKE/PRODUCTION) and is **not** per-event provenance.

The canonical write path is the server actions `web/src/app/games/stats-actions.ts` (statistician
console, `STATISTICIAN_SOURCE = "ULTRA_NATIVE_LIVE_STATISTICIAN"`) and `web/src/app/games/actions.ts`
(scorer console); both `tx.gameEvent.create({ ..., source })` inside Prisma transactions.
`rebuildGameStatsFromEvents()` (`stats-actions.ts:862`) materializes PlayerStat/TeamStat with
`EVENT_DERIVED`.

**Resolution:** extend `StatDataSource` with **one** new value via additive migration —
`OFFLINE_SYNC` (A3). Do **not** add a new column; do not touch the write-path contract. No
`VISION_PROMOTED` value is added (see §4).

## 4. Vision writing to canonical truth — RESOLVED: keep the hard boundary (4a)

The brief's **Phase B4** proposed writing `GameEvent` with `source = VISION_PROMOTED`.

The repo's architecture **explicitly forbids** vision→canonical promotion as a deliberate,
enforced decision:

- `AI_VISION_ARCHITECTURE.md`: *"Nothing in this domain can write ... `GameEvent`'s canonical
  fields ... `PlayerStat`, `TeamStat`, `Standing` ... This is enforced structurally, not just by
  convention — see `capability-separation.test.ts`, which **fails the build** if any file under
  `src/lib/vision/` ever ... writes to `PlayerStat`/`TeamStat`/`Standing`."*
- `HUMAN_REVIEW_WORKFLOW.md`: *"Confirming an observation or a match never writes anything to
  `GameEvent` ... Promoting a confirmed vision signal into canonical truth is a distinct, more
  consequential action this track deliberately does not build."*

Also note `canonical-event-alignment.ts` **already exists** (`web/src/lib/vision/
canonical-event-alignment.ts`) with `VisionEventMatch` as the bridge — B4's alignment deliverable
is partly built.

**Decision:** **Keep the hard boundary.** P14 — whether a service principal, permission tier, or
automated pipeline stage — is exactly the actor the boundary is designed to constrain. B4 stays
review-only: it changes `VisionObservation`/`VisionEventMatch` status, never canonical tables, and
adds no `VISION_PROMOTED` value and no promotion path. `capability-separation.test.ts` and
`AI_VISION_ARCHITECTURE.md`'s rule are unchanged.

## 5. Vision inference stack — RESOLVED: Python service (5b)

**Decision:** adopt the Python service, with this exact stack:

| Layer | Choice |
| --- | --- |
| Language / runtime | Python 3.12 |
| Training framework | PyTorch 2.x |
| Detector (baseline) | RF-DETR-Small |
| Detector (fallback) | YOLOv11-M |
| Tracker | ByteTrack (via `supervision` or `boxmot`) |
| Jersey OCR | Tesseract baseline → fine-tuned CNN only if < 90% |
| Spatial math | OpenCV `findHomography` + NumPy/SciPy |
| Inference runtime (v1) | **ONNX Runtime** (GPU + CPU execution providers) — default |
| Inference runtime (v2) | TensorRT (ONNX → `.engine`) — deferred until profiling proves it |
| API layer | FastAPI |
| Job queue | Celery + Redis |
| Packaging | Docker + Docker Compose in the existing stack |
| Model format | `.pt` (training) → `.onnx` (serving) → `.engine` (optional TensorRT) |

Rationale: ONNX-first keeps the service portable across CPU, GPU, and eventually edge; not
all-Rust and not all-TensorRT on day one. Rust (B6) remains conditional and would only port
decode/homography/tracker — never detector training or jersey-OCR fine-tuning.

## 6. Roadmap overlap — RESOLVED: P4.6 superseded by P13 (mapped)

P4.6's only deliverable is line 201: *"Offline-tolerant queueing with sync and visible connection
status"*, with the P4 usability criterion *"A dropped connection does not lose events; recovery is
automatic and visible."*

**Mapping check (run before marking superseded):**

| P4.6 deliverable / criterion | P13 coverage |
| --- | --- |
| Offline event capture (queueing) | A1 (local store + outbox) |
| Local persistence / queue | A1 (`db.ts` IndexedDB + outbox) |
| Visible connection status | A2 (`SyncStatusBadge`: online/offline, pending, last sync) |
| Sync on reconnect | A3 (`POST /api/sync/outbox`) + A2 (Background Sync) |
| Retry on reconnect / recovery | A4 (exponential backoff + dead-letter) |
| "Dropped connection does not lose events; recovery automatic + visible" | A3 exit criterion + A4 load test (zero data loss) |

Every P4.6 item maps to P13/A1–A4 — genuine, full subsumption (no residual, no dependency-only
relationship).

**Decision / mechanics:** mark P4.6 `SUPERSEDED_BY: P13/A1–A4` **without deleting it** — keep the
row and its description; P13 now carries P4.6's acceptance criteria as an explicit DoD item.
`P7.1` (offline hardening) dependency repointed from P4.6 → `P13/A4`. Re-check P4.6's criteria at
P13 close; if any are unmet, reopen rather than declare victory.

## Sign-off checklist

- [x] Item 1 — package manager: **npm** (match repo)
- [x] Item 2 — design docs: acknowledged, they live in `documentation/vision/` + root
- [x] Item 3 — provenance: extend `StatDataSource` with `OFFLINE_SYNC`; no new column
- [x] Item 4 — vision→canonical promotion: **(4a) keep the hard boundary**
- [x] Item 5 — vision stack: **(5b) Python service** (exact stack in §5)
- [x] Item 6 — `P4.6` marked `SUPERSEDED_BY: P13/A1–A4`, criteria carried forward
