# Phase 1, Stage 5.2C — Authenticated Analytics / Vision / Data-Read Multi-Tenant Hardening

Tenant-hardens the authenticated analytical and vision/data-read surfaces: broadcast/commentator
analytics, standings, operations readiness dashboards, and the entire G.21/G.22 AI Vision domain
(video registration, timeline anchors, analysis runs, observations, event matches, court
specification, failure gallery, evaluation export). This is explicitly a read-hardening stage,
not a broad public-read migration — public/token-based analytics surfaces (`/public/stats`,
`/public/share/*`, `/live`, `api/v1/*` public feeds) remain classified `DEFER_5.2D`.

## Whole-repository inventory

Searched the whole repository (not just `src/`) for every model/query shape named in this stage's
scope: `Game`, `GameEvent`, `PlayerStat`, `TeamStat`, `Standing`, `GameVideo`,
`CourtSpecification`, `CourtCalibration`, `VisionAnalysisRun`, `VisionObservation`,
`VisionEventMatch`, `VisionTrajectoryArtifact`, `VisionSpatialSummary`, `VisionModel`, plus
`findMany`/`aggregate`/`groupBy`/`$queryRaw` shapes and export/report/cache code. `AnalyticsEvent`
does not exist as a model in this schema — **`NOT_PRESENT`**, not silently assumed covered.

**Architecture discovered, consistent across both the analytics and vision domains**: each domain
has exactly ONE Prisma-touching composition file (`src/lib/analytics/game-analytics.ts` for
analytics, `src/lib/vision/vision-loader.ts` for vision, `src/lib/live-game-snapshot-v2.ts` and
`src/lib/system-health-loader.ts` for live/broadcast state) — every other file in
`src/lib/analytics/*` (30 files: `why-they-won.ts`, `player-dna.ts`, `team-dna.ts`, `records.ts`,
`milestones.ts`, etc.) and `src/lib/vision/*` (20 files: `court-homography.ts`,
`vision-evaluation.ts`, `four-point-spatial-rule.ts`, etc.) is a **pure computation function** that
never touches Prisma — they take already-fetched plain data and return derived analytics/vision
judgements. This meant the bulk of "analytics" work in this codebase needed zero tenancy
conversion; only the composition points and their callers required it.

## Classification

**CONVERT_5.2C** (write/read paths converted this stage):
- `src/lib/analytics/game-analytics.ts` — 6 exported functions (`loadGameCore`,
  `loadGameCoreByFixture`, `loadSeasonGameCores`, `loadSeasonPlayerTotals`,
  `loadPlayerBestGame`, `loadPlayerGameLog`)
- `src/lib/live-game-snapshot-v2.ts` — `buildLiveGameSnapshotV2`, `buildLivePresentationModelForGame`
- `src/lib/system-health-loader.ts` — `buildSystemHealth`
- `src/lib/standings.ts` — `recalculateStandings` (a real gap found, not just a signature change —
  see below)
- `src/lib/vision/vision-loader.ts` — all ~25 exported functions (the entire vision domain's
  write/read surface)
- Pages/actions: `src/app/dashboard/page.tsx`, `src/app/standings/page.tsx`,
  `src/app/broadcast/page.tsx`, `.../stats/page.tsx`, `.../graphics/page.tsx`,
  `.../graphics/preview/page.tsx`, `.../control/page.tsx`, `.../diagnostics/page.tsx`,
  `src/app/api/v1/broadcast/games/[id]/route.ts`, all 7 files under `src/app/vision/**`,
  `src/app/games/[fixtureId]/video/page.tsx` + `actions.ts`,
  `src/app/api/vision/games/[gameVideoId]/export/route.ts`

