---
title: Multi-Sport Staging Migration and Backfill Runbook
status: PLANNING ONLY — NOT EXECUTED
version: multi-sport-runbook-1.0
last_updated: 2026-09-13
---

# Multi-Sport Staging Migration and Backfill Runbook (Stages 1.3–7)

Status: **PLANNING ONLY — NOT EXECUTED.** Every command below is read-only or a proposal awaiting
explicit approval. Nothing in this runbook was run against any database.

Target: **staging only** — database `ultraos_staging` on the VPS Postgres container
(`127.0.0.1:55411`), privileged role `ultraos` for deploy/backup, restricted runtime role
`ultraos_staging` for verification. **Production (`ultraleagueos`) is out of scope and must never
be targeted.** Credentials are read from VPS env files and must not be printed.

This runbook covers the eleven migrations authored for multi-sport Stages 1.3 and 2–7, the
compatibility backfills, and the parity checks that close Gates G2, G3, and G5.

## 0. Preconditions (read-only)

Confirm before anything else:

```bash
# Migration status (privileged): note the pending set and any FAILED/rolled-back rows.
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at FROM _prisma_migrations ORDER BY started_at DESC LIMIT 20;"

# Row-count snapshot to prove no data loss later.
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT (SELECT count(*) FROM \"Organization\"), (SELECT count(*) FROM \"Club\"), (SELECT count(*) FROM \"SeasonClub\"), (SELECT count(*) FROM \"Athlete\"), (SELECT count(*) FROM \"Player\"), (SELECT count(*) FROM \"GameEvent\");"
```

Record the outputs. Expected baseline: the existing chain applied through
`20260912140000_team_competition_draft_consent_active`; the eleven migrations below pending.

Known pre-existing drift (from the earlier event-registration runbook): a historical rolled-back
row for `20260823070000_phase1_stage4a_row_level_security`. It did not block the previous
`migrate deploy`; re-check it and stop if `migrate status` now refuses to proceed.

## 1. Exact migration chain

Read from the migration directories (not memory). Order is timestamp order; Prisma applies it
as-is.

| Order | Migration directory | Stage | Kind / notes |
| ---: | --- | --- | --- |
| 1 | `20260913090000_sport_definition_override` | S1.3 | New tenant table `SportDefinitionOverride`; index; FKs. |
| 2 | `20260913090100_sport_definition_override_rls` | S1.3 | RLS + grants for `SportDefinitionOverride`. |
| 3 | `20260913100000_entrant_abstraction` | S2 | Enums `EntrantType`/`EntrantStatus`/`EntrantMemberRole`; tables `Entrant`/`EntrantMember`; nullable entrant refs on `Fixture`/`GameEvent`/`Standing`/`TeamStat`; `Competition_organizationId_id_key`. |
| 4 | `20260913100100_entrant_abstraction_rls` | S2 | RLS + grants for `Entrant`/`EntrantMember`. |
| 5 | `20260913110000_generic_statistics` | S3 | Enums `StatValueType`/`StatSubjectType`/`StatAggregation`; tables `SportMetricDefinition` (global) / `GameMetricValue`; grants for the global catalog. |
| 6 | `20260913110100_generic_statistics_rls` | S3 | RLS + grants for `GameMetricValue`. |
| 7 | `20260913120000_rule_sport_config` | S4 | Nullable `sportId`/`config` on `RuleSet`; `sportId`/`definitionVersion`/`ruleValues` on `GameRuleSnapshot`; FKs. |
| 8 | `20260913130000_generalized_standings` | S5 | `Standing` outcome/rank columns; table `StandingMetric`. |
| 9 | `20260913130100_generalized_standings_rls` | S5 | RLS + grants for `StandingMetric`. |
| 10 | `20260913140000_event_vocabulary` | S6 | `GameEvent.typeKey`/`data`; table `SportEventDefinition` (global); grants for the global catalog. |
| 11 | `20260913150000_registration_sport_unify` | S7 | `RegistrationForm.sportIds`; `RegistrationParticipantSport.sportId` + FK + index. |

### Dependencies

- 2 → 1; 4 → 3; 6 → 5; 9 → 8 (RLS after its DDL).
- 5 → 3 (`GameMetricValue.entrantId` → `Entrant`).
- 10 → 3 (`SportEventDefinition` is independent, but `GameEvent.typeKey` backfill needs Entrants).
- 11 → existing registration tables.

### Content analysis

- **Destructive operations:** none. All migrations are `CREATE`/`ALTER ... ADD`; no `DROP`,
  `TRUNCATE`, `DELETE`, or data `UPDATE`/`INSERT`.
- **Backfills required:** none inside migrations. Data population is done by the scripts in
  Section 5.
- **RLS/grants:** the three global tables (`SportDefinitionOverride` is tenant-owned and covered by
  its RLS migration; `SportMetricDefinition` and `SportEventDefinition` are global and granted in
  their DDL migrations). No default privileges exist, so every new table grants explicitly.
