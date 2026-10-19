# Phase 1, Stage 5.2D — Public / API Read Tenancy

Status: CLOSED, DEPLOYED

Stage 5.2D hardens the unauthenticated public website and public JSON/PNG/API surfaces so reads use an explicit organization context instead of relying on the temporary Neon Ultra row-level-security fallback. This is a read-hardening stage only; it does not change Prisma schema, public ID architecture, or the Stage 5.5 RLS bridge.

## Scope

Public browser surfaces:

- `/public`
- `/public/clubs`
- `/public/clubs/[id]`
- `/public/players`
- `/public/players/[id]`
- `/public/fixtures`
- `/public/fixtures/[id]`
- `/public/standings`
- `/public/stats`
- `/public/stats/players`
- `/public/stats/records`
- `/public/stats/compare/players`
- `/public/stats/compare/teams`
- `/public/events`
- `/public/events/[id]`
- `/public/celebrations`
- `/public/share/game/[id]`
- `/public/share/player/[id]`
- `/public/share/team/[id]`
- `/public/share/record/[key]`
- `/public/orders/[code]`
- `/public/tickets/[code]`
- `/live`
- `/display/game/[gameId]/clock`
- `/scoreboard/[gameId]`
- `/broadcast/game/[gameId]/scorebug`
- `/broadcast/game/[gameId]/final`
- `/broadcast/game/[gameId]/leader`
- `/broadcast/game/[gameId]/game-story`
- `/broadcast/game/[gameId]/team-comparison`
- `/broadcast/game/[gameId]/player-spotlight`
- `/broadcast/game/[gameId]/milestone`
- `/broadcast/game/[gameId]/record-watch`
- `/broadcast/game/[gameId]/four-point-moment`
- `/broadcast/game/[gameId]/ultra-time`

Public API surfaces:

- `/api/v1/clubs/[publicId]`
- `/api/v1/players/[publicId]`
- `/api/v1/seasons/[publicId]/standings`
- `/api/v1/seasons/[publicId]/leaders`
- `/api/v1/games/[publicId]`
- `/api/v1/games/[publicId]/box-score`
- `/api/v1/games/[publicId]/events`
- `/api/v1/games/[publicId]/snapshot`
- `/api/v1/live`
- `/api/public/coaches/[ultraStaffId]`
- `/api/public/players/[ultraAthleteId]`
- `/api/share/game/[id]`
- `/api/share/player/[id]`
- `/api/share/team/[id]`
- `/api/share/record/[key]`
- `/api/content/[kind]/[id]`
- `/api/draft-events/[draftEventId]/state`
- `/api/games/[id]`
- `/api/games/[id]/box-score`
- `/api/games/[id]/data-capabilities`
- `/api/games/[id]/snapshot`
- `/api/games/[id]/snapshot-v2`
- `/api/broadcast/games/[gameId]`
- `/api/broadcast/program`
- `/api/sponsor-impressions/[id]`
- `/api/qr/[code]`
- `/media/assets/[assetId]/file`

Authenticated export/download surfaces reviewed because they can expose public-style files:

- `/applications/export`
- `/tryouts/export`
- `/content/assets/[slug]/export/[format]`
- `/data-readiness/export`

## Tenant resolution patterns

### Pattern D — Intentional Neon Ultra public site

Public list and dashboard-like pages that carry no organization slug now resolve the public site organization through `resolveDefaultPublicOrganization()`, which resolves the server-controlled slug `neon-ultra`, then wraps reads in `withOrganizationContext(organization.id, ...)`.

This keeps the current product behavior explicit: the existing public website is the Neon Ultra public site. A second organization's own public site should use a future explicit organization-slug route pattern, not the unset RLS fallback.

### Pattern B — Resource-derived detail pages

Detail pages that receive a globally unique resource ID first read the resource's `organizationId`, then perform the full page/API read inside `withOrganizationContext(organizationId, ...)`.

Important limitation: this currently works for Neon Ultra resources because the temporary unset-RLS fallback points to Neon Ultra. It fails closed for non-Neon organizations under the current Stage 5.5 bridge because the bootstrap lookup itself runs before tenant context is set and therefore cannot see non-Neon rows. This is a capability gap, not a cross-tenant leak.

### Pattern C — Opaque public tokens

Token routes such as tickets and order collection pages still use the opaque token as the public capability:

- `Ticket.code`
- `Order.collectionCode`

The token lookup derives `organizationId`, and the detailed read runs inside that organization context.

## Code changes completed locally

