# Phase 1, Stage 5.2B-2 — League Structure Administration

Scoped to tenant-scope the administrative surfaces for Clubs, Competitions, Divisions, Seasons,
SeasonClubs, and Venues. A repository audit ahead of any conversion work found that four of those
six entities have no live administrative surface at all, which narrowed the stage's real scope
before any code changed.

## Repository audit narrowed the scope before conversion began

Searching the whole repository (`src/` and `scripts/`) for `.create(`/`.update(`/`.delete(` calls
against `Competition`, `Division`, `Season`, and `Venue` found them **only** in
`prisma/seed.ts` (the one-time bootstrap seed) and three historical/test scripts
(`scripts/g51-fix-venue.ts`, `scripts/rehearsal-isolation-integration-test.ts`,
`scripts/secondary-draft-isolation-integration-test.ts`). There is no `/competitions`,
`/seasons`, `/divisions`, or `/venues` route, and no action file for any of them.

```
COMPETITION_ADMIN_CRUD: NOT_PRESENT
DIVISION_ADMIN_CRUD: NOT_PRESENT
SEASON_ADMIN_CRUD: NOT_PRESENT
VENUE_ADMIN_CRUD: NOT_PRESENT
NEW_ADMIN_CRUD_INTRODUCED: NO
```

No CRUD surfaces were invented for these four to give this stage something to convert — that
would misrepresent a real gap as a completed module. `prisma/seed.ts` was **not** converted
either: a bootstrap seed has different tenancy semantics (it runs once, before any real
organization-scoping decision applies) and deserves its own deliberate design, not a mechanical
edit to satisfy this stage's checklist. The three historical/test scripts are named
`HISTORICAL_ONE_OFF` and left untouched for the same reason every prior stage has left completed
one-off operations alone.

This left `Club` and `SeasonClub` — the two entities with real, live admin actions
(`src/app/clubs/actions.ts`) — as the actual conversion work for this stage, plus classifying (not
necessarily converting) every other place in the repository that reads these six models.

## `src/app/clubs/actions.ts` — full conversion

Every exported action (`createClub`, `updateClub`, `archiveClub`, `createSeasonClub`,
`updateSeasonClub`, `withdrawSeasonClub`) now:

- Resolves `organizationId` via `requirePermissionWithOrganization("club:manage")` — never from
  client input.
- Runs its entire operation inside `withOrganizationContext(organizationId, async (tx) => {...})`.
- Stamps `organizationId` explicitly on every create (`Club`, `SeasonClub`, `Standing`).
- Writes an audit log entry with explicit `organizationId` — `CLUB_CREATED`, `CLUB_UPDATED`,
  `CLUB_ARCHIVED`, `SEASON_CLUB_CREATED`, `SEASON_CLUB_UPDATED`, `SEASON_CLUB_WITHDRAWN`. This
  file previously had **no audit logging at all**; adding it was part of "full conversion," not a
  scope add-on, since every other converted write path in this project logs its writes.
- `mutationError()` now also handles Prisma's `P2025` ("record not found") — the shape a
  foreign-org id takes once RLS makes the row invisible to an `update`/`delete`. A client
  supplying a legitimate Org B id while operating in Org A now gets the same clean "not found"
  response as a genuinely missing id, never a partial success or a different-looking error that
  would hint the id exists elsewhere.
- `validateSeasonClubScope()` and `validateStaffAssignments()` (both module-private helpers) now
  take the scoped `tx` instead of the bare client — `Club`, `Season`, `Division`, and `Staff` ids
  submitted from the form are resolved *through* the acting organization's transaction, so a
  foreign-org id is invisible to the lookup and the existing "must belong to the same sport and
  competition" validation error fires naturally, rather than ever reading a cross-org row far
  enough to compare its fields.

Six pages that populate this action's own dropdowns/detail views (`clubs/page.tsx`,
`clubs/[id]/page.tsx`, `clubs/[id]/edit/page.tsx`, `clubs/[id]/seasons/new/page.tsx`,
`season-clubs/[id]/edit/page.tsx`, `season-clubs/[id]/roster/page.tsx`) were also converted —
these are "shared helpers required by [the Club/SeasonClub administration] path" per the
stage's own boundary: an admin's Season/Division/Staff dropdown options are exactly the kind of
read that must not show cross-org data, independent of whether submitting a cross-org selection
would ultimately be rejected. `clubs/new/page.tsx` needed no change — its only query is `Sport`,
which is deliberately global (excluded from tenant scoping since Stage 1).

## Critical finding: `SeasonClub`'s relations have no schema-level tenant boundary

The staging rehearsal's cross-org relation attempts did not behave as expected. Attempting to
create an Org B `SeasonClub` referencing Neon Ultra's real `Club` id (and separately, Neon
Ultra's real `Season` id) **succeeded** — confirmed directly, then investigated:

