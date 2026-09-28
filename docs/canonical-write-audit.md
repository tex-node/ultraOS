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

## A3b sketch: sync replay, the stat-model question resolved

**Surfaced while sketching Batch S** (deciding the fate of `applyPlayerShotStatDeltas`/
`applyTeamShotStatDeltas`), not a Batch S question itself - an A3a/A3b boundary question this
project had been quietly assuming an answer to without stating it. Grounded by reading
`verifyStatistics`, `rebuildGameStatsFromEvents`, `getGameLiveBoxScore`, and `ledgerSourceFor` in
full before writing anything below, per the same discipline the rest of A3a used.

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

### Point 1 — what does replay need to reconstruct?

**Statistician-sourced replayed events: nothing new.** `verifyStatistics` (`stats-actions.ts:962`)
already re-derives `PlayerStat`/`TeamStat` from the ACTIVE statistician ledger from scratch on
every call - a full-snapshot upsert (every player who ever appeared, zeroed if voided), not an
incremental patch, and idempotent (two calls against the same event set produce byte-identical
rows). Once a statistician `GameEvent` lands in the ledger with the correct `source`, it is
indistinguishable to that query from one written live. The fix shipped ahead of this sketch
(`ledgerSourceFor` no longer collapsing the hint under `OFFLINE_SYNC` - see below) is what makes
this true; before that fix, a synced statistician event would have been silently excluded.
**A3b's replay endpoint therefore does not need to write `PlayerStat`/`TeamStat` for statistician
events at all** - inserting the `GameEvent` rows correctly is sufficient, and the next
`verifyStatistics` call picks them up for free.

**Scorer-sourced replayed events: still deferred, and correctly so.** Earlier framing called this
"order-dependent, unlike a sum" - that's wrong; addition is commutative, so summing deltas in a
different order produces the same total. The real reason is structural: no reusable pure function
derives `PlayerStat` deltas from a raw `GameEvent` row today. `recordScore`/`recordStatEvent`
compute deltas inline, caller-local, never extracted. `applyPlayerShotStatDeltas`/
`applyTeamShotStatDeltas` (relocated in Batch S) take already-computed deltas as input - they merge
them, they don't derive them from an event. Writing that extraction now would be new work sized to
guess at a shape A3b hasn't needed yet (no offline scorer UI exists). **A3b's replay endpoint
inserts scorer-sourced `GameEvent` rows into the ledger, and stops there** - `PlayerStat` for those
events stays whatever the live incremental writes last left it at, same as it does today for any
game that hasn't been re-verified. This is an inherited A3a gap, not something A3b creates or is
responsible for closing.

### Point 2 — source vs. transport, fixed ahead of this sketch

