# Phase 1, Stage 5.5 - Tenant Bootstrap, Public Routing, and RLS Fallback Elimination

Status: DESIGN REVIEW REQUIRED

Stage 5.5 investigates how Ultra League OS can determine organization context before reading tenant-owned, RLS-protected rows. This report is intentionally an investigation and design checkpoint only. No RLS fallback removal, Prisma schema change, route migration, deployment, or production data change has been performed in this stage.

## Baseline

Repository root: `C:/UltraLeagueOS`

Branch: `main`

Current baseline inherited from Stage 5.2D:

```text
STAGE_5_2D: CLOSED
PUBLIC_SURFACE_INVENTORY: PASS
UNCLASSIFIED_LIVE_CALL_SITES: 0
DATA_READINESS_EXPORT_PLATFORM_ADMIN_GATE: VERIFIED
TESTS: 461/461 PASS
PRODUCTION_INVARIANTS: UNCHANGED
```

Current local verification performed during Stage 5.5 investigation:

```text
PRISMA_VALIDATE: PASS
TSC: PASS
TESTS: 461/461 PASS
```

Full lint, Prisma generate, and production build were not rerun in this investigation pass because no application code or schema was changed.

## Bootstrap Paradox

The remaining problem is:

```text
public/resource route receives a resource id
  -> code needs resource.organizationId
  -> resource table is tenant-owned and RLS-protected
  -> RLS requires app.current_org_id before the row can be read
```

The Stage 4a policy currently masks this for Neon Ultra:

```text
organizationId = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')
```

That fallback lets no-context reads see Neon Ultra rows. It also makes Org B resource-derived routes fail closed before they can discover their own `organizationId`.

## Organization Reality

`Organization` is the global root table. It is not tenant-owned by another model.

Current useful bootstrap fields:

- `id`
- `slug @unique`
- `status`
- `idPrefixAthlete @unique`
- `idPrefixStaff @unique`

Current limits:

- No organization alias table.
- No custom-domain table.
- No public eligibility field beyond `status`.
- No separate public routing table.
- No modeled organization lifecycle beyond `OrganizationStatus`.

Current public slug rule in code:

- `resolveActiveOrganizationBySlug(slug)` reads `Organization` globally.
- It accepts only `status === "ACTIVE"`.
- Unknown or inactive slugs throw `OrganizationNotFoundError`.
- `/apply/[organizationSlug]` uses this correctly.

## Current RLS Policy Inventory

Stage 4a applies standard RLS to 104 tenant tables.

```text
TENANT_POLICY_COUNT: 104
NEON_FALLBACK_EXPR_COUNT: 104
ENABLE_RLS: PRESENT
FORCE_RLS: PRESENT
```

The standard policy is:

```sql
USING (
  "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')
)
WITH CHECK (
  "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')
)
```

`UserRoleAssignment` has a separate Stage 4c policy because `organizationId` is nullable for platform grants:

```sql
USING (
  "organizationId" IS NULL
  OR "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')
)
WITH CHECK (
  "organizationId" IS NULL
  OR "organizationId" = COALESCE(NULLIF(current_setting('app.current_org_id', true), ''), 'cmt4odhgn0000wokk8fbwr6ro')
)
```

Platform grants must remain visible globally when `organizationId IS NULL`.

## Current organizationId Default Inventory

`schema.prisma` still contains 104 tenant models with:

```prisma
organizationId String @default(dbgenerated("'cmt4odhgn0000wokk8fbwr6ro'"))
```

This means DB default removal is not safe in this pass. The repository still needs a separate live-create audit proving every live tenant create explicitly stamps `organizationId` before those defaults can be removed.

## Runtime-Class Matrix