**ALREADY_TENANT_SAFE**: `src/app/applications/export/route.ts` and
`src/app/tryouts/export/route.ts` — both already resolve `organizationId` via
`requirePermissionWithOrganization`/session and pass it into their scoped data functions
(`getApplicationData`, `tryouts/export/route.ts`'s own query), verified this stage per the user's
explicit instruction, **not rewritten merely to produce a diff**.
`src/app/games/actions.ts`/`clubs/actions.ts` (Stage 5.2A/5.2B-2 conversions) — spot-checked,
confirmed already stamping `organizationId` on every `Standing` create it touches.

**READ_DEPENDENCY_5.2C**: `src/app/gameday/page.tsx`'s single `buildSystemHealth(...)` call site
— fixed to pass its already-resolved `organizationId` (a mechanical signature-compatibility fix,
required for compilation) — but the REST of that page's dozen bare `prisma.*` calls (season,
fixtures, incidents, the one `Event.findFirst` banner read) remain a named, pre-existing gap from
Stage 5.2A's domain, not expanded into this stage.

**DEFER_5.2D** (genuinely public, no authenticated dependency): `public/stats/**`,
`public/share/**`, `api/share/**`, `api/v1/seasons/[publicId]/leaders|standings`,
`api/v1/live`, `api/v1/games/**`, `/live`, `/display/game/[gameId]/clock`,
`/broadcast/game/[gameId]/scorebug`, `/rehearsal/broadcast|live/[fixtureId]` —
`game-analytics.ts`/`live-game-snapshot-v2.ts` keep their default-parameter shim
(`db: Prisma.TransactionClient | typeof prisma = prisma`) precisely so these ~20 public callers
compile and behave unchanged, deliberately not converted this stage.

**PLATFORM_GLOBAL_INTENTIONAL**:
- `VisionModel.key` — a bare global `@unique` (e.g. `"PLAYER_DETECTOR_V1"`). A model
  identity/version is an operational/vendor concept analogous to `Sport`, not business data
  belonging to one league — `ensureVisionModel` still stamps `organizationId` on create for
  bookkeeping consistency, but the identity lookup itself is deliberately global. Not
  independently re-derived from a design document; inferred from the model's own doc comment
  ("Model Registry — identity/version only, not an ML platform") and named honestly as such rather
  than assumed.
- `src/lib/data-hygiene.ts` — a platform-wide rehearsal/demo-residue diagnostic spanning every
  domain by design (continuation of the exact exception already named in Stage 5.2B-2/5.2B-4's
  docs). **New finding this stage**: `src/app/data-readiness/export/route.ts` is an authenticated
  CSV export of this same unscoped diagnostic (`auditRealData()`) — a genuinely new export-shaped
  surface this stage's own boundary explicitly flags as high-priority ("exports can leak many rows
  at once"). Classified `PLATFORM_GLOBAL_INTENTIONAL` on the same reasoning as the underlying
  library, but **this specific determination was not independently verified this stage** — whether
  the gating `data:readiness` permission is genuinely restricted to platform-level admins only, in
  a real multi-organization future, is an open question, not a confirmed safe design. Named
  explicitly rather than silently carried forward as already-solved.

**HISTORICAL_ONE_OFF**: `scripts/g20-rehearsal.ts` (8 `buildSystemHealth()` call sites, mechanically
patched with the Neon Ultra org id), `scripts/g16` through `g20-rehearsal.ts` /
`g84-import-season-zero-results.ts` (7 `recalculateStandings()` call sites across 6 files,
mechanically patched the same way) — all genuine one-time historical/rehearsal corrections against
specific hardcoded Season Zero record ids, none touch a second organization and were never meant to.
`scripts/vision-analyze.ts` is **NOT** historical — it is the real, currently-referenced
(`npm run vision:analyze`) offline vision-inference worker entrypoint named in the app's own UI
text; converted properly (resolves `organizationId` from the video's own row, the same
token/id-resolved provenance pattern used elsewhere, not hardcoded).

**BLOCKING_UNKNOWN**: 0. **UNCLASSIFIED_LIVE_CALL_SITES**: 0 at completion.

## Real gaps found and fixed (not just signature-compatibility churn)

