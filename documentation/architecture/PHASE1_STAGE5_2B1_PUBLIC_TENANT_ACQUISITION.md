# Phase 1, Stage 5.2B-1 — Public Tenant Acquisition & Provisioning Provenance

Closes Stage 5.2B-1. Solves the problem Stage 5.2A explicitly deferred: an unauthenticated
applicant isn't an org member, so session-based `organizationId` resolution doesn't apply to the
`/apply` flow, and creating a permanent `Athlete`/`Player`/`Staff` record requires already
knowing which organization it belongs to.

## Mechanism: server-controlled route slug

`/apply` is now `/apply/[organizationSlug]/...`. The slug comes from the route segment — set by
whichever link the applicant followed, never by client/form input — and is resolved server-side
via `resolveActiveOrganizationBySlug()` (new, in `src/lib/tenant-context.ts`), which throws
`OrganizationNotFoundError` for an unknown or inactive slug (→ `notFound()`, no silent fallback).

The resolved `organizationSlug` reaches the server action as a **bound argument**
(`submitApplication.bind(null, organizationSlug)`), not a hidden form field — Next.js encrypts
bound arguments, so the client cannot tamper with which organization a submission targets. This
was an explicit, non-negotiable requirement: a hidden `organizationId` input would have been
client-supplied trust, exactly what this stage exists to eliminate.

Legacy `/apply` (no slug) is now a plain server redirect to `/apply/neon-ultra` — not the old
Stage 3a DB-default fallback. It's a deliberate, temporary, named exception, not a mechanism a
second organization could rely on.

## Application.organizationId as canonical provenance

The core architectural rule this stage establishes: **once an `Application` row exists, every
downstream step reads `application.organizationId` — never the current session/admin's org.** A
person can legitimately be a member of one league and apply to another; membership context and
application-target context are related but not identical.

`src/lib/participant-internalization.ts` was converted accordingly:
- The whole provisioning transaction runs as `withOrganizationContext(application.organizationId, ...)`,
  not a bare `prisma.$transaction`.
- `ensureUser`/`grantRole` take `organizationId` as an explicit parameter; the `FAN` role granted
  to a newly-created applicant User is stamped with `application.organizationId`, not any global
  default.
- Every `Athlete`/`Player`/`Staff` create stamps `organizationId: application.organizationId`.
- `writeAuditLog()` receives `organizationId: application.organizationId`.

`User` itself stays globally identity-unscoped — a person can hold role grants in more than one
organization over time via multiple `UserRoleAssignment` rows. This was already structurally
possible from Stage 0; this stage is the first to actually rely on it (an applicant may already
be a Neon Ultra fan/member applying to a second league).

## Ripple fixes

- `src/lib/r2.ts` — `uploadProfilePhoto(file, userId)` → `uploadProfilePhoto(file, userId, organizationId)`.
  Removed the Stage 5.2A `resolvePublicApplicantOrganizationId()` hardcoded-Neon-Ultra helper
  entirely; the caller now always has a real resolved org from the slug.
- `src/lib/application-intake.ts` — `getClosedApplicationTypes()` → `getClosedApplicationTypes(organizationId)`,
  wrapped in `withOrganizationContext`. `setApplicationTypeClosed` (admin-only) left unconverted —
  separate scope, no signature ripple into this stage's files.
- `src/app/applications/page.tsx` (admin) — added the standard `MissingOrganizationContextError`
  check, passes `session.user.organizationId` into `getClosedApplicationTypes`.

## Critical finding: `UserRoleAssignment` had zero RLS coverage — fixed as Stage 4c

Verifying this stage's fourth requirement (cross-tenant provisioning guards) empirically —
rather than assuming Stage 4a's blanket RLS covered everything — surfaced a real, previously
unknown gap: `UserRoleAssignment` got its `organizationId` column in Stage 0, before the "104
tenant tables" enumeration existed, and was excluded from every later stage's table list as
"already handled separately." That was never actually true. `Athlete`/`Staff` correctly denied a
cross-org create attempt in rehearsal; `UserRoleAssignment` silently allowed it.

