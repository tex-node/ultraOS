# Runbook: Live Presentation Rehearsal

G.19, Part L-LIII. How to safely rehearse the full presentation/broadcast pipeline without
touching real production data or exposing anything to the public.

**G.20 update**: this rehearsal's isolation checks were re-run and extended in
[`FULL_PRODUCTION_REHEARSAL.md`](./FULL_PRODUCTION_REHEARSAL.md) (`g20-rehearsal.ts`), which adds
diagnostics/staleness/Program-failure/multi-consumer-load/finalization/correction coverage on top
of everything below — read that one for the current, larger end-to-end test; this document still
accurately describes the G.19-era isolation methodology it builds on.

## Why a script, not the real browser UI

Driving the real scorer/statistician consoles requires an authenticated session, which requires
entering a password — prohibited regardless of authorization, the same rule that has held for
every track since G.15. Every rehearsal is instead a standalone script
(`web/scripts/g19-rehearsal.ts`) that reuses the exact transaction logic the real server actions
use (same Prisma queries, same validation, same locks), with a hardcoded actor id instead of a
session-derived one. This is a disclosed methodology gap, not a hidden one.

## What the script proves, in order

1. **Isolation, before any scoring happens.** Creates a `REHEARSAL`-origin `Fixture` + `Game`
   (`status: LIVE`) and immediately confirms, via real unauthenticated HTTP against the deployed
   server: `/live` doesn't mention it, `/broadcast/game/[id]/scorebug` and
   `/display/game/[id]/clock` both 404, `/api/broadcast/games/[id]` 404s — and a real
   PRODUCTION game's scorebug still renders 200 (the gate is selective, not blanket).
2. **Game Pulse and Game Story**, against a scoring sequence deliberately shaped to produce a
   real lead change, a real tie, a real largest lead, and a real Ultra Time start.
3. **Milestones and suggestions**, confirming a 4PT-make suggestion and a milestone suggestion
   both appear from real data.
4. **The rehearsal presentation route's own discovery query** (`recordOrigin: REHEARSAL`, no
   production filter) finds the fixture — proving the explicit rehearsal path works precisely
   where the public path must not.
5. **Preview/Program/TAKE/CLEAR**, including a simulated restart-recovery check (a fresh read
   returns identical state to right after TAKE — nothing lived only in memory).
6. **`/api/broadcast/program` refuses to leak** the rehearsal game even while it's technically on
   Program.
7. **Cleanup and re-verification**: deletes the rehearsal fixture/game/events/starters,
   recalculates standings, and confirms production FINAL count, standings totals, and rehearsal
   residue are all back to their pre-rehearsal values, and `/live` shows the genuine no-live-game
   state again.

## Running it

```bash
# On the app server, inside the current release directory:
set -a && source .env && set +a
npx tsx scripts/g19-rehearsal.ts
```

Exits non-zero on the first failed assertion. If it fails partway through, the rehearsal fixture
may be left behind — see the cleanup snippet in `BROADCAST_RECOVERY.md`.

## Known limitation

The Commentator Command Center's authenticated render (`/broadcast/stats`,
`/rehearsal/broadcast/[fixtureId]`) still cannot be visually verified this way — logging in
requires a password. Its correctness rests on: it calls the exact same
`buildLivePresentationModelForGame()` this rehearsal verifies directly, and the component
consuming it type-checks and builds cleanly.
