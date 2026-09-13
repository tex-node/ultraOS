# Event Registration Module — Integration Plan (Option B)

Status: Deployed to staging and verified over HTTP (2026-09-12); R1/R2 migrations
applied. The module is DB-backed: `getRegistrationHost()` returns the Ultra League
OS adapter and the in-memory adapter has been retired.

## Defects found during this work

1. **Cross-team duplicate check counted drafts** (adapter conformance): a team's own
   draft blocked its later submission. Fixed in both adapters; only active
   registrations (`notIn DRAFT, WITHDRAWN, REJECTED`) count.
2. **DB-only, found by the DB-backed contract** (invisible to `tsc`): the nested
   participant create passed `athleteId: null` (invalid on the checked variant) and
   used `organization: { connect }`, which failed the tenant RLS `WITH CHECK`.
   Fixed in `service.ts` by creating participants and sport memberships with
   explicit `organizationId` (unchecked creates), avoiding nested relation connects
   on RLS-protected tables.

The Volleyball/Flag Race registration experience is developed against a narrow
`RegistrationHost` port with two adapters, so it can run and be tested **without**
the unapplied R1/R2 staging migrations, and later switch to Ultra League OS
without a competing schema.

## Module structure

```text
web/src/lib/registration/
├── host.ts                     # RegistrationHost port + module DTOs
├── sport-rules.ts              # single authoritative rule facade
├── sport-config.ts             # existing zod-validated SportConfig
├── sport-config-admin.ts       # presets + cross-field rules (authoritative)
├── validation.ts               # submission/field validation
├── normalization.ts            # name+DOB match keys
├── reference.ts                # opaque reference numbers + retry
├── service.ts                  # Ultra League OS (Prisma) service
└── adapters/
    ├── ultra-league-os.ts      # Prisma adapter delegating to service.ts (sole adapter)
    ├── index.ts                # getRegistrationHost() factory (DB-backed)
    ├── host.test.ts            # adapter surface test
    └── db-contract.test.ts     # DB-backed adapter contract + duplicate regression
```

`getRegistrationHost()` always returns the database-backed Ultra League OS adapter.
The in-memory adapter and the `REGISTRATION_PERSISTENCE` switch have been removed.

## 1. Files that can be merged directly

The entire `src/lib/registration/` tree is already in the main repository and
integration-ready. The domain/rules (`sport-config*`, `validation`,
`normalization`, `reference`, `sport-rules`) and the Ultra League OS adapter
(`adapters/ultra-league-os.ts`, `service.ts`) map onto the committed R1/R2
Prisma models with no schema change. The public route, review pages, and admin
builder already consume this layer.

## 2. Local adapter retired

`adapters/in-memory.ts` was the development/test-only adapter. It has been
deleted: `getRegistrationHost()` now always returns the database-backed Ultra
League OS adapter, and the `REGISTRATION_PERSISTENCE=memory` selection is gone.

## 3. Reused Prisma models

`Organization`, `Event` (+`slug`), `RegistrationForm` (+`sports`,`sportConfig`),
`RegistrationField`, `RegistrationSubmission`, `RegistrationParticipant`,
`RegistrationParticipantSport`, plus `Venue`/`Season` (required by `Event`).
No parallel registration schema is created.

## 4. Server actions to connect

The existing server actions already delegate to `service.ts`:
`/register/[organizationSlug]/[eventSlug]/actions.ts` (public) and
`/events/[id]/registration/actions.ts` (admin). At integration they can either
keep calling `service.ts` or be switched to `getRegistrationHost()`; both expose
the same behavior because the Ultra League OS adapter delegates to `service.ts`.

The public route was relocated from `/events/[organizationSlug]/[eventSlug]/register`
to `/register/[organizationSlug]/[eventSlug]`. Next.js forbids two different
dynamic segment names (`[id]` vs `[organizationSlug]`) at the same path position,
and the existing admin routes already own `app/events/[id]`; the static `register`
segment removes the conflict without changing organization/event scoping.

## 5. ID mapping

No synthetic IDs are introduced in the Ultra League OS adapter. It passes through
`Organization.id`, `Event.id`, `RegistrationForm.id`, and generated
`RegistrationSubmission.referenceNumber`. No synthetic ids and no mapping are
introduced at the boundary.

## 6. R1/R2 migration handling

Migrations `20260912120000`, `20260912120100`, `20260912130000`,
`20260912130100`, `20260912140000` are committed but **not applied**. Integration
requires the separately approved staging migration runbook
(`STAGE_EVENT_REGISTRATION_STAGING_MIGRATION_RUNBOOK.md`): backup, read-only
drift check, `prisma migrate deploy`. The module code does not apply migrations.

## 7. Staging verification after integration

After `migrate deploy`: run the adapter conformance suite against the Ultra
League OS adapter (`REGISTRATION_HOST_DB=1`), then the read-only post-migration
checks, then a disposable end-to-end submission, then the seed dry-run/apply on
an approved all-female event. No production target.

## 8. Retiring the independent path

Done: the Ultra League OS adapter is verified and deployed, the in-memory adapter
is deleted, and `getRegistrationHost()` always returns the database-backed
adapter. No data migration or removal of the shared schema is involved.

## Regression requirements

The following are explicit, tested regression requirements — do not weaken them
during integration:

- **Duplicate detection counts only ACTIVE registrations.** A participant whose
  only prior registration is `DRAFT`, `WITHDRAWN`, or `REJECTED` **must be allowed
  to submit again**, subject to the normal validation and active-registration
  rules. A `PENDING`/`UNDER_REVIEW`/`APPROVED`/`WAITLISTED` registration for the
  same child in the same event still blocks a duplicate.
- Enforced in the database adapter's `service.ts` `existingMatchKeysForEvent`
  (`submission.status notIn DRAFT, WITHDRAWN, REJECTED`). Regression tests live in
  `src/lib/registration/adapters/db-contract.test.ts` (`REGISTRATION_HOST_DB=1`).

## Not in scope here

- Staging R1/R2 migrations were applied and verified 2026-09-12; production was
  never accessed and nothing was pushed. The public route
  `/register/[organizationSlug]/[eventSlug]` and the admin routes are wired to the
  DB-backed layer and deployed to staging.
- Event-detail "Registration setup" navigation link: still a documented
  follow-up (not required for module usability).
