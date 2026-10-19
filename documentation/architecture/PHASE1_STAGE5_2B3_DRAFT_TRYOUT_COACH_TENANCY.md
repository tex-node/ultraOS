# Phase 1, Stage 5.2B-3 — Draft / Tryouts / Coach Pools Multi-Tenant Hardening

Tenant-hardens the real, existing Draft/Tryout/Coach-Pool write surface: `Draft`/`DraftPick`
(Secondary Draft), `DraftEvent`/`DraftAllocation` (Main Draft), `DraftSquad`/`DraftSquadMember`,
`DraftCoachPoolEntry`, and the Player tryout/selection fields they act on — following the same
`requirePermissionWithOrganization` → `withOrganizationContext` conversion pattern as every prior
Stage 5.2B substage, then extends Stage 5.4B's composite tenant-aware foreign key pattern to the
relations this domain's write paths actually establish.

## Whole-repository inventory

Grepped the whole repository (not just `src/`) for every reference to the 7 draft/tryout/coach-
pool Prisma models and their business-logic library. Classification:

**CONVERT_5.2B3** (26 files):
- `src/lib/draft-events.ts` — the shared library for both Main Draft (`DraftEvent`/
  `DraftAllocation`) and Secondary Draft (`Draft`/`DraftPick`)
- `src/lib/draft-squad-capacity.ts`, `src/lib/participant-profiles.ts` (`draftReadinessForPlayer`
  only — see "found via `tsc`" below)
- `src/app/draft-events/actions.ts` (15 actions), `src/app/drafts/actions.ts`,
  `src/app/tryouts/actions.ts`
- 17 adjacent authenticated pages/routes: `draft-events/page.tsx`, `draft-events/new/page.tsx`,
  `draft-events/[draftEventId]/page.tsx`, `.../control/page.tsx`, `.../readiness/page.tsx`,
  `.../squads/page.tsx`, `.../squads/new/page.tsx`, `.../squads/[squadId]/page.tsx`,
  `.../coaches/page.tsx`, `.../player-pool/page.tsx`, `drafts/page.tsx`, `drafts/new/page.tsx`,
  `drafts/[id]/page.tsx`, `tryouts/page.tsx`, `tryouts/[group]/page.tsx`,
  `tryouts/reconciliation/page.tsx`, `tryouts/export/route.ts`

**ALREADY_TENANT_SAFE**: none found pre-existing in this domain — every live write/read path
touched a bare, unscoped `prisma` client before this stage.

**READ_DEPENDENCY_5.2B3**: `draft-cohort/page.tsx`'s and `scripts/tryout-metadata-import.ts`'s
zero-arg calls into `draftSquadCapacityConfig` — kept compiling via a default parameter, not
independently converted (see "Decisions" below).

**HISTORICAL_ONE_OFF** (21 g-numbered scripts): `g14-draft-favour-franklin-halo.ts`,
`g16-correct-halo-olutosoye.ts`, `g17-flip-grace-and-draft.ts`, `g3-correction-test.ts`,
`g3-reset-main-rehearsal.ts`, `g3-run-rehearsal.ts`, `g3-secondary-draft-rehearsal.ts`,
`g34-draft-4-men-to-clubs.ts`, `g37-draft-11-women.ts`, `g4-official-reset.ts`,
`g4-verify-cancel-button.ts`, `g4-verify-constraint-fix.ts`, `g4-verify-control-fix.ts`,
`g42-draft-final-3-women.ts`, `g43-swap-imole-vanessa.ts`, `g49-draft-igwebuike-ember.ts`,
`g5-verify-display-refresh.ts`, `g5-verify-readiness-fix.ts`, `g6-revert-to-rehearsal.ts`,
`g65-draft-three-reserves.ts`, `g66-halo-ember-roster-changes.ts` — one-time historical
corrections against Season Zero's real draft. Mechanically patched (not rewritten) to keep
compiling against the new signatures, by inserting the existing Neon Ultra organization id as an
explicit argument — these never touch a second organization and were never meant to.

