# Phase 1, Stage 5.2A — Tenancy Conversion & Whole-Repository Scan

Closes Stage 5.2A (Game-Day + Competitive Writes, extended to Media and Operations). Records
exactly what was converted, what remains, and why — so a future stage doesn't have to
re-derive this from scratch, and so "5.2A complete" means something precise and checkable.

## Fully converted (organizationId resolved from session, `withOrganizationContext()` used for
every read/write/relation check, every create explicitly stamped, `writeAuditLog()` passed
`organizationId`)

- `src/app/games/actions.ts` — scorer console (15 actions)
- `src/app/games/stats-actions.ts` — statistician console (7 write actions + 4 read functions)
- `src/app/check-in/actions.ts` — ticket/accreditation/order check-in (3 actions)
- `src/app/fixtures/actions.ts` — fixture CRUD + officials (5 actions)
- `src/app/operations/actions.ts` — incidents, checklists, runbooks, equipment, rehearsals,
  tasks, notifications, documents, launch readiness, display heartbeat (16 actions, zero
  external DB-touching helpers — fully self-contained)
- `src/lib/media-storage.ts` — the shared media domain. Redesigned per the explicit contract:
  every function takes `tx`/`organizationId` from the caller, never opens its own transaction,
  never imports session/auth logic. `assignPrimaryMediaAsset` explicitly validates the target
  `Club`/`Athlete`/`Staff` belongs to the acting org before updating it.
- `src/lib/game-day-checkin.ts` — wrapped in real org context; the `SystemSetting.key` lookup
  itself stays global for now (explicitly Stage 5.4's job, not conflated here)

## Verified with real evidence, not just code review

- **RLS + `SET LOCAL` mechanism** (Stage 5.1): resolved a real user's org, proved right-org
  read succeeds, wrong-org read returns empty, using the actual `resolveActiveOrganizationId`/
  `withOrganizationContext` functions against staging.
- **Media cross-org denial** (this stage): created a throwaway second `Organization` on
  staging, attempted `assignPrimaryMediaAsset` targeting a real Neon Ultra `Club` while scoped
  to the other org — denied with a clean "Media asset not found" (RLS made the row invisible;
  `assertSameOrganization` converted that into an explicit message rather than a null-pointer
  crash). Same-org assignment succeeded. All rehearsal data cleaned up afterward — zero residue
  on staging.
- **Anonymous 500s fixed**: `check-in/page.tsx`, `check-in/[code]/page.tsx`,
  `gameday/checkin/page.tsx` now redirect to `/login` instead of throwing an uncaught
  `AuthenticationError`. Added `requireAnyPermissionOrRedirect()` (mirroring the existing
  single-permission variant) since `gameday/checkin` is gated on `requireAnyPermission`.
  Verified post-deploy: both return clean 307-style redirects, not 500s.

## Ripple effects found only by re-scanning the WHOLE repository, not `src/` alone

Every function whose signature changed picked up extra, previously-missed callers living in
`scripts/` — the second time this exact class of mistake has happened in this track (media
functions the first time, in the previous session). The lesson is now explicit: **any signature
change to a shared function requires a repo-wide grep, `scripts/` included, not a `src/`-scoped
one.** All of the following were found and fixed in this stage:

- `uploadMediaAsset`/`assignPrimaryMediaAsset`/`approveMediaAsset`/`archiveMediaAsset`: 4 one-off
  scripts (`g3-upload-akpan-photo.ts`, `g3-upload-club-logos.ts`, `g3-upload-coach-photos.ts`,
  `season-zero-club-onboarding.ts`) plus `coaches/actions.ts`'s bulk photo import function and
  `r2.ts`'s `uploadProfilePhoto`.
- `getCheckInStatuses`/`setCheckInStatus`: `gameday/page.tsx`, `gameday/checkin/page.tsx`,
  `gameday/checkin/actions.ts`.

A final repo-wide grep for both function families after all fixes confirms **zero remaining
unconverted callers** of either.

## Named deferred exceptions (`writeAuditLog` callers not yet converted)

A repo-wide search for `writeAuditLog(` found **78 files** — more than double the 34 found by
the earlier `src/`-only search. Categorized:

**44 historical one-off `scripts/g*.ts` files** — already executed against production in past
tracks (player/coach corrections, draft rehearsals, one-time provisioning). Not reconverted:
these are completed historical operations, not live/ongoing code paths, and carry zero
production risk today. Left as-is deliberately, not an oversight.

**1 partially-converted file**: `src/app/coaches/actions.ts` — one function
(`applyCoachPhotoImport`) was converted as part of the media ripple-fix above; its other three
`writeAuditLog` call sites (`markSeasonZeroCoachSelection`, `assignSeasonClubCoach`,
`clearSeasonClubCoach`) remain unconverted. Flagged explicitly so partial conversion isn't
mistaken for complete — full conversion belongs to 5.2B (coach provisioning).

**25 live application files deferred to 5.2B/C/D**, named for the record:
`participant-internalization.ts`, `applications/actions.ts`, `imports.ts`,
`admin-offline-intake.ts`, `vision/vision-loader.ts`, `game-result-import.ts`,
`players/actions.ts`, `all-star-teams.ts`, `announcements/actions.ts`, `signup/actions.ts`,
`signup/support-club/actions.ts`, `events/[id]/debrief/actions.ts`, `novelty-matches/actions.ts`,
`application-intake.ts`, `draft-events.ts`, `drafts/actions.ts`, `draft-events/actions.ts`,
`season-zero-production-reconciliation.ts`, `draft-cohort.ts`, `tryouts/actions.ts`,
`forgot-password/actions.ts`, `content/actions.ts`, `vendors/actions.ts`, `events/actions.ts`,
`orders/actions.ts`.

## Public application tenant resolution — formally recorded

```
PUBLIC_APPLICATION_TENANT_RESOLUTION:
  STATUS: DEFERRED_TO_5.2B-1
  CURRENT_BRIDGE: NEON_ULTRA_ONLY
  SESSION_MEMBERSHIP_RESOLUTION: NOT_APPLICABLE
  CLIENT_ORGANIZATION_ID: MUST_NOT_BE_TRUSTED
```

`src/lib/r2.ts`'s `uploadProfilePhoto()` (called from the public, often-unauthenticated
`/apply` flow) resolves its organization via a hardcoded lookup of Neon Ultra's slug — correct
for today (the only organization that exists) but explicitly not a real solution. Applicants are
not authenticated org members, so `requirePermissionWithOrganization()`'s session-based
resolution genuinely does not apply here. 5.2B-1 must design a real trusted acquisition
mechanism — organization-specific application URLs/hostnames, invite/application tokens, or
another server-controlled league-context signal — before any second organization exists. An
organization id must never be inferred from unauthenticated client/form input.