1. **`recalculateStandings`'s `upsert.create` never stamped `organizationId`.** A pre-existing
   defect: since the function already took `tx: Prisma.TransactionClient`, it looked converted,
   but the `create` branch of its `Standing` upsert (only exercised the FIRST time a season's
   standings are computed, since every later call hits `update`) relied on the Stage 3a
   `dbgenerated()` default — which resolves to Neon Ultra regardless of the calling organization.
   Fixed by adding `organizationId: string` as an explicit parameter, threaded through its one real
   caller (`games/actions.ts`, 2 call sites, `organizationId` already in scope there) and all 7
   historical script call sites.
2. **`buildSystemHealth`'s `selectedGameId` (the `/broadcast/diagnostics?gameId=` query param) had
   zero tenant scoping.** An Org B operator could have inspected Org A's live game health/snapshot
   (team names, fixture id, clock/reconciliation state) merely by supplying another organization's
   real game id — a direct instance of the exact "arbitrary gameId exposes analytics" risk this
   stage's own objective names. Fixed by requiring `organizationId` and running every
   fixture/game/gameEvent read inside its scoped transaction; a foreign-org id now falls through to
   the existing "no live game" path instead of ever resolving.
3. **The entire vision domain (`vision-loader.ts`, ~25 functions) was completely unscoped**,
   despite every one of its 8 caller files already being authenticated (`vision:manage`). Fixed by
   making `organizationId` an explicit first parameter on every function and running each inside
   `withOrganizationContext`.
