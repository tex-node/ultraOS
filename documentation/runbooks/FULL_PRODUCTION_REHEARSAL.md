# Runbook: Full Production Operations Rehearsal

G.20, Part XLVII-LVI. `web/scripts/g20-rehearsal.ts` + `web/scripts/g20-load-test.ts`. The
most important end-to-end test this track ran — real Postgres, real unauthenticated HTTP against
the actual deployed server, real service restart.

## What it covers, and what actually happened on the last real run

1. **Baseline diagnostics**: confirmed `HEALTHY` with nothing live, no residue.
2. **Rehearsal Event Set** (Part XLVIII): starting five, 2PT, 3PT, miss, offensive rebound,
   assist, turnover, foul, substitution, lead change, Ultra Time, 4PT ×2, normal shot ×2,
   milestone, provisional record — all landed and verified in the presentation model.
3. **Diagnostics isolation**: the LIVE rehearsal game never appears in default diagnostics
   discovery; an operator can still inspect it explicitly via `?gameId=`.
4. **Stale-data rehearsal** (Part L): a real event backdated 200 seconds (past the 120s STALE
   threshold) on a LIVE game with the clock running → diagnostics correctly reported
   `CRITICAL`/`STALE`. Not a pure-function test — a real Postgres row with a real timestamp.
5. **Score reconciliation rehearsal** (Part XLIX): the official score was deliberately pushed
   out of agreement with the statistical total → diagnostics reported `WARNING` (game still
   LIVE) → resolved → returned to `HEALTHY`. Never auto-corrected by any code path.
6. **Program-failure rehearsal** (Part LI): Program was set to point at the REHEARSAL game →
   diagnostics reported `CRITICAL` ("Program references a non-PRODUCTION fixture"), the browser
   source itself still returned a clean 404 (no crash), and `/api/broadcast/program` reported
   `null` rather than leaking it.
7. **Public API isolation**: `/api/v1/games/{fixtureId}` and `/api/v1/live` both refused the
   REHEARSAL game, before and after it reached FINAL — isolation isn't just a LIVE-state check.
8. **Multi-consumer load during LIVE state** (Part XXXII): 26 concurrent requests (20 public
   `/live`-equivalent, 5 Program API, 1 diagnostics) — zero 5xx errors.
9. **Finalization**: FINAL + statistics verified.
10. **Post-final correction propagation** (Part LV): voided the statistician's Ultra-Time 4PT
    event → the presentation model updated immediately (4PT count dropped, verification cleared)
    → re-verified → restored. The same `verifyStatistics()`/materialization path every prior
    track's correction flow uses — no new logic.
11. **Cleanup**: rehearsal fixture/game/events/starters removed, standings recalculated,
    diagnostics returned to `HEALTHY`, Program confirmed empty.
12. **Production invariants**: FINAL game count, standings totals, and rehearsal residue all
    confirmed unchanged before vs. after.

Every one of these 24 checks passed on the run backing this report.

## Load test results (separate from the rehearsal, `g20-load-test.ts`)

Against the real deployed server, mixing public API v1, a browser-source graphic, the season
standings endpoint, and the Program API:

| Concurrency | Requests | Errors | p50 | p95 | max |
|---|---|---|---|---|---|
| 10 | 10 | 0 | 92ms | 364ms | 364ms |
| 25 | 25 | 0 | 349ms | 583ms | 587ms |
| 50 | 50 | 0 | 593ms | 982ms | 988ms |

Zero errors at every tier. Latency scales up with concurrency (single Node process, no read
replica or edge cache) — worth watching as real traffic grows, not a problem at today's scale,
and not something to fabricate a false "flat" claim about.

## Service restart with active consumers (Part XL, LII-LIII)

Program was set to a real production game, confirmed serving correctly over real HTTP, the
`ultraos-web` service was restarted, and the same Program state was confirmed byte-identical
immediately after (via `/api/broadcast/program`, `/live`, and `/api/v1/live` all polled
successfully across the restart) — recovered automatically, no manual re-selection, consistent
with `BROADCAST_CONSUMER_RECOVERY.md`.

## Deliberately not attempted

A literal network-partition simulation of one specific consumer (Part XXXVII) — this
environment has no sandboxed way to sever one process's network access without affecting the
rehearsal tooling itself. See `BROADCAST_CONSUMER_RECOVERY.md`'s "What was actually tested vs.
reasoned about" section for the honest accounting of what stands on real evidence vs. structural
reasoning.
