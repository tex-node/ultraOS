# Phase 1, Stage 5.5A - Global Tenant Bootstrap Locator Foundation

Status: STAGING BLOCKED - MIGRATION HISTORY DRIFT

Stage 5.5A implements the smallest global bootstrap layer needed by live public
routes that receive only a resource key or bearer-style token before tenant
context exists.

This stage deliberately does not remove the Stage 4a Neon Ultra RLS fallback and
does not remove temporary `organizationId` database defaults.

## Baseline

Repository root: `C:/UltraLeagueOS`

Branch: `main`

Baseline inherited from Stage 5.5 investigation:

```text
PRISMA_VALIDATE: PASS
TSC: PASS
TESTS: 461/461 PASS
```

## Bootstrap Requirement Matrix

| Route / caller | Selector | Selector type | Current first DB read | Current tenant source | Fallback dependent | Bootstrap required | Locator type | Public/auth | Metadata caller | Legacy Neon compatibility | Conversion 5.5A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/apply/[organizationSlug]` | `organizationSlug` | `ORGANIZATION_SLUG` | `Organization.findUnique(slug)` | Organization slug | No | No | None | Public | No | N/A | No locator |
| `/apply` | none | `LEGACY_NEON_DEFAULT` | `Organization.findUnique(slug="neon-ultra")` | Explicit Neon Ultra slug | No | No | None | Public | No | Preserved redirect | No locator |
| `/public` and public list pages | none | `LEGACY_NEON_DEFAULT` | `Organization.findUnique(slug="neon-ultra")` | Explicit Neon Ultra slug | No | No | None | Public | Sometimes | Preserved | No locator |
| `/live`, `/scoreboard/[gameId]`, display/broadcast pages | `gameId` where present | `LEGACY_NEON_DEFAULT` / `INTERNAL_DATABASE_ID` | Explicit Neon Ultra org then tenant reads | Explicit Neon Ultra slug | No for current product scope | No | None | Public/display | No | Preserved | No locator |
| `/public/tickets/[code]` | `Ticket.code` | `BEARER_TOKEN` | `Ticket.findUnique(code)` | Tenant-owned ticket row | Yes | Yes | `PublicTokenLocator(TICKET)` | Public | No | Preserved URL | Convert |
| `createWalletOrder(ticketCode)` | `Ticket.code` | `BEARER_TOKEN` | `Ticket.findUniqueOrThrow(code)` | Tenant-owned ticket row | Yes | Yes | `PublicTokenLocator(TICKET)` | Public action | No | Preserved URL | Convert |
| `/public/orders/[code]` | `Order.collectionCode` | `BEARER_TOKEN` | `Order.findUnique(collectionCode)` | Tenant-owned order row | Yes | Yes | `PublicTokenLocator(ORDER)` | Public | No | Preserved URL | Convert |
| `/public/events/[id]` | `Event.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Event.findUnique(id)` | Tenant-owned event row | Yes | Yes | `PublicResourceLocator(EVENT)` | Public | No | Preserved URL | Convert |
| `reserveZone(eventId)` | `Event.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Event.findUniqueOrThrow(id)` | Tenant-owned event row | Yes | Yes | `PublicResourceLocator(EVENT)` | Public action | No | Preserved URL | Convert |
| `/public/fixtures/[id]` | `Fixture.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Fixture.findUnique(id)` | Tenant-owned fixture row | Yes | Yes | `PublicResourceLocator(FIXTURE)` | Public | No | Preserved URL | Convert |
| `/public/clubs/[id]` | `Club.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Club.findUnique(id)` with business includes | Tenant-owned club row | Yes | Yes | `PublicResourceLocator(CLUB)` | Public | No | Preserved URL | Convert |
| `/public/share/game/[id]` | `Fixture.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Fixture.findUnique(id)` | Tenant-owned fixture row | Yes | Yes | `PublicResourceLocator(FIXTURE)` | Public | Yes | Preserved URL | Convert |
| `/api/share/game/[id]` | `Fixture.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Fixture.findUnique(id)` | Tenant-owned fixture row | Yes | Yes | `PublicResourceLocator(FIXTURE)` | Public API | No | Preserved URL | Convert |
| `/public/share/player/[id]` | `Athlete.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Athlete.findUnique(id)` | Tenant-owned athlete row | Yes | Yes | `PublicResourceLocator(ATHLETE)` | Public | Yes | Preserved URL | Convert |
| `/api/share/player/[id]` | `Athlete.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Athlete.findUnique(id)` | Tenant-owned athlete row | Yes | Yes | `PublicResourceLocator(ATHLETE)` | Public API | No | Preserved URL | Convert |
| `/public/share/team/[id]` | `Club.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Club.findUnique(id)` | Tenant-owned club row | Yes | Yes | `PublicResourceLocator(CLUB)` | Public | Yes | Preserved URL | Convert |
| `/api/share/team/[id]` | `Club.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `Club.findUnique(id)` | Tenant-owned club row | Yes | Yes | `PublicResourceLocator(CLUB)` | Public API | No | Preserved URL | Convert |
| `/media/assets/[assetId]/file` | `MediaAsset.id` | `GLOBAL_OPAQUE_RESOURCE_KEY` | `MediaAsset.findUnique(id)` | Tenant-owned media row | Yes | Yes | `PublicResourceLocator(MEDIA_ASSET)` | Public/auth conditional | No | Preserved URL | Convert |
| `/api/v1/*`, `/api/games/*`, `/api/content/*`, `/api/broadcast/*` | route-specific | `LEGACY_NEON_DEFAULT` | Explicit Neon Ultra org then tenant reads | Explicit Neon Ultra slug | No for current product scope | No | None | Public API | Sometimes | Preserved | No locator |
| `/data-readiness` and `/data-readiness/export` | none | `PLATFORM_GLOBAL` | Platform permission then platform diagnostic | None by design | No | No | None | Authenticated platform admin | No | N/A | No locator |

