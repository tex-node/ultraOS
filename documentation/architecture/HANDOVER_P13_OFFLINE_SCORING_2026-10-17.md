# Handover - P13 Offline Scoring & Sync (and the LBCL data work) - 2026-10-17

Written for whoever picks this up next, human or agent. State is as observed on 2026-10-17, not as
remembered; re-check anything marked VERIFY before acting on it. The long-form record is `session.md`
(entries 2026-09-27 -> 2026-10-07 for P13 and LBCL); this note is the short version plus the things
that are easy to get wrong.

## 0. P0 - production is throwing errors right now (fix first)

**Production's database is missing migration `20260928120000_gameevent_resolution_provenance`, but
production is running code that needs it.**

- Production release is `release-3be51dc-20261014T193534Z`. It contains the whole P13 stack
  (commits `832b687`..`0fb5970`), whose `schema.prisma` declares `GameEvent.resolvedBy` and
  `GameEvent.clientObservedAt`. It reached production as part of an unrelated GIESM deploy on
  2026-10-14, and that deploy did not apply the migration.
- Verified 2026-10-17 (read-only): prod `GameEvent` has `deviceId`/`idempotencyKey` but NOT
  `resolvedBy`/`clientObservedAt`; latest recorded migration is `20260927120001`.
- Verified live errors: `journalctl -u ultraos-web.service` shows `The column GameEvent.resolvedBy does
  not exist in the current database` (P2022) on 2026-10-16 22:16 (3 occurrences, both on reads).
  Prisma selects every column, so ANY read or write of a `GameEvent` row fails. Prod has only 9
  GameEvent rows (newest Aug 2026) and no live Neon-scored games, which is the only reason this is
  quiet. First real scoring/statistician use, or any public page that reads events, will 500.
- This is exactly the failure `docs/runbooks/a3a-batch10-12-smoke-test.md` warned about for the earlier
  P13 migrations ("schema ships alone, before the code"). It happened again because deploys do not run
  `--migrate` by default and nothing checks for pending migrations.
- Staging is fine (migration applied there; 0 errors).

**Fix (additive, no table rewrite, no restart needed - same procedure as the runbook):**
1. `pg_dump --format=custom` production to `/var/backups/ultraleagueos-production/` and
   `pg_restore --list` it.
2. Read the migration end to end: it is `CREATE TYPE "GameEventResolution"` + `ALTER TABLE "GameEvent" ADD
   COLUMN "resolvedBy" ... NOT NULL DEFAULT 'SERVER'` + nullable `clientObservedAt`. Nothing drops or
   retypes anything.
3. `cd /opt/ultraleagueos/current/web` and run `DATABASE_URL=<privileged url from
   /opt/ultraleagueos/shared/migrate.env, search params stripped> npx prisma migrate deploy`.
4. Verify both columns exist, the migration is recorded, and no new P2022 appears in the log for 5 minutes.
Do NOT print credentials. This was not done by me because it is a production schema change nobody has
approved in this session; it needs a human yes (and the permission classifier will want one too).

**Process fix to make after:** run `prisma migrate status` against the target DB as a step of every
deploy, or always pass `--migrate` and let the script fail loudly. Today's deploy script silently
skips it.

## 1. Where P13 stands

Plan and status table: `documentation/PRODUCT_ROADMAP.md` section 6/7 (rows A3a-A5).

