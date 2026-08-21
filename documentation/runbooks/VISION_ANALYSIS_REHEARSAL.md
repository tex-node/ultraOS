# Runbook: Vision Analysis Rehearsal

G.21, Part LII, LIV, LXXI-LXXII. What an empirical vision rehearsal requires, what was actually
possible in this environment, and how to run one for real once video exists.

## Status: VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO

Confirmed via a direct database check before any G.21 work began: `MediaAsset` has zero rows with
a `video/*` mimeType. This environment has no Ultra Basketball game clip to run a real
proof-of-concept against. Per Part LIV's explicit instruction ("If no real clip exists: STOP the
empirical CV evaluation and report ... Continue architecture/tests that do not require real
video"), this track built and unit-tested the full architecture (60+ new tests covering the
timeline model, match confidence, evaluation metrics, identity constraints, and homography math -
all passing against synthetic data) but did **not** run a real detection pipeline, and does not
claim any empirical vision accuracy. `scripts/vision-analyze.ts`, run with no `--video=` argument
or against a nonexistent id, prints this exact status rather than fabricating results.

## How to run the rehearsal for real, once video exists

1. **Register the video.** Upload the file to Cloudflare object storage (see
   `GAME_VIDEO_REGISTRY.md` for why the existing image-upload pipeline doesn't apply directly to
   video), create the `MediaAsset` row, then register it via `/games/[fixtureId]/video`.
2. **Create timeline anchors.** On `/vision/games/[fixtureId]`, mark at least 2 anchors per
   period the video covers (video time ↔ period/game clock). More anchors improve drift detection
   (`detectAnchorDrift()`).
3. **Run the narrow POC.** `npm run vision:analyze -- --video=<id> --model=PLAYER_DETECTOR_V1` -
   today this only proves the `QUEUED → PROCESSING → FAILED` lifecycle honestly; a real CV
   implementation would need to be added at the marked extension point in that script (see
   `VISION_WORKER_ARCHITECTURE.md`).
4. **Review detections.** Use the review queues on `/vision/games/[fixtureId]` to confirm/reject
   observations.
5. **Match against canonical events.** For an `EVENT_LEVEL`/`FULL_ULTRA` game (Season Zero has
   one: the Ember vs. Nova native-event game), `findAlignmentCandidates()` produces scored
   `VisionEventMatch` candidates for each canonical `GameEvent` in the window; confirm/reject them
   via the same review queue.
6. **Calculate real evaluation metrics.** `evaluateTask()` over the confirmed matches - the
   fixture vision workspace already computes and displays precision/recall/F1 for
   `CANONICAL_EVENT_MATCH` coverage live from real review data, no separate step needed.

## Hand verification (Part LXXII)

For at least several frames/events, a human should manually cross-check: video timestamp → game
clock (via the timeline mapping) → player/team candidate → the canonical event it's being
compared to → the vision observation → the match result. Not attempted this track (no real
video/observations exist to hand-verify) - this is the first real task for whoever runs the
rehearsal in step 1-6 above once real video is available.

## What this runbook is NOT

A promise that the architecture built this track has been proven accurate. It has been proven
*internally consistent* (unit tests against synthetic data) and *structurally safe* (the
capability-separation test proves vision code cannot touch canonical truth). Whether the actual
detection/matching quality is any good is an open, unanswered question until step 1 above happens
for real.
