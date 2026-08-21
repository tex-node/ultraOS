# Ultra canonical scoring model

How Ultra Basketball's rules (4PT shots, Ultra Time's ×2 multiplier) are represented and
enforced server-side, and how that coexists with the 11 real Season Zero games that were
imported from external box scores before any of this existed.

## Why this exists

Before this work, `src/lib/game-rules.ts` hardcoded `ULTRA_RULES` as a single global constant
and `recordScore` (`src/app/games/actions.ts`) computed the Ultra Time multiplier itself but
had no way to represent "this game's rules differ from the default" or "4PT is disabled for
this game." Every Season Zero game was also either live-scored under that single hardcoded
config or imported from a PDF that has no visibility into Ultra's custom rules at all. Season
One needs rules to be versioned and frozen per game, not a single mutable global.

## RuleSet / GameRuleSnapshot

- **`RuleSet`** (`prisma/schema.prisma`) — a named, versioned, season-scoped rule
  configuration (period count/duration, 4PT enabled + base value + definition type, Ultra Time
  enabled + multiplier + start-remaining-seconds + final-period-only flag, mandatory
  substitution policy). Editable while unused; league operators create/version these.
- **`GameRuleSnapshot`** — a full, duplicated copy of every `RuleSet` field, one row per
  `Game`, created at game start. Not just a foreign key: `ruleSetId` has `onDelete: SetNull`,
  so deleting or editing the source `RuleSet` later can *never* retroactively change how an
  already-played game is scored or displayed. This is the mechanism that makes "immutably
  frozen historical rules" real rather than aspirational.
- Any `Game` with **no** `GameRuleSnapshot` (every Season Zero game, and any game created
  before this migration) scores under `LEGACY_RULE_SNAPSHOT` in
  `src/lib/ultra-scoring-engine.ts` — a reshaping of the old hardcoded `ULTRA_RULES` constant.
  Nothing about existing games' scoring behavior changes.

## UltraScoringEngine (`src/lib/ultra-scoring-engine.ts`)

Pure functions, no Prisma, no I/O — deliberately, so they're trivially unit-tested
(`ultra-scoring-engine.test.ts`) and safe to call from any future code path (API routes, a
native mobile scorer, etc.) without dragging a database connection along.

- **`scoreShot(input)`** — the server-authoritative core. Given a rule snapshot, a raw shot
  value (1-4, or negative for a manual correction), and game clock/period state, it
  independently derives the multiplier and rejects anything invalid:
  - `shotValue` outside `[-4, 4]` or `0` → `INVALID_SHOT_VALUE`.
  - `shotValue === 4` when `rules.fourPointEnabled === false` → `FOUR_POINT_DISABLED`.
  - A manual correction (`shotValue <= 0`) is never multiplied and never 4PT-gated - it isn't
    claiming a shot happened.
  - The multiplier is **always** computed from `isUltraTimeUnderRules`, never trusted from a
    caller - this is what makes a client-forged "×2 outside Ultra Time" impossible.
- **`isUltraTimeUnderRules`** / **`detectUltraTimeTransition`** - Ultra Time is inferred fresh
  from the clock on every read, but `detectUltraTimeTransition` compares that against the last
  *persisted* state (`Game.isUltraTimeActive`) so the write path can emit an explicit
  `ULTRA_TIME_STARTED`/`ULTRA_TIME_ENDED` ledger event exactly when the boundary is crossed,
  not just leave it something a reader has to re-derive. See
  [game-event-ledger.md](game-event-ledger.md).
- **`shotStatDeltas` / `negateShotStatDeltas` / `addShotStatDeltas`** - per-shot stat category
  deltas (FG/2PT/3PT/4PT/FT made+attempted, each split by Ultra Time or not). Negating and
  re-applying these is exactly how a void or correction reverses/reapplies a shot's effect on
  `PlayerStat`/`TeamStat` without ever recomputing from scratch. See
  [data-capability-and-provenance.md](data-capability-and-provenance.md).
- **`replayScore`** - sums `points` over `ACTIVE`-status events per side. This is the
  event-replay invariant the whole correction design relies on: a corrected event moves to
  `CORRECTED` (excluded) and its replacement is `ACTIVE` (included), so summing status-filtered
  events always reproduces the current persisted score.

## What's deliberately unchanged

`game-rules.ts` and the pre-existing `recordScore` control flow were **not** rewritten. The
engine was wired in as the source of the multiplier/validity decision inside the existing
transaction (`src/app/games/actions.ts`), not as a parallel competing code path - there is one
scoring implementation, not two that could drift apart. This was a deliberate choice made this
close to a real event with real, already-imported production data: the risk of a full rewrite
outweighed the architectural tidiness of one.
