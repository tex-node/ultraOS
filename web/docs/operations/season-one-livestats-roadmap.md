# Season One LiveStats: what's built, what's next

Written at the end of the canonical-scoring-model work (RuleSet/GameRuleSnapshot,
UltraScoringEngine, GameEvent ledger evolution, stat provenance/capability, Season Zero PDF
parser, live scorer UX foundation, broadcast/box-score API routes). Honest inventory, not a
sales pitch - see the completion report delivered alongside this work for the full graded
acceptance-criteria checklist.

## What exists now

- Versioned, immutably-frozen-per-game rules (`RuleSet`/`GameRuleSnapshot`).
- A pure, unit-tested, server-authoritative scoring engine (`ultra-scoring-engine.ts`) that
  independently derives the Ultra Time multiplier and rejects invalid/disabled shot types -
  wired into the existing live scorer without replacing it.
- An append-only `GameEvent` ledger: sequencing, before/after scores, void/correct/supersede
  semantics, explicit `ULTRA_TIME_STARTED`/`ULTRA_TIME_ENDED` transitions.
- Live stat aggregation for 4PT and Ultra Time splits, at both player and team level, with real
  provenance (`StatDataSource`) and a genuine NULL(=not captured)/0(=really zero) distinction.
- A per-game `GameDataCapability` signal and shared helpers so downstream consumers never
  assume more than a given game's data actually supports.
- A text parser for the real FIBA/Genius Sports box score PDF format, scoped to what it can
  *safely* extract (header, roster, FG/FT splits when arithmetic-verifiable) - with an honest,
  tested boundary around what it correctly refuses to guess.
- A visually distinct 4PT control and inline void/correct UI in the live scorer.
- Broadcast and box-score read APIs that respect the capability/provenance model.

## What's explicitly deferred (not started this pass)

- **A native mobile/tablet scorer app.** Everything above assumes the existing web scorer
  console.
- **Assist attribution and shot location.** The schema has the columns
  (`assistedByPlayerId`, `x`/`y`/`courtZone`, `fourPointQualificationMethod`); nothing writes
  to them yet. This is real, additive UI work (a court-tap or player-picker interaction), not a
  schema change.
- **A DB-integration test harness.** The existing test suite (`npm test`) is pure-function-only
  - no test runs against a real Postgres instance anywhere in this codebase, not just in this
    change. The correction/void/replay *math* is unit-tested thoroughly
    (`ultra-scoring-engine.test.ts`); the actual `recordScore`/`voidScoreEventAction`/
    `correctScoreEventAction` Prisma transactions have not been exercised against a live
    database by an automated test. Standing this up would need a disposable test database
    (docker-compose Postgres or a Neon/Supabase branch) wired into CI, plus fixture
    setup/teardown per test - worth doing before this scoring path carries a second real
    tournament's worth of live data.
- **Full wrong-player correction UI.** The server action supports it; the scorer console's
  "Correct" form doesn't have a player picker yet (see
  [live-scorer-ultra-time-operations.md](live-scorer-ultra-time-operations.md) for the current
  two-step workaround).
- **Automatic Ultra Time transition ticking.** Transitions are detected the next time any
  action touches the game, not on a live timer - fine for a scorer-driven console, not fine for
  a fully autonomous clock-driven broadcast trigger. A background job or a
  clock-tick-triggered check would close this gap.
- **Full FIBA box score automation.** Confirmed, not assumed: this specific PDF export format
  silently drops blank/zero cells in a way that makes the counting-stat block (rebounds,
  assists, turnovers, steals, blocks, fouls, +/-, efficiency) and the combined 2PT/3PT token
  stream unsafe to positionally parse. See
  [fiba-box-score-parser-guide.md](fiba-box-score-parser-guide.md). Manual transcription with
  arithmetic pre-flight validation remains the correct workflow for those fields.
- **The remaining API surface** the original spec sketched
  (`/games/{id}/rules`, `/events`, `/play-by-play`, import dry-run/confirm endpoints). Only
  `/data-capabilities` and `/box-score` were built this pass, plus updating the existing
  broadcast endpoint to be rule-snapshot-aware. Scoped down deliberately rather than shipping
  four more thin, unexercised routes in the time available.
- **A `statSource` backfill for the 11 already-imported Season Zero games** (they predate the
  column). See [data-capability-and-provenance.md](../architecture/data-capability-and-provenance.md).

## Recommended next phase, in priority order

1. Backfill `statSource` on the 11 real Season Zero games (five-minute SQL script, listed
   above) - closes a real, known data gap at near-zero risk.
2. Stand up a disposable-Postgres integration test harness and add the DB-level correction/void
   tests this pass could only cover at the pure-function level.
3. Wrong-player correction UI (the backend already supports it).
4. Assist attribution UI for 4PT makes, since `assistedFourPointMakes`/
   `unassistedFourPointMakes` are currently permanently null for every game.
5. Resolve the two known Season Zero data gaps that need a human call (unrostered real players,
   3 cross-club discrepancies - see
   [season-zero-import-reconciliation.md](season-zero-import-reconciliation.md)) before they're
   forgotten.