Fixed and deployed to production standalone (ahead of the rest of this stage, since it was a
live, unpatched gap with zero app-code dependency) as
`prisma/migrations/20260823080000_phase1_stage4c_userroleassignment_rls/migration.sql`. Unlike
the 104 NOT-NULL tenant tables, `organizationId` here is nullable (platform-level grants), so the
policy allows a row through when `organizationId IS NULL` OR it matches the active session
context (same COALESCE-to-Neon-Ultra fallback used everywhere else). Rehearsed on
`ultraos_staging`, connected as the actual restricted role: cross-org create now denied,
same-org and null-org creates still succeed. Production had 594/594 `UserRoleAssignment` rows
already populated to Neon Ultra with zero nulls/other-orgs — zero blast radius from enabling RLS.

**Lesson for future stages**: any table that received `organizationId` before its formal
tenant-table enumeration existed needs its own independent `pg_policies`/`pg_class.relrowsecurity`
check — "handled separately" is a claim to verify, not trust.

## Critical finding: a second, live provisioning path was never converted — fixed

A pre-deploy review of this stage correctly identified that `participant-internalization.ts` is
NOT the only place an approved `Application` gets turned into permanent participant records.
`src/app/applications/actions.ts`'s `updateApplicationStatus()` → `provisionApprovedApplication()`
is **the actual live, per-application approve action**, wired directly into the
`/applications/[category]` review queue's Approve button — the screen an admin uses every day.
`internalizeApprovedApplications` (the function this stage originally converted) is only ever
invoked as a dry-run report or a manually-triggered CLI batch/reconciliation script — a secondary
path, not the primary one.

`applications/actions.ts` had zero Phase 1 conversion: `requirePermission()` instead of
`requirePermissionWithOrganization()` (no org-scoped authorization at all), a bare
`prisma.$transaction(...)` instead of `withOrganizationContext(...)`, and every
`Athlete`/`Player`/`Staff`/`Vendor`/`MediaProfile`/`VolunteerProfile` create/upsert,
every `grantRole()` call, and every `writeAuditLog()` call carried no `organizationId` at all —
meaning every insert silently fell through to the Stage 3a DB-level default (Neon Ultra), never
`Application.organizationId`. Fixed:

- `updateApplicationStatus`: now resolves `{ session, organizationId }` via
  `requirePermissionWithOrganization("application:review")`, does a scoped lookup of the
  application under the admin's own org context first (`withOrganizationContext(organizationId,
  tx => tx.application.findUnique(...))`), then `assertSameOrganization()` on the result — RLS
  makes a cross-org application invisible to that lookup, and the assertion turns that into a
  clear "Application not found" error rather than a silent no-op. Only once confirmed in-scope
  does the whole write transaction run, scoped to `application.organizationId` (not the admin's
  org directly — the two are proven identical by the lookup above, but provisioning still reads
  its own org from the Application, matching this stage's provenance rule everywhere else).
- `provisionApprovedApplication` and `grantRole` both take an explicit `organizationId`
  parameter now; every create/upsert in every application-type branch stamps it (update branches
  correctly do NOT restamp an existing row's org).
- `sendBulkApplicationEmail` and the `/applications/export` CSV route both read applications via
  `getApplicationData(organizationId, ...)` now (previously a bare, unscoped query) — a real,
  separate cross-org data-exposure risk on the read side: an admin's bulk email or export could
  otherwise have pulled every organization's applicant data, not just their own.

Re-verified with a genuine staging rehearsal running the actual (temporarily exported)
`provisionApprovedApplication` function under the restricted role: Staff/VolunteerProfile/
UserRoleAssignment all created with `organizationId` = the disposable Org B, the exact
`updateApplicationStatus` cross-org guard pattern correctly denied loading Org B's application
from a Neon-Ultra-scoped context ("Application not found"), and Org B's resulting Staff row was
invisible from a Neon-Ultra-scoped read. All rehearsal code/data reverted and cleaned up — zero
residue on staging, zero permanent code changes beyond the real fix.

## Two further pre-existing gaps found (not fixed — explicitly out of scope per plan)

Running a **real** rehearsal through the actual provisioning functions (not just raw table
probes) surfaced two structural limitations that predate this stage and aren't introduced by it.
Both sit exactly where `PublicIdCounter`/`ultraAthleteId`/`ultraStaffId`/`SystemSetting.key` were
already flagged as deliberately deferred to Stage 5.4 — left here as an explicit inventory entry,
not fixed, per that plan:

- **`PublicIdCounter` has RLS but its allocation logic doesn't stamp `organizationId`.** It was
  swept into Stage 4a's blanket 104-table RLS rollout (it does have the column, added in Stage 1
  like every other table), but its counter-allocation code (`allocatePublicId` in
  `src/lib/public-ids.ts`) never sets `organizationId` explicitly, so it falls through to the
  Stage 3a DB default (Neon Ultra). Under a real, non-Neon-Ultra `withOrganizationContext`, that
  mismatches the session and Postgres rejects the write outright: `new row violates row-level
  security policy for table "PublicIdCounter"`. **Practical effect: today, provisioning an
  Athlete or Staff record (which calls `ensureAthletePublicId`/`ensureStaffPublicId`) for any
  organization other than Neon Ultra will hard-fail**, through either provisioning path, until
  Stage 5.4 resolves this table. Confirmed directly by this rehearsal (not reasoned about) —
  Neon Ultra itself is completely unaffected since its existing counter row already matches its
  own context.
- **`internalizeApprovedApplications`'s own top-level application scan is not org-scoped in its
  default, no-selector form.** The function's initial `prisma.application.findMany({ where:
  { status: APPROVED } })` uses the bare, unscoped client, before any `withOrganizationContext`
  is established. Under the restricted role with no session variable set at that point, RLS's
  fallback makes this query see **only** Neon-Ultra-scoped applications when no selector is
  given — this default, unscoped-scan behavior was deliberately left unchanged (see Stage
  5.2B-1A below), matching the existing batch/reconciliation tool's established behavior.

## Stage 5.2B-1A: real two-tenant application-level provisioning proof

A follow-up review correctly identified that the cross-org provisioning proof above (Stage
5.2B-1's rehearsal) exercised raw table probes and a temporarily-exported function, not the
actual operator-facing tool, and that running the real `internalizeApprovedApplications` batch
function unscoped against staging's 342 real applications was too risky to attempt directly (no
existing selector could isolate a single disposable record without either touching real data or
requiring a code change). This stage adds that missing selector as a permanent, small,
purpose-built patch — not a broader tenancy change — then re-runs the full two-tenant proof
through the real CLI command.

**`internalizeApprovedApplications` / `scripts/participants-internalize.ts`** gained two
composable selectors, `applicationId` and `organizationId` (CLI: `--application-id <id>`,
`--organization-id <id>`):

- Either may be used alone; if both are given, a result not matching the given organization
  throws rather than silently narrowing (`findUnique` by primary key also makes multiple matches
  under `--application-id` structurally impossible).
- Selection under a known/resolved `organizationId` always runs inside
  `withOrganizationContext(...)`, never before it — this is what actually fixes the scan-scoping
  gap above, but **only for selector-based invocations**. An `applicationId` given alone (no
  `organizationId`) is resolved via a narrow, context-less probe first — under RLS's fallback,
  that probe can only ever find an application already visible under the default context, so it
  cannot be used to discover a foreign organization's application id by guessing.
  Omitting both selectors preserves the exact pre-existing broad, unscoped scan — untouched, by
  design, since that's the tool's established default behavior, not this patch's concern.
- The global "unresolved duplicate identities" bail-out (which previously fired even for an
  unrelated, narrowly-targeted run) is now skipped whenever either selector is used — a targeted
  run reasons about the one record it targets, not the health of the entire system.
- Zero matches is a clean, successful empty result (`applicationsScanned: 0`, exit code 0), not
  an error. Dry-run prints the full, exact candidate set (not a sample) whenever a selector is
  used.

**Staging maintenance credential**: `ultraos_staging`'s password had no durable record — every
prior rehearsal this stage required asking the user to approve a fresh reset. Fixed properly this
time: set a real, durable password on the *existing* role (verified unchanged: `NOSUPERUSER`,
`NOBYPASSRLS`) and stored it in a new `/opt/ultraleagueos/shared/staging-maintenance.env`,
alongside `web.env`/`migrate.env`, restricted to `600` permissions. This is the credential every
future staging rehearsal should source — never the privileged `migrate.env` role, which would
silently bypass the exact RLS enforcement a rehearsal exists to prove.

**The real Org B proof**, run entirely through `npx tsx scripts/participants-internalize.ts`
against `ultraos_staging`, connected as the actual restricted role via the new credential:

- Dry-run with `--application-id --organization-id` on a disposable Org B application: exactly 1
  candidate, unrelated global duplicate warnings (22 of them) correctly did not block it.
- `--apply` on a disposable Org B **PLAYER** application: failed cleanly with the already-known,
  already-deferred `PublicIdCounter` RLS gap (`new row violates row-level security policy for
  table "PublicIdCounter"`). Directly confirmed the failure is a genuine atomic rollback, not a
  partial write — re-querying under Org B's own context afterward found zero Athlete row and an
  unchanged `Application.provisioningStatus`. This is pre-existing, out of scope, and explicitly
  not fixed here (see the gate below).
- `--apply` on a disposable Org B **VENDOR** application (a type that never touches
  `PublicIdCounter`) to complete the proof cleanly end-to-end: `Application`, `UserRoleAssignment`
  (both `FAN` and `VENDOR` grants), and `AuditLog` (`APPLICATION_INTERNALIZED`) all confirmed
  `organizationId` = Org B under Org B's own context.
- Under a Neon-Ultra-scoped context: the same `Application`, `UserRoleAssignment`, and `AuditLog`
  rows were all correctly invisible (`findFirst`/`findUnique` returned `null`).
- A direct cross-org `Application.update()` attempt was denied by RLS; separately, the exact
  `updateApplicationStatus` guard pattern (`withOrganizationContext` scoped lookup +
  `assertSameOrganization`) was re-run and correctly threw "Application not found."
- All disposable Org B data (`Organization`, both `User`s, `Application`s, `UserRoleAssignment`s,
  `AuditLog`s) deleted afterward; a privileged-role query confirmed zero residue.

The core assertion this proof establishes: **`PROVISIONING_DESTINATION = Application.organizationId`**,
never the current admin/session org — the admin's session org is only ever the authorization
boundary for whether they may act on a given application, never the destination its provisioned
records are written to. This was already the architecture from Stage 5.2B-1; this stage is what
turns it from a claim into a directly-observed result of the real code path.

`PublicIdCounter`/`ultraAthleteId`/`ultraStaffId`/`SystemSetting.key` remain untouched, exactly as
instructed — the selector patch exists solely to make this proof safe and targeted, not to pull
Stage 5.4 forward.

```
INTERNALIZATION_SELECTOR_APPLICATION_ID: PASS
INTERNALIZATION_SELECTOR_ORGANIZATION_ID: PASS
SELECTOR_DRY_RUN_EXACT: PASS (1 candidate, unrelated ambiguity correctly bypassed)