```text
UNCLASSIFIED_BOOTSTRAP_CALLERS: 0
```

## Locator Architecture

Stage 5.5A uses two global infrastructure tables:

- `PublicResourceLocator` for exact resource-key lookups.
- `PublicTokenLocator` for bearer-style token lookups.

They are global bootstrap data, not tenant business data. They do not receive
ordinary tenant RLS policies and do not carry the Neon Ultra `organizationId`
database default.

`PublicResourceLocator.publicKey` is the exact existing public route selector
for globally opaque database IDs already embedded in public URLs, such as
`Club.id`, `Athlete.id`, `Fixture.id`, `Event.id`, and `MediaAsset.id`.

`PublicTokenLocator.tokenHash` stores a deterministic SHA-256 hash of
`<tokenType>:<raw token>`. Raw ticket and order tokens are not duplicated in the
locator table and must not be logged by locator helpers or backfill scripts.

## PublicIdAlias Decision

`PublicIdAlias` is not reused because it is tenant-owned, RLS-protected, carries
the temporary Neon Ultra default, and cannot answer a no-context bootstrap query
after fallback removal.

## Threat Model

| Case | Expected behavior |
| --- | --- |
| Valid token with altered resource ID | Locator returns token resource id; tenant reread verifies raw token and target. Mismatch fails closed. |
| Valid public key with wrong resource type | Composite unique lookup includes type. Wrong type returns no locator and fails closed. |
| Stale locator | Tenant reread by authoritative id returns null or invalid status and fails closed. |
| Deleted tenant resource | Tenant reread returns null and fails closed. |
| Archived tenant resource | Existing route visibility/status checks remain authoritative and fail closed where applicable. |
| Locator points at different organization | Tenant reread verifies `organizationId` and fails closed on mismatch. |
| Duplicate key attempt | Database unique constraint rejects duplicate type/key or type/hash. |
| Guessed key | Unknown exact lookup returns not found without enumeration. |
| Unknown token | Hash lookup misses and returns not found. |
| Malformed token | Hash lookup misses or caller validation rejects; no raw token logging. |
| Inactive organization | Helper rejects inactive/suspended organization and fails closed. |
| Resource deletion / locator cleanup race | Tenant reread remains authoritative and fails closed if the target is unavailable. |

## Lifecycle

Locator rows are created for existing resources by an idempotent backfill.
Creation hooks are required for future locator-backed resources:

- Event creation creates an `EVENT` resource locator.
- Fixture creation creates a `FIXTURE` resource locator.
- Club creation creates a `CLUB` resource locator.
- Media asset creation creates a `MEDIA_ASSET` resource locator.
- Ticket creation creates a hashed `TICKET` token locator.
- Order creation creates a hashed `ORDER` token locator.
- Athlete creation requires locator creation in participant provisioning and
  admin/player creation paths before public arbitrary-tenant player detail/share
  routes are considered fully supported.

Locator status can be set inactive without deleting history. The authoritative
tenant row still decides final public visibility.

## Deployment Boundary

Production deployment is allowed only after local verification, staging backup,
staging migration, idempotent backfill, Org B bootstrap proof, token tampering
proof, cleanup, and production invariant capture pass.

Stage 5.5A does not disable the Neon Ultra fallback. That remains Stage 5.5B.

