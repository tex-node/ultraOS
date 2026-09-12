# Staging Migration, Backup, and Drift-Check Runbook — Event Registration (R1 + R2)

Status: PLANNING ONLY — NOT EXECUTED. Every command below is read-only or a
proposal awaiting explicit approval. No migration, backup, seed, event, or form
was created by this task.

Target: **staging only** — database `ultraos_staging` on the VPS Postgres
container (`127.0.0.1:55411`), role `ultraos_staging` (runtime) / `ultraos`
(privileged maintenance). **Production is out of scope and must never be
targeted.** Credentials are read from the VPS env files and must not be printed.

## 0. Confirmed staging state (read-only)

```text
DATABASE: ultraos_staging            HOST: 127.0.0.1:55411 (VPS)
RUNTIME ROLE: ultraos_staging (rolsuper=false, rolbypassrls=false)
ORGANIZATION: neon-ultra (ACTIVE)
EVENTS: 1 — id/name "Season Zero Opening Night" (id seed-event-season-zero-launch)
LATEST APPLIED MIGRATION: 20260907111500_phase1_stage5_5a_bootstrap_locators
Event.slug: ABSENT
Registration tables: ALL ABSENT
_prisma_migrations rows for event_registration/team_competition: 0
```

Staging's applied set matches the repository's tracked chain **up to and
including** `20260907111500`; the only migrations that follow it in the repo are
the five below.

## 1. Exact migration chain

Read from the actual migration directories (not memory):

| Order | Migration directory | Responsibility | Kind |
|---:|---|---|---|
| 1 | `20260912120000_event_registration_v1_foundation` | 6 enums; `RegistrationForm`/`RegistrationField`/`RegistrationSubmission`/`RegistrationParticipant`; indexes + FKs; `Event.slug` + `Event_organizationId_slug_key` | Additive |
| 2 | `20260912120100_event_registration_v1_rls` | ENABLE/FORCE + `tenant_isolation` on the 4 R1 tables; grants | Additive |
| 3 | `20260912130000_team_competition_sport_rosters` | `RegistrationSport` enum; `RegistrationForm.sports`/`sportConfig`; `RegistrationParticipantSport` + indexes/FKs | Additive |
| 4 | `20260912130100_team_competition_sport_rosters_rls` | RLS + grants for `RegistrationParticipantSport` | Additive |
| 5 | `20260912140000_team_competition_draft_consent_active` | `RegistrationSubmissionStatus += DRAFT` (BEFORE PENDING); participant guardian/consent columns; `RegistrationParticipantSport.isActive` | Additive (enum + columns) |

### Dependencies

- M2 → M1 (tables must exist).
- M3 → M1 (`RegistrationForm`, `RegistrationParticipant`).
- M4 → M3 (`RegistrationParticipantSport`).
- M5 → M1 (participant) and M3 (participant-sport).
- Timestamp order `121200 → 121201 → 121300 → 121301 → 121400` is correct and
  Prisma applies in that order.

### Content analysis (from the SQL)

- **Destructive operations:** none. No `DROP TABLE`/`DROP COLUMN`/`TRUNCATE`/
  `DELETE`/`UPDATE`/`INSERT`/data backfill. R1 M1/M2 and R2 M3/M4/M5 only
  `CREATE`/`ALTER ... ADD`.
- **Enum changes:** all new enums in M1/M3; M5 adds `DRAFT` to an existing enum
  via `ALTER TYPE ... ADD VALUE 'DRAFT' BEFORE 'PENDING'` (Postgres 16 permits
  this inside a transaction; the new value is only usable after commit — the
  migration does not use it).
- **Table renames / column drops:** none.
- **Required backfills:** none. M5's new columns have defaults
  (`consentAccepted=false`, `isActive=true`) and are nullable/not-null-safe.
- **Compatibility with current staging:** yes — M1 adds `Event.slug` (nullable,
  so existing Season Zero event rows stay valid) and new tables; nothing touches
  existing basketball data.

### Residual risk in `_prisma_migrations`

There is one historical **rolled-back** row for
`20260823070000_phase1_stage4a_row_level_security` (finished_at NULL,
rolled_back_at set) alongside its finished record. `prisma migrate status` may
report this as a failed migration and **refuse to deploy** until resolved. This
is pre-existing staging drift, not caused by these migrations, and must be
checked (and, if blocking, repaired) under explicit approval before any deploy.

## 2. Backup runbook (proposed; NOT executed)