- **The converted application guard already prevents this in practice.** Re-running
  `validateSeasonClubScope()`'s exact logic under Org B's context against Neon Ultra's real
  `clubId` correctly returns `false` (the lookup can't see a Neon Ultra row from Org B's
  context), so `createSeasonClub`/`updateSeasonClub` reject the request before ever attempting
  the create. This is not a live exploit against this project's own code.
- **But the schema itself provides no backstop.** A bare `tx.seasonClub.create()` with a
  cross-org `clubId` — bypassing the application guard entirely — succeeds under RLS. This is a
  general PostgreSQL characteristic, not a bug specific to this table: **foreign key constraint
  validation is not subject to row-level security**. Postgres must be able to see the referenced
  row to validate the FK regardless of the querying role's RLS policies, or every FK check against
  an RLS-protected table would fail outright. RLS can make a cross-org row invisible to a
  `SELECT`, but it cannot make a cross-org `id` an invalid foreign key value.

This matches the stop condition named in this stage's plan verbatim: *"a relation whose schema
allows cross-org linkage despite application/RLS checks."* Per that plan, this is documented here
and not fixed by improvisation — a real fix (a trigger-based cross-org check, a composite foreign
key incorporating `organizationId`, or an application-layer invariant enforced everywhere writes
happen) is an architecture decision deserving its own dedicated design pass, the same way
`PublicIdCounter`'s redesign got one in Stage 5.4A. It is very likely **not unique to
`SeasonClub`** — every foreign key relation in this schema between two RLS-protected tables has
the same theoretical exposure; `SeasonClub`'s three relations (`season`, `club`, `division`) are
simply the first this project has directly rehearsed and found.

**Practical risk today**: contained. The only live code path that creates a `SeasonClub`
(`clubs/actions.ts`) validates scope through the acting organization's own context before every
create/update, so a cross-org relation cannot occur through it. The risk is latent, not active —
it would only manifest if a future write path (a new action, a script, a bulk import) created a
`SeasonClub` without reusing `validateSeasonClubScope`'s pattern.

## Whole-repository read/dependency classification

Beyond `clubs/actions.ts` and its six adjacent pages (`CONVERTED_5.2B2`), every other direct
Prisma reference to `Competition`, `Division`, `Season`, `Club`, `SeasonClub`, or `Venue` was
found and classified. Per this stage's explicit boundary, a read was **converted** only when it
is part of the live authenticated Club/SeasonClub administration path or a shared helper that
path requires — every other read was classified, not converted, even where it is genuinely
unscoped today.

**ALREADY_TENANT_SAFE** (converted in an earlier stage): `src/app/applications/actions.ts`,
`src/lib/participant-internalization.ts`, `src/lib/media-storage.ts`, `src/app/fixtures/actions.ts`,
`src/lib/game-day-checkin.ts`, `src/app/check-in/actions.ts`, `src/lib/operations.ts`,
`src/app/coaches/actions.ts` (the one function converted in Stage 5.2A; its other three
`writeAuditLog` call sites remain the already-named partial-conversion exception from that stage).

**DEFERRED_5.2D** (public/API reads): `src/app/public/clubs/page.tsx`,
`src/app/public/clubs/[id]/page.tsx`, `src/app/public/stats/*` (4 pages), `src/app/public/standings/page.tsx`,
`src/app/public/share/record/[key]/page.tsx`, `src/app/public/share/team/[id]/page.tsx`,
`src/app/api/share/record/[key]/route.ts`, `src/app/api/share/team/[id]/route.ts`,
`src/app/api/v1/clubs/[publicId]/route.ts`, `src/app/api/v1/seasons/[publicId]/leaders/route.ts`,
`src/lib/api-v1/identifiers.ts`, `src/app/live/page.tsx`.

**DEFERRED_5.2C** (analytics/vision/broadcast/content): `src/app/broadcast/page.tsx`,
`src/app/broadcast/stats/page.tsx`, `src/app/broadcast/graphics/page.tsx`,
`src/app/broadcast/graphics/preview/page.tsx`, `src/app/vision/videos/page.tsx`,
`src/lib/standings.ts`, `src/lib/content-engine.ts`, `src/app/content/page.tsx`,
`src/app/announcements/page.tsx`, `src/app/standings/page.tsx`, `src/app/dashboard/page.tsx`
(aggregate counts across many tables, no write path).