Converted public list/read pages to use explicit public organization context:

- `web/src/app/public/page.tsx`
- `web/src/app/public/clubs/page.tsx`
- `web/src/app/public/players/page.tsx`
- `web/src/app/public/fixtures/page.tsx`
- `web/src/app/public/standings/page.tsx`
- `web/src/app/public/stats/page.tsx`
- `web/src/app/public/stats/players/page.tsx`
- `web/src/app/public/stats/records/page.tsx`
- `web/src/app/public/stats/compare/players/page.tsx`
- `web/src/app/public/stats/compare/teams/page.tsx`
- `web/src/app/public/events/page.tsx`
- `web/src/app/public/celebrations/page.tsx`
- `web/src/app/public/share/record/[key]/page.tsx`

Converted public detail/share/token routes to scoped reads after resource/token bootstrap:

- `web/src/app/public/clubs/[id]/page.tsx`
- `web/src/app/public/players/[id]/page.tsx`
- `web/src/app/public/fixtures/[id]/page.tsx`
- `web/src/app/public/events/[id]/page.tsx`
- `web/src/app/public/share/game/[id]/page.tsx`
- `web/src/app/public/share/player/[id]/page.tsx`
- `web/src/app/public/share/team/[id]/page.tsx`
- `web/src/app/public/orders/[code]/page.tsx`
- `web/src/app/public/tickets/[code]/page.tsx`
- `web/src/app/public/celebrations/actions.ts`
- `web/src/app/live/page.tsx`
- `web/src/app/display/game/[gameId]/clock/page.tsx`
- `web/src/app/scoreboard/[gameId]/page.tsx`
- `web/src/app/broadcast/game/[gameId]/scorebug/page.tsx`

Converted public API helpers and routes:

- `web/src/lib/api-v1/identifiers.ts`
- `web/src/lib/api-v1/game-loader.ts`
- `web/src/lib/participant-profiles.ts`
- `web/src/lib/content-engine.ts`
- `web/src/lib/draft-events.ts`
- `web/src/lib/broadcast-presentation-state.ts` read helper
- `web/src/lib/broadcast-graphic-loader.ts`
- API routes listed in the Scope section above

Additional adjacent safe hardening completed while inventorying public exports/downloads:

- `web/src/app/content/page.tsx`
- `web/src/app/content/templates/page.tsx`
- `web/src/app/content/assets/[slug]/page.tsx`
- `web/src/app/content/assets/[slug]/export/[format]/route.ts`
- `web/src/app/media/assets/[assetId]/file/route.ts`

## Resource route classification

```text
/public: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/clubs: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/clubs/[id]: RESOURCE_DERIVED_ORG_ROUTE (Pattern B limitation applies)
/public/players: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/players/[id]: INTENTIONAL_NEON_ULTRA_DEFAULT (initial athlete read now scoped)
/public/fixtures: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/fixtures/[id]: RESOURCE_DERIVED_ORG_ROUTE (Pattern B limitation applies)
/public/standings: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/stats: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/stats/players: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/stats/records: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/stats/compare/players: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/stats/compare/teams: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/events: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/events/[id]: RESOURCE_DERIVED_ORG_ROUTE (Pattern B limitation applies)
/public/celebrations: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/share/game/[id]: RESOURCE_DERIVED_ORG_ROUTE (metadata and page use same loader)
/public/share/player/[id]: RESOURCE_DERIVED_ORG_ROUTE (metadata and page use same loader)
/public/share/team/[id]: RESOURCE_DERIVED_ORG_ROUTE (metadata and page use same loader)
/public/share/record/[key]: INTENTIONAL_NEON_ULTRA_DEFAULT
/public/orders/[code]: TOKEN_DERIVED_ORG_ROUTE
/public/tickets/[code]: TOKEN_DERIVED_ORG_ROUTE
/live: INTENTIONAL_NEON_ULTRA_DEFAULT
/display/game/[gameId]/clock: INTENTIONAL_NEON_ULTRA_DEFAULT
/scoreboard/[gameId]: INTENTIONAL_NEON_ULTRA_DEFAULT
/broadcast/game/[gameId]/*: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/v1/*: INTENTIONAL_NEON_ULTRA_DEFAULT unless authenticated broadcast route
/api/v1/broadcast/games/[id]: AUTHENTICATED_ORG_ROUTE
/api/share/game/[id]: RESOURCE_DERIVED_ORG_ROUTE
/api/share/player/[id]: RESOURCE_DERIVED_ORG_ROUTE
/api/share/team/[id]: RESOURCE_DERIVED_ORG_ROUTE
/api/share/record/[key]: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/public/coaches/[ultraStaffId]: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/public/players/[ultraAthleteId]: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/content/[kind]/[id]: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/draft-events/[draftEventId]/state: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/games/[id]*: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/broadcast/*: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/sponsor-impressions/[id]: INTENTIONAL_NEON_ULTRA_DEFAULT
/api/qr/[code]: PLATFORM_GLOBAL_INTENTIONAL (no database read; signed/opaque code becomes QR target)
/media/assets/[assetId]/file: RESOURCE_DERIVED_ORG_ROUTE; non-public assets now also require matching session organization
/applications/export: AUTHENTICATED_ORG_ROUTE
/tryouts/export: AUTHENTICATED_ORG_ROUTE
/content: AUTHENTICATED_ORG_ROUTE
/content/templates: AUTHENTICATED_ORG_ROUTE
/content/assets/[slug]: AUTHENTICATED_ORG_ROUTE
/content/assets/[slug]/export/[format]: AUTHENTICATED_ORG_ROUTE
/data-readiness/export: PLATFORM_GLOBAL_INTENTIONAL, PLATFORM_ADMIN_GATE_VERIFIED
```