| Runtime class | Entry point | Authenticated | Tenant source | Context established | Fallback dependency | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| Authenticated web request | Admin pages/actions | Yes | Session `user.organizationId` | Usually `requirePermissionWithOrganization()` + `withOrganizationContext()` | Some legacy page reads still need audit | CONVERT_5_5 / EXPLICIT_CONTEXT_SAFE by file |
| Public organization-slug request | `/apply/[organizationSlug]` | No/optional | Global `Organization.slug` | Yes for application create | No | EXPLICIT_CONTEXT_SAFE |
| Legacy Neon Ultra public request | `/public`, `/live`, scoreboard, broadcast public routes | No | `resolveDefaultPublicOrganization()` | Yes | No legitimate fallback dependency after Stage 5.2D | EXPLICIT_CONTEXT_SAFE |
| Resource-derived public request | `/public/clubs/[id]`, `/public/fixtures/[id]`, share routes | No | Intended resource `organizationId` | Only after seed lookup | Yes for non-Neon bootstrap | BOOTSTRAP_REQUIRED |
| Token/QR request | `/public/tickets/[code]`, `/public/orders/[code]`, ticket actions | No | Intended token row `organizationId` | Only after seed lookup | Yes for non-Neon bootstrap | BOOTSTRAP_REQUIRED |
| Public API | `/api/v1/*`, `/api/games/*`, `/api/content/*`, `/api/broadcast/*` | Mostly no | Default Neon Ultra | Yes | No for legacy Neon output; no Org B routing yet | EXPLICIT_CONTEXT_SAFE / PARTIAL_CAPABILITY |
| Metadata/SEO | Share pages `generateMetadata()` | No | Same loader as page | Same limitation as page | Yes for non-Neon resource routes | BOOTSTRAP_REQUIRED |
| Background job | No dedicated persistent worker found | N/A | N/A | N/A | None present | NOT_PRESENT |
| CLI | `scripts/*.ts`, npm operational scripts | No web session | Hardcoded ids, args, env, or selected org | Mixed | Some current CLI defaults still rely on fallback/privileged behavior | CONVERT_5_5 / HISTORICAL_ONE_OFF |
| Import utility | `/imports`, `src/lib/imports.ts` | Yes | Session org | Yes | No live fallback dependency observed in current import flow | EXPLICIT_CONTEXT_SAFE |
| Historical one-off script | `scripts/g*.ts` | No | Mostly Neon Ultra constants or direct ids | Mixed | Existing historical behavior | HISTORICAL_ONE_OFF |
| Seed | `prisma/seed.ts` | No | Seeder logic | Privileged maintenance | Not runtime | PRIVILEGED_MAINTENANCE_INTENTIONAL |
| Migration | `prisma/migrations/*` | No | SQL migration | Privileged maintenance | Not runtime | PRIVILEGED_MAINTENANCE_INTENTIONAL |
| Test | `src/lib/*.test.ts`, integration scripts | No | Test fixture | Mixed | Test-only | TEST_ONLY |
| Platform-global admin operation | `/data-readiness` | Yes | None by design | Platform permission, no fake tenant | No tenant context by design | PLATFORM_GLOBAL_INTENTIONAL |

## Public Identifier Classification

```text
GLOBAL_IDENTIFIER:
  Organization.slug
  Organization.id
  Athlete.ultraAthleteId (globally unique today through unique org prefixes + bare unique column)
  Staff.ultraStaffId (same)
  raw cuid ids in tables are globally unique as database ids, but not safe tenant bootstrap under RLS

TENANT_LOCAL_IDENTIFIER:
  Club.shortName
  Competition.slug
  Division.slug
  Season names/status aliases such as active
  PublicIdCounter namespace sequence values

OPAQUE_GLOBAL_TOKEN:
  Ticket.code
  Order.collectionCode
  DraftEvent.displayToken

INTERNAL_DATABASE_ID_USED_PUBLICLY:
  Club.id
  Athlete.id
  Fixture.id
  Event.id
  Game.id
  Draft.id
  DraftEvent.id
  MediaAsset.id
```

Raw cuid IDs are globally unique strings, but that does not solve the bootstrap paradox because the rows that map those IDs to `organizationId` are protected by RLS.

## Pattern Inventory

### Pattern 1 - Organization Slug

Current implementation:

- `/apply/[organizationSlug]`
- `/apply/[organizationSlug]/[role]`
- server action binds `organizationSlug`

Result:

```text
ORGANIZATION_SLUG_BOOTSTRAP: PASS_FOR_APPLY
CLIENT_ORG_ID_TRUSTED: NO
```

Recommended expansion:

- Add public organization-slug route families for true multi-tenant public sites, for example `/public/[organizationSlug]/clubs`, `/public/[organizationSlug]/players`, `/public/[organizationSlug]/standings`, `/public/[organizationSlug]/fixtures`.
- Keep existing `/public/*` as legacy Neon Ultra aliases.

### Pattern 2 - Legacy Neon Ultra Default

Current implementation:

- `resolveDefaultPublicOrganization()`
- resolves `neon-ultra` through `resolveActiveOrganizationBySlug()`
- callers use `withOrganizationContext(organization.id, ...)`

Result:

```text
LEGACY_NEON_BOOTSTRAP: PASS
LEGACY_NEON_ROUTES_USE_RLS_FALLBACK: 0
```

### Pattern 3 - Opaque Token

Current token routes:

- `/public/tickets/[code]`
- `/public/orders/[code]`
- `/public/tickets/actions.ts`
- `/check-in/[code]` authenticated operator route

Current issue:

- Public ticket/order pages perform bare `prisma.ticket.findUnique({ where: { code } })` or `prisma.order.findUnique({ where: { collectionCode } })` to discover `organizationId`.
- `Ticket` and `Order` are tenant-owned RLS tables.
- This will not work for Org B after fallback removal unless a safe bootstrap mechanism exists.

Authenticated `/check-in/[code]` is better scoped because it uses the operator session organization and returns not found for foreign codes.

Result:

```text
TOKEN_DERIVED_BOOTSTRAP: BOOTSTRAP_REQUIRED_FOR_PUBLIC_TICKETS_AND_ORDERS
UNKNOWN_TOKEN: FAIL_CLOSED_EXPECTED_AFTER_LOCATOR
TOKEN_LOGGING_SAFE: NEEDS_RECHECK_DURING_IMPLEMENTATION
```

### Pattern 4 - Resource Derived

Current resource-derived seed lookups include:

- `prisma.club.findUnique({ where: { id }, select: { organizationId } })`
- `prisma.fixture.findUnique({ where: { id }, select: { organizationId } })`
- `prisma.event.findUnique({ where: { id }, select: { organizationId } })`
- `prisma.athlete.findUnique({ where: { id }, select: { organizationId } })`
- `prisma.mediaAsset.findUnique({ where: { id }, select: { organizationId } })`

These are not safe bootstrap lookups after fallback removal because each target table is tenant-owned.

Result:

```text
RESOURCE_DERIVED_BOOTSTRAP: BOOTSTRAP_REQUIRED
ORG_B_RESOURCE_DERIVED_ROUTES: FAIL_CLOSED_TODAY
```

### Pattern 5 - Authenticated Session

Current mechanism:

- `resolveActiveOrganizationId(userId)`
- session stores `user.organizationId`
- tenant reads/writes should use `requirePermissionWithOrganization()` and `withOrganizationContext()`

Result:

```text
AUTHENTICATED_SESSION_BOOTSTRAP: PASS_WITH_REMAINING_PAGE_AUDIT
```

Known pages still visible in scan with bare tenant reads include:

- `web/src/app/fixtures/page.tsx`
- `web/src/app/fixtures/[id]/edit/page.tsx`
- `web/src/app/players/[id]/edit/page.tsx`
- `web/src/app/players/[id]/seasons/new/page.tsx`
- `web/src/app/media/[assetId]/page.tsx`
- `web/src/app/rehearsal/live/[fixtureId]/page.tsx`
- `web/src/app/rehearsal/broadcast/[fixtureId]/page.tsx`

These are authenticated/internal or rehearsal routes, not public bootstrap blockers, but they must be classified or converted before fallback removal.

### Pattern 6 - Platform Global

Current implementation:

- `/data-readiness`
- `/data-readiness/export`
- `auditRealData()`
- `requirePlatformPermission("data:readiness")`

Result:

```text
PLATFORM_GLOBAL_BOOTSTRAP: NOT_REQUIRED_BY_DESIGN
PLATFORM_GLOBAL_OPERATIONS_USE_FAKE_TENANT: NO
```

## Existing Locator Assessment

`PublicIdAlias` exists but is not a safe Stage 5.5 bootstrap locator.

Reasons:

- It has `organizationId`.
- It is included in the 104 Stage 4a tenant RLS tables.
- Its RLS policy still uses the Neon Ultra fallback expression.
- It stores `entityType` and `entityId`, which is more than a minimal bootstrap routing pointer unless lifecycle semantics are redesigned.
- It is not currently used by public routing code.