**Genuine repeatable rehearsal utilities, NOT historical** (per this stage's own instruction that
a script isn't historical merely for living under `scripts/`): `rehearsal-isolation-integration-
test.ts` and `secondary-draft-isolation-integration-test.ts` (pre-existing, mechanically patched
like the above since they exercise the same Neon Ultra rehearsal draft) — and this stage adds two
more genuine tools of the same kind: `draft-tenancy-isolation-integration-test.ts` (the two-tenant
rehearsal below) and `verify-5-2b3-privileged-fk.ts` (the privileged-role proof below).

**DEFER_5.2D**: `publicDraftEventState`/`publicSecondaryDraftState` in `draft-events.ts` — the
public/projector read surface. Left on the bare `prisma` client deliberately, with a code comment
explaining the boundary; not required by any authenticated 5.2B-3 workflow.

**DEFER (named, not 5.2C/5.2D)**:
- `season-zero-readiness.ts`/`draft-personnel-readiness.ts` — both hardcoded to the literal
  string `"Season Zero 2026"` as their season filter, not generalized to any organization's
  season. Real, pre-existing, out of this stage's scope (they don't take an organization
  parameter at all); named here so they aren't mistaken for covered.
- `draft-cohort/actions.ts` + `lib/draft-cohort.ts` — Application-centric (operates on the
  `Application` model, pre-draft), not Draft/DraftEvent-model-centric; a related but genuinely
  separate surface from what this stage's plan named.

**BLOCKING_UNKNOWN**: 0. **UNCLASSIFIED_LIVE_CALL_SITES**: 0 at completion (one page,
`draft-events/[draftEventId]/readiness/page.tsx`, was missing from the initial grep-based
inventory and was found the same way Stage 5.2B-2 warned about — a `tsc` compile error after
`draftEventReadiness`'s signature changed — and converted immediately).

## The conversion

Every function in `draft-events.ts` that touches the database now takes either an explicit
`organizationId` (top-level exported functions — `reserveNextAllocation`, `revealAllocation`,
`confirmAllocation`, `correctAllocation`, `resetRehearsalAllocations`, `nextAllocationReadiness`,
and the five equivalent Secondary Draft functions) or `tx: Prisma.TransactionClient` (internal
helpers already running inside a caller's scope — `draftEventReadiness`, `assertReadyToStart`,
`draftOperatingMode`), replacing every bare `prisma.*` call. Every `DraftAllocation`/`DraftPick`
create stamps `organizationId` explicitly; every `writeAuditLog` call passes it.

`draft-events/actions.ts`'s 15 actions and `drafts/actions.ts`'s actions all resolve `{ session,
organizationId } = await requirePermissionWithOrganization(...)` and wrap their body in
`withOrganizationContext(organizationId, async (tx) => {...})`. `tryouts/actions.ts`'s
`updatePlayerTryout`/`bulkUpdateTryoutGroup` do the same; `bulkUpdateTryoutGroup`'s `updateMany`
carries a code comment explaining that RLS — not an explicit WHERE clause — is what actually
excludes any foreign-org id from the affected rows, and the audit log records every requested id,
not just the ones RLS let through.

`draftReadinessForPlayer` (`participant-profiles.ts`) was a genuine stop-condition-6 bug: called
from an already org-scoped page, but implemented with the bare `prisma` client internally. Fixed
by taking `db: Prisma.TransactionClient | typeof prisma = prisma` (default preserves its one other
untouched caller). `draftSquadCapacityConfig` got the identical treatment for the same reason,
preserving its two untouched zero-arg callers.

**A live gap found by the rehearsal, not by inspection, and fixed this stage**:
`addCoachPoolEntry` (`draft-events/actions.ts`) created `DraftCoachPoolEntry` directly from
`draftEventId`/`divisionId`/`staffId` — a route param and two form fields — with no ownership
check on any of them, and none of `DraftCoachPoolEntry`'s three FKs is composite this stage (see
"Relations hardened" below). This is exactly the pattern `addSquadMember` already protects against
for `playerId`. Fixed by resolving all three ids through the same scoped `tx` first
(`tx.draftEvent.findUniqueOrThrow`/`tx.division.findUniqueOrThrow`/`tx.staff.findUniqueOrThrow`) —
a foreign-org id is invisible to RLS here and throws not-found before the create is ever reached.
Confirmed by rehearsal both before the fix (cross-org write silently succeeded) and after (denied,
`RecordNotFound`).

## Schema: composite tenant-aware foreign keys

Extends Stage 5.4B's pattern (`Parent: @@unique([organizationId, id])`; `Child: @relation(fields:
[organizationId, childId], references: [organizationId, id])`) to the relations this stage's
converted write paths actually establish, following the same "reference implementation, not a
platform-wide rewrite" discipline 5.4B itself recommended for this stage.

Five parent tables gained `@@unique([organizationId, id])`: `SeasonClub`, `Player`, `Staff`,
`DraftEvent`, `DraftSquad`. Five relations became composite:

```
DraftAllocation.draftEventId  -> DraftEvent(organizationId, id)   ON DELETE CASCADE
DraftAllocation.divisionId    -> Division(organizationId, id)     ON DELETE RESTRICT
DraftAllocation.seasonClubId  -> SeasonClub(organizationId, id)   ON DELETE RESTRICT
DraftSquadMember.draftSquadId -> DraftSquad(organizationId, id)   ON DELETE CASCADE
DraftSquadMember.playerId     -> Player(organizationId, id)       ON DELETE RESTRICT
```

These were chosen because they sit directly on the confirm step's write path — the step that
actually persists permanent `Player.seasonClubId`/`SeasonClub` coach assignments in `LIVE`
operating mode — making them the highest-consequence relations in this domain.

**Deliberately NOT made composite, with a real reason, not an oversight**:

- `DraftAllocation.draftSquadId` and `.staffId` — both nullable. `prisma validate` surfaced a real
  Prisma/Postgres incompatibility: a composite FK with `ON DELETE SET NULL` is rejected when any
  column in the composite key (here, `organizationId`) is itself `NOT NULL`, because Postgres
  would have to null out `organizationId` too on a referenced-row delete, violating the table's
  own `NOT NULL` constraint. This is the same reason `SeasonClub`'s own nullable Staff references
  (`headCoachId`/`assistantCoachId`/etc.) were never made composite either — not a new problem
  introduced this stage, an existing schema-wide constraint respected consistently. Application-
  level protection remains the operative guard for these two: both ids are always resolved inside
  `reserveNextAllocation`'s own scoped transaction, never client-supplied.
- The other 16 `TENANT_TO_TENANT` relations this domain establishes (`Draft`'s own
  `season`/`division`/`draftEvent`, `DraftEvent`'s own `season`/`event`, `DraftSquad`'s own
  `season`/`division`/`draftEvent`, `DraftCoachPoolEntry`'s `division`/`draftEvent`/`staff`,
  `DraftPick`'s `draft`/`player`/`seasonClub`) are inventoried here but not converted. Each of
  `DraftCoachPoolEntry`'s three is protected at the application level only (the fix above) — a
  real gap that a raw scoped Prisma call bypassing `addCoachPoolEntry` could still exploit, unlike
  the 5 relations above which the database itself now refuses regardless of caller. Named as a
  backlog item for a future stage, following Stage 5.4B's own recommendation not to attempt a
  platform-wide FK rewrite in one pass.

Migration `20260904060000_phase1_stage5_2b3_draft_tenant_fk` (hand-authored, mirroring 5.4B's
`SeasonClub` migration exactly — no data transformation needed, only new unique indexes and FK
redefinitions on existing `NOT NULL` columns). `ON DELETE`/`ON UPDATE` behavior is unchanged from
the original single-column FKs on all 5 relations.

## Mismatch audits — zero throughout

Read-only, against production, for all 7 originally-considered relations (including the 2 that
ended up not converted): zero mismatches before any schema change. Re-run against production
immediately before applying the migration (data changes over the course of a session): zero
mismatches, unchanged. Re-run immediately after applying the migration: zero mismatches.

## Two-tenant staging rehearsal

Against `ultraos_staging`, connected as the actual restricted `ultraos_staging` role (RLS
genuinely applies), using the real `reserveNextAllocation`/`revealAllocation`/`confirmAllocation`
functions from `draft-events.ts` — not a raw-SQL simulation. Script:
`scripts/draft-tenancy-isolation-integration-test.ts`.

Disposable Organization B, minimum hierarchy (Competition → Division → Season → Club →
SeasonClub), then one disposable Player, one disposable Staff, two DraftEvents (one per
`AllocationSubjectType`), one DraftSquad, one DraftCoachPoolEntry.

**PASS proofs** (all via the real functions):
- Org B Player added to Org B DraftSquad; `reserveNextAllocation` (SQUAD) correctly picked the
  only eligible squad/club; `confirmAllocation` wrote `Player.seasonClubId` to Org B's own
  SeasonClub and set `status = DRAFTED`.
- Org B Staff added to Org B Coach Pool; `reserveNextAllocation` (COACH) correctly picked the only
  eligible coach/club; `confirmAllocation` wrote `SeasonClub.headCoachId` to Org B's own coach.
- Org A and Org B each created identically-named draft-adjacent records (same Competition name)
  with no collision — no uniqueness constraint had to be altered or worked around.

**DENIED proofs, zero partial writes after each**:
- Org A Player → Org B DraftSquad: `Foreign key constraint violated on the constraint:
  DraftSquadMember_organizationId_playerId_fkey`.
- Org A Staff → Org B Coach Pool: denied at the **application level** (the `addCoachPoolEntry` fix
  above) — `tx.staff.findUniqueOrThrow` throws `RecordNotFound` under RLS before any create is
  attempted. Not a database constraint — `DraftCoachPoolEntry.staffId` has no composite FK this
  stage, so a raw scoped Prisma call bypassing the action would still succeed; this is reported
  honestly rather than claimed as DB-level protection.
- Org A SeasonClub → Org B DraftAllocation: `Foreign key constraint violated on the constraint:
  DraftAllocation_organizationId_seasonClubId_fkey`.
- Org A Division → Org B DraftAllocation: `Foreign key constraint violated on the constraint:
  DraftAllocation_organizationId_divisionId_fkey`.
- Zero rows created under Org B with the sentinel sequence numbers used by the failed attempts —
  confirmed no partial writes.

All rehearsal data (Organization B, its full hierarchy, both users, athlete/player/staff,
DraftEvents/DraftSquad/DraftSquadMember/DraftCoachPoolEntry/DraftAllocation rows, AuditLog rows)
deleted afterward by the script itself.

## Database-level proof: privileged role, inside rolled-back transactions

Script: `scripts/verify-5-2b3-privileged-fk.ts`. Connected as the `ultraos` role on
`ultraos_staging` — confirmed `rolsuper = true, rolbypassrls = true` before proceeding (the script
refuses to run under any other role, since a restricted-role result would prove nothing about the
constraint independent of RLS).

Each of the 5 newly-hardened relations was tested independently, in its own fresh Organization-B
setup and its own transaction (so one rejection doesn't prevent testing the rest), attempting to
attach that one relation to a real Neon Ultra (Org A) row while every other field stays genuinely
Org B's own — then the whole transaction, setup included, is rolled back regardless of outcome:

```
DraftAllocation.draftEventId  -> rejected by DraftAllocation_organizationId_draftEventId_fkey
DraftAllocation.divisionId    -> rejected by DraftAllocation_organizationId_divisionId_fkey
DraftAllocation.seasonClubId  -> rejected by DraftAllocation_organizationId_seasonClubId_fkey
DraftSquadMember.draftSquadId -> rejected by DraftSquadMember_organizationId_draftSquadId_fkey
DraftSquadMember.playerId     -> rejected by DraftSquadMember_organizationId_playerId_fkey
```

All 5: PASS — rejected by the named constraint itself, under a role that bypasses RLS entirely.
Zero residue afterward (every transaction rolled back; a follow-up count of any leftover
"Privileged FK Proof Org B" row returned 0).

## Decisions

- Hardened only the 5 relations this stage's converted write paths actually establish and that
  are Prisma/Postgres-compatible with the composite pattern — not all 22 relations in this domain,
  and not the 2 that hit a real incompatibility — following Stage 5.4B's own explicit
  recommendation for this stage.
- Fixed the `addCoachPoolEntry` ownership-validation gap in place rather than deferring it,
  because the plan named the coach-pool invariant ("cross-org Staff IDs fail cleanly at
  application level") as a required outcome of this stage, not an optional one — unlike the
  16-relation FK backlog, which the plan explicitly permits deferring.
- `draftSquadCapacityConfig`/`draftReadinessForPlayer` use a default-parameter shim rather than
  converting their remaining pre-existing callers, matching the precedent Stage 5.2A set for
  `game-day-checkin.ts` — narrow, compiling, and not pulling unrelated surfaces into this stage.

## Verification

```
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS (0 errors; 6 pre-existing warnings unrelated to this stage's files, unchanged)
TESTS: 455/455 PASS (unchanged count — no new tests added this stage)
LOCAL_BUILD: PASS
PRODUCTION_BUILD_ATTEMPT_1: FAILED_OOM
PRODUCTION_BUILD_RETRY: PASS
```

`PRODUCTION_BUILD_ATTEMPT_1` failed with `FATAL ERROR: Ineffective mark-compacts near heap limit
- JavaScript heap out of memory` during the TypeScript-checking phase of `next build` on the
production server (`raivstream`) — a shared box also running Docker, several other Next.js
services, and Logflare, with `free -h` showing only ~3.5GB free RAM and 5.2GB of 8GB swap already
in use at the time. This is a production-host capacity condition, not a code-validation failure:
the identical build had already passed locally (`LOCAL_BUILD: PASS`) with no errors or warnings of
its own, and no code changed between the two attempts. Per discipline, the failed attempt was not
worked around by weakening the build gate or restarting the service on an unverified artifact —
the retry used `NODE_OPTIONS=--max-old-space-size=4096` on the exact same synced code, and passed
cleanly end to end (`✓ Compiled successfully` → `Finished TypeScript in 90s` → `Generating static
pages (72/72)`, no errors). The service was only restarted after this second, fully-verified
build succeeded.

Deployed to production: fresh verified backup
(`ultraleagueos-pre-phase1-stage5-2b3-20260904154303.dump`, 829,475 bytes, 1321 TOC entries,
verified via `pg_restore --list`), migration applied inside an explicit transaction, all 5
composite FKs and 5 unique indexes verified from `pg_constraint`/`pg_indexes` to match the design
exactly (`draftSquadId`/`staffId` confirmed still simple FKs), migration registered via `prisma
migrate resolve --applied`, code synced, `prisma generate` run on the server, `npm run build` run
twice as described above, `ultraos-web.service` restarted (systemd, NOT pm2) only after the
verified retry succeeded, smoke-tested (`/draft-events`, `/tryouts`, `/drafts` each correctly
307-redirect unauthenticated; `/login` and `/public/clubs` 200), journalctl checked (no errors in
the two minutes following restart), production invariants re-captured and confirmed unchanged,
mismatch audit re-run post-migration and again post-restart (zero both times).

## Known remaining gaps

- `DraftCoachPoolEntry.divisionId`/`.draftEventId`/`.staffId` — application-level protection only
  (the `addCoachPoolEntry` fix above); no composite FK. A privileged-role or raw-table caller
  bypassing the action would not be stopped by the database.
- `DraftAllocation.draftSquadId`/`.staffId` — application-level protection only (both are always
  resolved inside `reserveNextAllocation`'s own scoped transaction); not composite, due to the
  real Prisma/Postgres `SetNull` incompatibility documented above.
- The other 16 `TENANT_TO_TENANT` relations in this domain remain un-hardened, as an explicit,
  named backlog for a future stage — not because they were overlooked, but because this stage
  targeted the relations its own converted write paths establish, per Stage 5.4B's guidance.
- `season-zero-readiness.ts`/`draft-personnel-readiness.ts` remain hardcoded to the literal season
  name `"Season Zero 2026"`, and `draft-cohort/actions.ts`/`lib/draft-cohort.ts` remain a related,
  separate, not-yet-scoped surface — both named above, neither touched this stage.
- Public/projector draft reads (`publicDraftEventState`/`publicSecondaryDraftState`) remain on the
  bare, unscoped Prisma client — deliberately deferred to Stage 5.2D.

## Final gate

```
STAGE_5_2B3

DRAFT_ACTIONS: PASS
DRAFT_EVENT_ACTIONS: PASS
DRAFT_SQUAD_ACTIONS: PASS
DRAFT_ALLOCATION_ACTIONS: PASS
DRAFT_PICK_ACTIONS: PASS
TRYOUT_ACTIONS: PASS
COACH_POOL_ACTIONS: PASS

AUTH_ORG_SOURCE: SERVER_DERIVED
CLIENT_ORG_ID_TRUSTED: NO
TENANT_READS_SCOPED: PASS
TENANT_CREATES_EXPLICIT_ORG: PASS
TENANT_RELATION_VALIDATION: PASS (composite FK for the 5 relations listed below; application-level
  scoped lookup for every other relation this stage's write paths touch, including the
  addCoachPoolEntry fix)
AUDIT_ORG_CONTEXT: EXPLICIT

WRITE_PATH_TENANT_FKS_INVENTORIED: PASS (22 TENANT_TO_TENANT relations in this domain; 5
  converted, 17 named and deliberately deferred with reasons — see "Known remaining gaps")
WRITE_PATH_EXISTING_MISMATCHES: 0 (all 7 originally-considered relations, pre- and post-migration)
WRITE_PATH_COMPOSITE_FKS: DraftAllocation.draftEventId, DraftAllocation.divisionId,
  DraftAllocation.seasonClubId, DraftSquadMember.draftSquadId, DraftSquadMember.playerId

APPLICATION_SCOPE_GUARDS_RETAINED: PASS
PRIVILEGED_CROSS_ORG_RELATION_WRITES: DENIED (all 5 composite FKs, independently, under the
  RLS-bypassing role, inside rolled-back transactions)

ORG_B_PLAYER_TO_ORG_B_SQUAD: PASS
ORG_B_COACH_TO_ORG_B_COACH_POOL: PASS
ORG_B_SQUAD_TO_ORG_B_SEASONCLUB_CONFIRM: PASS
ORG_B_COACH_TO_ORG_B_SEASONCLUB_CONFIRM: PASS

ORG_A_PLAYER_TO_ORG_B_DRAFT_SQUAD: DENIED (composite FK)
ORG_A_COACH_TO_ORG_B_COACH_POOL: DENIED (application-level guard only, not a database constraint)
ORG_A_SEASONCLUB_TO_ORG_B_CONFIRMATION: DENIED (composite FK, tested via direct DraftAllocation
  creation targeting Org A's SeasonClub)
ORG_A_CLUB_SEASON_TO_ORG_B_DRAFT: DENIED (composite FK, tested via Org A's Division on
  DraftAllocation.divisionId)

SAME_DRAFT_OBJECT_NAMES_ACROSS_ORGS: PASS (no uniqueness constraint required altering)

MAIN_DRAFT_BEHAVIOR: UNCHANGED
SECONDARY_DRAFT_BEHAVIOR: UNCHANGED
RESERVE_REVEAL_CONFIRM: UNCHANGED
CORRECTION_WORKFLOW: UNCHANGED

PUBLIC_DRAFT_READS: CLASSIFIED (DEFER_5.2D)
PUBLIC_TRYOUT_READS: CLASSIFIED (no dedicated public tryout read surface found; tryout data is
  not exposed publicly today)
HISTORICAL_SCRIPTS: NAMED (21 one-off + 2 pre-existing rehearsal utilities + 2 new rehearsal
  utilities added this stage)

WHOLE_REPOSITORY_SCAN: PASS_WITH_NAMED_DEFERRED_EXCEPTIONS
UNCLASSIFIED_LIVE_CALL_SITES: 0
BLOCKING_UNKNOWN: 0

REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS
TESTS: 455/455 PASS
LOCAL_BUILD: PASS
PRODUCTION_BUILD_ATTEMPT_1: FAILED_OOM (production-host memory pressure during tsc, not a code
  defect — see "Verification" above)
PRODUCTION_BUILD_RETRY: PASS (NODE_OPTIONS=--max-old-space-size=4096, identical code, clean run)

PRODUCTION_INVARIANTS: UNCHANGED
```

## Next

The 17-relation backlog this stage explicitly named (`DraftCoachPoolEntry`'s 3, `DraftAllocation`'s
2 nullable ones, and the other 12 across `Draft`/`DraftEvent`/`DraftSquad`/`DraftPick`) is the
natural target for the next stage that touches this domain again — `DraftCoachPoolEntry`'s 3 in
particular are the highest-priority follow-up, since they are the one place in this domain still
resting on application-level protection alone rather than a database constraint. Stage 5.2C
(Analytics/Vision) and 5.2D (public reads) proceed per the established sequencing.
