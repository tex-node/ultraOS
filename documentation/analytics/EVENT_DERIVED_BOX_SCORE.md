# Event-Derived Box Score

The pure reducer (`src/lib/event-derived-stats.ts`) that turns a statistician's `GameEvent`
ledger into player and team statistics. No Prisma, no I/O — fully unit tested
(`event-derived-stats.test.ts`, 17 tests).

## Inputs

`derivePlayerStats(events: DerivableEvent[])` takes ACTIVE-filtered, already-loaded events
(`eventType`, `status`, `seasonClubId`, `playerId`, `points`, `basePointValue`, `isUltraTime`).
`VOIDED`/`CORRECTED`/`SUPERSEDED` events are excluded by the reducer itself — the same replay
invariant `replayScore()` already relies on for the scorer's own ledger.

## Per-event rules

| Event | Effect |
|---|---|
| `SHOT_MADE` / `FREE_THROW_MADE` | `{2,3,4}PA/{2,3,4}PM` or `FTA/FTM` +1 (by `basePointValue`); `FGA/FGM` +1 if `basePointValue >= 2`; `PTS += points` (the persisted, already-multiplied value) |
| `SHOT_MISSED` / `FREE_THROW_MISSED` | Same attempt counters +1, no make counters, no points |
| `OFFENSIVE_REBOUND` / `DEFENSIVE_REBOUND` | `offensiveRebounds`/`defensiveRebounds` +1, `rebounds` +1 |
| `ASSIST` / `STEAL` / `BLOCK` / `TURNOVER` / `FOUL` | That counter +1 |
| `SUBSTITUTION` and anything else | No statistical effect (handled by the lineup module instead) |

## Field goal definition (deliberate choice)

A 4PT shot is a field goal like any other non-free-throw make/miss:

```
FGM = 2PM + 3PM + 4PM
FGA = 2PA + 3PA + 4PA
```

This matches how `PlayerStat.fieldGoalsMade/Attempted` was already used by every prior track
(Season Zero's FIBA imports have no separate 4PT category, so their FGM/FGA already implicitly
followed this same "every non-free-throw make counts" convention) — this reducer doesn't
introduce a new convention, it makes an existing implicit one explicit and enforced.

## PTS is never re-derived from counts

```
PTS += event.points   // NOT: 1×FTM + 2×2PM + 3×3PM + 4×4PM
```

`event.points` is the actual effective value persisted at write time by `scoreShot()`
(`ultra-scoring-engine.ts`) — already multiplied for Ultra Time. Recomputing PTS from
`basePointValue × count` would silently drop that multiplier. Concretely:

```
4PT made during Ultra Time:
  fourPointsMade += 1
  fourPointsAttempted += 1
  fieldGoalsMade += 1
  fieldGoalsAttempted += 1
  points += 8              // not 4
  ultraTimePoints += 8
  ultraTimeFieldGoalsMade += 1
```

Verified for every shot value (1-4) in and out of Ultra Time in `event-derived-stats.test.ts`,
and end-to-end in the G.16 isolated rehearsal (a real 4PT-during-Ultra-Time make was recorded on
both consoles, materialized, and independently hand-verified to sum correctly).

## Team totals

`deriveTeamStats(playerStats)` sums the already-derived player map, grouped by `seasonClubId` —
**never** independently recomputed from the raw event list a second way. This is deliberate: two
different code paths arriving at "team points" that could silently drift apart is exactly the
"second independent truth" this whole track exists to prevent.

## Corrections

A corrected shot (original event flips to `status: CORRECTED`, a new event with the corrected
value is created and marked `ACTIVE`) produces the corrected aggregate automatically — the
original's `CORRECTED` status excludes it from the reducer, and only the superseding `ACTIVE`
event counts. No special-case correction math needed in the reducer itself.