`ledgerSourceFor`'s `OFFLINE_SYNC` branch collapsed to a flat `"OFFLINE_SYNC"` regardless of the
`SCORER`/`STATISTICIAN` hint - a documented Batch 0/1 tradeoff ("the hint is retained on the
outbox payload for forensics") that predated two consumers built since:
`loadActiveStatisticianEvents`/`rebuildGameStatsFromEvents` and `correctStatisticianEvent` both
filter/gate on the literal `ULTRA_NATIVE_LIVE_STATISTICIAN`. A synced statistician event would have
been invisible to the live box score, excluded from verification's materialization, and
uncorrectable - silent data loss, not an edge case, caught before A3b's endpoint existed to trigger
it.

**Fixed** (`fix(scoring): stop collapsing synced statistician events into a flat OFFLINE_SYNC
source`, shipped as its own commit ahead of this sketch, per the two-commit discipline the rest of
A3a used): `source` now records who logged the event and is transport-stable -
`ledgerSourceFor("OFFLINE_SYNC", hint)` returns the same value as `ledgerSourceFor("LIVE_UI",
hint)`. Whether an event arrived via sync is answered separately, by `GameEvent.syncBatchId` being
non-null (confirmed as the correct predicate: the schema's own comment states all four provenance
columns are null for LIVE_UI writes; `syncBatchId` specifically means "arrived in this batch",
where `deviceId` could in principle be populated by a future live-browser-session use without
meaning "synced"). The bare `OFFLINE_SYNC` ledger value is kept, not removed, but is now documented
as reserved for a sync entity with no semantic origin hint - no scoring caller emits it today.

Verified before shipping: no production query filtered on the literal `"OFFLINE_SYNC"` (only test
files did), and a direct production query confirmed the enum value and the provenance columns
aren't deployed yet - zero rows, nothing to backfill.

**Scope implication for A3b, stated as a decision rather than left for the implementer to
discover:** `ledgerSourceHint` is now load-bearing on the wire, not forensic metadata. The sync
outbox's `GameEvent` wire record must carry a hint for every entry, and A3b's outbox type should
make it required (not optional) for that entity type - the fallback-to-bare-`OFFLINE_SYNC` path
exists for a hypothetical future non-scoring sync entity, not for anything scoring sync emits.

### Point 3 — does `rebuildGameStatsFromEvents` write the same `PlayerStat` row the scorer writes?

**Yes - same table, same row, `@@unique([gameId, playerId])`, `statSource` is a label not a key.**
Dual-authority is preserved architecturally, not violated, and the seam is exact:

- **Live, pre-verification:** `getGameLiveBoxScore` (`stats-actions.ts:863`) is a pure read model
  over the statistician ledger - it never writes `PlayerStat`. The scorer's incremental writes
  (`recordScore`/`recordStatEvent`) are the only thing touching the row during live play.
- **At verification:** `verifyStatistics` is a deliberate, human-gated, audited action
  (`result:confirm` permission, not the everyday `game:record-stats`) whose own comment states
  verification "is the gate that promotes the statistician's ledger into the canonical box score."
  It overwrites `PlayerStat`/`TeamStat` with the statistician-derived full snapshot
  (`statSource: "EVENT_DERIVED"`). That's a named, audited promotion, not a silent last-writer-wins
  race.

This resolves Point 1's shape (above) and means the three-option framing this section originally
posed collapses: option 1 (replay rebuilds via `rebuildGameStatsFromEvents`) isn't something A3b
has to choose or implement - it's what the existing, unchanged `verifyStatistics` workflow already
does, for free, once Point 2's fix lands. Options 2 and 3 don't apply; there's no new
reconciliation logic for A3b to build here.

### Point 4 — `RemoteScoringRepository`: delete as part of A3b's scope

`RemoteScoringRepository` (`src/lib/offline/repositories/scoringRepository.ts`) targets `POST
/games`, `GET/POST /games/{id}`, `GET/POST /games/{id}/events`, and `GET /games/{id}/player-stats`
- none of which exist under `src/app/api/`, and none of which match Batch 0's already-decided
single-batch-endpoint sync design (`POST /api/sync/outbox`, up to ~100 records atomically). Zero
references to it exist anywhere outside its own definition (confirmed by direct grep). It is dead,
mismatched scaffolding, not a stub of the real plan. Delete it as part of A3b, in the same change
that introduces the real sync endpoint - its removal is meaningful in contrast to what replaces it,
not a cleanup to do in isolation beforehand.

### Point 5 — sync test infrastructure: the mechanism, named

The whole suite today (749 tests as of the pre-A3b fix above) is pure-function unit tests with zero
Prisma dependency. A3b's endpoint is the first genuinely DB-transactional feature in this
codebase's test surface, and needs to prove atomic multi-record replay, idempotency
(`SyncIdempotency`), and conflict handling (`SyncConflictLog`) against a real Postgres - none of
that is meaningful against a mocked `$transaction`.

Spiked the mechanics rather than hand-waving them: Prisma's `PrismaPg` adapter (`@prisma/adapter-pg`,
already a dependency, already used by this project's ad-hoc production scripts) binds to a
connection string at construction and cannot be rebound afterward. Per-suite isolation therefore
means: provision a dedicated Postgres schema per test suite (`CREATE SCHEMA`, then `prisma db push`
or `migrate deploy` against it once), construct a fresh `PrismaClient`/`PrismaPg` pair whose
connection string's `?schema=` query param points at that schema (the same query param already
used in every deployed `DATABASE_URL`), run the suite, then `DROP SCHEMA ... CASCADE` at teardown.
No new package is required - `pg` and `@prisma/adapter-pg` are already present; `testcontainers`
would be new tooling this project doesn't currently have, and is a fallback only if schema-per-
suite proves too slow or too coupled to a shared dev database in practice. Decide which of the two
before A3b's implementation starts, not mid-batch.