## Local Implementation

Implemented locally:

- Added `PublicResourceLocatorType`, `PublicTokenLocatorType`, and
  `PublicLocatorStatus`.
- Added global `PublicResourceLocator` and `PublicTokenLocator` models.
- Added migration
  `20260907111500_phase1_stage5_5a_bootstrap_locators`.
- Added `src/lib/public-locators.ts`.
- Added `scripts/public-locators-backfill.ts`.
- Added `npm run public-locators:backfill`.
- Converted public token pages/actions:
  - `/public/tickets/[code]`
  - `/public/orders/[code]`
  - `createWalletOrder(ticketCode)`
- Converted public resource pages/actions:
  - `/public/events/[id]`
  - `reserveZone(eventId)`
  - `/public/fixtures/[id]`
  - `/public/clubs/[id]`
- Converted share page and PNG API resource bootstraps:
  - `/public/share/game/[id]`
  - `/api/share/game/[id]`
  - `/public/share/player/[id]`
  - `/api/share/player/[id]`
  - `/public/share/team/[id]`
  - `/api/share/team/[id]`
- Converted media file bootstrap:
  - `/media/assets/[assetId]/file`
- Added locator creation hooks for:
  - Club creation.
  - Fixture creation.
  - Event creation.
  - Media asset upload.
  - Public reservation ticket creation.
  - Public wallet order creation.
  - Player application approval athlete provisioning.
  - Participant internalization athlete provisioning.
  - Import-created or import-updated clubs and athletes.
  - Admin offline-intake athlete provisioning, preserving that path's current
    Stage 5 bridge behavior.

## Local Verification

```text
PRISMA_FORMAT: PASS
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS_WITH_7_PREEXISTING_WARNINGS
TESTS: 466/466 PASS
BUILD: PASS_WITH_EXISTING_MEDIA_STORAGE_NFT_WARNING
PUBLIC_BOOTSTRAP_BARE_SEED_SCAN: PASS
```

After tightening `scripts/public-locators-backfill.ts` to report
`existingLocatorRows`, `matchingLocatorRows`, `missingLocatorRows`,
`mismatchedLocatorRows`, `expectedInserts`, and `expectedUpdates`, TypeScript
was rerun and remained clean.

The lint warnings are the existing seven warnings in:

- `scripts/g15-rehearsal.ts`
- `scripts/g3-cohort-final-audit.ts`
- `scripts/g3-secondary-draft-rehearsal.ts`
- `src/app/broadcast/control/page.tsx`
- `src/app/clubs/[id]/page.tsx`
- `src/lib/game-result-import.ts`

The production build warning remains the existing Turbopack/NFT trace through
`src/lib/media-storage.ts` and `/media/assets/[assetId]/file`.

## Staging Attempt - 2026-09-08

Staging target verification:

```text
STAGING_DATABASE: ultraos_staging
STAGING_SERVICE: ultraos-staging-web.service
STAGING_APP_PATH: /opt/ultraos-staging/current/web
STAGING_CURRENT_RELEASE: /opt/ultraos-staging/releases/20260726-223640
STAGING_RUNTIME_ROLE: ultraos_staging
STAGING_RUNTIME_SUPERUSER: false
STAGING_RUNTIME_BYPASSRLS: false
STAGING_MAINTENANCE_ROLE: ultraos
STAGING_MAINTENANCE_SUPERUSER: true
STAGING_MAINTENANCE_BYPASSRLS: true
```

Runtime health:

```text
STAGING_WEB_LOCAL_LOGIN_HTTP: 200
FAILED_MIGRATIONS_BEFORE_ATTEMPT: 0
```

Fresh staging backup:

```text
STAGING_BACKUP: VERIFIED
STAGING_BACKUP_PATH: /var/backups/ultraleagueos-staging/stage5_5a_bootstrap_20260908-020202.dump
STAGING_BACKUP_SIZE: 820909
STAGING_BACKUP_TOC_ENTRIES: 1219
```

Pre-migration locator source inventory:

| Type | Source rows | Eligible rows | Null selectors | Duplicate selectors | Expected locator rows | Collisions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Club | 8 | 8 | 0 | 0 | 8 | 0 |
| Fixture | 12 | 12 | 0 | 0 | 12 | 0 |
| Event | 1 | 1 | 0 | 0 | 1 | 0 |
| MediaAsset | 17 | 17 | 0 | 0 | 17 | 0 |
| Athlete | 219 | 219 | 0 | 0 | 219 | 0 |
| Ticket.code | 0 | 0 | 0 | 0 | 0 | 0 |
| Order.collectionCode | 0 | 0 | 0 | 0 | 0 | 0 |

