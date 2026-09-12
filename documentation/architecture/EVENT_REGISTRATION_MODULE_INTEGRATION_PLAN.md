# Event Registration Module — Integration Plan (Option B)

Status: Independent module implemented; NOT integrated, NOT migrated, NOT deployed.

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
    ├── in-memory.ts            # no-DB adapter (local/dev/tests)
    ├── ultra-league-os.ts      # Prisma adapter delegating to service.ts
    ├── index.ts                # getRegistrationHost() factory
    └── host.test.ts            # adapter conformance tests
```

`getRegistrationHost("memory" | "ultraos")`, or `REGISTRATION_PERSISTENCE=memory`
env, selects the adapter. Default is `ultraos` so production behavior is unchanged.

## 1. Files that can be merged directly

The entire `src/lib/registration/` tree is already in the main repository and
integration-ready. The domain/rules (`sport-config*`, `validation`,
`normalization`, `reference`, `sport-rules`) and the Ultra League OS adapter
(`adapters/ultra-league-os.ts`, `service.ts`) map onto the committed R1/R2
Prisma models with no schema change. The public route, review pages, and admin
builder already consume this layer.

## 2. Local adapter to be replaced

`adapters/in-memory.ts` is the **development/test-only** adapter. It is never
used when `REGISTRATION_PERSISTENCE` is unset (default `ultraos`). At integration
it is retained solely for fast tests; no runtime path depends on it.

## 3. Reused Prisma models

`Organization`, `Event` (+`slug`), `RegistrationForm` (+`sports`,`sportConfig`),
`RegistrationField`, `RegistrationSubmission`, `RegistrationParticipant`,
`RegistrationParticipantSport`, plus `Venue`/`Season` (required by `Event`).
No parallel registration schema is created.

## 4. Server actions to connect

The existing server actions already delegate to `service.ts`:
`/events/[organizationSlug]/[eventSlug]/register/actions.ts` (public) and
`/events/[id]/registration/actions.ts` (admin). At integration they can either
keep calling `service.ts` or be switched to `getRegistrationHost()`; both expose
the same behavior because the Ultra League OS adapter delegates to `service.ts`.

## 5. ID mapping

No synthetic IDs are introduced in the Ultra League OS adapter. It passes through
`Organization.id`, `Event.id`, `RegistrationForm.id`, and generated
`RegistrationSubmission.referenceNumber`. The in-memory adapter uses `mem-<n>`
ids **only** in tests and never crosses the boundary; no mapping is required on
merge.

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

Once the Ultra League OS adapter is verified, delete or keep the in-memory
adapter as test-only tooling; `getRegistrationHost` continues to default to
`ultraos`. No data migration or removal of the shared schema is involved.

## Defect found during this work

Adapter conformance testing found that **draft** submissions were counted by the
cross-team duplicate check, so a team's own draft blocked its later submission.

## Regression requirements

The following are explicit, tested regression requirements — do not weaken them
during integration:

- **Duplicate detection counts only ACTIVE registrations.** A participant whose
  only prior registration is `DRAFT`, `WITHDRAWN`, or `REJECTED` **must be allowed
  to submit again**, subject to the normal validation and active-registration
  rules. A `PENDING`/`UNDER_REVIEW`/`APPROVED`/`WAITLISTED` registration for the
  same child in the same event still blocks a duplicate.
- Enforced in both adapters: `adapters/in-memory.ts` (skips inactive statuses) and
  `service.ts` `existingMatchKeysForEvent` (`submission.status notIn DRAFT,
  WITHDRAWN, REJECTED`). Regression tests live in
  `src/lib/registration/adapters/host.test.ts`.

## Not in scope here

- No migration applied, no staging/production access, no deploy/push.
- Event-detail "Registration setup" navigation link: still a documented
  follow-up (not required for module usability).