## Findings

### Club shortName public lookup remains ambiguous

`Club.shortName` is unique only inside an organization:

```text
Club @@unique([organizationId, shortName])
```

That means `/api/v1/clubs/[publicId]` cannot safely treat a short name such as `APEX` as globally unique once more than one organization exists. The current route is scoped to the default public organization, which is correct for the Neon Ultra public API, but this does not create a platform-wide public club namespace.

Future fix: add an explicit organization slug to multi-organization public API routes, or use globally unique club public IDs only.

### Pattern B bootstrap is blocked by the temporary RLS fallback for Org B

Bare bootstrap reads such as `prisma.club.findUnique({ where: { id } })` are still subject to RLS. With no tenant context set, the temporary bridge falls back to Neon Ultra. As a result, a valid Org B resource ID returns `null` before the code can read `organizationId`.

Security result: fail-closed / not found.

Capability result: non-Neon public detail pages will not work until Stage 5.5 removes or replaces the fallback bridge with a real tenant bootstrap mechanism.

### Data-readiness export platform authorization defect and remediation

`/data-readiness/export` checks only:

```text
hasPermission(session.user.roles, "data:readiness")
```

Exact current permission chain:

```text
web/src/app/data-readiness/export/route.ts
  -> auth()
  -> hasPermission(session.user.roles, "data:readiness")
  -> normalizeRoles(...)
  -> rolePermissions[role].has("data:readiness")
  -> SUPER_ADMIN includes data:readiness
  -> LEAGUE_OPERATOR includes data:readiness
```

`hasPermission` evaluates role names only. It does not distinguish which organization granted the role. Both `SUPER_ADMIN` and `LEAGUE_OPERATOR` include `data:readiness`, and an organization-scoped `UserRoleAssignment(role=LEAGUE_OPERATOR, organizationId=<Org B>)` satisfies the helper because the session carries `roles: ["LEAGUE_OPERATOR"]`, not grant scope.

The export then calls `auditRealData()`, which uses the bare Prisma client. Under the current RLS fallback, that means a non-Neon organization's operator role can be authorized by role name while the exported diagnostic resolves to Neon Ultra's fallback-scoped data. This is a cross-organization diagnostic disclosure risk.

Remediation:

```text
web/src/lib/platform-permissions.ts
  -> userHasPlatformPermission(userId, permission, db)
  -> UserRoleAssignment where userId = current user
  -> organizationId IS NULL
  -> revokedAt IS NULL
  -> roleGrantsPermission(role, permission)

web/src/lib/authorization.ts
  -> requirePlatformPermission(permission)
  -> requireSession()
  -> persisted null-org grant check
```

Converted platform-global callers:

- `web/src/app/data-readiness/page.tsx`
- `web/src/app/data-readiness/export/route.ts`

`data-hygiene.ts` and `auditRealData()` remain platform-global by design. The dataset was not tenant-scoped as a workaround.

Classification:

```text
CONFIRMED_BLOCKER: PLATFORM_GLOBAL_EXPORT_ACCESS_CONTROL
DATA_READINESS_EXPORT_PLATFORM_ADMIN_GATE: VERIFIED
```