```text
BACKFILL_COLLISIONS: 0
RAW_TICKET_CODES_PRINTED: NO
RAW_ORDER_COLLECTION_CODES_PRINTED: NO
```

A new staging release was prepared at:

```text
/opt/ultraos-staging/releases/20260908-030506
```

The active `current` symlink was not changed.

Migration attempt:

```text
COMMAND: npx prisma migrate deploy
TARGET_DATABASE: ultraos_staging
RESULT: BLOCKED
FAILED_MIGRATION: 20260823070000_phase1_stage4a_row_level_security
ERROR_CODE: 42710
ERROR: policy "tenant_isolation" for table "Competition" already exists
```

The failure occurred before the Stage 5.5A locator migration was reached.
`PublicResourceLocator` and `PublicTokenLocator` were not created.

Diagnosis:

```text
STAGING_MIGRATION_HISTORY_DRIFT: PRESENT
STAGE_4A_SCHEMA_OBJECTS_EXIST: YES
STAGE_4A_MIGRATION_RECORDED_APPLIED: NO
STAGE_4C_USERROLE_POLICY_EXISTS: YES
STAGE_4C_MIGRATION_RECORDED_APPLIED: NO
STAGE_5_4A_PUBLICIDALIAS_EXISTS: YES
STAGE_5_4A_MIGRATION_RECORDED_APPLIED: NO
```

Exact migration-history state after cleanup:

```text
LOCATOR_TABLES_PRESENT: NO
ROLLED_BACK_MIGRATION_ROWS:
  - 20260823070000_phase1_stage4a_row_level_security
MISSING_MIGRATION_HISTORY_ROWS:
  - 20260823080000_phase1_stage4c_userroleassignment_rls
  - 20260902220000_phase1_stage5_4a_tenant_scoped_public_ids
  - 20260903120000_phase1_stage5_4b_seasonclub_tenant_fk
  - 20260904060000_phase1_stage5_2b3_draft_tenant_fk
  - 20260905060000_phase1_stage5_2b4_vendor_event_reservation_tenant_fk
  - 20260907111500_phase1_stage5_5a_bootstrap_locators
```

The failed migration-table row created by this attempt was marked rolled back so
staging was not left in a failed Prisma migration state:

```text
MIGRATION_TABLE_CLEANUP: APPLIED_TO_FAILED_STAGE_4A_ROW_ONLY
LOCATOR_SCHEMA_CHANGE_APPLIED: NO
BUSINESS_DATA_CHANGED: NO
PRODUCTION_TOUCHED: NO
```

Smallest recommended remediation before rerunning Stage 5.5A migration:

1. Inventory every Phase 1 migration directory missing from staging
   `_prisma_migrations`.
2. For each missing migration, prove the schema effect already exists or identify
   the exact gap.
3. Mark only proven already-applied migrations as applied in staging migration
   history, or create a staging-specific migration-baseline repair plan for
   review.
4. Rerun `npx prisma migrate deploy`; it should then apply only
   `20260907111500_phase1_stage5_5a_bootstrap_locators`.

Do not apply the locator migration manually as a workaround unless the staging
migration-history repair plan is reviewed.

## Current Gate

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_STAGING_MIGRATION_HISTORY_REPAIR
RLS_FALLBACK_REMOVAL: NOT_ATTEMPTED_BY_DESIGN
ORGANIZATION_ID_DB_DEFAULT_REMOVAL: NOT_ATTEMPTED_BY_DESIGN

BOOTSTRAP_CALLERS_CLASSIFIED: PASS
UNCLASSIFIED_BOOTSTRAP_CALLERS: 0
ORGANIZATION_SLUG_BOOTSTRAP: PASS
LEGACY_NEON_BOOTSTRAP: PASS
RESOURCE_DERIVED_BOOTSTRAP: LOCAL_IMPLEMENTED
TOKEN_DERIVED_BOOTSTRAP: LOCAL_IMPLEMENTED

PUBLIC_RESOURCE_LOCATOR: IMPLEMENTED
PUBLIC_TOKEN_LOCATOR: IMPLEMENTED
LOCATOR_LAYER: GLOBAL_BOOTSTRAP_INFRASTRUCTURE
LOCATOR_REQUIRES_TENANT_CONTEXT: NO
LOCATOR_CONTAINS_BUSINESS_DATA: NO
LOCATOR_CONTAINS_PII: NO
RAW_BEARER_TOKEN_STORED: NO
RAW_BEARER_TOKEN_LOGGED: NO
TOKEN_HASH: SHA-256("<tokenType>:<raw token>")
PUBLIC_LOCATOR_LIST_API: NONE
PUBLICIDALIAS_REPURPOSED: NO
SPORT_SPECIFIC_LOCATOR_TYPES: NO

