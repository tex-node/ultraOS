# Live Score / Statistics Reconciliation

The mechanics of comparing the scorer's official score against the statistician's independently
derived score, and what happens (and doesn't happen) when they disagree.

## Why this exists

Before Track G.15, one console (`/games/[fixtureId]/live`) entered both the official score and
every stat category — a single point of failure with no independent check. G.15 adds a second,
separately-operated console (`/games/[fixtureId]/stats`) whose own recorded shots
independently sum to a score that can be compared against the official one. See
[`ULTRA_LIVE_DATA_ARCHITECTURE.md`](../analytics/ULTRA_LIVE_DATA_ARCHITECTURE.md) for the full
system this sits inside.

## Authority model

- **Scorer = official score authority.** `Fixture.homeScore`/`awayScore` are written only by
  `recordScore`/`voidScoreEventAction`/`correctScoreEventAction`/`undoLastEvent` in
  `src/app/games/actions.ts`. Nothing else ever writes them.
- **Statistician = statistical attribution authority.** Their `GameEvent` rows
  (`source: "ULTRA_NATIVE_LIVE_STATISTICIAN"`) never touch the fixture score.

## How the statistical score is derived

`src/lib/reconciliation.ts` + `replayScore()` (from `src/lib/ultra-scoring-engine.ts`, reused
unmodified) sum the `points` field of every `ACTIVE`-status statistician event, per team.
`VOIDED` events are excluded automatically — the same replay invariant the scorer's own
void/correction system already relies on, so a voided statistician entry can never silently
keep counting toward the derived score.

```
statisticalScore(team) = Σ points where source = STATISTICIAN and status = ACTIVE and seasonClubId = team
```

## States

| State | Meaning |
|---|---|
| `UNAVAILABLE` | No statistician events exist yet for this game. Not an error — normal before the statistician starts, or for a game with no statistician assigned at all. |
| `MATCHED` | `officialScore === statisticalScore` for both teams. |
| `MISMATCH` | They disagree for at least one team. Surfaced as a red banner on both consoles. |

`UNAVAILABLE` is intentionally distinct from a legitimate 0-0 `MATCHED` state — see the test
`reconcileGameScore does not treat a legitimate 0-0 statistical tally as UNAVAILABLE once the
statistician has started` in `src/lib/reconciliation.test.ts`.

## What happens on a mismatch

**Nothing is auto-corrected, in either direction.** This is a deliberate P0 safety rule (G.15
brief, Part X: "Do NOT allow them to silently disagree... Do NOT automatically rewrite one from
the other"). Both consoles show the mismatch; a human reviews the event feed and the box score
and either:

- finds and fixes their own entry error (Undo, or a fresh corrective entry), or
- verifies statistics anyway with a written override reason, if the discrepancy has a
  legitimate explanation that doesn't warrant chasing further.

## Finalization is independent of verification

`finalizeGame()` (the official game-result action) has **no dependency** on reconciliation
status or `Game.statisticsVerifiedAt`. An Event Director can finalize a tied-avoiding,
correctly-scored game at any time regardless of whether statistics have been reviewed — this
was an explicit design requirement (G.15 brief, Part XII: "Do not automatically block the
official game result if operational safety requires the Event Director to finalize the game").
`GAME RESULT FINAL` (Fixture/Game status) and `STATISTICS VERIFIED`
(`Game.statisticsVerifiedAt`/`statisticsVerifiedById`) are tracked as two separate fields for
exactly this reason.

## Verification and staleness

`verifyStatistics()` (`src/app/games/stats-actions.ts`) stamps `Game.statisticsVerifiedAt` and
writes an `AuditLog` entry (`STATISTICS_VERIFIED`) recording the reconciliation snapshot at the
moment of verification, plus the override reason if the state was `MISMATCH`. Any subsequent
statistician write (a new shot, stat, substitution, or undo) automatically clears the
verification stamp and logs `STATISTICS_VERIFICATION_CLEARED` — a verified badge is never
allowed to go stale silently.

## Deferred: native-vs-import reconciliation

This document covers reconciliation between the scorer and statistician **live consoles**. A
separate, still-open problem — comparing a live-captured game's final numbers against a later
official FIBA/Genius Sports PDF import of the same game — was explicitly out of scope for this
track's P0 (see [`STAT_SOURCE_RECONCILIATION.md`](../analytics/STAT_SOURCE_RECONCILIATION.md)).