Classification:

```text
PUBLIC_ID_ALIAS_AS_BOOTSTRAP_LOCATOR: REJECTED_CURRENT_FORM
```

## Proposed Smallest Bootstrap Architecture

Stage 5.5 should split the solution into two mechanisms.

### Mechanism A - Tenant-Qualified Public Routes

Use organization slug for true multi-tenant browsing:

```text
/public/[organizationSlug]
/public/[organizationSlug]/clubs
/public/[organizationSlug]/clubs/[clubPublicId]
/public/[organizationSlug]/players/[athletePublicId]
/public/[organizationSlug]/fixtures/[fixturePublicId]
/public/[organizationSlug]/standings
/public/[organizationSlug]/events
```

The flow is:

```text
organizationSlug
  -> global Organization lookup
  -> ACTIVE check
  -> organizationId
  -> withOrganizationContext(organizationId)
  -> tenant reads
```

This should be preferred wherever the public URL is navigational and the organization is naturally part of the site identity.

### Mechanism B - Minimal PublicResourceLocator

For public URLs that start with only a token/resource key and cannot know the organization first, introduce a minimal global bootstrap table after design review.

Conceptual model:

```prisma
model PublicResourceLocator {
  id             String @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  resourceType   PublicResourceType
  publicKeyHash  String?
  publicKey      String?
  resourceId     String
  status         PublicResourceLocatorStatus @default(ACTIVE)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([resourceType, publicKeyHash])
  @@index([organizationId, resourceType, status])
  @@index([resourceType, resourceId])
}
```

Design rules:

- The locator is bootstrap data, not tenant business data.
- It stores only routing metadata: organization id, resource type, public key/hash, target id, status.
- It must not contain names, emails, phone numbers, prices, scores, rosters, order contents, or private participant data.
- Bearer-style tokens should use a hash lookup where feasible.
- The full tenant row is still loaded only after entering `withOrganizationContext(locator.organizationId, ...)`.
- Locator rows must be created/updated/deactivated in the same transaction as the tenant business row to avoid stale routing.
- Unknown, inactive, or mismatched locators return normal not-found semantics.

Likely initial resource types:

- `TICKET`
- `ORDER`
- `MEDIA_ASSET`
- `CLUB`
- `ATHLETE`
- `FIXTURE`
- `EVENT`
- `GAME`
- `DRAFT_EVENT`

This model should not be implemented until reviewed because it is new bootstrap architecture and affects RLS fallback removal.

## Background Job Inventory

No persistent scheduler, queue worker, or cron runner was found in `package.json` or `src/`.

Worker-like code exists but is currently script/manual:

- `scripts/vision-analyze.ts`
- import processing helpers in `src/lib/imports.ts`
- rehearsal/invariant scripts under `web/scripts`

Classification:

```text
BACKGROUND_JOBS: NOT_PRESENT
VISION_ANALYZE_SCRIPT: CLI_CODE_PATH_VERIFIED_REQUIRED_BEFORE_FALLBACK_REMOVAL
```

## CLI / Operational Script Inventory

Current npm operational scripts:

- `participants:internalize`
- `data:audit-real`
- `data:duplicates-export`
- `data:tryout-metadata-preview`
- `data:tryout-metadata-import`
- `data:purge-demo`
- `data:purge-rehearsal`
- `season-zero:preflight`
- `season-zero:env`
- `vision:analyze`
- backup/restore PowerShell scripts

Historical one-off scripts:

- Many `scripts/g*.ts` files use direct Prisma reads and hardcoded Neon Ultra ids.
- These are historical one-off or rehearsal scripts unless they are still operationally invoked.

Current operational risk:

- `participants:internalize` has selector-based organization context from Stage 5.2B-1A, but its no-selector default scan remains intentionally broad/legacy and must be reclassified before fallback removal.
- `data:audit-real` is platform-global by design.
- `vision:analyze` first reads `GameVideo` by id to derive organization, which is a resource-derived bootstrap pattern and must be addressed before being treated as a current multi-tenant worker.

## Fallback Dependency Inventory