LOCATOR_IS_AUTHORIZATION: NO
AUTHORITATIVE_TENANT_REREAD: YES
CLIENT_ORG_ID_TRUSTED: NO
ORDINARY_TENANT_RLS_FALLBACK: RETAINED_BY_DESIGN
TENANT_ORGANIZATION_ID_DB_DEFAULT: RETAINED_BY_DESIGN

STAGING_BACKUP: VERIFIED
STAGING_MIGRATION: BLOCKED_BY_HISTORICAL_MIGRATION_METADATA_DRIFT
STAGING_BACKFILL: NOT_ATTEMPTED
ORG_B_CAPABILITY: NOT_ATTEMPTED
TOKEN_REHEARSAL: NOT_ATTEMPTED
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED

READY_FOR_STAGE_5_5B: NO
BLOCKING_UNKNOWN: 1
FINAL_STAGE_5_5A_STATUS: BLOCKED_PENDING_STAGING_MIGRATION_HISTORY_REPAIR
```

## 2026-09-08 Continuation: Staging Migration, Backfill, and Bounded Bootstrap Proof

Staging advanced past the migration-history blocker. Catalog checks proved the
historical Phase 1 schema effects already existed, then staging migration
history was repaired with `prisma migrate resolve --applied` for those
historical migrations only. Prisma then applied only:

```text
20260907111500_phase1_stage5_5a_bootstrap_locators
```

Evidence:

```text
STAGING_DATABASE: ultraos_staging
STAGING_SERVICE: ultraos-staging-web.service
STAGING_RELEASE: /opt/ultraos-staging/releases/20260908-030506
STAGING_BACKUP: VERIFIED
BACKUP_PATH: /opt/ultraos-staging/backups/stage55a_ultraos_staging_20260908T081504Z.dump
BACKUP_SIZE: 821648 bytes
TOC_ENTRIES: 1234
BACKUP_SHA256: 6351880254b59f06ed7cc8a35d4abff4491ad8333fb5096283c776d2ad1a8093
MIGRATION_HEAD: 20260907111500_phase1_stage5_5a_bootstrap_locators
FAILED_MIGRATIONS: 0
```

Locator/backfill result:

```text
LOCATOR_TABLE_RLS: NOT_TENANT_CONTEXT_DEPENDENT
LOCATOR_ORGANIZATION_ID_DEFAULT: NONE
RUNTIME_ROLE_SUPERUSER: NO
RUNTIME_ROLE_BYPASSRLS: NO
BACKFILL_DRY_RUN: PASS
BACKFILL_APPLY: PASS
BACKFILL_IDEMPOTENT: PASS
BACKFILL_COLLISIONS: 0
RESOURCE_LOCATORS: 257
TOKEN_LOCATORS: 0
LOCATOR_RESOURCE_MISMATCHES: 0
RAW_TOKEN_STORED_IN_LOCATOR: NO
```

Bounded disposable Org B staging proof:

```text
ORG_B_RESOURCE_BOOTSTRAP: PASS
ORG_B_TOKEN_BOOTSTRAP: PASS
AUTHORITATIVE_TENANT_REREAD: PASS
TOKEN_TYPE_ISOLATION: PASS
UNKNOWN_PUBLIC_KEY: FAIL_CLOSED
ALTERED_TOKEN: FAIL_CLOSED
WRONG_TOKEN_TYPE: FAIL_CLOSED
INACTIVE_LOCATOR: FAIL_CLOSED
CROSS_TENANT_TAMPER_REQUIRES_AUTHORITATIVE_REREAD: PASS
STAGING_RESIDUE: 0
```

Local/staging verification:

```text
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS_WITH_7_PREEXISTING_WARNINGS
TESTS: 466/466 PASS
STAGING_BUILD: PASS_WITH_KNOWN_MEDIA_STORAGE_NFT_WARNING
LOCAL_BUILD: INTERRUPTED_AFTER_TYPESCRIPT_DURING_PAGE_DATA_COLLECTION
```

Production was intentionally not attempted. The complete Stage 5.5A staging
gate is still not fully proven to production standard.

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: BLOCKED_PENDING_FULL_STAGING_GATE_PROOF
FINAL_STAGE_5_5A_STATUS: BLOCKED
READY_FOR_STAGE_5_5B: NO
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
```

Remaining before production:

```text
CREATION_HOOKS_VIA_LIVE_CREATE_PATHS: PARTIAL_NOT_FULLY_PROVEN
ATOMIC_ROLLBACK: NOT_FULLY_PROVEN
IMPORT_LOCATOR_CREATION: NOT_FULLY_PROVEN
PARTICIPANT_PROVISIONING_LOCATOR_CREATION: NOT_FULLY_PROVEN
METADATA_ORG_A_ORG_B_RUNTIME_PROOF: PARTIAL
PRIVATE_MEDIA_VISIBILITY_MATRIX: NOT_FULLY_PROVEN
CONCURRENT_CONTEXT_REHEARSAL: NOT_RUN
LEGACY_NEON_FULL_MATRIX: PARTIAL_SMOKE_ONLY
```

## 2026-09-08 Follow-up: Bounded Staging Proof and Idempotency Check

An additional bounded staging proof was run against the active staging release:

```text
STAGING_RELEASE: /opt/ultraos-staging/releases/20260908-030506
STAGING_DATABASE: ultraos_staging
STAGING_SERVICE: ultraos-staging-web.service
PROOF_SCRIPT: web/scripts/stage55a-staging-proof.ts
BASE_URL: http://127.0.0.1:4120
```

The proof created disposable Org A/Org B records, resolved public resource and
token locators without tenant context, re-entered the authoritative tenant
context before tenant-owned reads, checked fail-closed negative cases, exercised
public route smoke paths, and removed all sentinel records.

```text
RUNTIME_ROLE_RESTRICTED: PASS
NO_CONTEXT_RESOURCE_LOCATOR_BOOTSTRAP: PASS
NO_CONTEXT_TOKEN_LOCATOR_BOOTSTRAP: PASS
AUTHORITATIVE_REREAD_RESOURCE: PASS
AUTHORITATIVE_REREAD_TOKEN: PASS
UNKNOWN_PUBLIC_KEY_FAILS_CLOSED: PASS
ALTERED_TOKEN_FAILS_CLOSED: PASS
WRONG_TOKEN_TYPE_FAILS_CLOSED: PASS
TOKEN_TYPE_ISOLATION: PASS
INACTIVE_LOCATOR_FAILS_CLOSED: PASS
LOCATOR_IS_NOT_AUTHORIZATION: PASS
ATOMIC_ROLLBACK_RESOURCE_LOCATOR: PASS
CONCURRENT_CONTEXT_NO_BLEED: PASS
RAW_BEARER_TOKEN_NOT_STORED_IN_LOCATOR: PASS
PUBLIC_MEDIA_FILE_ROUTE: PASS
PRIVATE_MEDIA_FILE_UNAUTHENTICATED_ROUTE: PASS
PUBLIC_TICKET_ROUTE: PASS
PUBLIC_ORDER_ROUTE: PASS
PUBLIC_EVENT_ROUTE: PASS
PUBLIC_FIXTURE_ROUTE: PASS
PUBLIC_CLUB_ROUTE: PASS
SENTINEL_CLEANUP: PASS
```

The share game/player/team checks returned 404 for the disposable data because
the minimal fixture did not have finalized analytics or season totals. That is
acceptable fail-closed behavior for this proof, but it does not satisfy the
remaining full metadata/share matrix requirement.

Post-proof locator state was verified directly in `ultraos_staging`:

```text
EXPECTED_RESOURCE_ROWS: 257
ACTIVE_RESOURCE_LOCATORS: 257
MISSING_RESOURCE_LOCATORS: 0
EXPECTED_TOKEN_ROWS: 0
ACTIVE_TOKEN_LOCATORS: 0
MISSING_TOKEN_LOCATORS: 0
TOTAL_RESOURCE_LOCATORS: 257
TOTAL_TOKEN_LOCATORS: 0
NULL_ORG_RESOURCE_LOCATORS: 0
NULL_ORG_TOKEN_LOCATORS: 0
DUPLICATE_RESOURCE_PUBLIC_KEYS: 0
DUPLICATE_TOKEN_HASHES: 0
STAGE55A_SENTINEL_RESIDUE: 0
```

Verification after adding the proof script:

```text
TSC: PASS
PRISMA_VALIDATE: PASS
TESTS: 466/466 PASS
LINT: PASS_WITH_7_PREEXISTING_WARNINGS
LOCAL_BUILD: PASS_WITH_KNOWN_MEDIA_STORAGE_NFT_WARNING
STAGING_SERVICE_JOURNAL: CLEAN
```

This materially improves confidence in the locator foundation, but Stage 5.5A
is still not production-ready. The remaining gate items are explicit and should
not be bypassed.

