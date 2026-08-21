# Post-Final Statistical Corrections

G.17, Part VII. `correctStatisticianEventPostFinal()` in `src/app/games/stats-actions.ts`.

## Authority

Gated behind `result:confirm` — the same permission tier that finalizes and verifies games, not
the everyday `game:record-stats` statistician permission. Altering history after a game is
already `FINAL` is a bigger deal than routine live entry, and uses the higher tier accordingly
(no separate "Head Scorer"/"Event Director" role exists in the permission system, so this reuses
the existing tier rather than inventing new roles).

## Workflow

Available only on the statistician console's event feed (`/games/[fixtureId]/stats`) for a
`FINAL` game, per ACTIVE event:

1. Select the erroneous event.
2. Optionally supply a replacement shot value + made/miss (for a shot-category event whose value
   was wrong) — or leave it blank for a pure removal ("this event should never have existed").
3. Enter a reason (required, minimum 5 characters).
4. Submit.

The original event is **never deleted**: it flips to `CORRECTED` (if replaced) or `VOIDED` (if
removed), exactly the same non-destructive pattern the scorer console's own
`correctScoreEventAction`/`voidScoreEventAction` already use. A replacement event, if any, is
created `ACTIVE` with `supersedesEventId` pointing back at the original.

## What happens to verification

Any post-final correction **unconditionally clears** `Game.statisticsVerifiedAt`/`statisticsVerifiedById`
— the previously materialized `PlayerStat`/`TeamStat` snapshot is stale by definition the moment
the ledger changes. The UI shows **STATISTICS CORRECTED AFTER FINAL** once any correction has
ever been recorded for the game (`hasPostFinalCorrections()`).

Re-establishing canonical statistics uses the **same** `verifyStatistics()` action as any other
verification — this workflow does not duplicate materialization logic. "Capture once, verify
once, derive everything else": there is exactly one code path that writes `PlayerStat`/`TeamStat`
from the ledger, regardless of whether the game is still live or long since final.

## Audit trail

Every correction writes one `AuditLog` entry (`action: "POST_FINAL_STATISTICAL_CORRECTION"`)
recording: fixture/game, the original event's type and description, the replacement event's id
(if any), the actor, the reason, and the verification state immediately before the correction.

## Verified in the G.17 rehearsal

A real 2PT make was corrected to 3PT on an already-`FINAL` rehearsal game: the original event
flipped to `CORRECTED`, a new `ACTIVE` event was created, verification was cleared, and
re-verification re-materialized the affected player's `PlayerStat.points` with the exact expected
net +1 — confirmed by comparing the pre- and post-correction values directly, not by trusting the
engine to check itself.