## Final gate

```
5.2A_GAME_ACTIONS: PASS
5.2A_STATISTICIAN_ACTIONS: PASS
5.2A_FIXTURE_ACTIONS: PASS
5.2A_CHECKIN_ACTIONS: PASS
5.2A_MEDIA_ACTIONS: PASS
5.2A_MEDIA_STORAGE: PASS
5.2A_OPERATIONS_ACTIONS: PASS
MEDIA_HELPERS_REQUIRE_EXPLICIT_ORG: PASS
MEDIA_CROSS_ORG_ASSIGNMENT: DENIED (verified against staging with real data)
OPERATIONS_HELPERS_REQUIRE_EXPLICIT_ORG: PASS (no external DB-touching helpers exist in this file)
AUDIT_ORG_CONTEXT: EXPLICIT (for every converted file, verified by count-matching every
  writeAuditLog(tx, {...}) call against organizationId presence)
ANONYMOUS_GAMEDAY_CHECKIN: REDIRECT
ANONYMOUS_CHECKIN_CODE: REDIRECT
PUBLIC_APPLICATION_MEDIA_BRIDGE: DOCUMENTED_EXCEPTION — 5.2B-1
FULL_REPOSITORY_SCAN: PASS_WITH_NAMED_DEFERRED_EXCEPTIONS (see above — 44 historical scripts,
  1 partially-converted file, 25 live files, all named)
TSC: PASS
LINT: PASS
TESTS: PASS (454/454)
BUILD: PASS
PRODUCTION_INVARIANTS: UNCHANGED
```

Stage 5.2A is closed. Next: **5.2B-1 — solve public tenant acquisition first**, before
participant provisioning/internalization — creating an organization-owned `Athlete`/`Player`/
`Staff` record requires already knowing which organization it belongs to.