**DEFERRED_5.2B3** (draft/tryout/coach-pool machinery, per this project's own sequencing):
`src/app/draft-events/**` (5 pages), `src/lib/draft-events.ts`, `src/app/drafts/**` (3
pages/actions), `src/lib/draft-personnel-readiness.ts`, `src/lib/season-zero-readiness.ts`,
`src/lib/all-star-teams.ts`, `src/app/coaches/assignments/page.tsx`,
`src/app/training/new/page.tsx`, `src/app/novelty-matches/page.tsx`.

**HISTORICAL_ONE_OFF**: `prisma/seed.ts`, `scripts/g51-fix-venue.ts`,
`scripts/rehearsal-isolation-integration-test.ts`, `scripts/secondary-draft-isolation-integration-test.ts`.

**Named exceptions that don't fit the given taxonomy cleanly** — surfaced rather than
mis-classified into the nearest bucket:

- **`src/lib/imports.ts` + `src/app/imports/actions.ts`** — a real, live, authenticated bulk CSV
  import tool that creates/matches `Club` and `SeasonClub` rows via bare, unscoped `prisma.*`
  calls (`requirePermission` only, no organization resolution at all). This is a genuine third
  write path into the Club/SeasonClub domain — parallel to `clubs/actions.ts` and the seed — and
  it is **not tenant-scoped**. It sits outside this stage's literal instruction (conversion of
  `clubs/actions.ts` specifically), but it is squarely in-domain and materially more significant
  than the deferred read-only items above. Flagged here explicitly, not silently bucketed;
  recommended as its own near-term follow-up given its size (CSV parsing, row-matching,
  conflict-review logic) rather than folding it into this pass.
- **`src/app/gameday/page.tsx`** and **`src/app/fixtures/[id]/edit/page.tsx`** /
  **`src/app/fixtures/new/page.tsx`** — bare, unscoped reads of `Season`/`SeasonClub`/`Division`/
  `Venue` used to populate dropdowns and dashboards for already-tenant-scoped write actions
  (`fixtures/actions.ts`, `game-day-checkin.ts`). A pre-existing gap from Stage 5.2A (the write
  action was converted; the page that feeds it dropdown data was not) — not this stage's six
  named entities' own administration path, so not converted here, but named so it isn't lost.
- **`src/lib/data-hygiene.ts`** — a read-only demo/rehearsal-data detection tool (admin
  diagnostic), unscoped. Low urgency (read-only, no mutation), named for completeness.
- **`src/app/players/actions.ts`** — contains `setPlayerJerseyNumber`, invoked directly from the
  now-converted `season-clubs/[id]/roster/page.tsx`. Genuinely adjacent to the SeasonClub
  administration path, but Player is not one of this stage's six named entities and its own
  domain conversion is real, separate work — left to whichever stage covers Player write actions,
  named here so the adjacency isn't mistaken for "covered."
- **`src/app/participants/offline-intake/page.tsx`** renders `admin-offline-intake.ts` — already
  named as a related-but-separate, not-yet-scoped provisioning path since Stage 5.2B-1; unchanged.

No call site was left genuinely unidentified — every one of the ~70 files this search surfaced
falls into one of the buckets above.

## Verified with real evidence — staging rehearsal

Ran against `ultraos_staging`, connected as the actual restricted role via the durable
`staging-maintenance.env` credential. Since none of Club/SeasonClub's actions are exposed as a
CLI (they are `"use server"` actions requiring a real session, unlike `participants-internalize.ts`),
the rehearsal exercises the identical `withOrganizationContext` + Prisma operations the actions
perform — the same approach used for Stage 5.4A's counter mechanism, and the closest practical
substitute for calling the actions directly.

- **Cross-org duplicate names, both must succeed**: created an Org B `Competition` with Neon
  Ultra's exact `name`/`slug` ("Ultra Basketball"/"ultra-basketball"), an Org B `Club` with Neon
  Ultra's real `name`/`shortName` ("Apex"/"APEX"), and a `Venue` with an identical `name`+`city`
  in both Neon Ultra and Org B — all four creates succeeded independently.
- **Same-org duplicates, must be denied**: a second identical-named `Club`, `Venue`, and
  `Competition` within Org B each failed on the Stage 3b composite unique constraint.
- **Full Org B miniature hierarchy**: `Competition → Division → Season → SeasonClub ← Club`
  created successfully, then retrieved through the exact query shape `clubs/[id]/page.tsx`'s real
  loader uses (not a reimplementation) — correct data returned.
- **Visibility isolation**: Org B's `Club`, `Season`, and `Venue` were all invisible from a Neon
  Ultra context; visible from Org B's own.
- **Cross-org mutation denial**: a Neon Ultra context could not mutate Org B's `Club`, `Season`,
  or `Venue` — each attempt affected 0 rows or was denied outright.
- **Cross-org relation attempts**: see the critical finding above — denied in practice by the
  application guard, not by schema/RLS. Tested only the relations `SeasonClub` actually has
  (`season`, `club`, `division`) — no `Venue` relation exists on `SeasonClub` to test, so none
  was manufactured.