Backup uses the **privileged** `ultraos` superuser (a dump as the restricted role
would be subject to RLS). One-off, no credential output.

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
DIR=/var/backups/ultraleagueos-staging
F="$DIR/event_registration_premigration_${TS}.dump"
mkdir -p "$DIR"
docker exec ultraos-postgres pg_dump -U ultraos -Fc -d ultraos_staging > "$F"
```

Verification:

```bash
stat -c '%s' "$F"                                   # non-empty byte size
sha256sum "$F"                                      # record the checksum
docker exec -i ultraos-postgres pg_restore --list < "$F" | wc -l   # TOC entry count
```

Optional restore validation (isolated, disposable — never overwrites staging):

```bash
docker exec ultraos-postgres psql -U ultraos -c 'CREATE DATABASE ultraos_staging_restorecheck;'
docker exec -i ultraos-postgres pg_restore -U ultraos -d ultraos_staging_restorecheck --no-owner --role=ultraos < "$F"
# spot-check counts, then:
docker exec ultraos-postgres psql -U ultraos -c 'DROP DATABASE ultraos_staging_restorecheck;'
```

- **Production must not be targeted.** Only `ultraos_staging` and the disposable
  `ultraos_staging_restorecheck`.

## 3. Read-only drift check (proposed)

All commands below **do not modify** the database (status reads; diff writes only
to stdout). Use the privileged staging URL so RLS does not distort the
comparison. Prisma 7 supports `--from-config-datasource` (reads `DATABASE_URL`)
and `--to-schema`; it does **not** expose `--from-url`.

```bash
export DATABASE_URL="<privileged staging URL, /ultraos_staging>"

# 3a. Migration status: expected "5 migrations not yet applied"; watch for failed rows
npx prisma migrate status

# 3b. Live-DB -> schema diff: the DDL needed to bring staging to the committed schema
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Interpretation:

- **Expected pending migrations:** exactly the five above, no more.
- **Expected diff output:** semantically equal to the union of M1–M5 (6+1 enum
  types, 5 tables, indexes/FKs, `Event.slug` index, M5 columns). Any extra
  `CREATE`/`ALTER`/`DROP` indicates drift.
- **Unexpected drift:** statements touching tables/columns/enums outside the five
  migrations (e.g. a staging-only object, or a missing constraint) — STOP.
- **Destructive changes in the diff:** any `DROP`/type narrowing — STOP.
- **`_prisma_migrations` vs actual schema mismatch:** a table exists but no
  finished migration row (or vice versa) — STOP and reconcile history first.

## 4. Migration execution plan (PROPOSED; not executed)

```bash
export DATABASE_URL="<privileged staging URL, /ultraos_staging>"

# Gate 0: backup verified (section 2) and drift check acceptable (section 3).
npx prisma migrate deploy            # applies ONLY the 5 pending migrations, in order
npx prisma migrate status            # confirm "Database schema is up to date"
```

Rules:

1. Do **not** use `prisma db push`.
2. Do **not** use `--force-reset`.
3. Do **not** reset or drop the staging database.
4. Do **not** apply to production.
5. Capture full stdout; **stop on the first failure** and do not retry blindly.
6. `prisma migrate deploy` is the correct command for an existing environment
   (this repository deploys migrations via `migrate deploy`, per its migration
   headers and prior staging/production releases).

## 5. Post-migration validation (read-only)

```bash
# 5a. Tables + Event.slug column
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT to_regclass('public.\"RegistrationForm\"'), to_regclass('public.\"RegistrationField\"'), to_regclass('public.\"RegistrationSubmission\"'), to_regclass('public.\"RegistrationParticipant\"'), to_regclass('public.\"RegistrationParticipantSport\"');"
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Event' AND column_name='slug');"

# 5b. Enums (incl. DRAFT ordering) and RLS
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT t.typname, string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typname LIKE 'Registration%' GROUP BY t.typname ORDER BY t.typname;"
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname LIKE 'Registration%';"

# 5c. Migration records + no data loss (compare against pre-migration counts)
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT migration_name FROM _prisma_migrations WHERE migration_name LIKE '%event_registration%' OR migration_name LIKE '%team_competition%' ORDER BY migration_name;"
docker exec ultraos-postgres psql -U ultraos -d ultraos_staging -tAc \
 "SELECT (SELECT count(*) FROM \"Organization\"), (SELECT count(*) FROM \"Event\"), (SELECT count(*) FROM \"Athlete\");"
```

