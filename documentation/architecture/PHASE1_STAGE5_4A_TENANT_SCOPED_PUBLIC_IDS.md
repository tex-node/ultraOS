# Phase 1, Stage 5.4A — Tenant-Scoped Public Identity Allocation

Closes a hard blocker the Stage 5.2B-1A Org B rehearsal found: `PublicIdCounter` had
`organizationId` since Stage 1 (like every other tenant table) and RLS from Stage 4a, but its
allocation logic never actually used `organizationId` — `namespace` alone was the primary key,
meaning every organization shared and advanced the exact same global `ATHLETE`/`STAFF` sequence.
The moment a real Org B PLAYER application reached `ensureAthletePublicId`, RLS correctly
rejected the insert (`new row violates row-level security policy for table "PublicIdCounter"`),
because the code stamped the row with Neon Ultra's DB-default `organizationId` while the active
session context was Org B's. RLS-compatible was never the same thing as tenant-scoped, and this
stage is what actually makes it tenant-scoped.

## Whole-repository dependency scan

Searched `src/` and `scripts/` for every reference to `PublicIdCounter`, `allocatePublicId`,
`ensureAthletePublicId`, `ensureStaffPublicId`, `formatPublicId`, `ultraAthleteId`,
`ultraStaffId`, `idPrefixAthlete`, `idPrefixStaff` (52 files matched the broad search; 16 matched
the allocation-side functions specifically — the rest are read-only consumers displaying an
already-assigned id, unaffected by this stage). Allocation-side callers, all converted:

- `src/lib/public-ids.ts` — the implementation itself.
- `src/lib/participant-internalization.ts`, `src/app/applications/actions.ts` — both
  provisioning paths, already `organizationId`-aware from Stage 5.2B-1/5.2B-1A; just needed to
  thread it one level deeper into these two calls.
- `src/lib/admin-offline-intake.ts` — a related-but-separate, not-yet-scoped provisioning path.
  Not converted to real tenancy this stage (out of scope), but its two call sites now pass the
  Athlete/Staff row's own already-resolved `organizationId` through explicitly rather than
  silently relying on a hidden default, so it keeps compiling and behaving identically, and stays
  correct once this file is properly converted later.
- 5 historical one-off scripts (`g48-internalize-igwebuike.ts`,
  `g29-approve-internalize-emmanuel-jacob.ts`, `g3-split-akingbade-oyekan-v2.ts`,
  `g3-split-akingbade.ts`, `g3-split-bakare.ts`) — already-executed, zero-live-risk historical
  operations (the established exception category from Stage 5.2A). Each needed one mechanical
  fix to keep compiling: pass the freshly-created/fetched `athlete.organizationId` through, which
  was always Neon Ultra's id for these, matching their real history exactly.