Adjacent authenticated finding: `/participants/search` is not a public search surface, but it also uses `hasPermission(session.user.roles, "data:readiness")` to decide whether private email/phone search predicates are enabled. Classification: `ORGANIZATION_SCOPED_ADMIN_PRIVATE_SEARCH_ALLOWED`. Reason: private participant fields are intended to be searchable by an organization operator managing participant records in their own organization; the route itself remains an authenticated tenant/admin surface, not a platform-global diagnostic export. This remains a separate authenticated tenant-scoping follow-up if the product later narrows private-field access further.

Authorization tests added:

- org-scoped `LEAGUE_OPERATOR` only: denied
- null-org `LEAGUE_OPERATOR`: allowed
- no qualifying grant: denied
- org-scoped role plus null-org qualifying grant: allowed due to null-org grant
- null-org `FAN`: denied
- revoked null-org qualifying grant: denied

## Not present

Repository scans found no dedicated public implementation for:

- Sitemap route
- RSS feed
- Atom feed
- JSON feed
- Public search/autocomplete endpoint
- `generateStaticParams`
- `unstable_cache` around public tenant reads

Classification:

```text
SITEMAP: NOT_PRESENT
FEEDS: NOT_PRESENT
PUBLIC_SEARCH: NOT_PRESENT
STATIC_GENERATION: NOT_PRESENT
PUBLIC_CACHE_TENANCY: NONE_PRESENT
LEGACY_ROUTES_DEPEND_ON_UNSET_RLS_FALLBACK: NO
```

## Local verification

Current local result:

```text
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS_WITH_7_PREEXISTING_WARNINGS
TESTS: 461/461 PASS
BUILD: PASS_WITH_WARNING
```

Lint warnings are limited to pre-existing unused variables and one `<img>` optimization warning. The production build warning is the existing Turbopack/NFT trace warning through `next.config.ts` -> `media-storage.ts` -> `media/assets/[assetId]/file/route.ts`.

Staging result:

```text
STAGING_BACKUP: VERIFIED (/var/backups/ultraleagueos-staging/stage5_2d_platform_auth_20260906T043433Z.dump)
STAGING_RESTRICTED_ROLE: PASS (current_user=ultraos_staging, rolsuper=false, rolbypassrls=false)
ORG_B_RLS_VISIBILITY: PASS (Org B club visible inside Org B context)
ORG_A_CANNOT_READ_ORG_B_BY_ID: PASS (Neon context count=0)
BARE_CONTEXT_ORG_B_BOOTSTRAP: FAIL_CLOSED (bare count=0)
CLUB_SHORTNAME_COLLISION_SHAPE: CONFIRMED (Neon context can have its own APEX while Org B APEX is hidden)
DATA_READINESS_ROLE_NAME_PROOF: PASS (hasPermission([LEAGUE_OPERATOR], data:readiness)=true)
ORG_SCOPED_LEAGUE_OPERATOR_GLOBAL_EXPORT: DENIED
PLATFORM_QUALIFYING_GRANT_GLOBAL_EXPORT: ALLOWED
ORG_B_PUBLIC_REHEARSAL: PASS
STAGING_CLEANUP: PASS
STAGING_RESIDUE: 0
```

The staging proof used disposable non-Neon data to prove both the original role-name exposure and the corrected persisted null-organization grant boundary. It also created an Org B public-surface sentinel and verified Neon Ultra public list/detail/API/share routes did not reveal it. All disposable staging users, grants, organization, season, clubs, athlete, player, event, fixture, and standing rows were removed; the privileged residue check returned zero.

Production result:

```text
PRODUCTION_BACKUP: VERIFIED (/var/backups/ultraleagueos-production/stage5_2d_platform_auth_20260907T021814Z.dump)
PRODUCTION_MIGRATION: NOT_REQUIRED
PRODUCTION_BUILD: PASS_WITH_WARNING
PRODUCTION_SERVICE: ultraos-web.service ACTIVE
PRODUCTION_SMOKE_TESTS: PASS
PRODUCTION_JOURNAL: PASS_WITH_WARNINGS
PRODUCTION_INVARIANTS: UNCHANGED
PRODUCTION_PUBLIC_OUTPUTS: UNCHANGED_REPRESENTATIVE
```

Production pre/post-deploy invariant counts matched exactly: `Application=342`, `Athlete=219`, `Player=219`, `Staff=19`, `Club=8`, `SeasonClub=8`, `Fixture=12`, `Game=12`, `User=390`, `UserRoleAssignment=594`, `Organization=1`. The athlete ID checksum remained `3979b39ac8d1e2082bf118f1e901fdc2`; the staff ID checksum remained `d089ad58cb353172f34b36abc669542d`. Production currently has `platformReadinessGrants=0`, so no production user can access the platform-global readiness diagnostic until an explicit null-organization qualifying grant is provisioned by policy decision.

