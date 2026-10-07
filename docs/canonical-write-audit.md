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

## Current state (as of Batch 12): 4 raw sites remain, all outside A3a's scope

`actions.ts` (the scorer console, A3a's actual target) reached **0** — it dropped out of
`eslint-suppressions.json` entirely. Total baseline **4**, all in two files A3a was never scoped
to touch:

| Site | What it is | Why it's out of scope |
| --- | --- | --- |
| `stats-actions.ts:902` (`tx.playerStat.upsert`) | `rebuildGameStatsFromEvents`'s per-player materialization | The statistician console's own verify-gated recompute entry point (see "DERIVED" section below) — this *is* the canonical writer for that path, not debt |
| `stats-actions.ts:933` (`tx.teamStat.upsert`) | same function, team-level | same |
| `game-result-import.ts:265` (`tx.teamStat.upsert`) | bulk score-sheet import (CSV/manual box-score entry), team-level | A separate, pre-existing feature (LBCL-style score-sheet ingestion) — never in A3a's scope, not scoring-console-related |
| `game-result-import.ts:294` (`tx.playerStat.upsert`) | same import path, per-player | same |

"Canonical-write vocabulary closed" means: every scorer-console write that used to bypass the
service layer now goes through it. It does not mean zero raw writes exist anywhere in the codebase
— these four are deliberately-scoped exceptions, not overlooked debt.

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

**Escalated by the Batch 10-12 smoke test (2026-09-28):** "aren't deployed yet" turned out to be a
live blocker, not just a fact about sync's own future rollout - `createGameEvent`'s generated
Prisma Client already writes to these columns unconditionally on every insert (`buildGameEventCreateData`
always sets `deviceId`/`idempotencyKey`/`clientUpdatedAt`/`syncBatchId`), so **any** `createGameEvent`
call fails with `P2022` against a database that hasn't applied
`20260927120001_p13_sync_idempotency_conflictlog` yet - which is every environment right now.
Applying this migration is therefore a prerequisite for Batches 10-12 reaching production, not
solely an A3b-time decision. See `docs/runbooks/a3a-batch10-12-smoke-test.md` for the full finding.

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

### Point 5 — sync test infrastructure: proven, not just sketched (A3b Commit 1)

The whole suite before this was pure-function unit tests with zero Prisma dependency. A3b's
endpoint is the first genuinely DB-transactional feature in this codebase's test surface, and needs
to prove atomic multi-record replay, idempotency (`SyncIdempotency`), and conflict handling
(`SyncConflictLog`) against a real Postgres - none of that is meaningful against a mocked
`$transaction`.

**Built and proven against a real database** (`src/test-support/db-test-context.ts` +
`db-test-context.test.ts`), not just designed: `createTestDbContext()` provisions a dedicated
Postgres schema per test suite (`CREATE SCHEMA`, then `prisma db push` against it - schema-diff
based, faster than replaying 80+ historical migrations into an empty schema), builds a
`PrismaClient`/`PrismaPg` pair scoped to it, and returns a `teardown()` that drops the schema.
Proven with a real `createGameEvent` round-trip (not a mock) plus a genuine cross-schema isolation
check (a second, independently-provisioned context sees zero of the first's rows).

**The spike found a real, non-obvious mechanism correction, not just confirmed the plan:**
`@prisma/adapter-pg`'s runtime client does **not** honor a `?schema=` query-string parameter -
that convention belonged to the legacy query-engine binary this project no longer uses. A client
built the way `src/lib/prisma.ts` builds one (`new PrismaPg({ connectionString })`, and every
`?schema=public` in every deployed `DATABASE_URL` implies this works) silently falls back to the
connecting role's default `search_path` - in the first attempt at this harness, that meant the
"isolated" schema's client actually queried staging's real `public` schema and collided with real
Neon Ultra data. The fix: `PrismaPg` takes the schema as an **explicit second constructor
argument** (`new PrismaPg({ connectionString }, { schema: schemaName })`) - a config option, not a
connection-string convention. `db-test-context.ts` verifies this on every context it creates
(`prisma.organization.count()` must be `0` in a fresh schema) rather than trusting it silently,
specifically because it was wrong once already. This does not affect `src/lib/prisma.ts` itself -
production only ever targets one schema (`public`), so the no-op `?schema=` param there was
never a bug, just misleading if read as "this is what scopes the connection."

**Checked whether `?schema=` has silently-ignored siblings** (read `pg-connection-string`'s parser
and `pg.Client`'s config reader directly, not assumed): `pg-connection-string` copies *every*
query-string key into a generic config object regardless of whether anything downstream reads it,
so nothing throws either way - the only way to know which ones matter is to check what `pg.Client`
itself looks up. `connection_limit` and `pool_timeout` are the same story as `schema` - Prisma
query-engine-only conventions, meaningless to `pg`, never read (`pg.Pool`'s own pool size is a
`PoolConfig.max` field, not a connection-string param at all). `sslmode` (and `sslcert`/`sslkey`/
`sslrootcert`), `application_name`, `statement_timeout`, and
`idle_in_transaction_session_timeout` are real libpq parameters `pg.Client` actively reads and
forwards. `?schema=public` is the only one of the ignored group present anywhere in this
codebase's `DATABASE_URL`s today - no other silent gap exists right now.

No new package required - `pg` and `@prisma/adapter-pg` were already present. `npm run test:db`
runs this suite; requires `DATABASE_URL` pointing at a real, reachable Postgres the role can
`CREATE SCHEMA`/`DROP SCHEMA` on, and `NODE_OPTIONS=--conditions=react-server` so the `server-only`
package guard resolves to its build-time stub instead of the throwing default a plain `tsx` run
otherwise gets (needed because the canonical services under test are all `server-only`-marked).
`testcontainers` remains a fallback only, not needed - schema-per-suite proved fast enough (~15-17s
including two full `db push` provisions) in this spike.

### Point 6 — pre-Commit-3 checklist: three things settled before writing the replay

**Route registration verified directly, not inferred from `tsc`/build exit code.** A compile-clean
route file and a green `next build` don't prove App Router actually registered the route - that's
a runtime step neither checks. Curled `http://127.0.0.1:4120/api/sync/outbox` directly on the
staging host, bypassing the external reverse proxy entirely (the public `app.neonultra.ng/staging`
URL turned out to 404 on *every* API route, including known-good pre-existing ones - a proxy/
path-prefix issue unrelated to this endpoint, confirmed by testing a known-good route the same
way). Got `401` (auth is checked before body validation, by design), not `404` - proof the route
is registered. `/api/v1/live`'s separate `500` on the same host, same request, is a pre-existing
null-reference bug in unrelated code, confirmed via logs, not touched here.

**Confirmed this is a staging-only proxy issue, not a production one.** `curl
https://app.neonultra.ng/` and `https://app.neonultra.ng/api/v1/live` (production, no `/staging`
prefix) both return `200` - production's reverse proxy routes API paths correctly. The bug is
isolated to staging's `/staging` path-prefix handling specifically, not a systemic pattern.

**Open item, not A3b's to fix, but a real blocker for future end-to-end verification:** any
future browser-driven or external-client A3b verification (Commit 4's `drain()` test, a future E2E
smoke) will hit this same proxy 404 if run against the public staging URL. Until the proxy is
fixed, verification must either curl/connect directly to the staging host
(`http://127.0.0.1:4120`, as this session did) or run from a context that bypasses the `/staging`
prefix entirely. Track the proxy fix itself alongside the other deploy-process gap already flagged
for after A3b (the migration-not-applied issue) - both are staging infrastructure, not application
code, and neither blocks A3b's own implementation.

**The in-batch dependency authorization mechanism is named: SYNTHESIZED REFERENCE**, not deferred
or two-pass. A `GameEvent` record that only carries `gameId` (checked `LocalGameEvent`'s actual
shape, not assumed - it has no `fixtureId` field) resolves its `fixtureId` from the in-batch `Game`
`CREATE` record's own payload when one exists for that `gameId`, falling back to a DB lookup only
when the referenced game already exists from an earlier, already-synced batch. This preserves the
"reject the whole batch before touching the DB" contract (the alternative, deferred-checking,
would mean enforcing auth mid-batch instead). Extracted into
`src/server/sync/resolve-batch-authorization.ts` (the DB-touching resolver, tested via `test:db`
against a real database - proves a Game and its in-batch-referenced GameEvent resolve to exactly
one `fixtureId`, and that an already-existing game correctly falls back to a DB lookup) and
`src/lib/sync/authorize-batch.ts` (the pure reject-on-first-unauthorized-fixture loop, tested with
an injected mock permission-checker - proves the specific failure mode: one unauthorized fixture
in the set stops the loop before checking any fixture after it, so a bad-organization `Game` and
its dependent `GameEvent` - both resolved to the same `fixtureId` - reject the whole batch as one
unit, not the `Game` alone). **Contract this establishes for Commit 3's replay loop:** by the time
authorization has passed, every fixture any record in the batch touches has already been checked -
the replay loop can trust this, and does not need to defensively re-check authorization per record.

**Transaction isolation strategy for Commit 3: per-record, not one transaction for the whole
batch.** The original brief's "per-record, in one transaction" phrasing was aspirational about
per-record isolation, not literal about batch-wide atomicity - the two readings are in tension,
and only one matches what an offline scorekeeper actually needs. Batch-wide atomicity (one
transaction, or savepoints) means a single bad record blocks every good one behind it, forcing
manual repair before any progress lands - the wrong tradeoff for offline sync, where partial
progress (90 good events land, 10 bad ones get flagged) is the goal, not a compromise. Per-record
transactions (`prisma.$transaction(async tx => { check idempotency; call the canonical service;
record the idempotency key })`, serial iteration) make partial success the natural outcome, and
make crash recovery trivial: if the process dies mid-batch, records already committed return
`DUPLICATE` on retry (the idempotency key is already recorded), records not yet reached are simply
retried as new. Decided before Commit 3 starts, per explicit instruction, precisely because the
wrong choice here would mean rework across Commit 4 and A3b's production rollout.

### Point 7 — Commit 3: idempotency + canonical-write replay, and two gaps a test suite found

`replayOutboxRecord` (`src/server/sync/replay-outbox-record.ts`) is the core: per-record idempotency
check against `SyncIdempotency`, dispatch to `createGame` (new - the sync-replay counterpart to
`startGame`, deliberately not sharing its rule-resolution logic, which the offline client's payload
carries no data for) or `createGameEvent`, one Postgres transaction per record (Point 6's settled
decision). Only `CREATE` is implemented - the only operation the current offline client ever
enqueues.

**Two real design gaps surfaced by running the test suite against a real database, not by reading
first** - the discipline held for the invention, the verification method just changed for this
commit, because the thing under test (transaction behavior, id continuity across a sync boundary)
only manifests under real execution:

1. **The replay function initially imported the global `prisma` singleton and opened its own
   transaction on it**, instead of taking its transaction client from the caller - the one rule
   every other canonical service in this codebase follows. All 5 new tests failed identically
   against staging with "no record found" for rows that definitely existed, just in an isolated
   test schema the function wasn't actually querying. Fixed by adding `prisma` to `ReplayContext`
   as an injected field; `route.ts` passes the real client, tests pass the schema-scoped one.
2. **`createGameEvent` had no way to accept a caller-supplied `id`.** Every live-UI site creates
   events server-side with no pre-existing client id, so this was never needed before Commit 3.
   Sync replay needs it: the offline client generates an id locally before ever syncing, and a
   later event may reference it via `causedByEventId`/`supersedesEventId` using that value - a
   server-generated id would silently break that reference once synced. Extended
   `GameEventFields`/`CreateGameEventInput` with an optional `id` (absent by default, so every
   existing call site's behavior - Prisma's `@default(cuid())` - is unchanged).

Also added the `ledgerSourceHint` field to the outbox schema itself, correcting a Commit 2
oversight: Point 2 above decided this field is required on the wire for every `GameEvent` record
before Commit 2 was written, and Commit 2's schema didn't include it.

**Caller-supplied ids opened three validation gaps, closed in this commit, not deferred:**

1. **ID collision.** Both `createGame` and `createGameEvent` were already plain `create`, never
   `upsert` - confirmed, not assumed - so a colliding id was never at risk of silently overwriting
   an existing row, but the failure surfaced as a raw, unlabeled Prisma error. `errorDetail()` now
   returns a structured `{code, message}`: Postgres's unique-constraint violation (`P2002`) maps to
   `ID_COLLISION` specifically, so a client can branch on `detail.code` rather than string-match.
2. **Idempotency-vs-id mismatch** (two records, different `idempotencyKey`s, same `entityId`) -
   confirmed this is already covered by #1, not a separate gap: `SyncIdempotency` alone wouldn't
   catch it (neither key exists yet), but the second record's plain `create` hits the identical
   unique-constraint protection. Added a dedicated test proving the end-to-end behavior rather than
   just asserting the mechanism in isolation.
3. **Format validation.** `entityId` had no format constraint. Checked first: there's no existing
   offline-client convention for it to match (zero current callers of `createGame`/`logEvent`), but
   `crypto.randomUUID()` is already the generator `idempotencyKey` uses
   (`src/lib/offline/outbox.ts`) - tightened `entityId` to the same UUID format now, while nothing
   existing could break from the change, stating it as a forward-looking decision, not a confirmed
   existing behavior.

**Auth-rejection zero-rows, closed rather than left as a documented gap.** Extracted the route's
authorize-then-replay orchestration into `processOutboxBatch` (`src/lib/sync/process-outbox-batch.ts`)
- pure, every dependency (fixture resolution, permission check, per-record replay) injected. Its
contract - "if authorization fails, `replay` is called zero times, for any record" - is provable
with a mock `replay` function and a call-count assertion, no database needed: `replay` is the only
dependency that ever writes anything, so a call count of zero is equivalent proof to zero
`GameEvent`/`SyncIdempotency` rows. `route.ts` is now a thin wrapper supplying the real
dependencies (`withOrganizationContext`-scoped fixture resolution, `requireFixturePermission`,
`replayOutboxRecord` against the real client).

**Test coverage, final:** 8 DB-integration tests (single record, mixed-batch partial success,
idempotent replay, crash simulation - a real FK violation after real prior work in the same
transaction, not a mocked throw, asserting the prior work rolled back too - cross-record
dependency, ID collision, concurrent-race disambiguation, and ordering at the replay level) plus 3
pure orchestration tests (including the exact auth-rejection failure mode: a 3-record batch, the
middle fixture unauthorized, `replay` called for none of the three).

**P2002 disambiguation fix (post-Commit-3, pre-Commit-4).** Flagged in review: `P2002` fires on
*any* unique-constraint violation, and a replayed record touches two of them -
`SyncIdempotency.idempotencyKey` (correct answer: `DUPLICATE`) and the entity table's own id
(correct answer: `ID_COLLISION`). The original ordering - `findUnique` check, then the canonical
write, then `SyncIdempotency.create` last - meant a genuine concurrent race (two simultaneous
submissions of the identical record, same `idempotencyKey` and `entityId`) would have both
transactions pass the initial check before either committed, then race into the *entity* table's
own id constraint, since the `SyncIdempotency` insert hadn't been reached yet by either side. The
race's loser would have come back `ID_COLLISION`, not `DUPLICATE` - exactly the failure mode that
leaves a record stuck in an offline client's outbox forever, since `drain()` (Commit 4) only
retires records on `APPLIED`/`DUPLICATE`, never `FAILED`.

Fixed by making the claim step structurally incapable of throwing, rather than catching and
inspecting `error.meta.target` after the fact: the idempotency row is now claimed first, via
`syncIdempotency.createMany({ skipDuplicates: true })` (`INSERT ... ON CONFLICT DO NOTHING`), which
resolves a collision to a row count of zero instead of an exception. By the time any code path can
throw a genuine `P2002` in this function, the idempotency claim has already succeeded - so that
`P2002` can only be the entity table's own id constraint, unambiguously. This also sidesteps
relying on Postgres's aborted-transaction-then-COMMIT-degrades-to-ROLLBACK behavior, which a
catch-and-continue approach inside the same interactive transaction would have depended on.

Verified with a new test (concurrent resubmission of the identical record via `Promise.all`,
asserting the pair resolves to exactly one `APPLIED` and one `DUPLICATE`, never `ID_COLLISION`) and
confirmed the existing ID-collision test (distinct `idempotencyKey`s, same `entityId`) still
correctly returns `ID_COLLISION` - the reordering didn't blur that case. All 8 DB-integration tests
run green against real staging Postgres after the fix; no regressions in the other 7.

### Point 8 - Commit 4: drain(), the replay vocabulary narrowed, SyncConflictLog deferred

**Naming.** `outbox.ts`'s pre-existing `drain()` (a pure local read, no network) had zero callers
outside its own test - confirmed by reading every real call site before deciding, not assumed. Since
nothing depended on its current behavior, it was renamed `readPendingBatch()` (it doesn't drain
anything by itself) and `drain()` was reserved for the new network-syncing orchestrator, matching
domain language: draining the outbox means emptying it via sync, not reading it.

**`drain()`** (`src/lib/offline/outbox.ts`): reads the pending batch, POSTs it to
`/api/sync/outbox`, matches `results[]` back to outbox records by `idempotencyKey` (never array
index - the server processes in `clientUpdatedAt` order, not necessarily submission order), marks
`APPLIED`/`DUPLICATE` records synced, and marks `FAILED`/`CONFLICT` records failed
(`attemptCount` incremented, left in the outbox). A module-level in-flight flag makes a second
concurrent call a no-op rather than a second POST - safe because JS is single-threaded between
awaits, so the flag is visible to a second call before that call's own first `await`. A non-2xx
response (auth rejection, malformed body) touches nothing in the outbox - that failure isn't any
individual record's fault.

**Two real gaps found while building this, both closed:**

1. **No client producer of `Game` `UPDATE` exists at all** - `LocalScoringRepository.createGame`
   only ever enqueues `CREATE`; nothing calls `.update` and enqueues it. The only Game-level
   conflict actually reachable today is two devices both creating the same fixture's Game while
   offline (`Game.fixtureId`'s unique constraint), not a field-level UPDATE race.
2. **The wire contract already requires `ledgerSourceHint` for every `GameEvent` record** (Point 2,
   Commit 3's fix), but nothing on the client ever set it - `LocalGameEvent`/`CreateGameEventInput`
   had no such field. `drain()` would have 400'd on every real GameEvent the moment it was wired up.
   Closed by making `ledgerSourceHint` a required field on `CreateGameEventInput`, threaded through
   `logEvent()` into the enqueued wire record (not stored on `LocalGameEvent` itself - it's outbox
   routing metadata, not something the local console reads back).

**`readPendingBatch`/`pendingCount`'s filter was also wrong for the new attemptCount-based retry
model** - found while wiring `drain()`, not by reading first. The filter excluded any record with a
`failureReason` set, meaning a `FAILED` record would never be retried after its first failure,
making `attemptCount` pointless (nothing would ever reach a second attempt to count). Fixed: a
record is "pending" until `syncedAt` is set; `failureReason` no longer excludes it. Dead-lettering a
record after N failures is a real cutoff `attemptCount` enables - that's A4's job, not this filter's.

**SyncConflictLog and LWW: narrowed the replay vocabulary instead of building conflict resolution
speculatively.** With no real `Game` `UPDATE` producer, the shape LWW should take (full-snapshot vs.
partial-update replay, whole-record vs. per-field timestamp comparison) depends on a producer that
doesn't exist yet - building it now would mean guessing at both. Instead, `replayOutboxRecord`'s
accepted vocabulary is now explicit and enforced (`outbox-schema.ts`'s
`supportedReplayOperationSchema`): only `Game:CREATE` and `GameEvent:CREATE` have both a real
producer and a real replay implementation. Every other combination (`Game:UPDATE`, `GameEvent:UPDATE`,
either entity's `DELETE`) is rejected per-record with `UNSUPPORTED_OPERATION`, checked before a
transaction even opens - not a whole-batch 400, so one client with a stale or buggy producer never
blocks every other record in its batch. The `SyncConflictLog` table stays in the schema, unused -
that's evidence the case doesn't arise yet, not evidence of a gap. When a `Game` `UPDATE` producer
is added, LWW semantics and `SyncConflictLog` writes are scoped to that producer's actual shape, as
part of that change, not guessed at here.

**Test coverage:** pure - `isSupportedReplayOperation` (5 tests, `outbox-schema.test.ts`), `drain()`
(6 tests: empty outbox skips the network call, idempotencyKey-based matching under out-of-order
server results, per-status handling of all four `SyncOutboxRecordResult` statuses, the in-flight
guard under genuine concurrent calls, a non-ok response leaving the outbox untouched), plus the
`readPendingBatch`/`markFailed` retry-eligibility tests updated for the corrected filter. DB-integration
- a new `replayOutboxRecord` test proving a `Game:UPDATE` in a mixed batch fails only that record
(the `GameEvent:CREATE`s before and after it still land, and the rejected record claims no
`SyncIdempotency` row), plus a full end-to-end rehearsal (`drain-e2e.test.ts`): a real offline client
(`fake-indexeddb`, no browser) enqueues 3 `GameEvent` `CREATE`s via `LocalScoringRepository.logEvent`,
`drain()` is called with a `fetchFn` that routes into the real `processOutboxBatch`/
`replayOutboxRecord` against a real, isolated Postgres schema (only HTTP transport and session/auth
are stubbed - the same "substitute an explicit actor, bypass the browser" pattern this project's
rehearsal scripts already use), and asserts 3 `GameEvent` rows, an empty outbox, and 3
`SyncIdempotency` rows. All 13 DB-integration tests (9 replay + 2 resolve-batch-authorization + 1
db-test-context + 1 new e2e) pass against real staging Postgres; full local pure suite 795/796 (1
pre-existing, unrelated skip), 0 failures.

**Two flags from review, both closed before A4:**

1. **`ledgerSourceHint` had no defense at the replay layer, only at the wire layer.** The wire
   schema's `superRefine` already rejects a `GameEvent` record missing the hint, but that check runs
   in `route.ts`, one hop upstream of `replayOutboxRecord` - and this project's own test suite calls
   `replayOutboxRecord` directly, bypassing wire validation entirely, so "unreachable without a hint"
   was false on its face. Traced the actual consequence: `ledgerSourceFor`'s `OFFLINE_SYNC` branch
   does not throw on an undefined hint - it silently returns the bare `"OFFLINE_SYNC"` ledger value,
   which (per that function's own comment) makes a statistician event invisible to the live box
   score and uncorrectable. Silent wrong output, not a crash - the worse failure mode. Fixed with an
   explicit guard in `replayOutboxRecord`: a `GameEvent` record with no `ledgerSourceHint` now fails
   with `MISSING_LEDGER_SOURCE_HINT` before the transaction opens, never silently defaults. New test
   proves it: zero `GameEvent` rows created, not a degraded one.

2. **The CREATE-CREATE `fixtureId` collision is a real, reachable conflict the vocabulary narrowing
   doesn't cover.** `Game.fixtureId` is `@unique` (confirmed by reading the schema, not assumed) -
   two devices both starting the same fixture's game offline, each with its own client-generated
   `Game.id`, means the second device's `createGame` fails on `fixtureId`, not on `id`. The previous
   blanket `P2002` -> `ID_COLLISION` mapping was actively wrong here: the two ids never collided, so
   the message ("an entity with this id already exists") was false. Added `FIXTURE_ALREADY_HAS_GAME`
   as a distinct code. Detecting which field failed took an empirical detour: `error.meta.target`
   (the classic Prisma query-engine shape) is not populated at all by this project's driver-adapter
   build (`@prisma/adapter-pg`) - confirmed by writing a throwaway script that triggered a real
   collision against staging Postgres and printing the actual error. The real constraint name lives
   nested under `meta.driverAdapterError.cause.constraint.fields`, an adapter-internal shape with no
   documented stability guarantee, so detection matches on `error.message` instead (reliably names
   the failing field: `` Unique constraint failed on the fields: (`"fixtureId"`) ``).

   **What this does NOT do: reconciliation - named as a mechanism, not just a product question.**
   The losing device's queued `GameEvent`s still reference its own (never-created) local `Game.id`.
   Concretely, what's missing is:
   - **A response-shape addition.** `replayOutboxRecord`'s `FAILED` result for this case carries no
     way to learn the winning `gameId` today - `SyncOutboxRecordResult.detail` is whatever
     `errorDetail` returns (`{code, message}`), and neither field names the existing Game's id. The
     server would need to look it up (by `fixtureId`, already known from the payload) and include it.
   - **A client-side state-machine change in `drain()`.** On seeing this specific failure, the
     client needs to: rewrite every queued `GameEvent` record's `gameId` reference from its own
     (losing) local id to the winning id, drop its own `Game:CREATE` from the outbox (it will never
     apply), and re-drain the rewritten batch. `drain()` today has no such per-failure-code branch -
     every `FAILED` result is currently treated uniformly (bump `attemptCount`, leave in outbox).
   - **Only after both of the above exist** does the product question ("does the second scorekeeper
     see a silent merge, or a prompt?") become answerable - it's downstream of the mechanism, not a
     precondition for it. A future implementer should expect to build a response-shape change plus a
     `drain()` state machine, not a single UI decision on top of already-working plumbing.

   New test proves the failure is diagnosable and non-destructive (exactly one `Game` row for the
   fixture, the first device's write wins) - it deliberately does not attempt any of the above.
   Flagged as the next real gap once the mechanism is scoped.

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
`undoLastEvent` - migrated, Batches 10a/10b/11/12.** The stat-model uncertainty that originally
held these back resolved via Point 3 above (dual-authority-via-verification-gate is already the
model, in production, today - A3b's replay design doesn't change it). Each kept its existing
incremental-delta behavior unchanged; only where the write calls live changed. Two genuinely new
canonical-write shapes came out of this (`voidScoreEvent`, `correctScoreEvent` - see "Coupled
writes... are not a side effect" below), one new primitive (`applyCountingStatDelta`, Batch 10b),
and `undoLastEvent` needed neither - its compensation shape (append an offsetting event, never
flip the original's status) is fully served by `createGameEvent` plus the same primitive. Two
latent gaps surfaced and were fixed ahead of their sites' migrations, each its own commit: a
missing shot-category-delta reversal in `undoLastEvent`'s SCORE branch, and a missing Ultra-Time-
mirror reversal in its generic branch. `actions.ts` has zero raw `gameEvent`/`playerStat`/`teamStat`
write sites remaining - it dropped out of `eslint-suppressions.json` entirely.

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

`stats-actions.ts` `rebuildGameStatsFromEvents` (902/933 as of Batch 12) is the sole source of truth for the *statistician's verified* box score. Called by `verifyStatistics` (line 962). Superseded claim: "all other PlayerStat/TeamStat writes are legacy and will be removed in Batch S" - resolved by the A3b sketch's Point 3 instead. The scorer console's incremental writes are a deliberately independent, coexisting authority (dual-authority-via-verification-gate), not legacy debt to be deleted.

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

## Wall-clock-derived event fields (A4, offline scoring tap)

Several `src/lib/ultra-scoring-engine.ts`/`src/lib/scoring/validate-client-shot.ts`/
`src/server/sync/replay-outbox-record.ts` comments point here. Collected in one place because the
same constraint will recur for the next wall-clock-dependent helper, and it's cheaper to recognize
than to rediscover.

**The rule:** for a field whose correct value depends on real elapsed time (Ultra Time's
`isUltraTime`/`multiplier`, which depend on `remainingClockSeconds` - continuously ticking wall-clock
time, not something derivable from the event sequence), the server cannot correctly resolve it for
a record that arrives via offline sync. By the time a queued tap replays, the server's "now" is not
the client's "now" at tap time - potentially minutes or hours apart, during which the game may have
moved to a different period, or a real Ultra Time transition may already have happened live.

**Resolution for the event's own fields (Commit 3):** the client - the only party that actually
observed the wall-clock fact - asserts the resolved value (`clientResolvedAt`/`resolvedBy: CLIENT`
on `GameEvent`) at tap time, and the server validates rather than re-resolves: structural/consistency
checks only (a legal shot value under the game's own rules, a multiplier the rules can actually
produce, internal arithmetic consistency, a plausible observation timestamp) - never an attempt to
verify "was Ultra Time actually active at that exact clock second," since the server structurally
cannot know that after the fact. See `validate-client-shot.ts`'s own header comment.

**The broader rule, generalized (flagged in review, 2026-09-29): replay must not invoke
wall-clock-dependent side effects, not just avoid re-resolving wall-clock-dependent fields.**
`syncUltraTimeState` (`games/actions.ts`) is the concrete instance found so far: it compares the
game's *current* wall-clock state against the last-persisted `isUltraTimeActive` flag to detect a
transition, and writes a `ULTRA_TIME_STARTED`/`_ENDED` ledger event when one occurs. Calling this
during replay of an offline-queued tap would compare the SERVER's clock state at *replay* time -
not tap time - against that flag, producing a transition event with the wrong period/clock values
(or a false transition entirely) and corrupting `isUltraTimeActive` itself. `syncUltraTimeState`
therefore stays a **live-only** side effect, deliberately excluded from the shared score-event
effects extraction (`computeScoreEventEffects`/`applyScoreEventEffects`, planned, not yet built) -
the client's asserted `isUltraTime` flows through for this event's own resolution only, never for
the game's global Ultra-Time-active state. The next wall-clock-dependent helper anyone adds to the
live path should be checked against this same question before being wired into replay: does it
read or write something whose correctness depends on *when* it runs, not just *whether* it runs?
