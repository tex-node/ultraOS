# Phase 1, Stage 5.5B - Explicit Context Certification

Status: BLOCKED_PENDING_LIVE_PRECONTEXT_READ_REMEDIATION

Date: 2026-09-09

This document records the Stage 5.5B preflight and the exact stop condition.
Stage 5.5B is staging-only. Production RLS policies, production fallback, and
production organizationId defaults were not changed.

## Initial Status

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: CLOSED
STAGE_5_5B: NOT_STARTED_AT_BASELINE
PRODUCTION_FALLBACK: RETAINED
PRODUCTION_DEFAULT: RETAINED
STAGING_FALLBACK: RETAINED
STAGING_FALLBACK_DISABLED: NO
```

## Staging Safety Boundary

The staging target and roles were verified before the backup and before any
policy-changing command:

```text
DATABASE: ultraos_staging
MAINTENANCE_ROLE: ultraos
MAINTENANCE_ROLE: SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE, REPLICATION
RUNTIME_ROLE: ultraos_staging
RUNTIME_ROLE: NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE, NOREPLICATION
RUNTIME_ROLE_BYPASSRLS: NO
```

Fresh verified staging backup:

```text
PATH: /var/backups/ultraleagueos-staging/stage55b_preflight_20260909T041127Z.dump
SIZE: 832941 bytes
TOC_ENTRIES: 1253
SHA256: 987ee59effda5a13e5f7facd6de1e49844a315626717044d9886ceea6d377f88
```

## Pre-Change Business Baseline

```text
Organization: 1
User: 390
Application: 342
UserRoleAssignment: 594
Club: 8
Season: 1
SeasonClub: 8
Athlete: 219
Player: 219
Staff: 19
Fixture: 12
Game: 12
MediaAsset: 17
Event: 1
Ticket: 0
Order: 0
Draft: 3
DraftPick: 27
DraftEvent: 1
DraftSquad: 8
DraftSquadMember: 45
DraftAllocation: 18
Standing: 8
PlayerStat: 130
TeamStat: 24
PublicResourceLocator: 257
PublicTokenLocator: 0
PublicIdCounter: 2
PublicIdAlias: 0
ATHLETE_ID_CHECKSUM: 3979b39ac8d1e2082bf118f1e901fdc2
STAFF_ID_CHECKSUM: d089ad58cb353172f34b36abc669542d
```

Only Neon Ultra exists in the staging database at the baseline. No Org B was
created during this preflight.

## RLS Baseline

The current authoritative staging inventory is:

```text
ORGANIZATION_ID_TABLES: 107
RLS_ENABLED_TABLES: 105
FORCED_RLS_TABLES: 105
ORDINARY_FALLBACK_POLICY_ROWS: 105
NEON_FALLBACK_POLICY_ROWS: 105
ORDINARY_RLS_FALLBACK: RETAINED
ORGANIZATION_ID_DB_DEFAULTS: RETAINED
USERROLEASSIGNMENT_SPECIAL_SEMANTICS: UNCHANGED
```

The direct restricted-role baseline confirms the current fallback is active:

```text
NO_CONTEXT_CLUB_ROWS: 8
NO_CONTEXT_ATHLETE_ROWS: 219
```

No fallback-disabled policy was applied.

## Whole-Repository Pre-Context Audit

The scan covered `web/src`, `web/scripts`, `web/ops`, package scripts, and
Prisma migrations. Historical migrations, seed files, test-only scripts, and
maintenance scripts were kept separate from live runtime code.

Textual inventory counts are not themselves blockers because explicit legacy
Neon resolution, staging proofs, migrations, and historical scripts are valid
uses. The live application call-site audit is the blocker:

```text
BARE_TENANT_PRISMA_CALLS_IN_SRC: 283
SOURCE_FILES_CONTAINING_BARE_CALLS: 73
UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: >0
```

Confirmed live/runtime classes requiring conversion or explicit classification
include:

- authenticated operations and readiness loaders;
- fixture list/detail/edit/new pages;
- player and coach management pages and actions;
- game live, stats, reconciliation, and gameday pages;
- training pages and training actions;
- media management pages;
- draft, application, and selection workflows;
- events, announcements, standings, and staff planning;
- broadcast/vision/analytics loaders;
- participant search and offline intake.

Representative confirmed bare tenant reads include:

```text
src/lib/operations.ts
src/lib/season-zero-readiness.ts
src/lib/draft-personnel-readiness.ts
src/lib/participant-internalization.ts
src/app/fixtures/page.tsx
src/app/fixtures/[id]/page.tsx
src/app/fixtures/[id]/edit/page.tsx
src/app/players/page.tsx
src/app/players/[id]/page.tsx
src/app/players/[id]/edit/page.tsx
src/app/gameday/page.tsx
src/app/games/[fixtureId]/live/page.tsx
src/app/games/[fixtureId]/stats/page.tsx
src/app/training/page.tsx
src/app/media/page.tsx
src/app/coaches/assignments/page.tsx
src/app/announcements/page.tsx
```

These calls currently rely on the ordinary RLS fallback when no transaction
context is established. They cannot be considered certified for fallback
removal. A later write that includes `organizationId` does not make an earlier
unscoped read safe.

## Already-Certified Areas

The following Stage 5.5A mechanisms remain valid and are not the blocker:

```text
PUBLIC_RESOURCE_LOCATOR_BOOTSTRAP: IMPLEMENTED_AND_PROVEN
PUBLIC_TOKEN_LOCATOR_BOOTSTRAP: IMPLEMENTED_AND_PROVEN
PUBLIC_MEDIA_VISIBILITY: IMPLEMENTED_AND_PROVEN
LEGACY_NEON_PUBLIC_ROUTES: EXPLICIT_FOR_CONVERTED_PUBLIC_SURFACES
TRANSACTION_LOCAL_CONTEXT: IMPLEMENTED_WITH_SET_CONFIG(..., true)
```

The public ticket/order pages resolve a global token locator first and then
perform the authoritative tenant read inside `withOrganizationContext()`. The
public v1 routes similarly use explicit Neon context or the reviewed locator
path. This does not certify the authenticated/internal surface listed above.

## Stop Condition

## 2026-09-09 Remediation Slice

The durable call-site matrix is now generated at:

```text
documentation/architecture/PHASE1_STAGE5_5B_CALLSITE_MATRIX.csv
TOTAL_CLASSIFIED_SITES: 283
CLASSIFICATION_B_REMEDIATED: 131
CLASSIFICATION_C_PLATFORM_GLOBAL: 15
CLASSIFICATION_E_BLOCKED_OR_AMBIGUOUS: 137
UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: 137
```

The following live paths now pass an explicit transaction client from an
authenticated organization context:

- operations snapshot and operations page;
- Season Zero readiness library and launch-readiness page/report;
- draft personnel readiness library and draft-readiness page.
- player management actions, including athlete/player CRUD, SeasonClub
  validation, roster jersey updates, athlete deletion, and player photo lookup.
- announcements page/actions and the shared celebrant loader, including
  announcement reads, creation/update, and well-wish moderation.
- application review pages and participant internalization application
  selection. Internalization now requires an explicit trusted organizationId;
  application selection occurs inside that organization context, while each
  provisioning transaction continues to derive its destination from
  Application.organizationId.
- fixture list/detail/create/edit reads;
- Game Day control/check-in reads;
- live game, statistician, and native-vs-official reconciliation page reads.
Fixture mutations and the existing game/statistician action helpers already
use organization-aware transaction boundaries; these page conversions preserve
those contracts.

The readiness loaders accept `Prisma.TransactionClient` (or an explicitly
passed maintenance client for non-live scripts). The live pages call
`requirePermissionWithOrganization()` and `withOrganizationContext()` before
the first tenant-owned read. The matrix records the remaining textual
`prisma.model.operation` expressions inside these loaders as B because they
resolve through the local explicit `db` alias, not the process-global client.

Local verification for this slice:

```text
TSC: PASS
TESTS: 466/466 PASS
LINT: PASS_WITH_WARNINGS
LINT_ERRORS: 0
```

Lint warnings introduced by this slice were removed. The Stage 5.5A script
error was not changed as unrelated historical work.

The following gates remain intentionally unchanged and unattempted:

```text
STAGING_FALLBACK_DISABLED: NO
ORGANIZATION_ID_DB_DEFAULTS: RETAINED
PRODUCTION_RLS_MODIFIED: NO
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
FORMAL_FAIL_CLOSED_STAGING_REHEARSAL: NOT_ATTEMPTED
```

The matrix is complete as an inventory, but certification is not complete:
the 187 E rows still require live-path context tracing and remediation or an
explicit platform-global/historical classification. No E row was hidden by
hardcoding Neon Ultra or by tenant-scoping `data-hygiene.ts`.

```text
STAGE_5_5B: BLOCKED
BLOCKING_LIVE_FALLBACK_DEPENDENCY: YES
UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: 137
STAGING_FALLBACK_DISABLED_REHEARSAL: NOT_ATTEMPTED
STAGING_APPLICATION_DEPLOYMENT: NOT_ATTEMPTED
PRODUCTION_RLS_MODIFIED: NO
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5C: NO
```

The smallest safe next implementation is to convert the authenticated/internal
call sites to an explicit session organization plus transaction-local
`withOrganizationContext()` wrapper, beginning with the shared operations and
readiness loaders and then the representative management pages. After the
whole-repository live inventory reaches zero unclassified pre-context reads,
the staging-only fail-closed policy rehearsal can be created and tested against
this verified backup.

No production policy, production migration history, organizationId default,
platform readiness grant, or production data was changed in this stage.

## 2026-09-09 — Stage 5.5B Draft Workflows / Draft Cohort Batch 3

The fixed 283-site matrix remains authoritative:

```text
TOTAL_CLASSIFIED_SITES: 283
CLASSIFICATION_B_REMEDIATED: 140
CLASSIFICATION_C_PLATFORM_GLOBAL: 15
CLASSIFICATION_D_HISTORICAL_SCRIPT_TEST: 0
CLASSIFICATION_E_BLOCKED_OR_AMBIGUOUS: 128
UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: 128
```

This batch reviewed and converted the nine draft/data-quality baseline sites
associated with the selected draft cohort:

- `web/src/app/draft-cohort/page.tsx` application-pool and rejected-application reads;
- `web/src/lib/draft-cohort.ts` application review, cohort analysis, and resolution reads;
- `web/src/lib/data-quality.ts` approved-player duplicate-group reads and duplicate-resolution lookup;
- draft-cohort server actions and duplicate-review route callers now obtain the authenticated organization and use `withOrganizationContext()`;
- duplicate-group analysis accepts the scoped transaction client and explicit organizationId;
- draft cohort applications, athletes, resolution settings, and audit writes are tenant-contextualized;
- no draft identifier is used as tenant provenance, and no client-supplied organizationId is trusted.

Draft/cohort inventory result:

```text
DRAFT_SITES_REVIEWED: 9
DRAFT_SITES_REMEDIATED: 9
DRAFT_PLATFORM_GLOBAL: 0
DRAFT_HISTORICAL_SCRIPT_TEST: 0
DRAFT_REMAINING_E: 0
```

The broader remaining E set is unchanged in kind and remains outside this
batch, including data-hygiene/platform-global authorization decisions and
other authenticated/internal surfaces not yet traced.

Validation performed locally:

```text
TSC: PASS
TESTS: 466/466 PASS
LINT: PASS_WITH_WARNINGS (7 existing warnings, 0 errors)
BUILD: PASS
```

No staging proofs were run. The following boundaries remain unchanged:

```text
RLS_FALLBACK: RETAINED
ORGANIZATION_ID_DB_DEFAULT: RETAINED
STAGING_RLS_CHANGED: NO
PRODUCTION_RLS_CHANGED: NO
STAGING_DEPLOYMENT: NOT_ATTEMPTED
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
STAGE_5_5C: NOT_STARTED
```

Cross-tenant draft proofs (same-org success, cross-org player/SeasonClub and
squad failures, wrong-context read, forged organizationId, coach-pool
isolation, and finalization isolation) remain `NOT_RUN`; no PASS claim is
made. The formal fail-closed rehearsal remains blocked until the remaining
E inventory and the separate platform-global authorization boundary are
resolved.

## 2026-09-09 — Stage 5.5B Events / Reservations / Ticketing Batch

The fixed 283-site matrix remains authoritative:

```text
TOTAL_CLASSIFIED_SITES: 283
CLASSIFICATION_B_REMEDIATED: 153
CLASSIFICATION_C_PLATFORM_GLOBAL: 15
CLASSIFICATION_D_HISTORICAL_SCRIPT_TEST: 0
CLASSIFICATION_E_BLOCKED_OR_AMBIGUOUS: 115
UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: 115
```

The remaining event-related live E sites were the novelty-match workflow:

- `web/src/app/novelty-matches/page.tsx` event and venue selectors;
- `web/src/app/novelty-matches/[matchId]/live/page.tsx` match/player reads;
- `web/src/app/novelty-matches/actions.ts` creation, game lifecycle, scoring,
  player-stat, and finalization operations.

These sites now obtain the authenticated organization through
`requirePermissionWithOrganization()` and establish
`withOrganizationContext()` before the first tenant read. Novelty match/game,
game-event, and player-stat creates carry explicit `organizationId`. Creation
also validates the selected novelty teams, Event, and Venue inside the same
organization context. Client-selected IDs remain selectors and are not tenant
provenance.

```text
EVENTS_CORE_E_SITES_REMAINING: 0
RESERVATION_TICKETING_CORE_E_SITES_REMAINING: 0
NOVELTY_EVENT_SITES_REVIEWED: 13
NOVELTY_EVENT_SITES_REMEDIATED: 13
```

The following existing empirical evidence remains applicable to the core
Events / Reservations / Ticketing relational graph and is not re-counted as a
new proof in this batch:

```text
SOURCE: PHASE1_STAGE5_2B4_VENDOR_EVENT_RESERVATION_TENANCY.md
STAGING_ORG_B_VENDOR_EVENT_RESERVATION_ORDER_PROOF: PASS
CROSS_ORG_EVENT_VENUE: DENIED
CROSS_ORG_RESERVATION_EVENT: DENIED
CROSS_ORG_RESERVATION_SEAT_ZONE: DENIED
CROSS_ORG_ORDER_ITEM_PRODUCT: DENIED
CROSS_ORG_TICKET_RESERVATION_FK: PRIVILEGED_FK_PROOF_PASS
CAPACITY_ISOLATION: PASS
INVENTORY_ISOLATION: PASS
TRANSACTIONAL_ATOMICITY: PASS
PROMOCODE_GLOBAL_UNIQUENESS: CONFIRMED_LIMITATION / NOT_REDESIGNED
```

No new staging deployment or novelty-route runtime proof was performed in this
batch. Therefore the changed novelty routes have static certification only;
they must receive targeted staging proof before this domain is treated as
empirically closed. The pre-existing baseline backup remains:

```text
STAGING_BACKUP: /var/backups/ultraleagueos-staging/stage55b_preflight_20260909T041127Z.dump
NEW_BACKUP_THIS_BATCH: NOT_CREATED
```

Remaining event-adjacent E rows are not silently reclassified: the
platform-global `data-hygiene.ts` purge/audit queries remain blocked by the
known platform-global authorization boundary, and content-generation rows
remain a separate provenance review. `PromoCode.code @unique` remains a
documented global schema limitation and was not changed.
# Stage 5.5B Batch 6: Content, Media, Broadcast Presentation State

Status: `BLOCKED_PENDING_REMEDIATION` for the overall Stage 5.5B program. This batch made only local source changes; no staging or production deployment was performed.

## Baseline and current inventory

The regenerated matrix at `documentation/architecture/PHASE1_STAGE5_5B_CALLSITE_MATRIX.csv` is authoritative for this checkout:

```yaml
TOTAL: 282
B: 186
C: 15
D: 0
E: 81
```

The historical Batch 5 note recorded 283 sites. The current generator de-duplicates repeated file/model/operation records while preserving the call-site classifications, so the current matrix contains 282 distinct inventory records. This is an inventory accounting difference, not a claim that the remaining E-sites are resolved.

## Batch 6 conversions

### Content

`web/src/app/content/actions.ts` now obtains the authenticated organization with `requirePermissionWithOrganization()`, enters `withOrganizationContext()`, generates source payloads through the scoped transaction client, filters templates by `organizationId`, and stamps `organizationId` on `ContentJob`, `ContentAsset`, and `AuditLog` rows. Failure updates also use the same scoped transaction.

### Media

`web/src/app/media/page.tsx` and `web/src/app/media/[assetId]/page.tsx` now read through the authenticated organization context. The list and aggregate count are both organization-filtered. The detail route preserves not-found behavior for cross-organization IDs. Existing upload, assignment, approval, archive, locator, and file-serving paths remain scoped through their established helpers.

### Broadcast presentation state

`web/src/lib/broadcast-presentation-state.ts` now requires a trusted `organizationId` and supports a transaction client. Reads, writes, and audit rows execute inside `withOrganizationContext()`. The existing legacy `broadcast:presentation-state` row remains readable only inside the resolved organization; additional organizations use an organization-qualified key. No schema migration was made.

All application callers were updated, including the authenticated broadcast control panel, public Program API, internal broadcast API, diagnostics loader, and G.19/G.20 rehearsal scripts.

## Remaining E-sites after Batch 6

The remaining E records are currently:

```text
data-hygiene.ts                                      53
season-zero-production-reconciliation.ts              4
all-star-teams.ts                                     4
tenant-context.ts                                     2
training/actions.ts                                  2
runbooks/page.tsx                                     2
tasks/page.tsx                                        1
standings/page.tsx                                    1
rehearsals/page.tsx                                   1
rehearsal/live/[fixtureId]/page.tsx                  1
rehearsal/broadcast/[fixtureId]/page.tsx             1
public/celebrations/actions.ts                        1
notifications/page.tsx                                1
incidents/page.tsx                                    1
equipment/page.tsx                                    1
documents/page.tsx                                    1
display-monitoring/page.tsx                           1
coaches/actions.ts                                    1
system-health-loader.ts                               1
audit/page.tsx                                        1
```

These were not reclassified merely because they are shared, platform-oriented, or operational. They require separate provenance decisions.

## Proof harness and evidence status

Created `web/scripts/stage55b-content-media-broadcast-proof.ts`. It is intentionally read-only. It accepts disposable staging organization/resource identifiers through environment variables and proves same-organization visibility plus wrong-organization invisibility for media and content assets, while exercising broadcast state reads through explicit organization transactions. It performs no setup or cleanup mutation.

```yaml
STATIC_SOURCE_REVIEW: PASS
LOCAL_TYPECHECK: PASS
LOCAL_LINT: PASS_WITH_7_PREEXISTING_WARNINGS
EMPIRICAL_BATCH6_STAGING_PROOF: NOT_RUN
STAGING_BACKUP_FOR_BATCH6_MUTATION: NOT_CREATED
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
RLS_FALLBACK: RETAINED
DATABASE_DEFAULTS: RETAINED
STAGE_5_5C: NOT_STARTED
```

## Known schema limitation

`SystemSetting.key` remains globally unique. The broadcast helper avoids a migration by retaining the existing Neon key when it exists and using an organization-qualified key for additional tenants. This is an application-level compatibility bridge, not database-level proof of tenant uniqueness. A future schema decision should replace the global key constraint with an organization-aware uniqueness rule if presentation state becomes a first-class multi-organization feature.

## Quality gates

`npm run typecheck` passes. `npm run lint` passes with seven existing warnings and zero errors. No formal staging proof, deployment, restart, migration, or production data operation was performed in Batch 6.