```text
STAGE_5_5A: BLOCKED_PENDING_REMAINING_FULL_GATE_PROOFS
PUBLIC_LOCATOR_BACKFILL_IDEMPOTENCY: PASS
BOUNDED_ORG_B_BOOTSTRAP_PROOF: PASS
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5B: NO
```

## 2026-09-08 Full-Gate Staging Proof Continuation

The remaining Stage 5.5A full-gate proof was extended with:

```text
PROOF_SCRIPT: web/scripts/stage55a-full-gate-proof.ts
STAGING_DATABASE: ultraos_staging
STAGING_RUNTIME_USER: ultraos_staging
RAW_DISPOSABLE_TOKENS_PRINTED: NO
```

Runtime proof covered two disposable organizations and the smallest fixture
graph needed for resource bootstrap, bearer-token bootstrap, finalized metadata,
share-image APIs, public/private media, rollback, and cleanup.

```text
ORG_A_RESOURCE_BOOTSTRAP: PASS
ORG_B_RESOURCE_BOOTSTRAP: PASS
ORG_A_TICKET_BOOTSTRAP: PASS
ORG_B_TICKET_BOOTSTRAP: PASS
ORG_A_ORDER_BOOTSTRAP: PASS
ORG_B_ORDER_BOOTSTRAP: PASS

CROSS_TENANT_RESOURCE_TAMPERING: PASS
WRONG_RESOURCE_TYPE: FAIL_CLOSED
UNKNOWN_PUBLIC_KEY: FAIL_CLOSED
INACTIVE_RESOURCE_LOCATOR: FAIL_CLOSED
INACTIVE_ORGANIZATION_LOCATOR: FAIL_CLOSED

UNKNOWN_TOKEN: FAIL_CLOSED
ALTERED_TOKEN: FAIL_CLOSED
WRONG_TOKEN_TYPE: FAIL_CLOSED
INACTIVE_TOKEN_LOCATOR: FAIL_CLOSED
STALE_TOKEN_LOCATOR: FAIL_CLOSED
TOKEN_ORG_RESOURCE_MISMATCH: FAIL_CLOSED
TOKEN_TYPE_HASH_ISOLATION: PASS
RAW_TOKEN_STORED_IN_LOCATOR: NO

LOCATOR_IS_AUTHORIZATION: NO
AUTHORITATIVE_TENANT_REREAD: PASS
ATOMIC_ROLLBACK_RESOURCE_BUSINESS_AND_LOCATOR: PASS
ATOMIC_ROLLBACK_TOKEN_BUSINESS_AND_LOCATOR: PASS
PARTIAL_WRITES_AFTER_FAILURE: 0

METADATA_ORG_A_PLAYER: PASS
METADATA_ORG_B_PLAYER: PASS
METADATA_ORG_A_TEAM: PASS
METADATA_ORG_B_TEAM: PASS
METADATA_ORG_A_GAME: PASS
METADATA_ORG_B_GAME: PASS
METADATA_TAMPERED_LOCATOR: FAIL_CLOSED

MEDIA_ORG_A_PUBLIC: PASS
MEDIA_ORG_B_PUBLIC: PASS
MEDIA_ORG_A_PRIVATE_UNAUTHENTICATED: DENIED
MEDIA_ORG_B_PRIVATE_UNAUTHENTICATED: DENIED
MEDIA_CROSS_TENANT_PRIVATE_TAMPER: FAIL_CLOSED

CONCURRENT_LOCATOR_CONTEXT_NO_BLEED: PASS
SHARE_IMAGE_API_ORG_A_ORG_B: PASS
STAGING_TEST_FIXTURE_RESIDUE: 0
POST_CLEANUP_LOCATOR_BASELINE_RESTORED: PASS
```

Creation-hook classification:

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
  - import-created Club/Athlete locator hooks in src/lib/imports.ts
  - participant-provisioned Athlete locator hook in src/lib/participant-internalization.ts
  - admin offline intake Athlete locator hook in src/lib/admin-offline-intake.ts

PRE_EXISTING_DEFERRED:
  - admin offline intake full tenancy caveat
