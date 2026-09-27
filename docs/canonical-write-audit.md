# Canonical Write Audit (P13 / A3a)

Generated: 2026-09-27
Method: scripted scan of `web/src/app/games/*.ts` for
`tx.(gameEvent|playerStat|teamStat|game).(create|createMany|upsert|update)` call sites.

**Why this exists.** The A3 brief assumed a single HTTP route handler owning the canonical write.
Reality: the write path is **20 inline server-action sites** across two files, with **no service
layer**. This audit classifies every site so A3a consolidates only what sync replays, and the rest
is documented as known debt rather than silently refactored (or silently forgotten).

## Baseline triage (A3a ratchet)

The ESLint canonical-write guard flags **36** existing sites. Triaged into buckets:

| Bucket | Count | Sites | Handling |
| --- | --- | --- | --- |
| **A — exclude** | 0 | (no tests/seeds/scripts were flagged; guard `files` scope is `src/**` and generated code is ignored) | Explicit ignore list added anyway |
| **B — fixed by A3a** | ~29 | the create/flip sites that collapse to `createGameEvent` | Migrate, pruning the baseline per batch |
| **C — deferred debt** | ~7 | legacy `playerStat`/`teamStat` direct writes (`actions.ts` 112/135/1092/1097/1120; `stats-actions.ts` 877/908), `game-result-import.ts` 265/294 | Baseline with owner + target phase |

**Bucket C owners / target phases:**

| Site | Owner | Target phase |
| --- | --- | --- |
| `actions.ts` 112/135 (`applyPlayerShotStatDeltas`/`applyTeamShotStatDeltas`) | A3a (projection) | when `projectPlayerStats.ts` lands |
| `actions.ts` 1092/1097/1120 (undo reversals) | A3a | with the projection batch |
| `stats-actions.ts` 877/908 (`rebuildGameStatsFromEvents`) | A3a | this becomes the recompute entry point; stays the sole legitimate writer |
| `game-result-import.ts` 265/294 | imports track | not P13 scope |

**Baseline mechanics:** ESLint 9 native suppression (`eslint-suppressions.json`), keyed by
**file + rule + count** (never line numbers — they churn). `scripts/canonical-write-baseline.json`
sets a ceiling the CI check (`scripts/check-canonical-write-baseline.mjs`) enforces: the count may
shrink, never grow.

## Batch plan (Bucket B)

Unit of a batch = "sites that collapse to the same service-call shape," not file or count.

- **Batch 0 (template PR):** extract `createGameEvent` + migrate ONE low-risk site; establishes the
  service signature, the `server-only` boundary, and the characterization-test pattern.
- **createGameEvent track** (grouped by side-effect profile): plain creates (3–5/PR) → + audit
  (2–3/PR) → + stat recompute (1/PR).
- **createGame track** (see the open question below).

Realistic total: **8–14 PRs** for Bucket B. Bucket C is separate.

## Open question before extracting `createGame`

