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
| `actions.ts` 112/135 (`applyPlayerShotStatDeltas`/`applyTeamShotStatDeltas`) | Batch S | **superseded, see below** - relocate into `src/server/scoring/**` as a primitive; the incremental model stays, does not converge onto `rebuildGameStatsFromEvents` |
| `actions.ts` 1092/1097/1120 (undo reversals) | Batch S | with the relocation above |
| `stats-actions.ts` 877/908 (`rebuildGameStatsFromEvents`) | done | the statistician console's own recompute entry point - **not** "the sole legitimate writer" project-wide, see "Open question before A3b" below: this line assumed a single-model canonical that the dual-authority finding (Batch S reading) contradicts |
| `game-result-import.ts` 265/294 | imports track | not P13 scope |

**Baseline mechanics:** ESLint 9 native suppression (`eslint-suppressions.json`), keyed by
**file + rule + count** (never line numbers — they churn). `scripts/canonical-write-baseline.json`
sets a ceiling the CI check (`scripts/check-canonical-write-baseline.mjs`) enforces: the count may
shrink, never grow.

## Batch plan (Bucket B)

Unit of a batch = "sites that collapse to the same service-call shape," not file or count.

**Actual bucket sizes (updated after Batches 0-6):**

| Bucket | Sites | Status |
| --- | --- | --- |
| **Statistician console - event-only** | 8 | 8 migrated (flipPossession, recordJumpBall, recordGameTimeout, verifyScoreboard, recordStatisticianStat, recordStatisticianShot, recordSubstitution, recordWaveSubstitution) — all done |
| **Statistician console - sibling service (supersession)** | 1 | Migrated (Batch 7): correctStatisticianEventPostFinal → `correctStatisticianEvent`, not a `createGameEvent` caller |
| **Statistician console - status flips** | 2 | Migrated (Batch 8): voidStatisticianEvent, undoLastStatisticianEvent → `voidGameEvent`, on `withGameWrite` (mutable gate) — statistician console is fully migrated |
| **Scorer console - event-only** | 11 | Pending (Ultra Time helper, recordScore, correctScoreEventAction, ...) |
| **Scorer console - status flips** | 2 | Pending (voidScoreEventAction, correctScoreEventAction) |
| **Scorer console - direct stat writes (model correction)** | 5 | Pending - Batch S (applyPlayerShotStatDeltas, applyTeamShotStatDeltas, recordStatEvent, undoLastEvent) |
| **Multi-entity writes** | 3+ | 1 migrated (recordWaveSubstitution); 2+ pending |

**Batch progression:**
- **Batch 0 (template PR):** extract `createGameEvent` + migrate ONE low-risk site; establishes the
  service signature, the `server-only` boundary, and the characterization-test pattern. ✅ Done
- **Batch 1:** reshape service to own full canonical write (lock, mutable check, verification-stamp
  clearing, sequence, clock, validation, insert); migrate flipPossession. ✅ Done
- **Batch 2:** migrate recordJumpBall (plain create). ✅ Done
- **Batch 3:** migrate recordGameTimeout + verifyScoreboard (audit log sites). ✅ Done
- **Batch 4:** migrate recordStatisticianStat (statistician console, event-only, simple shape). ✅ Done
- **Batch 5:** migrate recordStatisticianShot + recordSubstitution (single event + upstream validation). ✅ Done
- **Batch 6:** migrate recordWaveSubstitution (multi-event, design question first). ✅ Done
- **Batch S (model correction):** refactor scorer console sites to use createGameEvent + rebuildGameStatsFromEvents, remove direct PlayerStat/TeamStat writes

Realistic total: **10-14 PRs** for Bucket B + Batch S. Bucket C is separate.

**Key findings:**
- verifyScoreboard derives TeamStat for comparison but doesn't write it. TeamStat is derived like
  PlayerStat (not direct-written). The derivation is only for the verification check, not for
  persistence. This simplifies the migration: verifyScoreboard is event-only + audit log, no
  TeamStat write needed.