```text
EXPLICIT_CONTEXT_SAFE:
  /apply/[organizationSlug]
  Stage 5.2D legacy Neon Ultra public list/default routes
  authenticated imports routes using requirePermissionWithOrganization
  /data-readiness after platform permission fix, as platform-global

BOOTSTRAP_REQUIRED:
  /public/clubs/[id]
  /public/fixtures/[id]
  /public/events/[id]
  /public/share/game/[id]
  /public/share/player/[id]
  /public/share/team/[id]
  /api/share/game/[id]
  /api/share/player/[id]
  /api/share/team/[id]
  /media/assets/[assetId]/file
  /public/tickets/[code]
  /public/orders/[code]
  /public/tickets/actions.ts
  scripts/vision-analyze.ts

PLATFORM_GLOBAL_INTENTIONAL:
  /data-readiness
  /data-readiness/export
  data-hygiene/auditRealData

PRIVILEGED_MAINTENANCE_INTENTIONAL:
  migrations
  backup/restore
  seed where explicitly run as maintenance

HISTORICAL_ONE_OFF:
  scripts/g*.ts unless still listed as operational runbook commands

TEST_ONLY:
  src/lib/*.test.ts
  integration/rehearsal scripts when used only in staging

CONVERT_5_5:
  authenticated/internal bare-read pages named in Pattern 5
  current operational CLI defaults that must survive fail-closed RLS

BLOCKING_UNKNOWN:
  0 after this investigation pass, subject to final route-by-route implementation audit
```

## Current Stop Condition

The repository does not currently have a safe global locator for resource-derived or token-derived Org B public routes. Removing the Neon Ultra RLS fallback now would break legitimate existing Neon Ultra behavior unless every legacy route remains explicitly scoped and every resource/token route is converted to either:

1. organization-slug route first, or
2. reviewed minimal locator first.

Therefore:

```text
ORDINARY_TENANT_RLS_FALLBACK: RETAINED
TENANT_ORGANIZATION_ID_DB_DEFAULT: RETAINED
RLS_POLICY_NEON_ULTRA_UUID_REFERENCES: 104 standard policies + 1 UserRoleAssignment special policy
```

## Recommended Next Implementation Sequence

1. Convert the remaining authenticated/internal bare reads named in Pattern 5 to session-scoped `withOrganizationContext()`.
2. Add tenant-qualified public route families using `Organization.slug` for multi-tenant public browsing.
3. Keep legacy `/public/*` as explicit Neon Ultra aliases.
4. Design-review and implement a minimal global `PublicResourceLocator` only for token/resource URLs that cannot carry `organizationSlug`.
5. Wire locator creation/deactivation in the same transactions as ticket/order/media/shareable resource creation.
6. Add fallback-disabled staging rehearsal that proves:
   - no-context tenant selects return zero rows,
   - no-context tenant writes are denied,
   - Neon Ultra legacy public routes still work through explicit context,
   - Org B slug routes work,
   - Org B token/resource routes work through locator or are explicitly not supported,
   - platform null-org grants still work.
7. Only after that proof, write and rehearse an RLS policy migration replacing the fallback expression with fail-closed semantics.
8. Defer DB default removal until a separate live-create audit proves every live tenant create explicitly stamps `organizationId`.

## Interim Gate

