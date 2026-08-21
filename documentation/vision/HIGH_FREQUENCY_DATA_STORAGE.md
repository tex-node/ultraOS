# High-Frequency Data Storage

G.21, Part XXXV-XL. The one explicit architectural decision this track makes and does not
implement further than a summary table.

## The problem, stated honestly

A 30fps game × 10 players × ~40 minutes of actual play is on the order of tens of millions of
per-player-per-frame position samples if stored naively. Postgres (this app's single OLTP
database, already serving every canonical read/write in the platform) is the wrong place for
that - it would compete for the same connection pool and disk I/O as `Fixture`/`GameEvent`/
`PlayerStat` writes that must stay fast and reliable for real game-day operations.

## The decision

**Raw per-frame trajectories are NOT modeled in Postgres at all.** No `VisionTrackSample` or
equivalent per-frame table exists in this migration. If/when real tracking data exists, the
recommended pattern (documented, not built - there is no real trajectory data yet to build a
pipeline for) is:

```
RAW VISION / TRAJECTORY DATA  -> object storage (Cloudflare, same provider MediaAsset already
                                  uses) as a compact per-game file (e.g. one Parquet or gzipped
                                  JSON-lines file per GameVideo, referenced by object key)
INDEX / METADATA / SUMMARIES  -> PostgreSQL (VisionSpatialSummary - built this track)
```

## What IS persisted in Postgres: VisionSpatialSummary

One row per (video, analysis run, player) - `averageCourtX`/`averageCourtY`,
`distanceCoveredUnits`, `samplesUsed`, and a `quality` label (`HIGH`/`MEDIUM`/`LOW`/
`INSUFFICIENT_DATA`). This is bounded (at most `players × runs` rows per video, never
`frames × players`), and is exactly the kind of aggregate a dashboard or a future coaching view
can query cheaply. No summary rows exist in production today - there is no real tracking data to
summarize yet (see `PLAYER_TRACKING_FOUNDATION.md`).

## Distance and speed: architecture only, not computed (Part XXXVIII-XXXIX)

Both require calibrated coordinates, accurate timestamps, AND noise filtering (raw frame-to-frame
jitter can dramatically inflate a naive distance sum). `VisionSpatialSummary.distanceCoveredUnits`
exists as the field a real pipeline would populate after filtering; no smoothing/filtering
algorithm was implemented this track, since there is no raw trajectory data to filter. Nothing
computes or displays a distance/speed number today - the field stays null until a real,
validated pipeline exists to fill it honestly.

## Retention (Part LXVI)

Conceptual policy, not yet needed operationally (no data exists to retain): a source `GameVideo`/
`MediaAsset` is never deleted automatically. Derived `VisionObservation`/`VisionTrack` rows are
cheap and bounded relative to trajectories, so no special retention job is needed for them yet.
Any future raw-trajectory object-storage files would need their own explicit retention policy,
separate from the summary rows in Postgres.

## G.22 update: the object-storage reference row now exists

`VisionTrajectoryArtifact` (new this track) is the concrete row this document's "index/metadata in
Postgres, raw data in object storage" pattern needed: `objectKey`/`storageProvider`/
`checksumSha256`/`byteSize`/`sampleCount`/`timeRangeStartMs`/`timeRangeEndMs`/`filtered`/
`filterMethod`. See `TRAJECTORY_STORAGE_FORMAT.md` for the full field list and the real (not
computed-against-real-data) filtering functions (`rejectImpossibleJumps`/`movingMedianSmooth`) that
would populate `filtered`/`filterMethod`. Zero rows exist - no trajectory has ever been produced.
`spatial-metrics.ts`'s `computeDistanceCovered()` (also new this track) is the real function this
document said didn't exist yet for turning filtered samples into a distance/speed number, with an
explicit `MetricQuality` label rather than false precision - see `SPATIAL_METRIC_QUALITY.md`.
