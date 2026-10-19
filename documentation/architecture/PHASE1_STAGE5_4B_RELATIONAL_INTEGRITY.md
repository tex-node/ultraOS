# Phase 1, Stage 5.4B — Cross-Tenant Relational Integrity + Bulk Import Tenancy Hardening

Closes the two findings Stage 5.2B-2's rehearsal surfaced: RLS enforces row-level visibility, not
relation-level tenant matching, and `imports.ts`/`imports/actions.ts` is a real, live, unscoped
write path into the Club/SeasonClub domain. This stage treats the first as a genuine
architectural gap (an audit before any migration, per the plan) and the second as a direct
conversion following the established pattern.

## Part A: architecture audit before any migration

### FK inventory, generated from Postgres's own catalog, not read by hand

Every foreign key in the schema (318 total) was pulled from `information_schema` and
cross-referenced against the list of tables carrying `organizationId` (105 tables), then
classified:

```
TENANT_TO_TENANT:  167
TENANT_TO_GLOBAL:  151  (mostly the routine organizationId -> Organization.id FK every
                          tenant table has, plus real global references like Club.sportId -> Sport.id)
GLOBAL_TO_TENANT:  0
GLOBAL_TO_GLOBAL:  0
```

`UNCLASSIFIED_FOREIGN_KEYS: 0` — every FK in the database was placed in exactly one bucket by
this method. `Sport`, for example, has no `organizationId` at all (deliberately global since
Stage 1), so `Club.sportId -> Sport.id` is correctly `TENANT_TO_GLOBAL`, not a cross-tenant-
integrity concern — consistent with the plan's own example.

### Production-safe integrity audit — zero mutation, zero mismatches

For every one of the 167 `TENANT_TO_TENANT` relations, ran (against production, read-only):

```sql
SELECT count(*) FROM "Child" c JOIN "Parent" p ON c."childCol" = p.id
WHERE c."organizationId" IS DISTINCT FROM p."organizationId";
```

**All 167 relations returned zero mismatches.** This is expected — only one organization has
ever existed — but it was verified empirically, not assumed, and it means this stage's schema
change cannot fail against existing data. Nothing was repaired because nothing needed repairing.

### Composite tenant-aware foreign keys — implemented for the proven case, not all 167

