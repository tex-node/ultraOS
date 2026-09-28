# A3a Batches 10a-12 smoke test (2026-09-28)

Manual, one-time verification that the scorer-console canonical-write migration (Batches 10a,
10b, 11, 12 — `recordScore`, `recordStatEvent`, `voidScoreEvent`/`correctScoreEvent`,
`undoLastEvent`) behaves correctly end-to-end against a real database, not just typecheck/lint/
unit-tests. Not automated, not repeated per-batch — a one-time boundary check before A3b builds on
top of this work. See `docs/canonical-write-audit.md` for the batches themselves.

## Why manual, and why not via the browser

The original plan called for logging in as a scorer through the UI. That's not how this was done:
entering a real login password into a browser session is prohibited regardless of authorization —
the same established constraint `scripts/g15-rehearsal.ts`'s own header names from this project's
prior rehearsal planning, and one this session's own operating rules independently require for
any non-`localhost` host (staging is `app.neonultra.ng/staging`, not a local dev host).

Instead: `scripts/g-batch10-12-rehearsal.ts` calls the real canonical services
(`withGameWrite`, `createGameEvent`, `applyPlayerShotStatDeltas`/`applyTeamShotStatDeltas`,
`applyCountingStatDelta`, `voidScoreEvent`, `correctScoreEvent`) directly against a real Postgres
transaction, with an explicit actor substituted for the session-derived one — not a shortcut
around the logic under test, only around the login form. This required
`NODE_OPTIONS=--conditions=react-server` to resolve the `server-only` package guard to its real
build-time stub instead of the throwing default a plain `tsx` run otherwise gets.

## Critical finding: staging (and production) were missing a required migration

Before the rehearsal script could run at all, every `createGameEvent` call failed with
`P2022 ColumnNotFound: deviceId of relation GameEvent does not exist`. `schema.prisma` has
declared `GameEvent.deviceId`/`idempotencyKey`/`clientUpdatedAt`/`syncBatchId` (and the
`OFFLINE_SYNC` enum value) since this session's Batch 0 — the generated Prisma Client expects
these columns — but the migration that adds them
(`prisma/migrations/20260927120001_p13_sync_idempotency_conflictlog`) had never been applied to
either staging or production. Confirmed via direct `psql` query on both.

**Consequence, independent of anything in Batches 10-12 themselves:** `createGameEvent` is the
canonical insert path used by every migrated site since Batch 7 (`correctStatisticianEvent`'s
replacement insert, `recordGameTimeout`, `recordSportEvent`, `recordScoringEvent`,
`recordShootoutKick`, `syncUltraTimeState`, and now Batches 10-12's scorer-console sites). Every
one of those calls would hit this same error. Checked production's logs for the last 60 days for
any trace of it (`journalctl -u ultraos-web.service | grep -i 'P2022\|deviceId'`) — zero matches,
meaning this has been **latent, not yet actualized**: production has not yet deployed Batches
10a-12 (still running the pre-migration `recordScore` that writes `GameEvent` raw, bypassing
`createGameEvent` entirely), and the handful of already-shipped `createGameEvent` call sites
(statistician corrections, non-basketball sport events, Ultra Time transitions) apparently haven't
been exercised in a way that surfaced it yet.

**This means: deploying Batches 10a-12 (or any future `createGameEvent` caller) to production
without first running this migration would immediately break the primary scoring console on
first use** — every `recordScore`/`recordStatEvent`/void/undo/correct call goes through
`createGameEvent` now. This is a pre-existing gap from Batch 0/7's deploy process (the migration
was written but never applied with `--migrate`), not something Batches 10-12 introduced - but
Batches 10-12 are what turns it from a latent, edge-case-only exposure into a total, first-touch
outage on the main scoring path.

**Fixed on staging** (for this smoke test): `npx prisma migrate deploy` applied both pending
migrations (`20260927120000_p13_offline_sync_source`, `20260927120001_p13_sync_idempotency_conflictlog`).
Purely additive (new nullable columns, new empty tables) - no data risk.

**Applied to production separately, as its own isolated change (2026-09-28, same day)** -
expand/contract: the schema change ships alone, verified independently, before any code that uses
it. Pre-checks: `prisma migrate status` confirmed these were the *only* two pending migrations (no
wider gap); both migration files read in full end-to-end, confirmed `ALTER TYPE ADD VALUE`/
`ALTER TABLE ADD COLUMN` (all nullable)/`CREATE TABLE` only - nothing drops, renames, or retypes an
existing column; `pg_dump --schema-only` taken as a pre-migration reference
(`/root/schema-backups/` on the host). Applied via `prisma migrate deploy` against production's
`migrate.env`. Verified: all 4 columns, both tables, and the `OFFLINE_SYNC` enum value present.
Service remained `active` throughout (nullable `ADD COLUMN` is metadata-only in Postgres, no table
rewrite, no restart needed) - checked logs for 5 minutes post-migration, no new errors.

**Batches 10-12's code is deliberately NOT deployed to production in this same window** - let the
schema bake (old code still runs fine against it, since old code never references the new
columns) before deploying the code that starts using it. That's a separate, later change.

## Test setup