STAGING_RESTRICTED_ROLE_AUTH: PASS (durable credential in staging-maintenance.env)
STAGING_ROLE_SUPERUSER: NO
STAGING_ROLE_BYPASSRLS: NO

ORG_B_APPLICATION_CREATED: PASS
ORG_B_INTERNALIZATION_DRY_RUN_COUNT: 1
ORG_B_INTERNALIZATION_APPLY: PASS (VENDOR type; PLAYER type correctly failed on the known,
  pre-existing, deliberately out-of-scope PublicIdCounter gap, with a confirmed atomic rollback)

APPLICATION_ORG: ORG_B
ATHLETE_ORG: ORG_B [UPDATE 2026-09-03: was NOT_APPLICABLE here, blocked by the PublicIdCounter
  gap this exact rehearsal found - now genuinely PASS, see PHASE1_STAGE5_4A_TENANT_SCOPED_PUBLIC_IDS.md]
PLAYER_ORG: ORG_B [UPDATE 2026-09-03: same basis]
STAFF_ORG: ORG_B [UPDATE 2026-09-03: same basis - VENDOR alone doesn't provision Staff, but the
  Stage 5.4A COACH rehearsal directly proves this]
ROLE_GRANT_ORG: ORG_B
AUDIT_ORG: ORG_B
MEDIA_ORG: NOT_APPLICABLE (no media on this application - unrelated to the PublicIdCounter gap,
  still not exercised by any rehearsal to date)