Converting all 167 relations to composite `(organizationId, id)` foreign keys in one migration
would be exactly the "blindly convert all FKs" the plan warned against — each relation needs its
own check of cascade behavior, nullability, self-relations, and existing indexes before
conversion is safe. This stage implements the pattern for the one relation set already proven
exploitable (`SeasonClub`'s `season`/`club`/`division`) as a working reference implementation,
and leaves the remaining 164 as a classified backlog for incremental adoption — each future stage
that converts a write path should harden the relations it touches, rather than this stage
attempting a platform-wide rewrite in isolation.

`Club`, `Season`, and `Division` each gained `@@unique([organizationId, id])`. `SeasonClub`'s
three relations became composite:

```prisma
season   Season   @relation(fields: [organizationId, seasonId], references: [organizationId, id], onDelete: Cascade)
club     Club     @relation(fields: [organizationId, clubId], references: [organizationId, id], onDelete: Restrict)
division Division @relation(fields: [organizationId, divisionId], references: [organizationId, id], onDelete: Restrict)
```

`organizationId` is shared between these relations and `SeasonClub`'s own `organization`
relation — Prisma supports a scalar field participating in more than one `@relation`'s `fields`
list; this validated and generated cleanly. `ON DELETE`/`ON UPDATE` behavior is unchanged from
the original single-column FKs (season stays `CASCADE`, club and division stay `RESTRICT`).

Migration (`prisma/migrations/20260903120000_phase1_stage5_4b_seasonclub_tenant_fk`) was
generated via `prisma migrate diff` against staging (this project's established methodology),
then hand-cleaned of the usual diff-tool noise (the ~104 redundant `SET DEFAULT` statements and
cosmetic `RenameIndex` drift, both documented since Stage 0/3b).

### Rehearsed: the exact previously-succeeding attack, now rejected — including under RLS bypass

Against `ultraos_staging`:

- **As the restricted role**: a disposable Org B `SeasonClub` referencing Neon Ultra's real
  `clubId` — rejected: `Foreign key constraint violated on the constraint:
  SeasonClub_organizationId_clubId_fkey`. Same for a Neon Ultra `seasonId`. A legitimate
  same-org `SeasonClub` still creates successfully (no regression).
- **As the privileged, `BYPASSRLS` superuser role, inside a transaction rolled back
  afterward**: the identical cross-org relation attempt (raw `INSERT` naming Neon Ultra's real
  Apex club id) was **still rejected** —
  `insert or update on table "SeasonClub" violates foreign key constraint
  "SeasonClub_organizationId_clubId_fkey"`. This is the proof the plan asked for: a true database
  constraint, not something that only holds because of RLS or a particular role. RLS remains the
  access-control layer; this is now a genuinely independent relational-integrity layer beneath it.

## Part B: bulk import tenancy hardening

`src/lib/imports.ts` (870 lines) and `src/app/imports/actions.ts` were fully converted, following
the `media-storage.ts` pattern the plan named: every function that touches the database now takes
`tx` (and, where it starts a new scope, `organizationId`) explicitly rather than importing the
bare Prisma client or inferring an organization.

- **Actions** (`imports/actions.ts`): `uploadImportCsv`, `updateImportRowResolution`,
  `confirmImport`, `cancelImport` all resolve `organizationId` via
  `requirePermissionWithOrganization` and pass it down — never derived from the CSV or any other
  client-supplied value.
- **Analysis** (`analyzePlayerRow`/`analyzeCoachRow`/`analyzeClubRow`/`analyzeImportRows`,
  `seasonAndDivision`): all now take `tx` and run *inside* `createImportJobFromCsv`'s
  `withOrganizationContext` call, not before it. Every duplicate-detection and relation lookup a
  row's analysis performs (`Club` name match, `Season`/`Division` lookup, `SeasonClub` coach-
  conflict check) is therefore scoped from the first query, not just the final write — this is
  what actually answers the plan's "must never match Org A's Apex" requirement, not a
  after-the-fact filter.
- **Processing** (`processPlayerRow`/`processCoachRow`/`processClubRow`): every
  `Athlete`/`Player`/`Staff`/`Club`/`SeasonClub`/`Standing`/`Application` create now stamps
  `organizationId` explicitly. `ensureFanRole`/`ensureRole` (role-grant helpers) take
  `organizationId` too.
- **`confirmImportJob`**: the job lookup, every per-row transaction (still one transaction per
  row, preserving the existing behavior where one row's failure doesn't roll back others), and
  the final completion update all run inside the same organization's `withOrganizationContext` —
  a client-supplied `importJobId` belonging to a different organization is invisible (RLS),
  surfacing as the same "Import job not found" a genuinely missing id gets.
- **Reads**: `importReportRows` (CSV export) and the three pages/route that display import
  history (`imports/page.tsx`, `imports/[importJobId]/page.tsx`,
  `imports/[importJobId]/report/route.ts`) were also converted — this is the same "shared helper
  required by the path" boundary Stage 5.2B-2 established for `clubs/actions.ts`'s own adjacent
  pages, applied consistently here.

**Named, not converted**: `src/lib/operations.ts`'s `operationsSnapshot()` (a general operations
dashboard spanning many domains — fixtures, applications, incidents, orders, and, incidentally,
an `importJob.count`) uses the bare, unscoped Prisma client throughout. It is a materially larger
and different concern than the import *domain* itself (it's a dashboard aggregating counts across
the whole platform, not a Club/SeasonClub or import write path), so converting it was treated as
out of this stage's scope — named here so it isn't mistaken for covered, following the same
discipline as every previously-named deferred exception.

### Rehearsed: the exact scenario the plan specified

Using the real, directly-callable `createImportJobFromCsv`/`confirmImportJob` functions (not a
reimplementation, and not requiring a fabricated session, since these are plain library functions
once `organizationId` is supplied):

- Org A (Neon Ultra) has a real Club named "Apex". Org B imported a CSV containing a `CLUB` row
  also named "Apex" (identical name and short name).