- **Compatibility:** all new columns are nullable or defaulted; existing basketball reads are
  unaffected. `SportDefinitionOverride` is empty until an admin saves a rule override, so the
  resolver falls back to the code registry (no behaviour change).

## 2. Backup (PROPOSED; not executed)

Backup with the privileged `ultraos` role (a dump as the restricted role would be RLS-filtered).

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
DIR=/var/backups/ultraleagueos-staging
F="$DIR/multisport_stages1.3-7_premigration_${TS}.dump"
mkdir -p "$DIR"
docker exec ultraos-postgres pg_dump -U ultraos -Fc -d ultraos_staging > "$F"
```

Verify:

```bash
stat -c '%s' "$F"                                                # non-empty byte size
sha256sum "$F"                                                   # record the checksum
docker exec -i ultraos-postgres pg_restore --list < "$F" | wc -l # TOC entry count
```

Optional isolated restore check (never overwrites staging):

```bash
docker exec ultraos-postgres psql -U ultraos -c 'CREATE DATABASE ultraos_staging_restorecheck;'
docker exec -i ultraos-postgres pg_restore -U ultraos -d ultraos_staging_restorecheck --no-owner --role=ultraos < "$F"
# spot-check counts, then:
docker exec ultraos-postgres psql -U ultraos -c 'DROP DATABASE ultraos_staging_restorecheck;'
```

## 3. Read-only drift check (PROPOSED)

```bash
export DATABASE_URL="<privileged staging URL, /ultraos_staging>"

# 3a. Expected: exactly the eleven migrations above pending; watch for failed rows.
npx prisma migrate status

# 3b. Live-DB -> schema diff. Must be semantically equal to the union of migrations 1–11.
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Interpretation:

- **Expected diff:** the 6 new enum types, 5 new tables (`SportDefinitionOverride`, `Entrant`,
  `EntrantMember`, `SportMetricDefinition`/`GameMetricValue`, `StandingMetric`,
  `SportEventDefinition`), the added columns, indexes, and FKs, plus grant statements.
- **STOP** on any `DROP`, type narrowing, or statement touching objects outside this set.
- **STOP** if `_prisma_migrations` disagrees with the live schema.

## 4. Migration execution (PROPOSED)

```bash
export DATABASE_URL="<privileged staging URL, /ultraos_staging>"
# Gate 0: backup verified (2) and drift check acceptable (3).
npx prisma migrate deploy
npx prisma migrate status     # expect "Database schema is up to date!"
```

Rules: no `db push`; no `--force-reset`; no database reset/drop; never production; capture full
stdout; stop on the first failure and do not retry blindly.

## 5. Backfill sequence (PROPOSED)

Run **in this order**. Every script is dry-run by default; add `--apply` only after the dry-run
output is reviewed. Each script runs per organization through the tenant context (RLS) and is
idempotent, so a re-run is safe.

Dependency: **Entrant first** — the metrics and standings backfills resolve team stats through
Entrants.

```bash
# 5.1 Entrants (Stage 2). Creates one TEAM Entrant per SeasonClub and populates entrant refs.
npm run entrant:backfill                         # dry-run
npm run entrant:backfill -- --apply
npm run entrant:parity-check                     # Gate G2

# 5.2 Metrics (Stage 3). Catalog sync first, then the compatibility projection.
npm run metrics:sync-definitions                 # dry-run
npm run metrics:sync-definitions -- --apply
npm run metrics:backfill                         # dry-run (needs 5.1 applied)
npm run metrics:backfill -- --apply
npm run metrics:parity-check                     # Gate G3

# 5.3 Rules (Stage 4).
npm run rules:backfill                           # dry-run
npm run rules:backfill -- --apply
npm run rules:parity-check

# 5.4 Standings (Stage 5). Needs 5.1 applied.
npm run standings:backfill                       # dry-run
npm run standings:backfill -- --apply
npm run standings:parity-check                   # Gate G5 (basketball parity)

# 5.5 Events (Stage 6).
npm run events:sync-definitions                  # dry-run
npm run events:sync-definitions -- --apply
npm run events:backfill                          # dry-run
npm run events:backfill -- --apply
npm run events:parity-check

# 5.6 Registration sport identity (Stage 7). Upserts Sport rows for volleyball/flag-race.
npm run registration-sport:backfill              # dry-run
npm run registration-sport:backfill -- --apply
npm run registration-sport:parity-check
```

Expected dry-run signals before applying:

- `entrant:backfill`: `entrantsToCreate` equal to the SeasonClub count on a fresh run; `0` on a
  re-run.
- `metrics:sync-definitions` / `events:sync-definitions`: non-zero metric/event counts per sport.
- `metrics:backfill`: non-zero `playerValues`/`entrantValues`; `skippedTeamStats` should be `0`
  once 5.1 is applied.
- `standings:backfill`: `updated` equal to the Standing count; `skipped` `0`.
- `registration-sport:backfill`: `updated` equal to the participant-sport and form counts.