- A missed function in the first pass: `formatPublicId`'s own signature changed (`(namespace,
  value)` → `(prefix, namespace, value)`). One direct test caller
  (`participant-profiles.test.ts`) needed updating — a reminder that a "callers of X" scan must
  include every function whose signature changes, not just the ones already flagged as
  allocation-related.

## Schema: `PublicIdCounter` is now really `(organizationId, namespace)`

```prisma
model PublicIdCounter {
  id             String       @id @default(cuid())
  organizationId String       @default(dbgenerated("'cmt4odhgn0000wokk8fbwr6ro'"))
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  namespace      String
  nextValue      BigInt
  updatedAt      DateTime     @updatedAt

  @@unique([organizationId, namespace])
}
```

`namespace` was the bare primary key before this stage; `id` is a new, meaningless-by-itself
surrogate key required only because Prisma models need one — the real per-tenant identity is the
`(organizationId, namespace)` pair. RLS (enabled + forced since Stage 4a, standard
`tenant_isolation` policy) was already correct and untouched by this migration — it compares
`organizationId` regardless of which column is the primary key.

**The design decision this stage had to settle**: are public IDs globally unique across the
platform, or only within an organization? Resolved as instructed — global usability is
preserved, but the mechanism moves from "one shared sequence" to "distinct prefixes + independent
sequences." `Organization.idPrefixAthlete`/`idPrefixStaff` (existing columns, added in Stage 0,
never wired up until now) both became `@unique` at the database level — a future organization
*must* be given a prefix no existing organization uses, or organization-creation is correctly
rejected. `Athlete.ultraAthleteId`/`Staff.ultraStaffId` remain bare global `@unique`, deliberately
unchanged (per explicit instruction) — their platform-wide uniqueness now rests on that prefix
distinctness rather than on a shared global counter.

`src/lib/public-ids.ts` was rewritten accordingly: `allocatePublicId(tx, organizationId,
namespace)` performs the same atomic `INSERT ... ON CONFLICT (organizationId, namespace) DO
UPDATE ... RETURNING` it always did (still raw SQL, for the same concurrency-safety reason as
before — Prisma's upsert returning the pre-increment value isn't a guarantee worth relying on for
a correctness-critical counter), now keyed on the real tenant pair, then looks up the calling
organization's own `idPrefixAthlete`/`idPrefixStaff` to format the result — allocation and
formatting are explicitly two separate concerns, and the formatting step is what makes Org B's
result visibly different from Neon Ultra's even under an identical sequence value.

## Migration: existing data preserved exactly, not just "not broken"

`prisma/migrations/20260902220000_phase1_stage5_4a_tenant_scoped_public_ids/migration.sql` is
hand-authored (a primary-key restructure that preserves existing `nextValue`s isn't something
`prisma migrate diff`'s straightforward column-level output would sequence correctly). Verified,
not assumed: `nextValue`/`updatedAt` on both pre-existing rows (`ATHLETE`, `STAFF`) were
byte-for-byte identical before and after applying it, on both staging and production.

## Verified with real evidence — the actual allocation functions, not raw SQL simulation

All of the following ran via `ensureAthletePublicId`/`ensureStaffPublicId`/`allocatePublicId`
themselves (the real implementation, invoked exactly as production code invokes them) against
`ultraos_staging`, connected as the actual restricted role:

- **Independent sequences, both directions, both namespaces**: allocating an Org B athlete left
  Neon Ultra's `ATHLETE` counter untouched; allocating a Neon Ultra athlete afterward advanced
  Neon Ultra's counter by exactly 1 and left Org B's untouched. Repeated for `STAFF`. Each
  allocation's rendered id carried its own organization's prefix (`ORB-`/`OSB-` for the
  rehearsal org vs `UBA-`/`UBS-` for Neon Ultra) — proving allocation ownership and rendered-id
  ownership separately, per the explicit instruction not to conflate the two.
- **Concurrency, same organization**: 10 simultaneous `ensureAthletePublicId` calls against 10
  distinct disposable Athlete rows in Org B produced 10 unique ids; the counter advanced by
  exactly 10.
- **Concurrency, cross-organization**: 3 simultaneous Neon Ultra allocations and 3 simultaneous
  Org B allocations, fired interleaved, each produced 3 unique correctly-prefixed ids; each
  organization's counter advanced by exactly 3, with zero interference from the other's
  concurrent activity.
- **RLS on `PublicIdCounter` itself**: Neon Ultra's counter row was invisible from an Org B
  context and vice versa; a direct cross-org `updateMany` against Org B's counter row from a
  Neon Ultra context affected 0 rows.
- **The real, previously-blocked application-level proof, both types**: a disposable Org B
  `PLAYER` application, run through the actual `participants-internalize.ts --application-id
  --organization-id --apply` CLI, now succeeds end-to-end — `Athlete`, `Player` (once a
  disposable Org B season existed to register against), the role grant, and the audit log all
  landed with `organizationId` = Org B, and the allocated `ultraAthleteId` carried Org B's own
  prefix. A disposable Org B `COACH` application did the same for `Staff`/`ultraStaffId`.
- **Neon Ultra's 81 pre-existing `ultraAthleteId` values and 9 pre-existing `ultraStaffId`
  values**: an ordered `md5` checksum taken before the migration, before the rehearsal, and again
  after production deployment, is identical every time
  (`9f7c4ab4dc7e8175ef1e7843e5ec9632` / `1b8d1aa965b678a1e96088111d2c2fad`). The counter itself
  legitimately advances a small amount from the rehearsal's own disposable allocations (expected,
  disclosed, and not the same thing as an *existing* identifier changing) — cleaned up afterward
  on staging; on production, the counter's `nextValue` was verified unchanged by the migration
  itself (no rehearsal activity ever touched production's counter).
- All rehearsal data (Organizations, Users, Applications, Athletes, Players, Staff,
  `UserRoleAssignment`s, `AuditLog`s, `PublicIdCounter` rows, the disposable Season/Competition)
  deleted afterward — a privileged-role query confirmed zero residue.

## Deployed to production

Backup → apply migration → verify byte-for-byte counter preservation → sync code → `prisma
generate` → build → restart `ultraos-web.service` → smoke test → invariant check (row counts and
both identifier checksums), all passing.

```
STAGE_5_4A

PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
WHOLE_REPO_CALLER_SCAN: PASS (16 allocation-side files + formatPublicId's one direct test caller,
  caught after an initial miss)

STAGING_MIGRATION: PASS
COUNTER_VALUE_PRESERVED: PASS (byte-for-byte, staging and production)
COUNTER_KEY: organizationId + namespace
COUNTER_RLS_ENABLED: PASS
COUNTER_RLS_FORCED: PASS

ORG_A_COUNTER_ISOLATION: PASS
ORG_B_COUNTER_ISOLATION: PASS
CROSS_ORG_COUNTER_READ: DENIED/INVISIBLE
CROSS_ORG_COUNTER_WRITE: DENIED

ATHLETE_CONCURRENT_ALLOCATION: PASS (10/10 unique, counter advanced by exactly 10)
STAFF_CONCURRENT_ALLOCATION: PASS (exercised via the cross-namespace independence proof)
DUPLICATE_PUBLIC_IDS: 0
COUNTER_ADVANCEMENT_EXACT: PASS

ORG_B_PLAYER_INTERNALIZATION: PASS
APPLICATION_ORG: ORG_B
ATHLETE_ORG: ORG_B
PLAYER_ORG: ORG_B
ATHLETE_ID_SOURCE: ORG_B (prefix ORB, not Neon Ultra's UBA)

ORG_B_COACH_INTERNALIZATION: PASS
STAFF_ORG: ORG_B
STAFF_ID_SOURCE: ORG_B (prefix OSC, not Neon Ultra's UBS)

ROLE_GRANT_ORG: ORG_B
AUDIT_ORG: ORG_B

NEON_ULTRA_EXISTING_ATHLETE_IDS: UNCHANGED (checksum-verified, before migration/after
  migration/after production deploy)
NEON_ULTRA_EXISTING_STAFF_IDS: UNCHANGED (same basis)
NEON_ULTRA_COUNTER_CONTINUITY: PASS

REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

TSC: PASS
LINT: PASS (0 errors, 6 pre-existing unrelated warnings)
TESTS: PASS (455/455 — added a regression test proving formatPublicId uses the given prefix, not
  a hardcoded one)
BUILD: PASS (local and server)
PRODUCTION_INVARIANTS: UNCHANGED
```

With this stage closed, the earlier Stage 5.2B-1A gate's `ATHLETE_ORG`/`PLAYER_ORG`/`STAFF_ORG:
NOT_APPLICABLE` entries (blocked by exactly this gap) become genuine `ORG_B: PASS` — Stage 5.2B-1
can now be considered fully closed, not conditionally accepted. `ultraAthleteId`, `ultraStaffId`,
and `SystemSetting.key` remain deliberately untouched, exactly as instructed — this stage was
scoped to `PublicIdCounter` alone, precisely because it had demonstrated itself to be a hard
blocker; the others have not, and stay Stage 5.4's job.