## Gate status

```text
STAGE_5_2D: CLOSED
PUBLIC_SURFACE_INVENTORY: PASS
UNCLASSIFIED_LIVE_CALL_SITES: 0
PUBLIC_TENANT_PROVENANCE: EXPLICIT
CLIENT_ORG_ID_TRUSTED: NO
ARBITRARY_RESOURCE_ID_TRUSTED_AS_TENANT: NO
LEGACY_ROUTES_DEPEND_ON_UNSET_RLS_FALLBACK: NO
PUBLIC_LIST_READS: PASS
PUBLIC_DETAIL_READS: PASS_WITH_PATTERN_B_LIMITATION
PUBLIC_TOKEN_READS: PASS
PUBLIC_API_READS: PASS_WITH_DEFAULT_PUBLIC_ORG_SCOPE
PUBLIC_METADATA_READS: PASS
PUBLIC_PROJECTOR_READS: PASS
PUBLIC_SHARE_PNG_READS: PASS
PUBLIC_CONTENT_API_READS: PASS
PUBLIC_DRAFT_STATE_READS: PASS
BROADCAST_PUBLIC_READS: PASS
CLUB_SHORTNAME_ROUTE_COLLISION: DOCUMENTED_LIMITATION
PATTERN_B_NON_NEON_BOOTSTRAP: DEFER_STAGE_5_5_CAPABILITY_LIMITATION
CONFIRMED_BLOCKER: PLATFORM_GLOBAL_EXPORT_ACCESS_CONTROL
DATA_READINESS_EXPORT: PLATFORM_GLOBAL_INTENTIONAL
DATA_READINESS_EXPORT_PLATFORM_ADMIN_GATE: VERIFIED
ORGANIZATION_ADMIN_CAN_ACCESS_GLOBAL_READINESS_EXPORT: NO
PLATFORM_PERMISSION_SCOPE_VERIFICATION: PERSISTED_USERROLEASSIGNMENT
ORG_SCOPED_LEAGUE_OPERATOR_GLOBAL_EXPORT: DENIED
PLATFORM_QUALIFYING_GRANT_GLOBAL_EXPORT: ALLOWED
PARTICIPANTS_SEARCH_PERMISSION: ORGANIZATION_SCOPED_ADMIN_PRIVATE_SEARCH_ALLOWED
CLUB_SHORTNAME_SCOPE: TENANT_LOCAL
KNOWN_PROMOCODE_GLOBAL_UNIQUENESS: PRESERVED_FOR_DEDICATED_STAGE
KNOWN_ANONYMOUS_ADMIN_500_BACKLOG: PRESERVED
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS_WITH_7_PREEXISTING_WARNINGS
TESTS: 461/461 PASS
BUILD: PASS_WITH_WARNING
STAGING_BACKUP: VERIFIED
STAGING_RLS_PROOF: PASS
PLATFORM_AUTH_REHEARSAL: PASS
ORG_B_PUBLIC_REHEARSAL: PASS
STAGING_CLEANUP: PASS
STAGING_RESIDUE: 0
PRODUCTION_BACKUP: VERIFIED
PRODUCTION_MIGRATION: NOT_REQUIRED
PRODUCTION_BUILD: PASS_WITH_WARNING
PRODUCTION_SERVICE: ultraos-web.service ACTIVE
PRODUCTION_SMOKE_TESTS: PASS
PRODUCTION_JOURNAL: PASS_WITH_WARNINGS
PRODUCTION_INVARIANTS: UNCHANGED
PRODUCTION_PUBLIC_OUTPUTS: UNCHANGED_REPRESENTATIVE
FINAL_STAGE_STATUS: CLOSED
```

## Known future work

1. Stage 5.5 must replace the temporary Neon Ultra unset-RLS fallback with a real tenant bootstrap mechanism so non-Neon public detail pages can be supported without fail-closed Pattern B behavior.
2. Multi-organization public APIs need an explicit organization slug or globally unique public identifiers before `Club.shortName` can be used outside a tenant-local context.
3. Production has no null-organization `data:readiness` grant. Provision one only after an explicit platform-administration policy decision.
4. Existing build/runtime warnings remain backlog items: Turbopack/NFT tracing through the media asset file route, npm audit/engine warnings observed during server install, and the PostgreSQL client deprecation warning in the production journal.