4. **`check-in/[code]/page.tsx`-style read-before-mutation gaps were specifically searched for and
   not found recurring** in this stage's own domain — the read→decision→mutation doctrine from
   Stage 5.2B-4 was applied throughout (e.g. `broadcast/diagnostics` finding above IS an instance of
   it: a read feeding an operator's decision, not a mutation, still leaking cross-org data).

## Relational integrity

This is primarily a read-hardening stage; composite FKs were **not** added merely because a read
joins two tables. One live **write** path was found and evaluated per the standing doctrine:
`registerGameVideoFromExistingAsset` (`vision-loader.ts`) — previously fully unscoped, could attach
a `GameVideo` to any organization's `Fixture`/`MediaAsset`.

**Composite tenant-aware FKs added — 2 relations**, the anchor point for the entire vision domain
(every other vision model hangs off `GameVideo`):

```
GameVideo.fixtureId    -> Fixture(organizationId, id)     ON DELETE CASCADE   (required)
GameVideo.mediaAssetId -> MediaAsset(organizationId, id)  ON DELETE RESTRICT  (required, 1:1)
```

2 parent tables gained `@@unique([organizationId, id])`: `Fixture`, `MediaAsset`.
`GameVideo` gained `@@unique([organizationId, mediaAssetId])` (a mechanical Prisma requirement for
the composite 1:1 relation — `mediaAssetId`'s own bare `@unique` already guarantees the real
cardinality). `GameVideo.gameId` (optional, `ON DELETE SET NULL`) stays a simple FK — the same
Prisma/Postgres composite-FK-plus-SetNull-on-a-NOT-NULL-`organizationId` incompatibility Stage
5.2B-3 first documented.

**Deliberately deferred, application-guard-only** (via this stage's `vision-loader.ts`
conversion, which resolves every id through a scoped `tx` first): `VideoTimelineAnchor.gameVideoId`,
`VisionAnalysisRun.gameVideoId`/`.visionModelId`, `VisionObservation.analysisRunId`/`.gameVideoId`,
`VisionEventMatch.observationId`/`.gameEventId`, `CourtSpecification.venueId`,
`VisionTrajectoryArtifact.gameVideoId`/`.analysisRunId`, `VisionSpatialSummary.gameVideoId`/
`.analysisRunId` — roughly 15 more relations in this domain, named backlog for whichever future
stage next touches vision writes, same incremental-adoption reasoning as every prior stage.

**Pre-migration mismatch audit**: `GameVideo.fixtureId`/`.mediaAssetId` — zero mismatches against
production, both before and after migration (expected: production has **zero** `GameVideo` rows —
no real video has ever been registered in this environment, confirmed directly from the database,
matching the domain's own honest doc comments).

## Statistical integrity — preserved, not touched

`recalculateStandings`'s actual computation (`calculateStandings` in `standings.ts`) and its
tie-break comparator were **not modified** — only the missing `organizationId` stamp was added.
`competitiveFixtureScope()` (excludes non-`PRODUCTION` `recordOrigin` fixtures from every
season-wide aggregator) is untouched. Nothing in `why-they-won.ts`, `player-dna.ts` (Shooting DNA
suppression), `bench-spark`-style attribution, or the competition-style standings tie ranking
(`leaguePoints` → `won` → `pointDifference` → `pointsFor` → name) was altered — these are pure
functions this stage never modified, and `standings/page.tsx`'s own sort function is byte-for-byte
the same comparator, just wrapped in `withOrganizationContext`.

**Season Zero `BOX_SCORE_ONLY` limitation**: preserved exactly. No `GameEvent` rows were
fabricated for the rehearsal — sentinel `PlayerStat`/`TeamStat`/`Standing` rows were written
directly (the same shape a `CSV_IMPORT`-sourced box score already produces), not synthesized event
timelines.

## Two-tenant staging rehearsal

Against `ultraos_staging`, connected as the actual restricted role. Script:
`scripts/analytics-vision-tenancy-isolation-integration-test.ts`. Built a disposable Organization
B **and** a disposable Competition/Season/Fixture/Game under Neon Ultra itself — a brand-new
`seasonId` on both sides scopes every analytics query to only these rehearsal rows, so **no real
Season Zero data was read, aggregated, or altered** at any point. Each side's disposable game
carried a deliberately distinctive **sentinel point total** (Org A: 991, Org B: 337) so any
cross-org contamination in an aggregate would be immediately obvious rather than masked by
coincidentally-equal numbers.

**Analytics — all PASS**: Org B's `loadSeasonPlayerTotals`/`loadSeasonGameCores` returned exactly
its own sentinel (337) and its own 1 disposable game, never Org A's; the real
`recalculateStandings` recomputed Org B's own standing correctly (`won=1, pointsFor=337`); Org B's
`loadGameCore` with Org A's real `gameId` returned `null` (RLS), and the reverse held for Org A.

**Readiness — PASS**: both orgs' dashboard-style team scans (the same query shape
`dashboard/page.tsx` uses) saw exactly their own 2 `SeasonClub` rows, never the other org's.

**Vision — all PASS, both application-level and database-level**: a disposable `GameVideo` was
registered for each org; Org B's `getVisionDashboardData`/`listGameVideosForFixture`/
`getFixtureVisionWorkspaceData` all excluded Org A's video and Org A's fixture (RLS). Two
independent composite-FK denials were proven with a raw `tx.gameVideo.create()` (bypassing
`registerGameVideoFromExistingAsset`'s own application-level guard entirely, so the rejection can
only be the database constraint): `Foreign key constraint violated on the constraint:
GameVideo_organizationId_fixtureId_fkey` and `...GameVideo_organizationId_mediaAssetId_fkey`. The
application-level guard was proven separately and distinctly (`registerGameVideoFromExistingAsset`
with Org A's real `mediaAssetId` → `RecordNotFound`, the scoped `findUniqueOrThrow` firing before
any write). Zero partial writes confirmed after every failed attempt (each ran in its own
transaction — Postgres aborts an entire transaction on the first failed statement, so multiple
negative tests cannot safely share one transaction; a first draft of this rehearsal discovered
that the hard way and was corrected before being trusted).

**Database-level privileged-role proof**: script `scripts/verify-5-2c-privileged-fk.ts`, connected
as the `ultraos` role on `ultraos_staging`, confirmed `rolsuper=true, rolbypassrls=true` before
proceeding. Both composite FKs tested independently, each in its own fresh Organization-B fixture
built inside its own rolled-back transaction: **PASS** for both — rejected by their named
constraint (`GameVideo_organizationId_fixtureId_fkey`,
`GameVideo_organizationId_mediaAssetId_fkey`) under a role that bypasses RLS entirely. Nothing
committed; zero residue.

**Cleanup**: every sentinel fixture, disposable Organization B, and stray row was removed;
verified zero residue for `Organization`/`MediaAsset`/`Venue`/`Competition`/`User` matching the
rehearsal's naming pattern.

## Verification

```
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS
TESTS: 455/455 PASS (unchanged count — no new tests added this stage)
LOCAL_BUILD: PASS
```

Deployed to production: fresh verified backup
(`ultraleagueos-pre-phase1-stage5-2c-20260905215617.dump`, 834,939 bytes, 1333 TOC entries),
pre-migration mismatch audit zero on both relations, migration applied inside an explicit
transaction, both composite FKs and all 3 supporting unique indexes verified from
`pg_constraint`/`pg_indexes` to match the design exactly, migration registered via `prisma migrate
resolve --applied`, code synced, `prisma generate` run, production build run with
`NODE_OPTIONS=--max-old-space-size=4096` applied proactively from the first attempt (per the
Stage 5.2B-3/5.2B-4 precedent — no OOM this time), `ultraos-web.service` restarted (systemd, NOT
pm2), smoke-tested, journalctl checked, post-migration mismatch audit re-run (zero), production
row counts and standings/top-scorer snapshot re-captured and confirmed unchanged.

## Known remaining gaps

- `data-hygiene.ts`/`data-readiness/export/route.ts` — platform-wide unscoped diagnostic and its
  CSV export; classified `PLATFORM_GLOBAL_INTENTIONAL` but the `data:readiness` permission's real
  restriction to platform-level admins was not independently verified this stage.
- `gameday/page.tsx` — a dozen bare `prisma.*` reads (season, fixtures, incidents, one `Event`
  banner) beyond the one `buildSystemHealth` call site fixed for compilation; Stage 5.2A's domain,
  named not expanded into.
- The other ~15 `TENANT_TO_TENANT` relations in the vision domain (`VideoTimelineAnchor`,
  `VisionAnalysisRun`, `VisionObservation`, `VisionEventMatch`, `CourtSpecification`,
  `VisionTrajectoryArtifact`, `VisionSpatialSummary`'s own relations) remain application-guard-only,
  an explicit named backlog.
- `VisionModel.key`'s global uniqueness is a deliberate design choice (like `Sport`), not
  independently re-verified against any written design document.
- No real `GameVideo`/vision data exists in production — every vision-domain proof in this stage is
  a **tenancy** proof using disposable fixtures, not an empirical accuracy validation. Consistent
  with the domain's own pre-existing honesty doctrine (see `VISION_EMPIRICAL_ACCURACY` in the final
  gate below).
- `PromoCode.code` global uniqueness (Stage 5.2B-4) and the `/vendors`/`/orders`/`/events/new`
  anonymous-500 backlog item remain untouched, exactly as their own stages left them — not
  rediscovered or silently resolved here.

## Final gate

```
STAGE_5_2C

AUTHENTICATED_ANALYTICS_SURFACES: PASS
AUTH_ORG_SOURCE: SERVER_DERIVED
CLIENT_ORG_ID_TRUSTED: NO
EXPLICIT_TENANT_CONTEXT: PASS
GLOBAL_PRISMA_ESCAPE_IN_CONVERTED_HELPERS: 0
READ_DECISION_MUTATION_TRACING: PASS (broadcast/diagnostics's selectedGameId finding is a direct
  instance of this doctrine applied, not just repeated as a slogan)

----------------------------------------------------------------------
ANALYTICS
----------------------------------------------------------------------
GAME_ANALYTICS: PASS
PLAYER_ANALYTICS: PASS
TEAM_CLUB_ANALYTICS: PASS
STANDINGS: PASS
RANKINGS_LEADERBOARDS: PASS
SEASON_DIVISION_ANALYTICS: PASS
READINESS_DATA_QUALITY: PASS (dashboard.page.tsx; data-hygiene.ts/data-readiness remain named
  PLATFORM_GLOBAL_INTENTIONAL, not fixed)
AGGREGATE_INPUT_TENANCY: PASS
JOIN_INPUT_TENANCY: PASS
RAW_SQL_TENANCY: NONE_PRESENT (no raw analytical $queryRaw found in the converted surfaces; the
  events/[id]/debrief CheckIn count from Stage 5.2B-4 already carries an explicit organizationId
  filter)

----------------------------------------------------------------------
EXPORTS / CACHES
----------------------------------------------------------------------
CSV_EXPORTS: PASS_WITH_NAMED_EXCEPTION (applications/tryouts exports verified already-safe;
  data-readiness/export is unscoped by design - see Known remaining gaps)
JSON_EXPORTS: PASS (vision evaluation dataset export)
PDF_REPORTS: NOT_PRESENT
ANALYTICS_CACHE_TENANCY: NONE_PRESENT (no unstable_cache/React cache/Redis found wrapping any
  tenant-owned analytics query)
PERSISTED_ANALYTICS_GENERATION: PASS (Standing, via the fixed recalculateStandings)
PERSISTED_ANALYTICS_RETRIEVAL: PASS

----------------------------------------------------------------------
VISION
----------------------------------------------------------------------
GAMEVIDEO_READ_TENANCY: PASS
GAMEVIDEO_WRITE_TENANCY: PASS
COURT_SPECIFICATION_TENANCY: PASS (application-level; not composite-FK-hardened this stage)
CALIBRATION_TENANCY: PASS (application-level; CourtCalibration has zero production rows)
VISION_ARTIFACT_TENANCY: PASS (application-level; VisionTrajectoryArtifact has zero production
  rows - "no raw trajectory data has ever been generated," per the domain's own doc comments)
FAILURE_GALLERY_TENANCY: PASS
VISION_EVALUATION_EXPORT: PASS
VISION_EMPIRICAL_ACCURACY: NOT_TESTED (no real video/vision data exists in this environment;
  this stage proves tenancy isolation only, never basketball/vision accuracy)
FABRICATED_VISION_DATA: NO

----------------------------------------------------------------------
TWO-TENANT PROOF
----------------------------------------------------------------------
ORG_B_LEADERBOARD_EXCLUDES_ORG_A: PASS
ORG_B_STANDINGS_EXCLUDE_ORG_A: PASS
ORG_B_TEAM_ANALYTICS_EXCLUDE_ORG_A: PASS
ORG_B_GAME_WITH_ORG_A_GAME_ID: DENIED
ORG_B_PLAYER_WITH_ORG_A_PLAYER_ID: DENIED (proven via loadSeasonPlayerTotals scoping - a foreign
  playerId simply never appears in Org B's own scoped result set)
ORG_B_FILTER_WITH_ORG_A_SEASON_ID: DENIED (Org B's own disposable seasonId used throughout;
  Org A's real seasonId returns Org A's own data only when queried under Org A's own context -
  cross-context substitution denied by RLS, proven via loadGameCore/loadSeasonPlayerTotals)
ORG_B_EXPORT_CONTAINS_ORG_A_ROWS: 0 (applications/tryouts exports; data-readiness export
  NOT_TESTED for cross-org content, since it's classified platform-global)
ORG_B_READINESS_AFFECTED_BY_ORG_A: NO
ORG_B_VISION_LIST_EXPOSES_ORG_A: NO
ORG_B_VISION_DETAIL_WITH_ORG_A_ID: DENIED

----------------------------------------------------------------------
RELATIONAL INTEGRITY
----------------------------------------------------------------------
NEW_WRITE_PATH_TENANT_RELATIONS: 2
PRE_MIGRATION_RELATION_MISMATCHES: 0
NEW_COMPOSITE_FKS:
  - GameVideo.fixtureId -> Fixture(organizationId, id)
  - GameVideo.mediaAssetId -> MediaAsset(organizationId, id)
APPLICATION_GUARD_ONLY:
  - GameVideo.gameId -> Game (nullable, ON DELETE SET NULL - Prisma/Postgres incompatibility)
  - ~15 further vision-domain relations (VideoTimelineAnchor, VisionAnalysisRun,
    VisionObservation, VisionEventMatch, CourtSpecification, VisionTrajectoryArtifact,
    VisionSpatialSummary) - named backlog, not hardened this stage
PRIVILEGED_CROSS_ORG_WRITE_PROOF: PASS (both new composite FKs, independently, each in its own
  rolled-back transaction)

----------------------------------------------------------------------
STATISTICAL INTEGRITY
----------------------------------------------------------------------
SEASON_ZERO_ANALYTICS: UNCHANGED
WHY_THEY_WON_DIRECTIONALITY: UNCHANGED
BENCH_SPARK_ATTRIBUTION_RULE: UNCHANGED
SHOOTING_DNA_SAMPLE_THRESHOLD: UNCHANGED
COMPETITION_STYLE_TIE_RANKING: UNCHANGED
BOX_SCORE_ONLY_LIMITATION: PRESERVED
FABRICATED_GAMEEVENT_DATA: NO

----------------------------------------------------------------------
CLASSIFICATION
----------------------------------------------------------------------
PUBLIC_ANALYTICS_READS: DEFER_5.2D
PUBLIC_STANDINGS_READS: DEFER_5.2D
PUBLIC_PLAYER_READS: DEFER_5.2D
PUBLIC_VISION_READS: NONE (no public vision surface exists)
PLATFORM_GLOBAL_INTENTIONAL:
  - VisionModel.key (model identity/version, analogous to Sport)
  - data-hygiene.ts / data-readiness/export/route.ts (platform-wide diagnostic; permission
    restriction not independently verified - see Known remaining gaps)
HISTORICAL_SCRIPTS: NAMED (g16-g20-rehearsal.ts, g84-import-season-zero-results.ts mechanically
  patched; vision-analyze.ts is NOT historical, converted properly)
KNOWN_PROMOCODE_STRUCTURAL_LIMITATION: PRESERVED_FOR_DEDICATED_STAGE
KNOWN_ANONYMOUS_ADMIN_500_BACKLOG: PRESERVED
WHOLE_REPOSITORY_SCAN: PASS_WITH_NAMED_DEFERRED_EXCEPTIONS
UNCLASSIFIED_LIVE_CALL_SITES: 0
BLOCKING_UNKNOWN: 0

----------------------------------------------------------------------
REHEARSAL
----------------------------------------------------------------------
STAGING_BACKUP: VERIFIED
ORG_B_ANALYTICS_REHEARSAL: PASS
DISTINCTIVE_SENTINEL_TESTS: PASS (Org A=991, Org B=337 points)
VISION_TENANCY_REHEARSAL: PASS
REHEARSAL_CLEANUP: PASS
STAGING_RESIDUE: 0

----------------------------------------------------------------------
LOCAL VERIFICATION
----------------------------------------------------------------------
PRISMA_VALIDATE: PASS
PRISMA_GENERATE: PASS
TSC: PASS
LINT: PASS
TESTS: 455/455 PASS
LOCAL_BUILD: PASS

----------------------------------------------------------------------
PRODUCTION
----------------------------------------------------------------------
PRODUCTION_BACKUP: VERIFIED
PRODUCTION_MIGRATION: PASS
PRODUCTION_BUILD: PASS
PRODUCTION_BUILD_NODE_HEAP: 4096MB (applied proactively from the first attempt; no OOM)
PRODUCTION_SERVICE: ultraos-web.service ACTIVE
PRODUCTION_SMOKE_TESTS: PASS
PRODUCTION_JOURNAL: CLEAN
PRODUCTION_ANALYTICS_INVARIANTS: UNCHANGED
PRODUCTION_STATISTICAL_OUTPUTS: UNCHANGED
PRODUCTION_TENANT_ISOLATION: VERIFIED

FINAL_STAGE_STATUS: CLOSED
```

## Next

The vision domain's ~15-relation composite-FK backlog and the `data-readiness/export`
platform-global determination (not independently re-verified) are the two most concrete
follow-up items for whichever stage next touches this domain. Stage 5.2D (public/API reads) is
next in the established sequencing.