| Item | State |
|---|---|
| A3a canonical-write migration | Done. Ratchet: 4 suppressions, ceiling 4 (`npm run lint:canonical-writes`). |
| A3b sync endpoint + replay | Commits 1-3 done and verified on real Postgres (staging). **Two-device integration test still pending.** |
| Option C (offline scoring tap, hedge for Season One 2026-11-14) | Commits 1-3 done: provenance migration, `resolveClientShot`, `validate-client-shot.ts`, replay wiring. **Commit 4 (live-console UI wiring) moved to A5.** |
| A4 offline client | PR1 (trigger wiring) and PR2 (dead-letter, threshold 5) done. PR3 admin page deferred pending fleet evidence. PR4 load test pending. |
| A5 live-console offline integration | **All 8 steps done.** Steps 1-4 in `77a7928`; steps 5-7 (effects extraction, `recordScoreInternal` calling it, replay SCORE parity) in `745eb7b`, `4190cfd`, `2324247`; step 8 (tap conversion, `attachServerGame`, runbook) committed 2026-10-17/18. **Pending: logged-in staging rehearsal with a real network drop, and turning the flag on (off everywhere).** |

**A5 detail (the settled 8-step plan):**
1. DONE - inject `actor` into the five ledger-writing actions. They are now thin `"use server"`
   wrappers in `web/src/app/games/actions.ts` over `*Internal` functions in
   `web/src/app/games/actions-internal.ts`. That file is deliberately NOT `"use server"` (it is
   `server-only`): an exported function taking an `actor` from a `"use server"` file would be a public
   Server Action and an authorization bypass. Do not move those functions back, and do not export them from
   any `"use server"` file.
2. DONE - DB invocation suite `web/src/app/games/actions-internal.test.ts`: 14 cases, all green on real
   Postgres (shot categories, away-team, Ultra Time both directions with asymmetric scores, INVALID_TEAM,
   INVALID_PLAYER, FOUR_POINT_DISABLED via a real GameRuleSnapshot, zod rejection). Mutation-checked: swapping
   the opponent side makes the right tests fail. `INVALID_SHOT_VALUE` is unreachable through
   `recordScoreInternal` (zod rejects first) - tested as a ZodError instead.
3. DONE - pure `computeScoreConsequences` (`web/src/lib/scoring/compute-score-consequences.ts`, 10 unit
   tests). Returns `{valid:true, fixtureDelta, eventFields, playerDelta, teamDelta, opponentUltraDelta} |
   {valid:false, error}`. Naming: "consequences" = pure derivation; "effects" = the I/O that applies them.
4. DONE - `recordScoreInternal` calls it; every write keeps its order and arguments; the error result is
   translated back to a throw at the same point.