```text
STAGE_5_5: BLOCKED_PENDING_BOOTSTRAP_DESIGN_REVIEW
TENANT_BOOTSTRAP_ARCHITECTURE: PARTIAL
PUBLIC_MULTI_TENANT_ROUTING: NOT_YET_IMPLEMENTED
CLIENT_ORG_ID_TRUSTED: NO
RUNTIME_ROLE_BYPASSRLS: NO
TENANT_CONTEXT_TRANSACTION_LOCAL: YES

AUTHENTICATED_SESSION_BOOTSTRAP: PASS_WITH_REMAINING_PAGE_AUDIT
ORGANIZATION_SLUG_BOOTSTRAP: PASS_FOR_APPLY
LEGACY_NEON_BOOTSTRAP: PASS
RESOURCE_DERIVED_BOOTSTRAP: BOOTSTRAP_REQUIRED
TOKEN_DERIVED_BOOTSTRAP: BOOTSTRAP_REQUIRED
PLATFORM_GLOBAL_BOOTSTRAP: NOT_REQUIRED_BY_DESIGN
BACKGROUND_JOB_BOOTSTRAP: NOT_PRESENT
CLI_BOOTSTRAP: PARTIAL

PUBLIC_ID_ALIAS_AS_BOOTSTRAP_LOCATOR: REJECTED_CURRENT_FORM
RESOURCE_LOCATOR_MODEL: PROPOSED_FOR_REVIEW
RESOURCE_LOCATOR_CONTAINS_BUSINESS_DATA: NO_BY_DESIGN

ORDINARY_TENANT_RLS_FALLBACK: RETAINED
RLS_NO_CONTEXT_BEHAVIOR: NEON_ULTRA_FALLBACK_CURRENTLY
RLS_NO_CONTEXT_WRITES: NEON_ULTRA_FALLBACK_CURRENTLY
RLS_POLICY_NEON_ULTRA_UUID_REFERENCES: 105
USERROLEASSIGNMENT_PLATFORM_GRANTS: PRESERVED

TENANT_ORGANIZATION_ID_DB_DEFAULT: RETAINED
ALL_LIVE_TENANT_CREATES_EXPLICIT_ORG: NOT_YET_PROVEN
DEFAULT_REMOVAL_DEFERRALS: 104 tenant model defaults

BACKGROUND_JOBS_USE_FALLBACK: NOT_PRESENT
CURRENT_CLI_USE_FALLBACK: PARTIAL
HISTORICAL_SCRIPTS: NAMED_AS_CLASS
PLATFORM_GLOBAL_OPERATIONS_USE_FAKE_TENANT: NO

WHOLE_REPOSITORY_FALLBACK_SCAN: PASS_WITH_NAMED_EXCEPTIONS
UNCLASSIFIED_LIVE_FALLBACK_DEPENDENCIES: 0
BLOCKING_UNKNOWN: 0

PRISMA_VALIDATE: PASS
TSC: PASS
TESTS: 461/461 PASS

STAGING_BACKUP: NOT_RUN
FALLBACK_DISABLED_REHEARSAL: NOT_RUN
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
FINAL_STAGE_STATUS: BLOCKED_PENDING_BOOTSTRAP_DESIGN_REVIEW
```

## Stage 5.5A Update

The design review moved forward into Stage 5.5A. Local implementation of the
global bootstrap locator foundation is complete, but staging proof and
production deployment have not been attempted.

See:

```text
documentation/architecture/PHASE1_STAGE5_5A_GLOBAL_TENANT_BOOTSTRAP_LOCATOR.md
```

Current status:

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_STAGING_MIGRATION_HISTORY_REPAIR
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
RESOURCE_DERIVED_BOOTSTRAP: LOCAL_IMPLEMENTED
TOKEN_DERIVED_BOOTSTRAP: LOCAL_IMPLEMENTED
LOCAL_VERIFICATION: PASS
STAGING_BACKUP: VERIFIED
STAGING_MIGRATION: BLOCKED_BY_HISTORICAL_MIGRATION_METADATA_DRIFT
STAGING_BACKFILL: NOT_ATTEMPTED
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
```

Stage 5.5A staging was attempted on 2026-09-08 against
`ultraos_staging`. Runtime and maintenance credentials were verified, a staging
backup was verified, and locator source inventory had zero collisions. The
standard Prisma migration path then stopped before the locator migration because
staging already contains Stage 4a RLS policy objects while
`_prisma_migrations` does not record Stage 4a as applied. The attempted failed
Stage 4a migration row was marked rolled back; no locator schema or business
data change was applied, and production was not touched.

## 2026-09-08 Stage 5.5A Continuation Status

Stage 5.5A advanced past the previous staging migration-history blocker.
Staging migration history was repaired only for historical migrations whose
schema effects were catalog-verified as already present, and Prisma then
applied only the Stage 5.5A locator migration.

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_FULL_STAGING_GATE_PROOF
STAGING_DATABASE: ultraos_staging
STAGING_RELEASE: /opt/ultraos-staging/releases/20260908-030506
STAGING_MIGRATION_HEAD: 20260907111500_phase1_stage5_5a_bootstrap_locators
STAGING_BACKFILL: PASS
RESOURCE_LOCATORS: 257
TOKEN_LOCATORS_FROM_BASELINE: 0
BOUNDED_ORG_B_BOOTSTRAP_PROOF: PASS
STAGING_RESIDUE: 0
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5B: NO
```

