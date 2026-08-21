# GameEvent ledger: sequencing, corrections, and replay

## Sequencing

Every `GameEvent` written by a native code path gets a `sequenceNumber`, assigned from
`Game.nextEventSequence` at write time (then incremented in the same transaction). This gives a
deterministic per-game ordering that doesn't depend on `createdAt` timestamp precision or
transaction-commit ordering under concurrency.

## Status lifecycle

`GameEventStatus`: `ACTIVE` → `VOIDED` | `CORRECTED` → (`CORRECTED` events point at a
`SUPERSEDED`-eligible* replacement via `supersedesEventId`).

An event is **never deleted or mutated in place** beyond its `status` and correction metadata
(`correctedAt`, `correctedById`, `correctionReason`). This is what makes the ledger
append-only and auditable: you can always answer "what did the scorer originally enter, and
who changed it, when, and why."

\* `SUPERSEDED` exists in the enum for future use (e.g. a chain of corrections); the current
correction workflow only ever produces one replacement event per correction, marked `ACTIVE`.

## Void (`voidScoreEventAction`)

Reverses a `SCORE`/`SCORE_CORRECTION` event entirely: subtracts its `points` from the relevant
side's `Fixture` score and reverses its `shotStatDeltas` on `PlayerStat`/`TeamStat`, then marks
the event `VOIDED`. Use this for "this never happened" - a made shot that should never have
been recorded at all.

## Correction (`correctScoreEventAction`)

For "this happened, but differently" - 2PT→3PT, 3PT→4PT, a scoring-player mistake, or an Ultra
Time multiplier that should/shouldn't have applied:

1. The original event is marked `CORRECTED` (not deleted).
2. A new event is created with `eventType: "SCORE_CORRECTION"`, `supersedesEventId` pointing at
   the original, re-evaluated through `scoreShot()` using the **original event's own frozen
   `period`/`clockSeconds`** - not "now." A correction made five minutes after the shot
   shouldn't inherit whatever Ultra Time state happens to be true at correction time.
3. Player/team stat deltas are reversed for the original shot and reapplied for the corrected
   one (`negateShotStatDeltas(oldDeltas)` + `newDeltas`), including cross-team
   `ultraTimePointsAgainst` bookkeeping on the opposing side's `TeamStat` when the Ultra Time
   status of the shot changed.
4. A wrong-player correction is supported: `playerId` in the correction input must belong to
   the *same* `SeasonClub` as the original event (a correction fixes who scored, not which team
   scored) - the old player's line is reversed, the new player's line gains the corrected
   value.

## Ultra Time transitions are explicit ledger events

`ULTRA_TIME_STARTED`/`ULTRA_TIME_ENDED` are written whenever `syncUltraTimeState` (in
`src/app/games/actions.ts`) detects the persisted `Game.isUltraTimeActive` flag no longer
matches what the clock/period/status now implies. This runs from every action that can move
the clock forward: `recordScore`, `recordStatEvent`, `pauseGame`, `resumeGame`,
`advancePeriod`. There is no background ticker - a transition is only detected (and its ledger
event written) the next time *something* touches the game, which is an accepted limitation:
see [season-one-livestats-roadmap.md](../operations/season-one-livestats-roadmap.md).

Pausing during Ultra Time deliberately ends it (nothing is being played), and resuming
re-detects and re-starts it if the clock still qualifies - so a pause/resume pair near the
boundary can legitimately produce two transition events, which is correct, not a bug.

`undoLastEvent` explicitly skips over these system-generated transition events when finding
"the last thing an operator did" - they were never an operator action to undo.

## Event replay

`replayScore(events, homeSeasonClubId, awaySeasonClubId)` in `ultra-scoring-engine.ts` sums
`points` over `ACTIVE`-status events per side. Tested (`ultra-scoring-engine.test.ts`) against
sequences that include a void and a correction, proving replay reproduces the persisted score.

**Scope note:** this is a pure, unit-tested function proving the *math* is self-consistent -
`negateShotStatDeltas`/`addShotStatDeltas` round-trip to zero, and a hand-built event sequence
replays to the expected score. It has not been exercised as an integration test against a real
Postgres instance actually running `recordScore`/`voidScoreEventAction`/
`correctScoreEventAction` end-to-end, because the existing test suite
(`npm test` → `tsx --test src/lib/*.test.ts`) has no live-database harness for any area of this
codebase - see the Testing section of
[season-one-livestats-roadmap.md](../operations/season-one-livestats-roadmap.md) for why, and
what a future DB-integration harness would need.