- Scorer console sites (recordScore, recordStatEvent, undoLastEvent) write PlayerStat/TeamStat
  directly, contradicting the "stats are derived" model. This is a model correction (Batch S),
  not just a migration. Each site should write its event via createGameEvent, then call
  rebuildGameStatsFromEvents(gameId, tx) to derive stats. Direct stat writes are deleted.

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

## Open question before A3b: which stat model does sync replay apply?

**Surfaced while sketching Batch S** (deciding the fate of `applyPlayerShotStatDeltas`/
`applyTeamShotStatDeltas`), not a Batch S question itself - an A3a/A3b boundary question this
project has been quietly assuming an answer to without stating it.

**The premise A3a inherited, stated in Batch 0's decisions:** *"PlayerStat is DERIVED, not
synced... PlayerStat/TeamStat are recomputed server-side from the canonical event ledger."* This
row in the original bucket-C plan made the assumption explicit: `rebuildGameStatsFromEvents`
"becomes the recompute entry point; **stays the sole legitimate writer**." That's a single-model
assumption - one canonical derivation, everything converges on it.

**What reading the scorer/statistician consoles for Batch S found:** there isn't one canonical
model, there are two, and the split is deliberate, not incidental. `stats-actions.ts`'s own header:
*"The scorer's console remains the sole write path for the official score and the canonical box
score; the statistician's ledger exists purely as an independently-derived cross-check... the
safest way to add a second, genuinely independent set of eyes without risking a
duplicate/competing scoring truth."* `reconciliation.ts`: *"reconciliation between the two
independently-operated live consoles... deliberately does not auto-resolve a mismatch in either
direction."* Both models were introduced together, in the same founding commit - this is an
N-version-programming safety property, not a historical wart to migrate away from.