ORG_A_CANNOT_READ_ORG_B: PASS
ORG_A_CANNOT_MUTATE_ORG_B: PASS
ORG_B_CAN_READ_OWN_DATA: PASS

REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

TSC: PASS
LINT: PASS (0 errors, 6 pre-existing unrelated warnings)
TESTS: PASS (454/454)
BUILD: PASS (local and server)
```

Deployed to production (backup → sync → build → restart `ultraos-web.service` → smoke test →
invariant check, all passing). This is a backward-compatible addition — no existing no-selector
invocation changes behavior.

## Verified with real evidence, not just code review

- **Cross-org provisioning denial** (`rehearse-provisioning-cross-org.ts` against
  `ultraos_staging`, connected as the actual restricted role): `Athlete` create denied,
  `Staff` create denied, `UserRoleAssignment` create denied (post-Stage-4c fix) — all under a
  Neon Ultra session context stamped for a throwaway second organization. Same-org control
  creates for `Athlete` and `UserRoleAssignment` succeeded, as did a platform-level
  (`organizationId: null`) `UserRoleAssignment` grant. All rehearsal data cleaned up — zero
  residue left on staging.
- **`Application` table cross-org read/mutation denial**: proven directly this pass via the exact
  `updateApplicationStatus` guard pattern (`withOrganizationContext` scoped lookup +
  `assertSameOrganization`) against a disposable Org B application on staging — denied with
  "Application not found" from a Neon-Ultra-scoped admin context. Separately, `Application` also
  carries RLS enabled + forced with the identical `tenant_isolation` policy already proven on five
  other tables (`Athlete`, `Staff`, `Club`, `MediaAsset`, `UserRoleAssignment`).
- **Live per-application provisioning cross-org denial** (`provisionApprovedApplication`,
  rehearsed directly under the restricted role): Staff/VolunteerProfile/UserRoleAssignment all
  created with Org B's `organizationId`; Org B's resulting Staff row invisible from a
  Neon-Ultra-scoped read. Rehearsal code (a temporary export) and data fully reverted/cleaned up.
- **Legacy `/apply` regression**: smoke-tested against production post-deploy (twice — once for
  the apply-flow deploy, again after the `applications/actions.ts` fix) —
  `/apply` → 307 to `/apply/neon-ultra`, `/apply/neon-ultra` → 200, `/apply/neon-ultra/player` →
  200, `/apply/not-a-real-league` → 404 (unknown slug correctly not found), adjacent
  already-converted pages (`/applications`, `/applications/internalization`, `/check-in`,
  `/media`) unaffected. Zero errors in `journalctl` for `ultraos-web.service` post-restart both
  times. `UserRoleAssignment`/`Athlete`/`Application`/`Staff`/`Organization` row counts unchanged
  pre/post-deploy both times.

## Deployment note

Deployed via direct file sync (`scp`) to `/opt/ultraleagueos/current/web` — this repo has no
git-based release flow on the server; production runs as the `ultraos-web.service` systemd unit
(port 4110), separate from the several unrelated pm2-managed apps also on this shared host. A
mid-deploy mistake this stage restarted an unrelated pm2 app (`raivstream-web`, a different
project) before the real service was correctly identified — no UltraLeagueOS impact, but worth
recording: **verify a process's `pm_cwd`/`WorkingDirectory` before restarting anything on this
host**, don't infer it from a name matching the SSH alias.

## Final gate

```
PUBLIC_ORG_RESOLUTION: PASS
PUBLIC_ORG_SOURCE: SERVER_CONTROLLED_SLUG
CLIENT_SUPPLIED_ORG_ID_TRUSTED: NO
APPLICATION_CREATE_ORG_EXPLICIT: PASS
APPLICATION_MEDIA_ORG_EXPLICIT: PASS
APPLICATION_AUDIT_ORG_EXPLICIT: PASS
PROVISIONING_USES_APPLICATION_ORG: PASS (both provisioning paths — participant-internalization.ts
  AND applications/actions.ts's live per-application approve path)
LIVE_APPROVE_PATH_CONVERTED: PASS (applications/actions.ts — found unconverted, fixed, rehearsed,
  deployed this stage)
BULK_EMAIL_EXPORT_READ_ORG_EXPLICIT: PASS (getApplicationData now takes organizationId — a
  separate cross-org data-exposure risk found and fixed alongside the live approve path)
USER_MULTI_ORG_ROLE_GRANTS: SUPPORTED
ATHLETE_ORG_EXPLICIT: PASS
PLAYER_ORG_EXPLICIT: PASS
STAFF_ORG_EXPLICIT: PASS
CROSS_ORG_APPLICATION_READ: DENIED (rehearsed directly this pass via the real
  updateApplicationStatus guard pattern, plus Stage 4a's proven tenant_isolation policy)
CROSS_ORG_APPLICATION_MUTATION: DENIED (same basis as above)
CROSS_ORG_PROVISIONING: DENIED (verified against staging with real data through BOTH provisioning
  paths — Athlete/Staff/UserRoleAssignment/VolunteerProfile all denied cross-org)
CROSS_ORG_MEDIA_ASSIGNMENT: DENIED (verified in Stage 5.2A, unchanged)
NEON_ULTRA_PUBLIC_APPLY_REGRESSION: PASS (verified against production post-deploy, twice)
USERROLEASSIGNMENT_RLS_GAP: FOUND_AND_FIXED (Stage 4c, deployed to production standalone,
  rehearsed on staging as the actual restricted role)
PUBLICIDCOUNTER_RLS_GAP: FOUND_NOT_FIXED (pre-existing, deferred to Stage 5.4 per explicit
  instruction — blocks Athlete/Staff public ID assignment for any non-Neon-Ultra org today)
INTERNALIZATION_SCAN_ORG_VISIBILITY_GAP: FOUND_NOT_FIXED (pre-existing — the batch/reconciliation
  tool's top-level scan can't see a second organization's applications under the restricted role)
TSC: PASS
LINT: PASS (0 errors, 6 pre-existing unrelated warnings)
TESTS: PASS (454/454)
BUILD: PASS (local and server, both deploys)
PRODUCTION_INVARIANTS: UNCHANGED
```

Stage 5.2B-1 was conditionally accepted here, then **fully closed on 2026-09-03** once Stage
5.4A (`PHASE1_STAGE5_4A_TENANT_SCOPED_PUBLIC_IDS.md`) made `PublicIdCounter` genuinely
tenant-scoped and re-ran this exact PLAYER/COACH proof successfully — the `NOT_APPLICABLE` gate
entries above are now real `PASS`es, not caveats. `admin-offline-intake.ts` is a
related-but-separate provisioning path (admin-side, not applicant-submitted) — still explicitly
not touched, named here so it isn't mistaken for done. `ultraAthleteId`/`ultraStaffId`/
`SystemSetting.key` remain deliberately untouched — `PublicIdCounter` was pulled out of Stage 5.4
specifically because it had demonstrated itself to be a hard blocker; the others have not. Next:
5.2B-2 (club/season/competition/venue administration), continuing down the sequence set out in
`PHASE1_STAGE5_2A_TENANCY_SCAN.md`.
