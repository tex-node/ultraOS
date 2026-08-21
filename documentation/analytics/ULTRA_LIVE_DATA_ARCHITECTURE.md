# Ultra Live Data Architecture

How Ultra Basketball captures a game as it happens, and how that capture feeds everything built
on top of it (box scores, Game Story, DNA, records, milestones, broadcast graphics). Built in
Track G.15 on top of the canonical scoring model Track H established.

> **G.16 update:** the statistician ledger this document describes is no longer a dead-end
> cross-check — it now materializes into canonical `PlayerStat`/`TeamStat` once verified. See
> [`CANONICAL_LIVE_STATISTICS.md`](./CANONICAL_LIVE_STATISTICS.md) for the full authority model,
> and [`STARTING_FIVE_AND_SUBSTITUTIONS.md`](../gameday/STARTING_FIVE_AND_SUBSTITUTIONS.md) for
> the new structured lineup capture. G.16 also fixed a real isolation gap: season-wide analytics
> queries (standings, leaderboards, records, milestones, DNA) now filter on
> `competitiveFixtureScope()` (`src/lib/competitive-scope.ts`), so a rehearsal fixture can safely
> reach FINAL status without ever affecting real production data — proven in the G.16 rehearsal
> by actually finalizing a rehearsal game and confirming byte-identical real standings.
>
> **G.17 update:** verified player minutes and lineup stints
> ([`PLAYER_MINUTES_AND_LINEUPS.md`](./PLAYER_MINUTES_AND_LINEUPS.md)), an explicit post-final
> statistical correction workflow ([`POST_FINAL_STAT_CORRECTIONS.md`](./POST_FINAL_STAT_CORRECTIONS.md)),
> a native-vs-official reconciliation engine and operator page
> ([`NATIVE_VS_OFFICIAL_RECONCILIATION.md`](./NATIVE_VS_OFFICIAL_RECONCILIATION.md)), and a
> consolidated public read model, Live Snapshot V2
> ([`LIVE_SNAPSHOT_V2.md`](./LIVE_SNAPSHOT_V2.md), `GET /api/games/[id]/snapshot-v2`). A real
> mid-rehearsal service restart and a real concurrent-substitution race were both proven safe
> against production — see [`LIVE_STATISTICS_REHEARSAL.md`](../runbooks/LIVE_STATISTICS_REHEARSAL.md).

## The chain

```
SCORER CONSOLE          STATISTICIAN CONSOLE
(official score,   +    (player attribution,
 clock, game state)      independent ledger)
        \                      /
         \                    /
          v                  v
         CANONICAL GameEvent LEDGER
         (one table, two source tags)
                    |
                    v
      PlayerStat / TeamStat (box score)
     — written only by the scorer console —
                    |
                    v
       Game Story / DNA / Records / Milestones
       (Track G.9-G.14, unchanged by this track)
                    |
                    v
        Public / Broadcast / Graphics / API
```

## Two consoles, one ledger, one canonical box score

Season Zero was played entirely by importing official FIBA box scores after the fact
(`StatDataSource.FIBA_LIVESTATS_PDF_IMPORT`). Track H already built a full server-authoritative
live-scoring engine — `src/lib/ultra-scoring-engine.ts` — with Ultra Time detection, 4PT
scoring, and a `GameEvent` ledger with sequencing and void/correction semantics. It went unused
for a real game (`GameEvent` count was 0 in production before this track) because it only had
one console: the scorer's, at `/games/[fixtureId]/live` (`src/app/games/actions.ts`).

G.15 adds a second, independently-operated console — the statistician's, at
`/games/[fixtureId]/stats` (`src/app/games/stats-actions.ts`) — so a genuine live game can have
two separately-operated sets of eyes on it, cross-checked against each other rather than
trusted blindly.