Dedicated throw-away `Fixture`/`Game` (`recordOrigin: REHEARSAL`) created inside the real Season
Zero season, with real rostered `SeasonClub`s/players (same pattern as `g15-rehearsal.ts`). Never
finalized. All rows (`GameEvent`, `PlayerStat`, `TeamStat`, `Game`, `Fixture`) deleted by the
script's own cleanup step at the end - verified deleted after the run.

Two prior runs left orphaned rows when the script errored mid-way (before the schema was fixed,
and once more after a test-script bug was found) - Postgres rolled back the failed transaction's
writes automatically, but the `Fixture`/`Game` rows created *before* entering that transaction
were not part of it and had to be deleted manually. Confirmed clean before each retry.

## Results: all ten scenarios passed

| # | Scenario | Result |
| - | --- | --- |
| 1 | Score a 2PT shot - `Fixture.homeScore`, `PlayerStat` (points/FGM/2PM), `TeamStat` | PASS |
| 2 | Score a 3PT shot - `PlayerStat.threePointsMade`/`threePointsAttempted` | PASS |
| 3 | Undo the 2PT immediately (before any other event exists, since `undoLastEvent` only ever targets the most recent one) - Fixture score AND shot-category deltas both reverse | PASS - this is the exact bug this session's standalone fix (commit `9251321`) addressed |
| 4 | Record a rebound via `recordStatEvent` - `PlayerStat.rebounds` via the new `applyCountingStatDelta` primitive | PASS |
| 5 | Undo the rebound (now the most recent event) - exercises `undoLastEvent`'s generic branch | PASS |
| 6 | Void a 3PT via `voidScoreEvent` - Fixture score, player's points/3PM/3PA, status -> VOIDED | PASS |
| 7 | Correct a 2PT to a 3PT with a wrong-player correction via `correctScoreEvent` - old player's stat reverts, new player's stat applies, original -> CORRECTED | PASS |
| 8 | Ultra-Time-against: score a 4PT during Ultra Time (x2 = 8 pts), void it - both the scoring team's `ultraTimePointsFor` AND the opposing team's `ultraTimePointsAgainst` revert to 0 | PASS - the pure function's most complex branch, backed by 9 unit tests in `score-event-contribution.test.ts`, now also confirmed end-to-end |
| 9 | Hand-verify final arithmetic (reconciliation-equivalent): sum of ACTIVE `SCORE`/`SCORE_CORRECTION` events per team matches `Fixture.homeScore`/`awayScore` exactly | PASS |
| 10 | Reload/persistence: a fresh read (not the reference used to compute the prior assertion) matches | PASS |

Two test-script bugs were found and fixed *in the rehearsal script itself* during this run, not in
the code under test - both caught by the assertions failing as designed:
- Calling "undo" after scoring both a 2PT and a 3PT targeted the 3PT (the actual most recent
  event), not the 2PT the test intended - `undoLastEvent` behaved correctly given what was
  actually asked of it. Fixed by reordering the scenario.
- `correctScoreEvent`'s returned `actualPoints` is the replacement event's own point value
  (`newScore - baseScore`, where `baseScore` already excludes the original event's points), not
  "new minus old" - matches the pre-existing, unmigrated `correctScoreEventAction`'s own
  definition exactly. Fixed the test's expectation, not the code.

## Coverage gap: what this smoke test did NOT verify

Because browser login was prohibited, calling the canonical services directly proves the
service-level write paths (all ten scenarios) but does not exercise:

- **The UI rendering path** - whether the box score panel, scoreboard, or live game view actually
  reflects these writes correctly.
- **The auth/permission layer** - `requireFixturePermission`, `result:confirm`,
  `game:operate`, organization-context resolution from a real session.
- **The HTTP/route layer** - the actual Next.js Server Action boundary (form parsing, zod
  validation in `actions.ts`, `revalidatePath` cache invalidation).

For A3b's purposes this is very likely sufficient - A3b is a server-side sync endpoint, and
service-level verification is the right layer for it. But a future reader should not read "smoke
test passed" as "verified end-to-end including the UI." If a real logged-in smoke test becomes
possible (a dedicated QA account with a properly scoped, low-privilege permission set - not an
admin credential), it's worth running once before Batches 10-12's code reaches production.

## Process gap, flagged not fixed here

Production schema was behind by these same two migrations, written in this session's Batch 0 and
never applied. Either the deploy process doesn't run `prisma migrate deploy` automatically, or it
does and this branch's deploy skipped it, or it's a manual step that got missed. Investigate after
A3b lands - it's a deployment-infrastructure fix, not part of A3a or A3b's own scope, and A3b's own
migrations will hit the same silent-gap risk if the process itself isn't fixed.

## Conclusion

Batches 10a-12's canonical-write migration is verified correct end-to-end at the service layer,
including both previously-latent bugs this session found and fixed ahead of migration
(`undoLastEvent`'s shot-category and Ultra-Time-mirror reversal gaps). The pre-existing migration
gap this smoke test surfaced has been closed on both staging and production, isolated from any
code deploy (expand/contract - schema now, code later). Environment used for the rehearsal script:
staging (`app.neonultra.ng/staging`), per explicit direction - not production, not local dev. The
migration application itself was done directly against both staging and production databases, per
separate explicit instruction, following the sequence in "Applied to production separately" above.