Parity checks must print `PARITY OK`. A non-zero exit is a hard stop.

## 6. Gate mapping

| Gate | Closed by | Evidence |
| --- | --- | --- |
| G2 (Entrant parity) | `entrant:parity-check` | `PARITY OK` |
| G3 (stat projection parity) | `metrics:parity-check` | `PARITY OK` |
| Stage 4 (snapshot round-trip) | `rules:parity-check` | `PARITY OK` |
| G5 (basketball standings parity) | `standings:parity-check` | `PARITY OK` |
| Stage 6 (event vocabulary) | `events:parity-check` | `PARITY OK`, `withoutTypeKey=0` |
| Stage 7 (registration sport) | `registration-sport:parity-check` | `PARITY OK` |

## 7. Post-migration validation (read-only)

```bash
# 7a. New tables present.
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT to_regclass('public.\"SportDefinitionOverride\"'), to_regclass('public.\"Entrant\"'), to_regclass('public.\"EntrantMember\"'), to_regclass('public.\"SportMetricDefinition\"'), to_regclass('public.\"GameMetricValue\"'), to_regclass('public.\"StandingMetric\"'), to_regclass('public.\"SportEventDefinition\"');"

# 7b. RLS enabled + forced on the tenant-owned new tables.
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('SportDefinitionOverride','Entrant','EntrantMember','GameMetricValue','StandingMetric') ORDER BY relname;"

# 7c. Migration rows recorded.
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT migration_name FROM _prisma_migrations WHERE migration_name >= '20260913000000' ORDER BY migration_name;"

# 7d. No data loss (compare to the Section 0 snapshot).
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
  "SELECT (SELECT count(*) FROM \"Organization\"), (SELECT count(*) FROM \"Club\"), (SELECT count(*) FROM \"SeasonClub\"), (SELECT count(*) FROM \"Athlete\"), (SELECT count(*) FROM \"Player\"), (SELECT count(*) FROM \"GameEvent\");"
```

## 8. Application deploy and smoke (PROPOSED)

The engine changes are additive; the only app surfaces that read the new schema are the
tournament onboarding flow and `/competitions/[id]/sport-rules` (which reads
`SportDefinitionOverride`). Follow the existing staging release process:

```bash
npx prisma generate
npm run build
# deploy to /opt/ultraos-staging/current and restart the isolated staging service
systemctl restart ultraos-staging-web.service        # verify working directory + unit identity first
# smoke
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4120/login
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4120/public
```

Expected: `/login` and `/public` return 200; the authenticated tournament and sport-rules pages
render for an operator with `competition:manage`.

## 9. Rollback

- **Data rollback (backfills):** all backfills only set previously-null additive columns. To
  revert, null them (approval required):

  ```sql
  UPDATE "Fixture" SET "homeEntrantId"=NULL,"awayEntrantId"=NULL,"winnerEntrantId"=NULL;
  UPDATE "GameEvent" SET "entrantId"=NULL,"typeKey"=NULL;
  UPDATE "TeamStat" SET "entrantId"=NULL;
  UPDATE "Standing" SET "entrantId"=NULL,"rank"=NULL,"rankTiebreak"=NULL;
  DELETE FROM "GameMetricValue";
  DELETE FROM "EntrantMember"; DELETE FROM "Entrant";
  DELETE FROM "StandingMetric";
  DELETE FROM "SportDefinitionOverride";
  ```

- **Schema rollback:** the added columns are nullable/defaulted and safe to leave. Dropping the new
  tables is possible pre-data but irreversible once populated.
- **Failed deploy:** restore the Section 2 backup. Do not use `migrate resolve --rolled-back`
  without explicit approval.
- **No production action of any kind.**

## 10. Approval checklist (all required before execution)

- [ ] Eleven-migration chain confirmed in order 0900→1500.
- [ ] Pre-existing rolled-back Stage 4a row assessed; repair plan approved if it blocks.
- [ ] Backup executed and verified (size + SHA-256 + TOC count).
- [ ] Drift check reviewed; pending set equals the eleven migrations; no destructive diff.
- [ ] Target database confirmed as `ultraos_staging` (never production).
- [ ] Backfill dry-runs reviewed; apply order approved (Entrant first).
- [ ] Parity checks reviewed; `PARITY OK` required for each.
- [ ] Restore/rollback procedure reviewed.
- [ ] Staging service restart window agreed.

## Risks / blockers

1. Pre-existing migration-history drift (residual rolled-back Stage 4a row) may need repair first.
2. Backfill volume on large tables (`GameEvent` is the largest) — run dry-run first and allow time.
3. `metrics:backfill` requires Entrants (5.1) applied first; a partial run will report
   `skippedTeamStats > 0`.
4. The `Sport` catalog gains rows for volleyball/football/cricket/tennis/flag-race; these are
   global reference rows with no tenant data and can remain.
5. All commands are proposals; actual results must be recorded in an execution section appended
   after an approved run.