**The scorer console remains the sole write path for `Fixture.homeScore`/`awayScore` and for
`PlayerStat`/`TeamStat`.** The statistician's shot/rebound/assist/steal/block/turnover/foul/
substitution events land in the *same* `GameEvent` table, tagged
`source: "ULTRA_NATIVE_LIVE_STATISTICIAN"`, but never touch the fixture score or the box-score
tables. This was a deliberate scope decision (see "What this track did not do" below), not an
oversight — see [`STAT_SOURCE_RECONCILIATION.md`](./STAT_SOURCE_RECONCILIATION.md) for the full
reasoning and the honest limitation this creates.

## Score reconciliation

`src/lib/reconciliation.ts` compares the official score (`Fixture.homeScore`/`awayScore`)
against the statistician's own score, derived by replaying their `ACTIVE`-status `GameEvent`
rows (`replayScore()`, reused unmodified from the scorer's own void/correction replay
invariant). Three states per team: `MATCHED`, `MISMATCH`, `UNAVAILABLE` (no statistician events
recorded yet — distinct from a legitimate 0-0). Never auto-corrects either side. See
[`LIVE_SCORE_STAT_RECONCILIATION.md`](../gameday/LIVE_SCORE_STAT_RECONCILIATION.md).

## Event sequencing

Both consoles share one counter — `Game.nextEventSequence` — incremented under the same
`SELECT ... FOR UPDATE` row lock on `Fixture` that the scorer console already used for its own
concurrency safety. This was a deliberate design choice: locking two different rows (Fixture
for the scorer, Game for the statistician) would let a concurrent scorer write and statistician
write both read the same sequence number before either committed. Locking the same row forces
true mutual exclusion between the two consoles.

## Data capability

Unchanged from Track H/G.9: `Game.dataCapability` (`BOX_SCORE_ONLY` / `PLAY_BY_PLAY` /
`ULTRA_NATIVE_EVENTS` / `SHOT_LOCATION` / `VISION_ENRICHED`), collapsed to the 3-tier
`GameAnalyticsCapability` (`BOX_SCORE_ONLY` / `EVENT_LEVEL` / `FULL_ULTRA`) by
`getGameAnalyticsCapability()` in `src/lib/game-data-capability.ts`. `startGame()` already set
`ULTRA_NATIVE_EVENTS` for any game started through the live console — this track didn't need to
change that. Season Zero's 11 games remain `BOX_SCORE_ONLY` and always will.

## What this track did not do

- **Statistician events don't feed `PlayerStat`/`TeamStat`.** They're a genuine independent
  ledger for reconciliation and the event feed, not (yet) the canonical box-score source. A
  future track could promote a *verified* statistician ledger to canonical once enough real
  games build trust in the workflow — deliberately deferred rather than rushed.
- **No native-vs-PDF-import reconciliation** (Part XXV of the G.15 brief). This track's P0 was
  live capture and score reconciliation between the two live consoles; comparing a live-captured
  game against a later official PDF import is a distinct, still-open problem.
- **No lineup/stint-based minutes.** Substitution events are captured (`GameEventType.SUBSTITUTION`,
  direction encoded in the event description), but no starting-five confirmation step exists, so
  `PlayerStat.minutesPlayed` is not derived from them. See
  [`STATISTICIAN_OPERATOR_GUIDE.md`](../gameday/STATISTICIAN_OPERATOR_GUIDE.md#known-limitations).

## Files

| Concern | File |
|---|---|
| Scoring math, Ultra Time, replay | `src/lib/ultra-scoring-engine.ts` (Track H, unchanged) |
| Score reconciliation | `src/lib/reconciliation.ts` |
| Live game read model | `src/lib/live-game-snapshot.ts`, `/api/games/[id]/snapshot` |
| Scorer console | `src/app/games/[fixtureId]/live/page.tsx`, `src/app/games/actions.ts` |
| Statistician console | `src/app/games/[fixtureId]/stats/page.tsx`, `src/app/games/stats-actions.ts` |
| Capability classification | `src/lib/game-data-capability.ts` (Track H/G.9, unchanged) |
