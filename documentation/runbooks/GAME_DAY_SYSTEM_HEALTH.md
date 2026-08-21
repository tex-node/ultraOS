# Runbook: Game Day System Health

G.20, Part XLII-XLIV, LXV. The Event Director's "can we continue the game?" checklist.

## Before tip-off

Open `/broadcast/diagnostics` (or check the "Live system health" strip on `/gameday`). Confirm:

- **Database**: HEALTHY.
- **Public /live** and **Commentator /broadcast/stats**: HEALTHY.
- **Presentation (Program)**: HEALTHY, and either empty or pointing at the correct upcoming game.
- **Browser Sources**: no unexpected CRITICAL/WARNING entries (IDLE is normal and expected before
  a game starts — see `BROADCAST_DIAGNOSTICS.md`).

This is read-only. Nothing on this page writes game state (Part XLII) — it cannot start the
game, set the score, or touch Program for you.

## During the game

Watch the "Live system health" strip on `/gameday`, or refresh `/broadcast/diagnostics`.

- **Snapshot**: should stay HEALTHY while the clock runs. A sustained WARNING (event ledger
  hasn't advanced in 30-120s while the clock is running) is worth a look, but not itself a crisis
  — a real defensive stretch can genuinely go that long. CRITICAL (120s+) during active play
  deserves attention: check whether the statistician's console is actually being used.
- **Reconciliation**: WARNING on a MISMATCH is normal mid-game (the statistician may simply be a
  play behind the scorer) — don't treat it as broken. Never manually "fix" a mismatch from
  diagnostics; it has no such control. Resolve it the normal way, on the statistician's own
  console.
- **Never edit score from diagnostics. Never force Program truth.** This page has no mutation
  path for either — if you need to change something, you're in the wrong tool.

## Alert severity (Part XLIV)

| Tier | Examples | Response |
|---|---|---|
| **P0** | Database unreachable; Program references a missing/non-production fixture | Stop and investigate immediately — nothing downstream can be trusted |
| **P1** | Score reconciliation MISMATCH; public `/live` or `/broadcast/stats` degraded; a browser source down mid-broadcast | Investigate promptly, but the game itself can usually continue |
| **P2** | One non-critical graphic route IDLE/unavailable (e.g. no milestone active); optional panel empty | No action needed — this is often just "nothing to show yet," not a fault |

## After the game

1. Confirm the game reached FINAL and statistics are verified (reconciliation shows MATCHED,
   `isStatisticsVerified: true`).
2. Confirm records/milestones look right on the public page and `/broadcast/stats`.
3. Clear Program (`/broadcast/control` → CLEAR PROGRAM) if a graphic was left on air.
4. Confirm the public final state (`/api/v1/games/{fixtureId}` shows `status: FINAL`).
5. Close any incidents opened during the game via `/incidents`.
