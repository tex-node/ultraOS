# Vision Dataset Export

G.22, Parts XLV-XLVI, LXXIII. `buildEvaluationDatasetExport()` / `datasetExportToJsonl()`
(`vision-loader.ts`) + `GET /api/vision/games/[gameVideoId]/export`.

## Purpose

A real, working export of one game video's vision-relevant data (canonical events, timeline
anchors, observations, event matches) as JSONL, for offline analysis or feeding an external
evaluation/training pipeline. Requires `vision:manage` permission (`requirePermission`, manual 401
JSON on failure - matches G.20's `/api/v1/*` error-shape discipline even though this route is
internal, not public).

## Public-identifier discipline (reused from G.20)

Every row uses `fixtureId` (already the public routing id) and the player's real `ultraAthleteId`
- never a raw internal `Player`/`Athlete`/`User` cuid, matching the convention G.20 established for
`/api/v1/*` and reused here even though this endpoint sits behind internal auth, not public access
(defense in depth: if this export is ever forwarded outside the org, it doesn't leak internal ids).

## Format

One JSON object per line (`DatasetExportRow`) - `datasetExportToJsonl()` is a pure formatting
function, separable from the DB-reading `buildEvaluationDatasetExport()`, so it's independently
testable against fixed input.

## Current empirical status

Functionally complete and tested against synthetic data. Never exercised against a real
`GameVideo`, because none exists - calling the real route today against any `gameVideoId` returns
a 404 (no such row), which is the honest and correct behavior, not a bug. See
`VISION_EMPIRICAL_BENCHMARK.md`.