- Analysis result: `matchedEntityType: null`, `resolutionAction: CREATE` — the import correctly
  found **no existing match**, proving Org A's Apex never entered the comparison at all.
- Confirmed: Org B's import created its **own new** Club row (a different id from Neon Ultra's
  real Apex), `organizationId` = Org B, and the `ImportRow`'s `importedEntityId` correctly points
  at that new row.
- Both the newly-created Club and the `ImportJob` itself were confirmed invisible from a Neon
  Ultra context (RLS).
- All rehearsal data (`Organization`, `User`, `Club`, `ImportJob`, `ImportRow`,
  `UserRoleAssignment`, `AuditLog` rows) cleaned up afterward; a privileged-role query confirmed
  zero residue.

## Final gate

```
STAGE_5_4B

TENANT_FK_INVENTORY: COMPLETE (318 total FKs; 167 TENANT_TO_TENANT, 151 TENANT_TO_GLOBAL, 0
  GLOBAL_TO_TENANT, 0 GLOBAL_TO_GLOBAL)
TENANT_TO_TENANT_RELATIONS: CLASSIFIED
TENANT_TO_GLOBAL_RELATIONS: CLASSIFIED
UNCLASSIFIED_FOREIGN_KEYS: 0

PRODUCTION_RELATION_INTEGRITY_AUDIT: PASS
EXISTING_CROSS_ORG_RELATION_MISMATCHES: 0 (all 167 relations, production, read-only)

DB_TENANT_RELATIONAL_BACKSTOP: IMPLEMENTED (SeasonClub's 3 relations - season, club, division;
  the reference implementation, not all 167 - see "implemented for the proven case" above)
ORG_B_CHILD_ORG_A_PARENT_DB_WRITE: DENIED
RLS_BYPASS_CANNOT_VIOLATE_TENANT_RELATION: PASS (verified inside a rolled-back transaction as the
  privileged BYPASSRLS role)

APPLICATION_SCOPE_GUARDS_RETAINED: PASS (clubs/actions.ts's validateSeasonClubScope unchanged -
  still produces a clean domain error before the constraint would ever fire)

IMPORT_ACTIONS_ORG_SOURCE: SERVER_DERIVED
IMPORT_LIBRARY_AUTH_DEPENDENCY: NONE
IMPORT_LIBRARY_TX_EXPLICIT: PASS
IMPORT_LIBRARY_ORG_EXPLICIT: PASS
IMPORT_CREATES_ORG_EXPLICIT: PASS
IMPORT_MATCHING_TENANT_SCOPED: PASS
CSV_ORGANIZATION_ID_TRUSTED: NO

ORG_A_APEX_DOES_NOT_MATCH_ORG_B_IMPORT: PASS
ORG_B_IMPORT_CREATES_OR_MATCHES_ONLY_ORG_B: PASS
ORG_B_SEASONCLUB_RELATIONS: ORG_B_ONLY

WHOLE_REPOSITORY_SCAN: PASS (imports.ts + 3 pages/route + imports/actions.ts converted;
  operations.ts's operationsSnapshot() named as a separate, out-of-scope dashboard concern)
UNCLASSIFIED_LIVE_RELATION_WRITERS: 0

REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS
TESTS: PASS
BUILD: PASS

PRODUCTION_INVARIANTS: UNCHANGED
```

The three-layer model is now real, not aspirational, for at least one concretely-proven relation
set:

```
AUTHORIZATION      server-derived organization (requirePermissionWithOrganization)
ACCESS ISOLATION   PostgreSQL RLS (tenant_isolation policy, every tenant table)
RELATIONAL INTEGRITY  tenant-aware composite foreign keys (SeasonClub's 3 relations; 164 more
                       inventoried, not yet converted)
```

**Recommendation for future stages**: when 5.2B-3 (Draft/Tryouts/Coach Pools) or any later stage
converts a write path with foreign keys into other tenant tables, harden those specific relations
to the composite pattern as part of that conversion, using this stage's migration and rehearsal
as the template — rather than treating relational integrity as solved platform-wide by this
stage alone. The remaining 164 `TENANT_TO_TENANT` relations (full list generated, available on
request) are real candidates, not yet acted on.