```

Post-cleanup persistent staging baseline:

```text
RESOURCE_LOCATOR_COVERAGE: 257/257
MISSING_RESOURCE_LOCATORS: 0
TOKEN_LOCATOR_PERSISTENT_BASELINE: 0/0
MISSING_TOKEN_LOCATORS: 0
NULL_LOCATOR_ORGANIZATION_IDS: 0
DUPLICATE_LOCATOR_KEYS: 0
STAGE55A_FULL_SENTINEL_RESIDUE: 0
```

Static/catalog checks:

```text
CONVERTED_ROUTE_RESCAN: PASS
ACCIDENTAL_BARE_TENANT_SEED_READS: 0
PUBLIC_LOCATOR_LIST_API: NONE
PUBLIC_LOCATOR_ENUMERATION: NONE_IN_PUBLIC_OR_API
LOCATOR_CONTAINS_PII: NO
LOCATOR_CONTAINS_SCORE_DATA: NO
LOCATOR_CONTAINS_ORDER_DATA: NO
LOCATOR_CONTAINS_TICKET_HOLDER_DATA: NO
LOCATOR_CONTAINS_MEDIA_METADATA: NO
LOCATOR_CONTAINS_BUSINESS_DATA: NO
BOOTSTRAP_LAYER_SPORT_NEUTRAL: YES
RUNTIME_ROLE_BYPASSRLS: NO
ORDINARY_TENANT_RLS_FALLBACK: RETAINED_BY_DESIGN
TENANT_ORGANIZATION_ID_DB_DEFAULT: RETAINED_BY_DESIGN
```

Legacy Neon regression remains the only unresolved staging close-gate item:

```text
LEGACY_NEON_REGRESSION_PASS:
  - public club
  - public player
  - public event
  - public fixture
  - scoreboard
  - display clock
  - share game page
  - share image API
  - share team page
  - /live
  - /api/v1/live

LEGACY_NEON_REGRESSION_SKIPPED:
  - ticket route: no persistent staging ticket rows
  - order route: no persistent staging order rows

LEGACY_NEON_REGRESSION_BLOCKED:
  - public media asset route
```

The media blocker is not a locator authorization failure. The proof-created
Org A/Org B public/private media routes passed. The legacy Neon staging media
check is blocked because staging contains 17 public READY media rows whose local
files are absent under the staging media root; the first sampled route returned
HTTP 500 with `ENOENT`.

Production deployment was not attempted.

```text
STAGE_5_5A: BLOCKED_PENDING_LEGACY_NEON_MEDIA_REGRESSION_DECISION
FINAL_STAGE_5_5A_STATUS: BLOCKED
PRODUCTION_DEPLOYMENT: NOT_ATTEMPTED
READY_FOR_STAGE_5_5B: NO
BLOCKING_UNKNOWN: 0
```

## Continuation Verification — 2026-09-09

The historical Neon media blocker was investigated without copying production
media or changing the staging records. All 17 public READY Neon media rows use
`LOCAL_PERSISTENT_STORAGE`, but no corresponding local files exist under the
staging media root. The old route also read the local object key, so the
observed `ENOENT` is a pre-existing broken media reference / staging media
fidelity failure, not a Stage 5.5A locator or authorization regression.

A disposable Neon media asset was then created through the real
`uploadMediaAsset` path. The test proved locator bootstrap, scoped authoritative
reread, public visibility, successful media-route bytes, and complete cleanup.
No production media was copied and no persistent staging media rows were
altered.

```text
LEGACY_NEON_MEDIA_FIXTURE_PROOF: PASS
MEDIA_PROOF_FIXTURE_RESIDUE_ZERO: PASS
STAGE55A_FULL_GATE_PROOF: PASS
POST_CLEANUP_RESOURCE_LOCATORS: 257/257
POST_CLEANUP_TOKEN_LOCATORS: 0/0
LOCAL_BUILD: PASS (exit code 0)
```

The local build still emits one known Turbopack NFT-tracing warning through the
media storage import path; it has no build or typecheck failure. Production
preflight remains a separate gate and has not yet been run.

## Production Closure — 2026-09-09

Production preflight passed and Stage 5.5A was deployed in an isolated
release. The verified backup was
`/var/backups/ultraleagueos-production/stage55a_preflight_20260909T034738Z.dump`
with SHA-256
`19bfb7334a91518f98b069905f8cb36e412bd550fec0e57f5dbbf2c7f37e9187`.

The locator migration applied cleanly, the backfill dry-run found zero
collisions, and the apply created 257 resource locators and zero token
locators. The release was activated at
`/opt/ultraleagueos/releases/release-20260909041000-stage5-5a`. Only
`ultraos-web.service` was restarted; Caddy and unrelated applications were not
changed. HTTPS smoke checks, representative public/API routes, media delivery,
service health, RLS state, and unchanged business row counts all passed.

```text
STAGE_5_5A: COMPLETE
STAGE_5_5B: NOT_STARTED
PRODUCTION_DEPLOYMENT: PASS
ORDINARY_RLS_FALLBACK: RETAINED
TENANT_ORGANIZATION_ID_DEFAULTS: RETAINED
```