**Outbox entity vocabulary.** The outbox carries `Game` and `GameEvent` only.
`PlayerStat`/`TeamStat` are projections, never wire entities - enforced at the type level,
`OutboxEntityType = "Game" | "GameEvent"`. `LocalScoringRepository.updatePlayerStat` was removed
(`fix(offline): enforce Game+GameEvent-only outbox`, then fully deleted rather than stripped) - it
enqueued `PlayerStat` snapshots, contradicting this decision. Zero callers existed, so this was
latent drift, not a live bug. Whether a local stat projection returns at all, and whether it's
materialized (a repository write method) or computed (derived on read from local events, which
would need a new pure reducer - no existing one covers the scorer's event vocabulary,
`derivePlayerStats` is statistician-only), stays open: Point 1 above defers the scorer-side
derivation for the same missing-reducer reason, so a local projection has nothing to build against
yet either.

**`recordScore`, `recordStatEvent`, `voidScoreEventAction`, `correctScoreEventAction`,
`undoLastEvent` - the stat-model uncertainty that held these back is resolved, but not yet acted
on.** These five were held because migrating them risked doing the work twice if A3b picked a
different stat model. Point 3 above resolves that: dual-authority-via-verification-gate is already
the model, in production, today - A3b's replay design doesn't change it, it only decides what
happens to *synced* events under it (Point 1). That means the uncertainty that justified holding
these five live-console sites is gone; they could migrate into the canonical-write shapes now,
independent of A3b's implementation. Not done here - raised as a newly-available option, not
assumed. If taken, each keeps its existing incremental-delta behavior unchanged; nothing about
Point 1-5 above requires changing what these functions do today, only where the write calls live.

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

**Three canonical-write service shapes for the statistician console:** `createGameEvent` (insert, mutable gate), `correctStatisticianEvent` (insert-or-mutate, FINAL-only gate), `voidGameEvent` (mutate-only, mutable gate).

**Fourth and fifth shapes, scorer console (A3a Batch 11):** `correctScoreEvent` and `voidScoreEvent` — see "Coupled writes in voidScoreEvent/correctScoreEvent are not a side effect" below for both the shapes themselves and why they depart from the pattern above.

### Coupled writes in `voidScoreEvent`/`correctScoreEvent` are not a side effect

Every service before Batch 11 touched only the canonical `GameEvent` ledger:

- `createGameEvent` — pure canonical write.
- `correctStatisticianEvent` — canonical event insert + the original event's own status flip (both canonical).
- `voidGameEvent` — canonical event status flip only.

None of them touch `Fixture.homeScore`/`awayScore` or `PlayerStat`/`TeamStat`. `voidScoreEvent` and `correctScoreEvent` are the first services to do so, and it's a deliberate departure, not an accident: the score/stat delta reversal is intrinsic to what "void a score event" or "correct a score event" *means*, not an effect a caller could legitimately choose to skip. Splitting the projection writes out into the callback (matching every prior service's pattern) would be like splitting "delete a user" from "clean up their sessions" as if they were two independently-optional operations — a caller that forgot the second half would silently corrupt void/correction semantics, not just miss an optimization.

