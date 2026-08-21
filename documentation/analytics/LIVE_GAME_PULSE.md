# Live Game Pulse

G.19, Part VIII-IX. `src/lib/live-game-pulse.ts` (`computeGamePulse()`) — pure reducer, no
Prisma. Deferred by G.18 because Snapshot V2 didn't carry per-event running score yet; G.19's
Part IX extension of Snapshot V2 (`scoringChronology`, using the `homeScoreAfter`/`awayScoreAfter`
fields G.18 already added to the event schema) supplies exactly what this needed.

## Data source: the full scoring chronology, not the moment feed

`live-game-snapshot-v2.ts`'s `latestEvents` field is capped at the 15 most recent events (enough
for a moment feed, not enough to detect a lead change from tip-off). `scoringChronology` is a
separate, uncapped query: every ACTIVE event with `made: true` and both running-score fields
populated, ordered by `sequenceNumber` ascending — the complete point-by-point score history.

## What it computes

| Field | Meaning |
|---|---|
| `leadChanges` | Times the team holding the lead switched, **including a team taking the lead right out of a tie** |
| `ties` | Times the score became level after not being level |
| `largestLead` | The biggest margin either team ever held, and who held it |
| `largestRun` / `currentRun` | Consecutive scoring by one team, broken the instant the opponent scores |
| `ultraTimeStart` | The first scoring point flagged `isUltraTime`, or `null` |

## A real defect found and fixed via the G.19 rehearsal

The first implementation only compared each point's leader to the *immediately prior* point.
That definition misses the single most common real "lead change" shape in basketball: team A
leads, the game ties, team B then takes the lead. TIE → B was never flagged as a change because
the prior point (TIE) wasn't itself a leader. The rehearsal built a real 0–6 away start, a
comeback to a 6–6 tie, then a 9–6 home lead, and got `leadChanges: 0` instead of the correct `1`.

Fixed by tracking `lastNonTieLeader` independently of the immediately-prior point — a lead change
is now counted whenever a team takes sole possession of the lead and it differs from whoever held
it last (skipping over ties, which are counted separately). Regression test added
(`live-game-pulse.test.ts`).

## Historical games are untouched

BOX_SCORE_ONLY games have no event ledger to reduce over — Game Pulse is simply never called for
them; the existing historical presentation is unaffected.