**The tension this creates for A3b's replay design:** the outbox syncs `Game` + `GameEvent` only
(Batch 0's decision); the server has to reconstruct `PlayerStat`/`TeamStat` from that ledger during
replay. Which model does it apply?

1. **Replay rebuilds via `rebuildGameStatsFromEvents`** — applies the statistician's model
   server-side. The scorer's incremental authority becomes a client-side-only fiction; the server
   never actually maintains it as its own thing.
2. **Replay reapplies the scorer's incremental deltas in event order** — applies the scorer's
   model. But then server-side `PlayerStat` is not "derived from events" in the sense Batch 0
   meant - it's derived from an *ordered application of deltas*, a different operation with
   different failure modes (replay order now matters for a sum that should be order-independent).
   Batch 0's "stats are derived" framing was written assuming one model; it needs re-reading
   against this path specifically.
3. **Replay maintains both and reconciles server-side** — preserves the dual-authority
   architecture faithfully, but is a materially bigger sync design than A3a has assumed anywhere
   so far (two recomputations per replay, a reconciliation check, a decision about what happens
   on a genuine mismatch mid-sync).

**Not resolved here.** This decision shapes A3b's replay design, the sync payload shape, and
whether Batch 0's "derived" framing stands as originally written or needs a qualifying note for
the scorer path specifically. Sketch and decide before A3b starts, with the same rigor as the
`createGame` question above - this is now the load-bearing open question for that phase, not
Batch S's.

## Post-migration issue: `data` field null semantics

**Status:** Logged, not fixed. Fix after all sites migrate.

The original sites leave `data` as SQL NULL when absent. The service preserves this behavior
(`data: input.data ?? undefined` → Prisma omits the field → SQL NULL). However, SQL NULL and
JSONB-null (`Prisma.JsonNull`) are semantically different:

- `WHERE data IS NULL` matches SQL NULL
- `WHERE data = 'null'::jsonb` matches JSONB-null

If downstream code treats them differently, the original sites may have a latent bug. After all
sites migrate, audit whether any code queries the `data` field and whether it expects SQL NULL or
JSONB-null. If a fix is needed, it happens once in the service (change `undefined` to `Prisma.JsonNull`),
not per-site.

**Action:** Add a follow-up issue or TODO in the service: "Audit `data` field null semantics after
migration complete."


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
| 183 | `recordStatisticianShot` | `gameEvent.create` | IN | **migrated** (Batch 5) |
| 281 | `recordStatisticianStat` | `gameEvent.create` | IN | **service target** |
| 359 | `recordSubstitution` | `gameEvent.create` | IN | **migrated** (Batch 5) |
| 442 | `recordWaveSubstitution` | `gameEvent.create` | IN | **migrated** (Batch 6) |
| 498 | `voidStatisticianEvent` | (none — calls `voidGameEvent`) | IN | **migrated** (Batch 8, `voidGameEvent` — status-flip service) |
| 543 | `recordGameTimeout` | `gameEvent.create` | IN | **migrated** (Batch 3) |
| 596 | `recordJumpBall` | `gameEvent.create` | IN | **migrated** (Batch 2) |
| 634 | `flipPossession` | `gameEvent.create` | IN | **migrated** (Batch 1) |
| 685 | `verifyScoreboard` | `gameEvent.create` | IN | **migrated** (Batch 3) |
| 794 | `undoLastStatisticianEvent` | (none — calls `voidGameEvent`) | IN | **migrated** (Batch 8, `voidGameEvent` — status-flip service) |
| 877/908 | `rebuildGameStatsFromEvents` | `playerStat.upsert`, `teamStat.upsert` | DERIVED | **the** derive; sole legitimate PlayerStat writer |
| 959 | `verifyStatistics` | `game.update` | IN | verification gate |
| 1036 | `correctStatisticianEventPostFinal` | (none — calls `correctStatisticianEvent`) | IN | **migrated** (Batch 7, sibling service — see "Sites that don't fit `createGameEvent`") |

## A3a in-scope service targets (the sites that become `createGameEvent`/`createGame` callers)

### Statistician console (event-only, simple migration)

These sites only create game events. No stat writes. File header (line 130) confirms: "does not touch Fixture.homeScore/awayScore or PlayerStat/TeamStat".

**createGameEvent (create sites)** — 8:
`stats-actions.ts` 183 (recordStatisticianShot), 281 (recordStatisticianStat), 359 (recordSubstitution), 442 (recordWaveSubstitution), 543 (recordGameTimeout), 596 (recordJumpBall), 634 (flipPossession), 685 (verifyScoreboard)

**Event status flips (`voidGameEvent`, not `createGameEvent`)** — 2: `stats-actions.ts` 498 (voidStatisticianEvent), 794 (undoLastStatisticianEvent), migrated in Batch 8 — see "Sites that don't fit `createGameEvent`" below.

**Sibling service (not a `createGameEvent` caller)** — `stats-actions.ts` 1036 (correctStatisticianEventPostFinal), migrated in Batch 7 to `correctStatisticianEvent` — see "Sites that don't fit `createGameEvent`" below.

**Statistician console: fully migrated as of Batch 8.** All 11 sites now route through one of the three canonical services below.

### Sites that don't fit `createGameEvent`

Not every canonical write is a parameterization of "insert one event into a mutable game." A3a's statistician-console migration surfaced three distinct write shapes, not one — this section documents the two that aren't `createGameEvent` itself.

**`correctStatisticianEvent`** (Batch 7) — `correctStatisticianEventPostFinal` needed a FINAL-only gate (the opposite of `createGameEvent`'s mutable-game check), a mutation of an existing `GameEvent` row rather than a plain insert, and a VOID mode that creates no event at all. Rather than bolting an `allowPostFinal` escape hatch onto `createGameEvent`, this became a sibling service under the same `src/server/scoring/**` boundary:

- `load-final-game.ts` / `loadFinalGameForCorrection` — the FINAL-only counterpart to `loadMutableGame`, same `FOR UPDATE` lock on Fixture, opposite status assertion. Its own (unconditional) verification-stamp reset — deliberately not shared with `loadMutableGame`'s conditional, separately-audited version; they're different operations, not one operation expressed two ways.
- `with-final-game-write.ts` / `withFinalGameWrite` — mirrors `withGameWrite` exactly, so the two service shapes share a calling convention.
- `correctStatisticianEvent.ts` / `correctStatisticianEvent` — the mutation itself, discriminated on `mode: "REPLACE" | "VOID"` in both input and output so a caller can't lose track of which branch ran.
- `sequence.ts` / `assignNextSequence` — the one primitive genuinely shared with `createGameEvent` (sequence-counter increment; was duplicated inline in both places before Batch 7).

**`voidGameEvent`** (Batch 8) — `voidStatisticianEvent` and `undoLastStatisticianEvent` are both pure status-flips to `VOIDED`, under the *mutable* (LIVE/PAUSED) gate — not FINAL, so they don't fit `correctStatisticianEvent` either; forcing them through it would have meant a which-gate parameter, the shape-mixing failure this whole split exists to avoid. They differ from each other only in target selection (explicit `eventId` vs. "most recent `ACTIVE`") and audit action/reason literal — a difference in caller policy, not in the write itself, so one thin service serves both:

- `voidGameEvent.ts` / `voidGameEvent` — takes an already-resolved `eventId` and trusts it: the caller resolves the target inside the same transaction, under the same Fixture `FOR UPDATE` lock `withGameWrite` already took, so nothing can change between resolution and write. No redundant re-lookup.
- Deliberately source-agnostic. "Only statisticians can void statistician events" is an authorization/selection question, answered by the caller's own scoped lookup (`{ id, gameId, source: STATISTICIAN_SOURCE, status: "ACTIVE" }`), not baked into the service — so a future scorer-console void can reuse `voidGameEvent` without inheriting a statistician-only restriction.
- Uses the existing `withGameWrite`/`loadMutableGame` mutable gate directly; no new wrapper needed, since this shape's gate already existed for `createGameEvent`.

**Three canonical-write service shapes, and (for the statistician console) no fourth needed:** `createGameEvent` (insert, mutable gate), `correctStatisticianEvent` (insert-or-mutate, FINAL-only gate), `voidGameEvent` (mutate-only, mutable gate). Any future site that turns out to be a distinct shape (e.g. the scorer console's `undoLastEvent` in Batch S, once its stat-write model is corrected) should first be checked against these three before assuming it needs a fourth.

**Fourth shape, found in the scorer console, deferred to Batch S:** `correctScoreEventAction` (`actions.ts` ~699) is a supersession (mark original `CORRECTED`, insert a replacement with `supersedesEventId`) under the *mutable* (LIVE/PAUSED) gate, with the original/replacement's incremental `PlayerStat`/`TeamStat` deltas reversed and reapplied inline, and no VOID mode at all (voiding a score event is the wholly separate `voidScoreEventAction`). This is not `correctStatisticianEvent` parameterized differently — it differs on gate (mutable vs FINAL), on stat coupling (inline reversal vs none), and on mode (REPLACE-only). Candidate service: `correctScoreEvent` under `withGameWrite`, with the stat-delta reversal as a callback-owned concern once Batch S replaces the incremental-write model with something derived. Not sketched yet — this note is a placeholder for that sketch, not a design.

**Known issue, independent of any migration — `assertGameIsMutable` gap:** `voidScoreEventAction` and `correctScoreEventAction` (`actions.ts`) call `assertGameIsMutable` (rejects FINAL/CANCELLED/POSTPONED) but skip the additional `if (game.status !== "LIVE" && game.status !== "PAUSED")` check every sibling scorer-console function has right after it (`recordScore`, `recordStatEvent`, `recordSportEvent`, `recordScoringEvent`, `recordShootoutKick` all have it). Whether this is a genuine gap (a game in some other non-FINAL, non-LIVE/PAUSED status could be voided/corrected when it shouldn't be) needs its own read and, if real, its own PR with its own test — not bundled into a migration, so a future bisect can tell a shape change from a behavior change.

**Known issue, wider than A3a — `organizationId` DB default.** `GameEvent.organizationId` (and dozens of other models' — the same `@default(dbgenerated("'cmt4odhgn0000wokk8fbwr6ro'"))`, the fixed Neon Ultra organization id, appears across the schema) has a schema-level default that silently fills in Neon Ultra's own org id whenever an insert omits the field. `syncUltraTimeState`'s pre-migration raw `tx.gameEvent.create` (Batch 9b) omitted `organizationId` entirely and relied on this default - meaning every Ultra Time transition event for any organization *other than* Neon Ultra would have been silently miscoded to Neon Ultra's org id, a tenant-isolation bug, not just an incompleteness. Migrating this one call site to `createGameEvent` fixes it as an unavoidable consequence (the service always sets `organizationId` from `ctx.actor.organizationId` explicitly - there's no way to opt out and keep the old defaulted behavior even if that were desired). Not touched here beyond this one call site: the schema-wide default spans models far outside A3a's scope and is a separate concern, most likely a holdover from the pre-multi-tenancy retrofit that RLS-fallback-elimination work was already chasing down elsewhere. Production audit (2026-09-27): zero cross-organization mismatches found on `GameEvent`, `PlayerStat`, `TeamStat`, `Fixture`, or `Player` - latent, not actualized, but not exhaustively checked across every one of the ~120 models carrying this default. Tracked as [tex-node/ultraOS#1](https://github.com/tex-node/ultraOS/issues/1), its own phase, deliberately not folded into A3a or Batch S.

**Invariant: terminal event ordering.** A `GAME_ENDED` (or equivalent terminal) event must be created *before* the game/fixture status flips to `FINAL`, within the same transaction — never after. Reason: `createGameEvent`'s mutable-gate check rejects a `FINAL` game, and read-your-own-writes within a Postgres transaction means a status flip earlier in the same transaction is already visible to a canonical write later in it. `recordScoringEvent` and `recordShootoutKick`'s finalize branches originally created `GAME_ENDED` *after* both status flips (harmless while the write was a raw `tx.gameEvent.create`, fatal once it routes through `createGameEvent`) - reordered as a standalone, no-op-on-final-state commit ahead of their A3a migration (Batch 9a). Verified no-op: every field in the terminal event is already computed earlier in the function (never re-derived from the game's post-flip status), nothing between the old and new position reads `game.status`/`fixture.status` (`advanceKnockoutBracket` only touches `division`/bracket structure, never the event ledger or status), and `recalculateStandings`'s position relative to the flip is unchanged - only the event create moved. Same problem shape as `correctStatisticianEventPostFinal` needing `loadFinalGameForCorrection` (both are "a canonical write needs to happen relative to a FINAL boundary"), different solution: a correction needs its own FINAL-gated service; a terminal event just needs to happen while the game is still mutable, one line earlier. Any future finalize path must follow this ordering, or it will work today and break silently the day someone adds a terminal event to it.

### Scorer console (event + stat writes, model correction needed)

These sites write PlayerStat/TeamStat directly, contradicting the "stats are derived" model. This is a model correction (Batch S), not just a migration.

**createGameEvent (create sites)** — 11:
`actions.ts` 70 (Ultra Time helper), 518 (recordScore), 756 (correctScoreEventAction), 913 (recordStatEvent), 1078/1104 (undoLastEvent), 1358 (recordSportEvent), 1508/1558 (recordScoringEvent), 1646/1680 (recordShootoutKick)

**Event status flips (update)** — 2: `actions.ts` 632 (voidScoreEventAction), 745 (correctScoreEventAction)

**Direct stat writes (model correction)** — 5:
- `actions.ts` 112 (`applyPlayerShotStatDeltas`) — playerStat.upsert
- `actions.ts` 135 (`applyTeamShotStatDeltas`) — teamStat.upsert
- `actions.ts` 932 (`recordStatEvent`) — playerStat.upsert
- `actions.ts` 1092/1120 (`undoLastEvent`) — playerStat.update
- `actions.ts` 1097 (`undoLastEvent`) — teamStat.upsert

### createGame / game lifecycle (upsert + create)

`actions.ts` 215 (`startGame`), plus the `game.update` sites that are part of event recording.

### DERIVED (PlayerStat/TeamStat) — sole legitimate writer

`stats-actions.ts` `rebuildGameStatsFromEvents` (877/908) is the sole source of truth. Called by `verifyStatistics` (line 963). All other PlayerStat/TeamStat writes are legacy and will be removed in Batch S.

**Derivation call graph (verified Batch 3):**

All derivation uses the same functions from `src/lib/event-derived-stats.ts`:
- `derivePlayerStats(events)` → `Map<string, DerivedPlayerStats>`
- `deriveTeamStats(playerStats)` → `Map<string, DerivedTeamStats>`
- `deriveTeamScore(teamStats, seasonClubId)` → `number`

**Writers** (only one):
- `rebuildGameStatsFromEvents` (stats-actions.ts:868) — called by `verifyStatistics` (line 963)
  - This is the ONLY function that writes PlayerStat/TeamStat rows
  - Uses `derivePlayerStats` (line 879) and `deriveTeamStats` (line 911)

**Readers** (comparison/display only, no writes):
- `verifyScoreboard` (stats-actions.ts:688-690) — derives for comparison, doesn't write
- `verifyStatistics` (stats-actions.ts:829-831, 954-956) — derives for comparison, doesn't write
- `live-game-snapshot-v2.ts` (lines 150-160) — read-only snapshot generation

**Alignment:** All readers and the writer use the SAME derivation functions. No divergence risk.
Sync's replay path will call `rebuildGameStatsFromEvents(gameId, tx)` post-batch, same shape as
the live path.

## Replay vs. live differences

Live callbacks may validate against current state; replay must not. This is the highest-value
finding from Batch 5.

**Example: causedByEventId validation**

recordStatisticianShot validates that the referenced foul exists and has status: "ACTIVE" (line 167).
This is correct for live writes, where "was this foul undone?" is a real-time question. But it means
replay semantics differ from live semantics.

**Scenario:** scorekeeper logs foul at 12:30, logs linked FT at 12:31, device goes offline. Admin
on the server voids the foul at 13:00. Device syncs at 14:00. The FT's link validation fails — not
because the data is wrong, but because server state moved between write time and replay time.

**Three semantic choices for A3b:**

1. **Strict** — replay validates against current server state. Offline writes can fail for reasons
   the scorekeeper couldn't have known. Correct but harsh.

2. **Historical** — replay validates only that the referenced event exists, ignoring status. Lets
   the FT link, and the derivation handles the voided foul downstream (if rebuildGameStatsFromEvents
   skips FT events with voided parents, which it must).

3. **Timestamp-scoped** — replay validates against state as of clientUpdatedAt. Complex, probably
   not worth it.

**Decision:** Historical is almost certainly right. The canonical write is the FT; whether the foul
is later undone is a derivation concern, not a write-time concern. The strict check exists because
in the live path the callback was protecting against the scorekeeper linking to a foul they'd just
undone — a UI-level correctness guard, not a data-integrity one.

**Implementation:** The callback needs to know which mode it's in (live vs. replay), or the
validation moves to the caller and the service stays pure. For A3b, the sync endpoint should skip
status checks on cross-event FKs and let the derivation handle voided parents.

**Pattern established:** Callback cross-event validation (validate against sibling events) is now
a pattern. Batch 5 established it. If more sites need it, watch for the extract-vs-reimplement
decision. Reimplemented is fine for two sites. At five, extract.

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