- All rehearsal data (`Organization`, `Competition`, `Division`, `Season`, `Club`, `SeasonClub`,
  `Venue` rows, including the disposable Neon Ultra `Venue` created for the duplicate-name proof)
  deleted afterward; a privileged-role query confirmed zero residue.

## Final gate

```
STAGE_5_2B2

COMPETITION_ADMIN_CRUD: NOT_PRESENT
DIVISION_ADMIN_CRUD: NOT_PRESENT
SEASON_ADMIN_CRUD: NOT_PRESENT
VENUE_ADMIN_CRUD: NOT_PRESENT
NEW_ADMIN_CRUD_INTRODUCED: NO

CLUB_ACTIONS: PASS
SEASONCLUB_ACTIONS: PASS

AUTH_ORG_SOURCE: SERVER_DERIVED
CLIENT_ORG_ID_TRUSTED: NO
TENANT_CREATES_EXPLICIT_ORG: PASS
TENANT_RELATION_VALIDATION: PASS (application-level guard; see the schema-level finding below)
AUDIT_ORG_CONTEXT: EXPLICIT

CLUB_DEPENDENCY_LOADERS: TENANT_SCOPED
SEASONCLUB_DEPENDENCY_LOADERS: TENANT_SCOPED

COMPETITION_READS: CLASSIFIED
DIVISION_READS: CLASSIFIED
SEASON_READS: CLASSIFIED
VENUE_READS: CLASSIFIED

PUBLIC_READS_FOUND: DEFERRED_5.2D
DRAFT_TRYOUT_READS_FOUND: DEFERRED_5.2B3
ANALYTICS_VISION_READS_FOUND: DEFERRED_5.2C
HISTORICAL_ONE_OFF_SCRIPTS: NAMED

ORG_A_CLUB_VISIBLE_TO_A: PASS
ORG_B_CLUB_VISIBLE_TO_B: PASS
ORG_A_CANNOT_READ_ORG_B_CLUB: PASS
ORG_A_CANNOT_MUTATE_ORG_B_CLUB: PASS

CROSS_ORG_SEASONCLUB_SEASON: DENIED_AT_APPLICATION_LAYER_ONLY (schema/RLS does not enforce this -
  see critical finding; a stop condition per this stage's own plan, documented not fixed)
CROSS_ORG_SEASONCLUB_CLUB: DENIED_AT_APPLICATION_LAYER_ONLY (same basis)
CROSS_ORG_SEASONCLUB_DIVISION: NOT_INDEPENDENTLY_TESTED (same FK/RLS characteristic applies by
  construction; not re-tested separately since the mechanism is identical)

SAME_CLUB_NAME_ACROSS_ORGS: PASS
SAME_CLUB_SHORTNAME_ACROSS_ORGS: PASS
SAME_COMPETITION_NAME_ACROSS_ORGS: PASS
SAME_COMPETITION_SLUG_ACROSS_ORGS: PASS
SAME_VENUE_NAME_CITY_ACROSS_ORGS: PASS
SAME_ORG_DUPLICATE_CONSTRAINTS: PASS (Club, Venue, Competition all denied)

ORG_B_MINIATURE_HIERARCHY: PASS
ORG_B_SEASONCLUB_CREATION: PASS
APPLICATION_LEVEL_ORG_B_READ: PASS (retrieved via the actual clubs/[id] loader query shape)
ORG_A_CANNOT_SEE_OR_MUTATE_ORG_B_HIERARCHY: PASS

WHOLE_REPOSITORY_SCAN: PASS_WITH_NAMED_DEFERRED_EXCEPTIONS
UNCLASSIFIED_LIVE_CALL_SITES: 0
BLOCKING_UNKNOWN: 0
STOP_CONDITION_TRIGGERED: YES — SeasonClub relation FK/RLS gap (documented above, not fixed;
  does not block this stage's own conversion since the only live write path already guards
  against it at the application layer)

TSC: PASS
LINT: PASS (0 errors, 6 pre-existing unrelated warnings)
TESTS: PASS
BUILD: PASS
PRODUCTION_INVARIANTS: UNCHANGED
```

## Next

Stage 5.2B-3 — Draft / Tryouts / Coach Pools, per the established sequencing. The `SeasonClub`
relation finding should be weighed before then: it is not blocking (the one real write path
already guards against it), but any new write path touching `SeasonClub` — or any other
RLS-protected foreign key relation — must not assume the schema enforces tenant-matching on its
own. `imports.ts`'s unscoped bulk Club/SeasonClub creation is a real, live gap worth a dedicated
follow-up given its size, separate from the sequential 5.2B/5.2C/5.2D roadmap.