Measured: the only Game-row creation is `startGame` (`actions.ts:215`, `game.upsert` by `fixtureId`)
and `game-result-import.ts:223`. Nothing pre-creates Games at schedule time — so an offline
scorekeeper creates the Game **on the device**, which forces **ID reconciliation** at sync time
(local game id → canonical cuid, remapping every event's `gameId`).

Because `Game` is keyed by `fixtureId` (unique), the server can resolve the canonical Game by
fixture at sync time. Two options:

1. **Device-creates + reconcile:** extract `createGame`, scope it to the sync replay surface
   (creation + status transitions only), and remap event `gameId`s on sync.
2. **Server-pre-creates:** create the Game when the fixture is scheduled; the device only sends
   status transitions (`updateGameStatus`). No ID reconciliation; A3b is much simpler.

Option 2 eliminates a whole class of sync complexity. Decide before extracting `createGame`.


## Buckets

| Bucket | Meaning | A3a action |
| --- | --- | --- |
| **IN** | Reachable by a live user flow that sync will replay (Game, GameEvent) | Extract into `src/server/scoring/`, refactor the site |
| **DERIVED** | PlayerStat/TeamStat writes | Consolidate into `src/server/scoring/projectPlayerStats.ts` (the only legitimate writer) |
| **ADMIN/SEED** | Legitimate direct writes not reachable by sync | Leave; register as bypass |
| **ADJACENT** | Fixture/Team/other entities sync doesn't replay | Leave; consolidate in a later phase |
| **VISION** | Vision promotion path | Deferred to B4 (will use the service once it exists) |

## Sites — `web/src/app/games/actions.ts` (scorer console)

| Line | Function | Write | Bucket | Notes |
| --- | --- | --- | --- | --- |
| 66 | (module helper) | `game.update` | IN | shared game-state helper |
| 70 | (module helper) | `gameEvent.create` | IN | **service target** |
| 112 | `applyPlayerShotStatDeltas` | `playerStat.upsert` | DERIVED | incremental counters; becomes projection |
| 135 | `applyTeamShotStatDeltas` | `teamStat.upsert` | DERIVED | |
| 215 | `startGame` | `game.upsert` | IN | game creation/start |
| 304 | `pauseGame` | `game.update` | IN | |
| 329 | `resumeGame` | `game.update` | IN | |
| 362 | `advancePeriod` | `game.update` | IN | |
| 393/398/406 | `controlShotClock` | `game.update` | IN | |
| 514 | `recordScore` | `game.update` | IN | |
| 518 | `recordScore` | `gameEvent.create` | IN | **service target** |
| 632 | `voidScoreEventAction` | `gameEvent.update` | IN | status flip (CORRECTED/VOIDED) |
| 745/755/756 | `correctScoreEventAction` | `gameEvent.update`, `game.update`, `gameEvent.create` | IN | **service target** (supersession) |
| 911/913/932 | `recordStatEvent` | `game.update`, `gameEvent.create`, `playerStat.upsert` | IN + DERIVED | **service target** |
| 1000 | `finalizeGame` | `game.update` | IN | |
| 1078/1092/1097/1104/1120 | `undoLastEvent` | `gameEvent.create`, `playerStat.update`, `teamStat.upsert` | IN + DERIVED | **service target** (reversal events) |
| 1160 | `reopenGame` | `game.update` | IN | |
| 1211/1217 | `recordIncident` | `game.update` | ADJACENT | incidents, not sync-replayed |
| 1356/1358 | `recordSportEvent` | `game.update`, `gameEvent.create` | IN | **service target** (multi-sport) |
| 1507/1508/1535/1552/1558 | `recordScoringEvent` | `game.update`, `gameEvent.create` | IN | **service target** (multi-sport) |
| 1645/1646/1674/1680 | `recordShootoutKick` | `game.update`, `gameEvent.create` | IN | **service target** (multi-sport) |

## Sites — `web/src/app/games/stats-actions.ts` (statistician console)

| Line | Function | Write | Bucket | Notes |
| --- | --- | --- | --- | --- |
| 71/85 | (helpers) | `game.update` | IN | verification-stamp clearing |
| 183 | `recordStatisticianShot` | `gameEvent.create` | IN | **service target** |
| 281 | `recordStatisticianStat` | `gameEvent.create` | IN | **service target** |
| 359 | `recordSubstitution` | `gameEvent.create` | IN | **service target** |
| 442 | `recordWaveSubstitution` | `gameEvent.create` | IN | **service target** |
| 494 | `voidStatisticianEvent` | `gameEvent.update` | IN | status flip |
| 543 | `recordGameTimeout` | `gameEvent.create` | IN | **service target** |
| 596 | `recordJumpBall` | `gameEvent.create` | IN | **service target** |
| 634 | `flipPossession` | `gameEvent.create` | IN | **service target** |
| 685 | `verifyScoreboard` | `gameEvent.create` | IN | **service target** |
| 785 | `undoLastStatisticianEvent` | `gameEvent.update` | IN | status flip |
| 877/908 | `rebuildGameStatsFromEvents` | `playerStat.upsert`, `teamStat.upsert` | DERIVED | **the** derive; sole legitimate PlayerStat writer |
| 959 | `verifyStatistics` | `game.update` | IN | verification gate |
| 1050/1052/1063/1068/1074 | `correctStatisticianEventPostFinal` | `game.update`, `gameEvent.create`, `gameEvent.update` | IN | **service target** (supersession) |

## A3a in-scope service targets (the sites that become `createGameEvent`/`createGame` callers)

**createGameEvent (create sites)** — 11:
`actions.ts` 70, 518, 756, 913, 1078, 1104, 1358, 1508, 1558, 1646, 1680
`stats-actions.ts` 183, 281, 359, 442, 543, 596, 634, 685, 1052

**createGame / game lifecycle (upsert + create)** — `actions.ts` 215 (`startGame`), plus the
`game.update` sites that are part of event recording.

**Event status flips (update)** — 4: `actions.ts` 632, 745; `stats-actions.ts` 494, 785, 1063,
1068. Consolidate into `createGameEvent`'s supersession helper or a sibling `voidGameEvent`.

**DERIVED (PlayerStat/TeamStat)** — `stats-actions.ts` `rebuildGameStatsFromEvents` (877/908) is
the sole source of truth. `actions.ts` 112/135/1092/1097/1120 are the incremental scorer writes
that A3a moves behind `projectPlayerStats.ts`.

## Out of A3a scope (documented debt)

- **ADJACENT:** `recordIncident` game-status writes; all Fixture/Team/Athlete writes elsewhere
  (not scanned here — no `tx.gameEvent`/`tx.game` in this file set).
- **ADMIN/SEED:** `web/scripts/*` seeders and admin overrides — legitimate direct writes, not
  reachable by scoring sync.
- **VISION:** `src/lib/vision/**` promotion path — B4 will call `createGameEvent` with
  `source: 'VISION_PROMOTED'` (and per the signed-off boundary, B4 stays review-only, so this is
  the seam, not an implementation).
- **Other entity writes** outside `web/src/app/games/` — not audited here.

## The guard (A3a deliverable)

Once `src/server/scoring/` exists, `prisma.gameEvent.create|createMany` and
`playerStat.upsert|createMany` are permitted **only** under `src/server/scoring/**`. Enforcement:
ESLint `no-restricted-syntax` (author-time) with a CI grep fallback. Without it, the 21st write
site appears within a month.

## Roadmap correction

A3 was one phase on paper. It is two in reality: **A3a** (consolidation, no migration) and
**A3b** (sync endpoint, one migration). Recorded in `documentation/PRODUCT_ROADMAP.md`.