Production remains blocked because the full Stage 5.5A staging gate was not
completed: creation-hook proof through all live create paths, atomic rollback,
import/provisioning paths, full metadata/media visibility matrix, concurrent
context rehearsal, and full legacy Neon regression matrix still require
execution.

## 2026-09-08 Stage 5.5A Bounded Proof Update

An additional bounded proof was completed on staging using:

```text
PROOF_SCRIPT: web/scripts/stage55a-staging-proof.ts
STAGING_RELEASE: /opt/ultraos-staging/releases/20260908-030506
STAGING_DATABASE: ultraos_staging
```

Results:

```text
PUBLIC_LOCATOR_BACKFILL_IDEMPOTENCY: PASS
EXPECTED_RESOURCE_ROWS: 257
ACTIVE_RESOURCE_LOCATORS: 257
MISSING_RESOURCE_LOCATORS: 0
TOKEN_LOCATORS: 0
DUPLICATE_LOCATOR_KEYS: 0
NULL_LOCATOR_ORGANIZATION_IDS: 0

NO_CONTEXT_RESOURCE_LOCATOR_BOOTSTRAP: PASS
NO_CONTEXT_TOKEN_LOCATOR_BOOTSTRAP: PASS
AUTHORITATIVE_TENANT_REREAD: PASS
TOKEN_TYPE_ISOLATION: PASS
FAIL_CLOSED_UNKNOWN_OR_ALTERED_TOKEN: PASS
FAIL_CLOSED_INACTIVE_LOCATOR: PASS
LOCATOR_IS_NOT_AUTHORIZATION: PASS
CONCURRENT_CONTEXT_NO_BLEED: PASS
PUBLIC_MEDIA_ROUTE: PASS
PRIVATE_MEDIA_UNAUTHENTICATED_ROUTE: PASS
PUBLIC_TICKET_ORDER_EVENT_FIXTURE_CLUB_ROUTES: PASS
SENTINEL_CLEANUP_RESIDUE: 0
```

The share/metadata route family still needs a finalized-data Org A/Org B proof.
The bounded disposable fixture correctly failed closed where finalized analytics
or season totals were absent, but that is not enough to close the production
gate.

Current status:

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_REMAINING_FULL_GATE_PROOFS
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5B: NO
HANDOVER_READY: YES
```

## 2026-09-08 Stage 5.5A Full-Gate Proof Update

A fuller staging proof was completed with
`web/scripts/stage55a-full-gate-proof.ts`. It created two disposable staging
organizations and verified resource bootstrap, ticket/order token bootstrap,
fail-closed tampering, inactive locator and inactive organization behavior,
authoritative tenant rereads, token type hash isolation, raw-token non-storage,
resource and token rollback, finalized metadata, public/private media
visibility, share-image APIs, concurrent context isolation, and cleanup.

```text
CROSS_TENANT_TAMPERING: PASS
AUTHORITATIVE_TENANT_REREAD: PASS
TOKEN_BOOTSTRAP: PASS
TOKEN_SECURITY: PASS
ATOMIC_ROLLBACK: PASS
METADATA_BOOTSTRAP: PASS
MEDIA_VISIBILITY: PASS
CONCURRENT_CONTEXT_BLEED: NONE
STAGING_TEST_FIXTURE_RESIDUE: 0
POST_CLEANUP_RESOURCE_LOCATORS: 257/257
POST_CLEANUP_TOKEN_LOCATORS: 0/0
```

Creation-hook status:

```text
RUNTIME_PROVEN:
  - Club
  - Fixture
  - Event
  - MediaAsset
  - Ticket
  - Order
  - Athlete

CODE_PATH_VERIFIED:
  - imports
  - participant internalization
  - admin offline intake locator hook