5. DONE (2026-10-17) - `applyScoreEffects` extracted to `web/src/server/scoring/applyScoreEffects.ts`. It
   takes a `WriteContext` (`tx` required) exactly like `createGameEvent`; there is deliberately no separate
   `db` parameter - the transaction IS the interface, and test injection happens one level up where the
   transaction is opened (`withGameWrite`'s `prisma` / `ReplayContext.prisma`). `computeScoreConsequences`
   also gained `computeScoreConsequencesForResolvedShot`, the derivation shared with replay, so a
   client-asserted shot never gets re-resolved on the server.
6. DONE (2026-10-17) - `recordScoreInternal` calls it; the 14-test suite passed unchanged (no test edits).
   The audit-log write stays in `recordScoreInternal` after the effects call.
7. DONE (2026-10-17) - `replayOutboxRecord`'s SCORE branch derives consequences from the client's asserted
   shot and calls the same `applyScoreEffects`. The event keeps the client id, `resolvedBy`/`clientObservedAt`
   and the attribution fields replay used to spread through. Before/after score fields come from the
   SERVER's fixture row, not the client's snapshot. New guards: `INVALID_TEAM`, `INVALID_PLAYER`,
   `INVALID_SCORE_PAYLOAD`, plus shot validation when the record carries no `clientObservedAt`.
   Parity test `web/src/server/sync/score-effects-parity.test.ts` (3 cases; compares every field either path
   writes). Note: three `replay-outbox-record.test.ts` tests were date-bombed (hardcoded 2026-09-28
   `clientObservedAt` outside the 24h plausibility window) and now use a fresh timestamp.
8. DONE (2026-10-17/18) - live console taps go through `live-score-capture.tsx`: same `recordScore` action
   when online, local capture when offline with the flag on. `LocalScoringRepository.attachServerGame`
   mirrors a server-owned game locally WITHOUT enqueueing `Game:CREATE` (that can only ever dead-letter on
   `Game.fixtureId`'s unique constraint). `web/src/lib/offline/score-capture.ts` resolves + queues the tap;
   jsdom component test covers offline queue / online action / flag-off. Runbook:
   `documentation/runbooks/live-console-offline.md`. Known limitation: the on-screen score does not move
   while offline (no local score projection yet) - the queue acknowledgment is the operator's feedback.

**Invariants worth knowing before touching this code**
- `syncUltraTimeState` is LIVE-ONLY. It compares the game's current wall-clock state to the persisted flag;
  invoking it during replay would write transition events with wrong period/clock. See the "wall-clock-derived
  event fields" section of `docs/canonical-write-audit.md`.
- The client asserts the shot's multiplier/isUltraTime; the server validates (`validate-client-shot.ts`), it
  does not re-resolve. A validation failure must THROW inside the transaction so the idempotency claim rolls back.
- `withGameWrite` takes an optional injected `prisma` (default: the global singleton). That is what makes DB tests possible.
- Outbox is Game + GameEvent only. Do not reintroduce PlayerStat sync.

## 2. LBCL (Lagos Basketball Community League) data

- Pipeline: `web/scripts/data/build-lbcl-batch.mjs` -> `lbcl-2026-batch1.json` (32 games) ->
  `web/scripts/external-stats-ingest.ts` (dry run by default, `--apply` writes). Verify with
  `web/scripts/data/verify-batch.mjs`. Games 1-33 are loaded on staging AND production (32 games; sheet
  numbers 26 and 28 were never supplied; two different Friday games are both printed "Game 25").
- Season end date set to 2026-11-29 on both environments via `update-lbcl-season-end-date.ts <orgId> <YYYY-MM-DD> [--apply]`.
- Ids: LBCL org on staging `cmucf1lo500003bkk1zyyoxmh`, production `cmucgcmxk0000svkkew5wg9yf`.
- Method that worked: transcribe each sheet table by crop + 2.4x upscale, check every column against the sheet's
  Totals row (players + the Team/Coach row for OR/DR/TO/PF), plus FGM=2PM+3PM, points=2*2PM+3*3PM+FTM per player.
  That check caught 4 real transcription errors across the two batches that hand-summing missed. Keep doing it.
- Name matching is the weak point: the importer matches by normalized name only and creates a new player on a miss.
  Reconcile every row against the LIVE roster first. **Open judgement calls to review** are listed in `session.md`
  (2026-10-02 and 2026-10-07 entries): Jamelo U vs Whatson Shedrack (both wore #0), the two White Fire "Okoye/Okeye
  Faith" and "Joseph Reginald/Reginald Kelechi" probable duplicates, Chuka O -> Chukwu Obi, and ~10 moderate merges.
- Players with no jersey: ensurePlayer enforces `(seasonClubId, jerseyNumber)` unique, so a new name on a taken jersey
  gets `jerseyNumber: null`, never a guessed number.

## 3. Environment facts that cost time

- **Everything real runs on the VPS** (`ssh raivstream`, root). Local `web/.env` is the Prisma placeholder; there is no
  usable local Postgres. Staging release `/opt/ultraos-staging/current`, production `/opt/ultraleagueos/current`
  (symlinks into `releases/`), staging db `ultraos_staging`, production db `ultraleagueos`. The privileged url is in
  `/opt/ultraleagueos/shared/migrate.env` (strip `?schema=`; rewrite the path for staging). Never echo env values.
- **Run scripts in a scratch copy under /tmp made with `cp -a`, never `cp -al`.** A hardlink copy plus `scp` overwrites
  files in the live release in place (it happened to me; restored by hash). Re-hash the release against git afterwards.
- **Production-RLS:** ad-hoc reads on production need `withOrganizationContext(orgId, ...)`; an unscoped query returns nothing.
- **DB tests** (`npm run test:db`) now bake in `node --conditions=react-server --import tsx` (the `server-only` guard threw
  under plain tsx). They need a real `DATABASE_URL`, so run them on the VPS in a scratch copy. Running many files at once
  exhausts Postgres's lock table (`max_locks_per_transaction` 64 x 100 conns, 126-model schema; teardown dies with 53200)
  and leaves orphaned `test_<uuid>` schemas - check `pg_namespace` for `^test_[0-9a-f]{32}$` afterwards and drop them one at
  a time. Fix is either raising the setting (needs a Postgres restart) or `--test-concurrency=1`.
- **CI** (`.github/workflows/ci.yml`) runs typecheck, lint, the ratchet and `npm test` only. It does NOT run `test:db` or
  `test:component`. `npm run test:component` (jsdom, 4 tests) passes locally.
- **Deploys** build from GitHub: push first, then `bash /root/deploy.sh --app-root ... --service ... --env-file ... [--migrate]`
  (see `deploy/README.md`). `npm ci` fails with "Missing @swc/helpers@0.5.23" unless package-lock was regenerated on the host
  with npm 10 (already fixed in `3be51dc`; regenerate on the host again if it recurs, never locally with npm 11). The host is
  shared and often loaded (load 5-10 on 6 cores; builds fail around 40) and needs `NODE_OPTIONS=--max-old-space-size=4096`.
- **The permission classifier** blocks production-touching commands and `git push` unless you have a rule or an explicit
  yes. A rule for `git push origin main` was added by the user on 2026-10-07. Do not route around a denial.
- **Parallel sessions share this tree and the VPS.** Other work (GIESM registration, P15 Coaching Assistant, backups/ops) landed
  on `origin/main` after my last push (`0fb5970`..`82bc2e5`). The checkout was found on branch `ops/reconcile-backup-design`
  (3 commits ahead of origin/main, not mine) with an uncommitted edit to `deploy/ops/backup-offsite.sh` (not mine). Check
  `git status`/`git log` before committing, and stage explicit paths only (the tree also holds unrelated untracked folders:
  `UI/`, `Draft UX/`, `data/*.xlsx`, `docs/academy|adr|architecture|...`, `lbcl/` scoresheet images, `clicktest-*` scripts).

## 4. Smaller loose ends

- Leftover scratch copies of the production release on the host: `/tmp/lbcl-p2`, `/tmp/lbcl-se-p`. Plain copies, safe to
  `rm -rf` (my cleanup of production-adjacent paths was blocked by the classifier and not retried).
- Lint on `main` has 7 errors in files I did not touch (`apply-registration-template.ts`, `verify-event-update.ts`,
  `game-result-import.ts`), so CI lint is probably red already.
- `postcss.config.mjs` shows as modified (trailing newline only) - not mine, left alone.
- GIESM: per-gender roster minimums are collected but not enforced; `sportConfigFormSchema` still asserts flag race = 6
  (see the 2026-10-14 session entry). Not P13.

## 5. Suggested order of work

1. Apply the pending production migration (section 0) and verify. 2. Add a pending-migration check to the deploy process.
3. Run a logged-in smoke test of the scoring console on staging (the runbook's open coverage gap: UI, auth, Server Action
   boundary were never exercised end to end, and A5 changed that boundary - `LiveScoreCapture` now calls the
   `recordScore` action from a click handler instead of a form submit, so that path is new and untested in a browser).
4. A5 is code-complete: rehearse the offline path on a real tablet with a real network drop
   (`documentation/runbooks/live-console-offline.md`), then decide on turning `NEXT_PUBLIC_OFFLINE_SCORING_ENABLED` on.
5. A3b two-device integration test; A4 PR3/PR4. 6. Season One is 2026-11-14: decide whether the Option C hedge is still
   wanted and set a cut-off date.