Expected: 5 tables present; `slug` exists; 7 `Registration*` enum types with
`DRAFT` before `PENDING`; `relrowsecurity`/`relforcerowsecurity` true on the 5
new tables; the 5 migration rows recorded; Organization/Event/Athlete counts
unchanged from the pre-migration snapshot.

Prisma client sanity + seed dry-run (still read-only, **no `--apply`**):

```bash
npx prisma generate
npm run registration:seed-sport-config -- --organization-slug neon-ultra --event-slug <approved-event-slug>
# Expect: no P2022. It should resolve the event or report "not found" cleanly.
```

## 6. Registration seed readiness

- The only staging event is **"Season Zero Opening Night"** (basketball launch),
  now with a **NULL** slug (existing rows are unaffected by the nullable column).
  It is **not** an all-female Volleyball/Flag Race competition.
- A seed run keyed on `--event-slug` therefore cannot find an event until one is
  given an org-scoped slug. **No event/form will be created in this task.**
- Required before seeding (each needs approval): create an event that
  represents the all-female competition (needs a `Venue` + `Season`, since both
  are required on `Event`), assign it a stable org-scoped slug, then either
  create its `RegistrationForm` via `--create-form` or have an admin create it.
- Until the target event/form is explicitly approved, the seed stays **dry-run**.

## 7. Approval checklist (all items required before execution)

- [ ] Migration chain confirmed (5 migrations, order 121200→121400).
- [ ] Residual rolled-back `stage4a` row assessed; repair plan (if needed) approved.
- [ ] Backup command reviewed.
- [ ] Backup verification method reviewed (size + SHA-256 + TOC count, optional restore).
- [ ] Drift-check commands reviewed; expected pending set = the 5 migrations.
- [ ] Target database confirmed as `ultraos_staging` (never production).
- [ ] Migration command reviewed (`prisma migrate deploy`, no db push/reset).
- [ ] Post-migration checks reviewed.
- [ ] Registration event/form target confirmed (created/approved separately).

## Risks / blockers requiring explicit approval

1. Migration-history repair may be needed for the residual rolled-back Stage 4a
   row before `migrate deploy` will proceed.
2. No suitable all-female event exists; creating one (with Venue + Season + slug)
   is a separate approved action.
3. R2 M5's `ALTER TYPE ADD VALUE` is transaction-compatible on PG16 only (staging
   is `postgres:16-alpine`); no production PG version assumption is made here.
4. All commands are proposals — superseded by the execution results below.

## Execution results (2026-09-12)

Status: STAGING MIGRATION APPLIED AND VERIFIED. Production untouched.

- Target: `ultraos_staging` @ `127.0.0.1:55411` (privileged `ultraos` for deploy/status, restricted `ultraos_staging` for the DB contract). Production DB `ultraleagueos` on the same container was **not** targeted.
- Fresh backup: `/var/backups/ultraleagueos-staging/event_registration_premigration_20260912T171050Z.dump` - 839874 bytes, SHA-256 `612cc5df0cd9f16cefe58d9cf7ea25a6bf1dde3335881b07f7ccf461778a8693`, 1253 TOC entries.
- `prisma migrate deploy`: applied the 5 approved migrations in order (121200, 121201, 121300, 121301, 121400); exit 0; `migrate status` reports "Database schema is up to date!". The residual rolled-back Stage 4a row did **not** block.
- Post-migration DB checks: 5 registration tables present; `Event.slug` text nullable; `RegistrationSubmissionStatus = DRAFT,PENDING,UNDER_REVIEW,APPROVED,REJECTED,WAITLISTED,WITHDRAWN` (DRAFT before PENDING); RLS enabled+forced with 1 policy per new table; runtime role has CRUD grants on all 5; row counts unchanged (Organization=1, Event=1, Athlete=219, Player=219).
- DB-backed adapter contract (`REGISTRATION_HOST_DB=1 npm test`): **496/496 pass, 0 fail, 0 skipped**; disposable-org residue 0; counts unchanged.
- Seed: **NOT RUN** - no approved all-female event/form target exists (see blocker 2).
- Route integration: **NOT DONE** (pending seed and end-to-end verification).
- Two DB-only defects were found and fixed during conformance (see the integration plan): nested-create `athleteId` was an invalid argument; nested `organization: connect` failed the tenant RLS `WITH CHECK` (now explicit unchecked creates).
