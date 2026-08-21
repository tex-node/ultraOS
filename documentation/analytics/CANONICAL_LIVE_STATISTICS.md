# Canonical Live Statistics

The G.16 authority model: how a statistician's tap becomes a verified, materialized statistic,
and exactly what "canonical" means in this system now. Builds directly on
[`ULTRA_LIVE_DATA_ARCHITECTURE.md`](./ULTRA_LIVE_DATA_ARCHITECTURE.md) (G.15).

## The chain

```
SCORER (official score)      STATISTICIAN (basketball events)
        \                            /
         \                          /
          GameEvent ledger (one table, two source tags)
                      |
                      v
        derivePlayerStats() / deriveTeamStats()   <- pure, deterministic (event-derived-stats.ts)
                      |
                      v
              LIVE DERIVED BOX SCORE   <- read model, statistician console, never persisted
                      |
              (operator taps "Verify statistics")
                      |
                      v
         rebuildGameStatsFromEvents()  <- materialization, gameId-scoped transaction
                      |
                      v
         PlayerStat / TeamStat (statSource: EVENT_DERIVED)   <- CANONICAL SNAPSHOT
                      |
                      v
    Game Story / DNA / Records / Milestones / Public / Broadcast (G.9-G.14, unchanged)
```

## Three authorities, not one blurred one

| Concern | Authority | Where |
|---|---|---|
| **Official score** | Scorer console | `Fixture.homeScore`/`awayScore`, written only by `src/app/games/actions.ts` |
| **Statistical event truth** | Statistician console | `GameEvent` rows tagged `source: ULTRA_NATIVE_LIVE_STATISTICIAN` |
| **Canonical statistics** | Verified materialization | `PlayerStat`/`TeamStat`, written only by `rebuildGameStatsFromEvents()` inside `verifyStatistics()` |

The scorer's score and the statistician's derived score are never silently merged — see
[`LIVE_SCORE_STAT_RECONCILIATION.md`](../gameday/LIVE_SCORE_STAT_RECONCILIATION.md). Only a
human tapping **Verify statistics** promotes the statistician's ledger into the canonical box
score, and even then only after reconciliation passes (or is explicitly overridden with a
reason).

## LIVE vs VERIFIED vs FINAL

| State | Meaning | Where |
|---|---|---|
| **LIVE DERIVED** | `getGameLiveBoxScore()` — computed fresh from ACTIVE events on every read. Never written anywhere; a pure read model. | Statistician console, "Live derived box score" section |
| **VERIFIED** | `Game.statisticsVerifiedAt`/`statisticsVerifiedById` set; `PlayerStat`/`TeamStat` materialized. Cleared automatically the moment a new statistician event is recorded (a stale green badge is worse than an honest "needs re-verification"). | `verifyStatistics()` |
| **FINAL** | `Fixture.status`/`Game.status` — the official competitive result. Entirely independent of verification; an Event Director can finalize with statistics unverified. | `finalizeGame()`, unchanged from G.15 |

## Materialization (`rebuildGameStatsFromEvents`)

Deterministic and idempotent: every player who has ever appeared in a game's statistician
ledger (active or voided) gets an explicit upsert, including an honest all-zero row if every one
of their events has since been voided — a rebuild is a full snapshot, never an incremental
patch that could leave stale non-zero data behind. Running it twice against the same ACTIVE
event set produces byte-identical `PlayerStat`/`TeamStat` rows both times (proven in the G.16
isolated rehearsal).

FGM/FGA definition: a 4PT shot counts as a field goal like any other non-free-throw make/miss —
`FGM = 2PM + 3PM + 4PM`, `FGA = 2PA + 3PA + 4PA`. PTS is summed directly from each event's
persisted `points` field (already Ultra-Time-adjusted at write time), never recomputed as
`1×FTM + 2×2PM + 3×3PM + 4×4PM`, which would silently drop the Ultra Time multiplier. See
[`EVENT_DERIVED_BOX_SCORE.md`](./EVENT_DERIVED_BOX_SCORE.md) for the full reducer semantics.

## Restart recovery

No state lives only in server memory or browser state. Score, clock, event ledger, lineup
(starting five + structured substitution events), and verification status are all read fresh
from Postgres on every request. A service restart mid-game loses nothing — confirmed structurally
by every read path being a stateless query, and exercised in the G.15/G.16 rehearsals via a real
`systemctl restart` between deploy steps with production data intact afterward.

## What G.16 explicitly did not build

- **Native-vs-PDF-import reconciliation** (comparing a live-captured game against a later
  official report of the same game) — a distinct, still-open problem, deferred again with
  reasoning in [`STAT_SOURCE_RECONCILIATION.md`](./STAT_SOURCE_RECONCILIATION.md).
- **Minutes played** — no starting-five-confirmed game has been played long enough in production
  to validate stint-based minutes math against a real clock history; the starting five and
  structured substitution events needed for it now exist (`GameStarter`, `GameEvent.substitutedOutPlayerId`),
  but the derivation itself is deferred rather than shipped unverified.
- **Public/broadcast live surfaces** — the read model (`getGameLiveBoxScore`, `getGameReconciliation`,
  `getGameLineup`, plus the existing `/api/games/[id]/snapshot`) is ready to be consumed by a
  public live page or `/broadcast/graphics` live cards, but no real live game has run long enough
  in production yet to build and validate that UI against real behavior rather than guesswork.