```

Remaining blocker:

```text
LEGACY_NEON_REGRESSION: BLOCKED_BY_STAGING_MEDIA_FILE_ABSENCE
```

Most legacy Neon routes passed on staging: public club, public player, public
event, public fixture, scoreboard, display clock, share game page, share image
API, share team page, `/live`, and `/api/v1/live`. Ticket/order route smoke was
skipped because staging has no persistent token rows. Legacy public media could
not be proven because all 17 public READY Neon media rows in staging point to
missing local files; the first sampled media route returned HTTP 500 with
`ENOENT`. The disposable Org A/Org B media proof passed, so this is a staging
data/media-file readiness blocker rather than evidence of locator leakage.

Production remains untouched:

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_LEGACY_NEON_MEDIA_REGRESSION_DECISION
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5B: NO
BLOCKING_UNKNOWN: 0
```

## Stage 5.5A Continuation — 2026-09-09

The controlled legacy Neon media proof now passes. The test used a disposable
asset created by the real upload path, verified the scoped locator and public
media route, and removed all fixture rows and files. Historical staging media
rows remain unchanged; their missing local files are classified as a
pre-existing staging media-fidelity issue. Ordinary RLS fallback and tenant
organization defaults remain unchanged.

```text
STAGE55A_FULL_GATE_PROOF: PASS
LEGACY_NEON_MEDIA_REGRESSION: PASS_FOR_VALID_STORAGE_BACKED_ASSET
LEGACY_NEON_HISTORICAL_ROWS: 17 STALE LOCAL REFERENCES, UNCHANGED
CONCURRENT_CONTEXT_BLEED: NONE
POST_CLEANUP_RESOURCE_LOCATORS: 257/257
POST_CLEANUP_TOKEN_LOCATORS: 0/0
LOCAL_BUILD: PASS
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
```

The next required activity is independent production preflight. Stage 5.5B is
not started.

## Production Closure — 2026-09-09

Stage 5.5A production preflight passed. A verified database backup was taken,
the locator migration applied, and the production backfill completed with zero
collisions. The isolated release was activated at
`/opt/ultraleagueos/releases/release-20260909041000-stage5-5a` and only
`ultraos-web.service` was restarted.

Production verification passed for HTTPS routing, representative public pages
and APIs, media delivery, locator counts, RLS state, service health, and
business-row invariants. Production now has 257 resource locators, zero token
locators, zero null locator organization IDs, and zero duplicate keys.

No RLS fallback removal, database-default removal, or Stage 5.5B work was
performed. Those remain separate, explicitly authorized work.

```text
STAGE_5_5A: COMPLETE
STAGE_5_5B: NOT_STARTED
PRODUCTION_DEPLOYMENT: PASS
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
```

## Stage 5.5B Preflight — 2026-09-09

Stage 5.5B began with a verified staging-only baseline. The fresh backup is
`/var/backups/ultraleagueos-staging/stage55b_preflight_20260909T041127Z.dump`
with SHA-256
`987ee59effda5a13e5f7facd6de1e49844a315626717044d9886ceea6d377f88`.
The restricted runtime is `ultraos_staging` with `NOBYPASSRLS`; the privileged
maintenance role is `ultraos`; the database is `ultraos_staging`.

The current baseline is 107 organizationId-bearing tables, 105 enabled and
forced RLS tables, and 105 ordinary policies retaining the Neon fallback.
Business state and public locator state were recorded in
`PHASE1_STAGE5_5B_EXPLICIT_CONTEXT_CERTIFICATION.md`.

The whole-repository audit found 283 bare tenant Prisma call sites across 73
source files. The confirmed live classes include operations/readiness,
fixture, player, coach, game/live, training, media, draft, event, broadcast,
and participant-management surfaces. These paths can still rely on the
fallback when they run without an explicit transaction-local organization
context. Therefore the required gate
`UNCLASSIFIED_LIVE_PRECONTEXT_TENANT_READS: 0` is not met.

No staging fallback-disabled policy was applied, no staging service was
restarted, and production was untouched. Stage 5.5B is blocked pending the
explicit-context remediation and a new live-path inventory.

```text
STAGE_5_5B: BLOCKED
STAGING_BACKUP: VERIFIED
ORDINARY_RLS_FALLBACK: RETAINED
STAGING_FALLBACK_DISABLED_REHEARSAL: NOT_ATTEMPTED
PRODUCTION_RLS_MODIFIED: NO
READY_FOR_STAGE_5_5C: NO
```