**`voidScoreEvent`** (`voidScoreEvent.ts`) — status-flip to `VOIDED` (via `buildVoidData`, the pure builder shared with `voidGameEvent` — see below) plus reversal of the event's `Fixture` score contribution and its `PlayerStat`/`TeamStat` shot-category deltas (including the opposing team's Ultra-Time-against counter). Unlike `voidGameEvent`, it loads and validates the event itself (`gameId` match, `eventType` is `SCORE`/`SCORE_CORRECTION`, `status === "ACTIVE"`) rather than trusting a caller-resolved id — it needs the event's own `basePointValue`/`isUltraTime`/`points` for the delta computation, which `voidGameEvent`'s callers never needed to supply.

**`correctScoreEvent`** (`correctScoreEvent.ts`) — the shape previously placeholder-noted below: mutable-gate supersession (mark original `CORRECTED`, insert a replacement via `createGameEvent` with `supersedesEventId`), REPLACE-only (no VOID mode — that's the separate `voidScoreEvent`), with the old event's deltas reversed and the new event's deltas applied, possibly to a different player than the original (a wrong-player correction) but always the same team. Reuses `createGameEvent` for the replacement insert — unlike `correctStatisticianEvent`, which runs under `withFinalGameWrite`'s FINAL-only gate (incompatible with `createGameEvent`'s internal mutable-only gate check, so it has no choice but to build its insert manually), `correctScoreEvent` runs under the same mutable gate `createGameEvent` already asserts, so reusing it is the smaller, more consistent diff.

**The delta math is one pure function, not two.** `computeScoreEventContribution(basePointValue, isUltraTime, points)` (`src/lib/scoring/score-event-contribution.ts`) returns a `ScoreEventContribution` bundle — shot-category deltas, points delta, and the scoring/opposing team's Ultra-Time "for"/"against" deltas, all pre-resolved to plain numbers rather than carried as a raw `isUltraTime` boolean. That resolution-before-combination is what makes `negateScoreEventContribution`/`addScoreEventContributions` correct even when a correction's old and new events disagree on `isUltraTime` (a boolean can't represent "0% from one side, 100% from the other" once combined; two already-resolved numbers can just be added). `voidScoreEvent` applies the negation; `correctScoreEvent` negates the old contribution and adds the new one. Verified field-for-field against `voidScoreEventAction`/`correctScoreEventAction`'s pre-existing arithmetic before either service was written, not assumed from the shape. 9 unit tests cover it: the void negation, same-player/same-value, same-player/different-value, different-player/same-value, different-player/different-value, the Ultra-Time-against counter in isolation, and a correction that crosses the Ultra-Time boundary (old plain, new Ultra-Time, or vice versa).

**`buildVoidData(reason, actorId, now?)`** (`src/lib/scoring/void-data.ts`) — the four-field `{status: "VOIDED", correctedAt, correctedById, correctionReason}` shape, shared by `voidGameEvent` and `voidScoreEvent`. `voidScoreEvent` does **not** delegate to `voidGameEvent` to get this: `voidGameEvent` loads the event under its own (looser) preconditions, and `voidScoreEvent` needs the event's full details for delta computation plus an additional `eventType` check — delegating would mean a double-load of the same row or a `preloaded?` escape hatch, both worse than two services sharing one five-line pure builder.

**`assertGameIsMutable` gap — closed as an incidental consequence of Batch 11, not fixed directly:** `voidScoreEventAction` and `correctScoreEventAction` used to call `assertGameIsMutable` (rejects FINAL/CANCELLED/POSTPONED) but skip the additional `if (game.status !== "LIVE" && game.status !== "PAUSED")` check every sibling scorer-console function had right after it. Migrating both to `withGameWrite` (Batch 11) routes them through `loadMutableGame`, which always runs both checks — the same "the migration closes the gap because there's no way to opt out of the shared gate" pattern the `organizationId` DB-default fix above already established for `syncUltraTimeState`. Not verified as a *behavior change* worth its own test beforehand, since the previous section's `organizationId` precedent already established that this class of gap (an omitted check that the canonical gate always runs) closes as a byproduct of routing through the shared primitive, not as something requiring its own isolated fix-then-migrate step.

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
