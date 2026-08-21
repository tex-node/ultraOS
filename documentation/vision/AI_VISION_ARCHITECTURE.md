# AI Vision Architecture

G.21. The foundation layer for computer-vision analysis of Ultra Basketball game video, built on
top of the G.15-G.20 canonical game-truth stack. Read this first; the other `documentation/vision/*`
files each go deep on one piece of what's described here.

## The one rule everything else follows

**AI observes. Humans / the canonical game system verify. Derived intelligence may use both.**

Nothing in this domain can write `Fixture.homeScore`/`awayScore`, `GameEvent`'s canonical fields
(including its pre-existing `x`/`y`/`courtZone`, which stay null until a *future, separate*
human-audited promotion step - not built this track), `PlayerStat`, `TeamStat`, `Standing`,
`Player` identity, `SeasonClub` assignment, or coach assignment. This is enforced structurally,
not just by convention - see `capability-separation.test.ts`, which fails the build if any file
under `src/lib/vision/` ever references `dataCapability`/`GameDataCapability`/`BOX_SCORE_ONLY`/
`FULL_ULTRA` or writes to `PlayerStat`/`TeamStat`/`Standing`.

## The pipeline

```
GAME VIDEO (GameVideo, reuses MediaAsset)
      |
VIDEO TIMELINE SYNC (VideoTimelineAnchor -> video-timeline.ts)
      |
VISION ANALYSIS (VisionAnalysisRun + VisionModel -> VisionObservation, VisionTrack)
      |
CANONICAL EVENT ALIGNMENT (canonical-event-alignment.ts -> VisionEventMatch)
      |
MATCH CONFIDENCE (vision-match-confidence.ts, deterministic MATCH SCORE)
      |
HUMAN REVIEW (VisionObservation.status / VisionEventMatch.reviewStatus, AuditLog-backed)
      |
GROUND-TRUTH EVALUATION (vision-evaluation.ts: precision/recall/F1, per task)
      |
[future] DERIVED PLAYER/TEAM INTELLIGENCE (VisionSpatialSummary - foundation only this track)
```

## What's real vs. what's an extension point

Built and tested this track (pure logic, 60+ new unit tests, all passing against real production
after deployment): the video registry, the timeline anchor/interpolation/confidence model, the
observation/analysis-run/event-match/human-review schema and workflow, deterministic match
scoring, precision/recall/F1 evaluation, a real homography-based image-to-court coordinate
transform, and player-identity constraint resolution (team/jersey/lineup, never face).

Explicitly NOT built, and not claimed to work: actual computer-vision inference (no video exists
in this environment to run it against - see `VISION_WORKER_ARCHITECTURE.md`), the Ultra
4-point zone's spatial boundary (no court geometry is defined anywhere in this codebase - see
`COURT_CALIBRATION.md`), and any real trained model. `scripts/vision-analyze.ts` exists as the
extension point a real CV worker would plug into, and honestly reports
`VISION_EMPIRICAL_REHEARSAL_BLOCKED_NO_VIDEO` rather than fabricating results.

## Why this doesn't threaten canonical trust

G.15-G.20 built something genuinely valuable: verified basketball truth with a full audit trail.
This domain is architected so it is *impossible* for that to quietly degrade - every vision table
is additive, every foreign key into canonical tables is read-only (a `VisionEventMatch` points
*at* a `GameEvent`, nothing points *from* a `GameEvent` into vision data), and the one new
`MediaAssetPurpose` value (`GAME_VIDEO`) doesn't change how any existing media purpose behaves.

## G.22 update: empirical validation layer added, still architecture-only

G.22 extends this pipeline with real (unit-tested) measurement functions -
`detection-metrics.ts`, `tracking-metrics.ts`, `spatial-metrics.ts`, `trajectory-filtering.ts`,
`calibration-quality.ts` - plus a physical-truth layer (`CourtSpecification`, DRAFT/OFFICIAL
gated) and an attacking-direction derivation (`attacking-direction.ts`). The "one rule" above is
unchanged and was re-verified: `capability-separation.test.ts` gained a second check this track
scanning for biometric-pattern regressions, still passing cleanly. Per the user's explicit
confirmation that no real Ultra video or official court dimensions exist yet, none of G.22's new
measurement functions have been run against real data - see `VISION_EMPIRICAL_BENCHMARK.md` for
the full, honest accounting.
