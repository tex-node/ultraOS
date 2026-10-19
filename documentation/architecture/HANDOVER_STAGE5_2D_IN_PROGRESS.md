# Handover — Phase 1, Stage 5.2D (Public/API Read Tenancy) — IN PROGRESS, NOT DEPLOYED

Written mid-stage for a continuing agent. Stages 0–4c, 5.1–5.4B, 5.2B-3, 5.2B-4, 5.2C are
**complete and deployed to production**. Stage 5.2D (this one) is **partially converted, not
rehearsed, not deployed**. Do not report it closed. Read this whole file before touching
anything — it captures decisions made this session that are not yet written into any doc.

## What Stage 5.2D is

Full spec was pasted by the user verbatim (67 sections) — re-read it from the conversation history
if available; if not, the essential shape is: **prove the PUBLIC-facing (unauthenticated) side of
the site can support multiple organizations** — public clubs/players/standings/schedules/draft/
events, public API (`api/v1/*`, `api/share/*`, `api/public/*`), metadata, sitemap/feeds, search,
caches, exports — using the same doctrine as every prior stage (server-derived tenant, never
client-supplied, IDs are selectors not authorization), plus one **explicit, mandatory
verification task**: confirm whether an organization-level admin can access the platform-global
`data-readiness/export` route (Stage 5.2C flagged this as unverified, not yet confirmed either
way).

## Baseline before this stage started

- `git status --short` in repo root: ~190 modified/untracked files (cumulative, uncommitted,
  since Stage 0 — this whole Phase 1 effort has never been committed; that is normal for this
  project, not a mistake to fix).
- `npx tsc --noEmit -p .` (run from `web/`): clean.
- Tests: 455/455 (unchanged since 5.2B-3).
- Last deployed migration: `20260905120000_phase1_stage5_2c_gamevideo_tenant_fk` (production and
  staging both have it applied and verified).
- 18 composite tenant-aware FK relations hardened since Stage 5.4B (3 SeasonClub + 5 Draft + 8
  Vendor/Event/Reservation + 2 GameVideo).

## What has actually been done this session for 5.2D (uncommitted, unverified beyond tsc)

**New helper added** — `web/src/lib/tenant-context.ts`, function `resolveDefaultPublicOrganization()`:
resolves Neon Ultra by its real slug (`"neon-ultra"`) via the existing 5.2B-1
`resolveActiveOrganizationBySlug()` mechanism. This is the **Pattern D** (INTENTIONAL_NEON_ULTRA_DEFAULT)
building block — every public LIST page (no resource ID in the URL) that used to run on the bare
`prisma` client (and "worked" only via RLS's unset-context Neon-Ultra fallback) should call this,
then wrap its reads in `withOrganizationContext(organization.id, ...)`. Read this function's own
doc comment in the file — it explains the reasoning fully.

**Files converted so far** (Pattern D for list pages, Pattern B for detail pages):
- `web/src/app/public/clubs/page.tsx` — Pattern D, done.
- `web/src/app/public/clubs/[id]/page.tsx` — Pattern B (resolve `Club.id` on the bare client,
  since cuids are globally unique and safe to look up without context; then thread
  `organizationId` through 3 nested async components — `TeamDnaSection`, `SimilarTeams`,
  `TeamGameLogSection` — each wrapping its own `withOrganizationContext` call). Done, tsc clean.
- `web/src/app/public/players/page.tsx` — Pattern D, done.
- `web/src/app/public/players/[id]/page.tsx` — Pattern B, same threading approach through 4
  nested components (`BestGameSection`, `PlayerDnaSection`, `MilestonesSection`,
  `GameLogSection`). Done, tsc clean.

**tsc is clean as of the last check** (ran immediately after the players/[id] conversion).
**Lint, tests, and build have NOT been re-run since these edits.** Do that before going further.

## NOT yet started (the bulk of the stage)

Public pages under `web/src/app/public/` still on the bare client / unconverted:
- `fixtures/page.tsx`, `fixtures/[id]/page.tsx`
- `standings/page.tsx` (note: `web/src/app/standings/page.tsx` at the ROOT, i.e. the
  *authenticated* one, was already converted in Stage 5.2C — do not confuse the two; this is
  `public/standings/page.tsx`, a different, public-only page)
- `stats/page.tsx`, `stats/players/page.tsx`, `stats/records/page.tsx`,
  `stats/compare/players/page.tsx`, `stats/compare/teams/page.tsx`
- `share/game/[id]/page.tsx`, `share/player/[id]/page.tsx`, `share/team/[id]/page.tsx`,
  `share/record/[key]/page.tsx` — **each of these has a `generateMetadata` export that must be
  audited too, separately from the page body** (metadata can leak cross-tenant names/scores even
  if the page itself later 404s — this is section 29's explicit concern, not yet checked at all
  for these 4 files)
- `events/page.tsx`, `events/[id]/page.tsx` (events/actions.ts's `reserveZone` was already
  converted in 5.2B-4 — that part is done; only the page reads are outstanding)
- `orders/[code]/page.tsx`, `tickets/[code]/page.tsx` — these are ALREADY_TENANT_SAFE via the
  opaque-token pattern (verified in 5.2B-4), just confirm and classify, no code change expected
- `celebrations/page.tsx`, `celebrations/actions.ts`
- `page.tsx` (the `/public` root/landing page)

API routes under `web/src/app/api/` — **confirmed via this session's own audit that every one of
these except `api/v1/broadcast/games/[id]` and `api/vision/games/[gameVideoId]/export` (both
already authenticated+converted) has NO auth check at all** — genuinely public, all unconverted:
```
api/broadcast/games/[gameId]/route.ts        api/broadcast/program/route.ts
api/games/[id]/route.ts                       api/games/[id]/box-score/route.ts
api/games/[id]/data-capabilities/route.ts     api/games/[id]/snapshot/route.ts
api/games/[id]/snapshot-v2/route.ts           api/content/[kind]/[id]/route.ts
api/draft-events/[draftEventId]/state/route.ts
api/public/coaches/[ultraStaffId]/route.ts    api/public/players/[ultraAthleteId]/route.ts
api/qr/[code]/route.ts                        api/sponsor-impressions/[id]/route.ts
api/share/game/[id]/route.ts                  api/share/player/[id]/route.ts
api/share/record/[key]/route.ts               api/share/team/[id]/route.ts
api/v1/clubs/[publicId]/route.ts              api/v1/games/[publicId]/route.ts
api/v1/games/[publicId]/box-score/route.ts    api/v1/games/[publicId]/events/route.ts
api/v1/games/[publicId]/snapshot/route.ts     api/v1/players/[publicId]/route.ts
api/v1/seasons/[publicId]/leaders/route.ts    api/v1/seasons/[publicId]/standings/route.ts
api/v1/live/route.ts
```
None of these have been converted or even individually re-confirmed this session (only spot-checked
for auth presence via one grep pass). The central resolution library for the `api/v1/*` layer is
`web/src/lib/api-v1/identifiers.ts` (`resolveClubByPublicId`, `resolvePlayerByPublicId`,
`resolveSeasonByPublicId`, `resolvePlayerNames`, `resolveFixtureByPublicId`) — **entirely bare
`prisma`, not touched yet**.

## Real findings made this session — do not lose these

1. **`Club.shortName`-based public lookup (`api/v1/clubs/[publicId]`) is genuinely,
   confirmedly ambiguous across organizations.** `Club` has `@@unique([organizationId, shortName])`
   (Stage 3b) — two orgs CAN legitimately have a club with the identical shortName (e.g. both
   "APEX"). `resolveClubByPublicId()` in `identifiers.ts` does an unscoped `findMany()` scan and
   returns the first case-insensitive match, **platform-wide, with no tenant dimension in the
   URL at all**. Today (one org) this is invisible; the moment a second org creates a
   same-shortName club, `/api/v1/clubs/<shortName>` becomes ambiguous — it will resolve
   whichever org's club happens to match first, silently, not necessarily the caller's intended
   one. **This is a real structural finding matching section 42's "Route Collision" concern and
   section 57 stop condition #2.** Recommended treatment: classify as `BLOCKING_UNKNOWN` or a
   named dedicated-backlog item (parallel to `PromoCode.code`) — do NOT silently disambiguate by
   guessing, and do NOT restore global uniqueness. This finding was made but **not yet written
   into any doc or reported to the user** — surface it prominently.

2. **A deeper, more important architectural finding: the "Pattern B" resource-derived tenant
   bootstrap (resolve `record.organizationId` via a bare, context-less lookup, then enter
   `withOrganizationContext`) does NOT actually work for a genuinely non-Neon-Ultra
   organization's resource, because that bare bootstrap lookup is ITSELF subject to RLS's
   unset-context-falls-back-to-Neon-Ultra policy.** Concretely: if `Club.id` belongs to Org B (not
   Neon Ultra), a bare `prisma.club.findUnique({where:{id}})` with no transaction/context set will
   be filtered by RLS's `organizationId = COALESCE(current_setting(...), '<neon-ultra-id>')`
   policy — Org B's row does NOT match `'<neon-ultra-id>'`, so the row is **invisible**, and the
   lookup returns `null` even though the club genuinely exists. This affects EVERY "Pattern B"
   conversion done in this stage AND in prior stages (5.2B-4's `reserveZone`/`createWalletOrder`
   bootstrap lookups, 5.2C's `vision-analyze.ts` bootstrap lookup) — none of them were wrong to
   write this way at the time (only one org exists, so it "works"), but **none of them will
   correctly serve a second organization's public resource until the Neon Ultra RLS bridge itself
   is retired (Stage 5.5) or a different bootstrap mechanism is introduced**. Consequence
   direction is safe (fails closed — "not found" — not a cross-tenant leak), so this is not a
   security defect, but it IS a real capability gap that should be reported honestly rather than
   claimed as "Pattern B fully supports multi-org today." **This was reasoned through carefully
   this session and is not yet written into any doc.** The final Stage 5.2D report must be
   explicit about this rather than claiming full multi-org Pattern B support. Do not attempt to
   fix the underlying RLS-bridge architecture as part of closing 5.2D — that is Stage 5.5's job;
   just document the constraint precisely, the same way `PromoCode.code`'s global uniqueness is
   tracked.

3. **The Stage 5.2C-flagged `data-readiness/export` permission question has been analyzed (via
   code reading, NOT yet via an actual staging rehearsal proof) with a preliminary but fairly
   confident conclusion of YES — a genuine defect.** `hasPermission()` in
   `web/src/lib/permissions.ts` (line ~274) checks ONLY the role NAME (`SUPER_ADMIN`,
   `LEAGUE_OPERATOR`, etc.) against a static per-role permission set — it has **no concept of
   which organization a role grant belongs to**. Since `data:readiness` is granted to both
   `SUPER_ADMIN` and `LEAGUE_OPERATOR` roles (confirmed at lines ~137, ~199 of that file), and role
   grants themselves ARE per-organization (`UserRoleAssignment.organizationId`, Stage 5.1), **any
   organization's own LEAGUE_OPERATOR/SUPER_ADMIN-equivalent admin has the `data:readiness`
   permission and can hit `/data-readiness/export`**. What that export actually shows them is a
   separate question — `auditRealData()` (`data-hygiene.ts`) itself runs on the bare `prisma`
   client, so it is ALSO subject to the same RLS Neon-Ultra-fallback described in finding #2 above
   — meaning today it would show them **Neon Ultra's** data-hygiene diagnostic specifically (not
   "all organizations blended," and not their own org's data) regardless of which org they
   actually belong to. **This is still a cross-tenant information disclosure** (Org B's admin
   seeing Neon Ultra's operational diagnostic, a different organization's data) even though it
   isn't "all orgs at once." This reasoning has NOT been verified empirically against staging (no
   rehearsal script exists yet to prove it with a real disposable Org B admin user) — **do that
   before writing `DATA_READINESS_EXPORT_PLATFORM_ADMIN_GATE: FAILED` into the final gate as a
   proven fact rather than a code-reading inference.** Per the spec's own explicit instruction:
   report this and STOP — do not attempt to redesign the global diagnostic's access architecture
   as part of closing 5.2D.

4. **No sitemap, no RSS/Atom/JSON feed routes, no `generateStaticParams`, no `unstable_cache`
   anywhere in the app** — confirmed via repo-wide grep. So in the final gate: `SITEMAP:
   NOT_PRESENT`, `FEEDS: NOT_PRESENT`, `STATIC_GENERATION: NOT_PRESENT`, `PUBLIC_CACHE_TENANCY:
   NONE_PRESENT`. No further investigation needed on these four axes — don't re-derive, just cite
   this.
5. **No dedicated public search/autocomplete feature exists** — the "search" hits in
   `public/stats/compare/*` and `public/stats/players/page.tsx` are just literal UI copy (a
   player-picker for comparison), not a real search endpoint. `PUBLIC_SEARCH: NOT_PRESENT`.
6. **Every public page found so far uses `export const dynamic = "force-dynamic"`** — no ISR, no
   static generation risk anywhere in the pages actually read this session.

## Established conversion patterns to keep using (do not reinvent)

- **Pattern D (list pages, no resource ID)**: `const organization = await
  resolveDefaultPublicOrganization(); const rows = await withOrganizationContext(organization.id,
  (tx) => tx.model.findMany(...));`
- **Pattern B (detail pages, resource ID in the URL)**: resolve the record by its cuid `id` on the
  bare `prisma` client (safe — cuids are globally unique, no cross-org ambiguity in WHICH row is
  found, only in whether RLS's fallback can SEE a non-Neon-Ultra row — see finding #2), pull out
  `.organizationId`, `notFound()` if null, then thread that `organizationId` as a prop into every
  nested async server component and wrap each one's own reads in its own
  `withOrganizationContext(organizationId, ...)` call. This matches exactly what was done for
  `game-analytics.ts`'s shimmed functions (`loadGameCore(id, tx)`, `loadSeasonPlayerTotals(seasonId,
  tx)`, etc. — pass `tx` as the second arg once inside a `withOrganizationContext` callback).
- **Pattern C (opaque token)**: already established in 5.2B-4 (`Ticket.code`, `Order.collectionCode`)
  — resolve by the globally-unique token on the bare client, pull `.organizationId`, enter scoped
  context for everything else. `public/orders/[code]/page.tsx` and `public/tickets/[code]/page.tsx`
  need to be **checked against this pattern**, not necessarily rewritten (5.2B-4 already reasoned
  these are safe reads via the token itself).

## Known backlog items from prior stages — do not rediscover, just carry forward

- `PromoCode.code` global uniqueness — dedicated future stage, not touched.
- `/vendors`, `/orders`, `/events/new` anonymous 500 — auth-boundary cleanup backlog, not touched.
- `DraftCoachPoolEntry`'s 3 relations, 16 other Draft-domain relations, ~15 Vision-domain
  relations — all application-guard-only composite-FK backlog, not touched.
- `data-hygiene.ts` / `data-readiness/export` — see finding #3 above, this stage's job is to
  actually VERIFY the permission question, not just re-carry the "unverified" label forward again.

## Credentials / environment (repeated for convenience, unchanged from prior stages)

- SSH host alias: `raivstream`. Production `DATABASE_URL` role: `ultraos_app` (`NOSUPERUSER
  NOBYPASSRLS`). Privileged/migration role: `ultraos` — password
  `hLjEn8mlLBzE439L0JOL8PhpAsqXXL6XYJ3G8HN6` — works against BOTH `ultraleagueos` (prod) and
  `ultraos_staging` (same Postgres cluster, port 55411, host 127.0.0.1) — confirmed
  `rolsuper=true, rolbypassrls=true` on both.
- Staging restricted-role credentials: `/opt/ultraleagueos/shared/staging-maintenance.env` on the
  server (durable, do not reset).
- Production restricted-role password for read-only checks:
  `9wMTs0MWZej0mVCIhUFCn2fybuvB3VLD` (role `ultraos_app`).
- Neon Ultra's real organization id: `cmt4odhgn0000wokk8fbwr6ro`, slug `neon-ultra`.
- Production deploy target: `/opt/ultraleagueos/current/web` (rsync/tar-pipe in place, NOT a
  symlinked release directory — confirmed this session's predecessor already established this).
  Staging rehearsal convention: `/opt/ultraleagueos/shared/rehearsal-stage5-2X/web`, node_modules
  symlinked from `/opt/ultraleagueos/current/web/node_modules`, own `prisma generate` run there.
- Production service: **systemd `ultraos-web.service`, port 4110 — NEVER pm2.**
- Production builds on this host can OOM under memory pressure from unrelated services sharing
  the box — **always pass `NODE_OPTIONS=--max-old-space-size=4096` proactively** on both the
  staging rehearsal build (if one is ever done) and the production build. Confirmed this avoids
  the OOM every time it's applied from the first attempt.
- Backup directories on the server: `/var/backups/ultraleagueos-production/` (prod dumps),
  `/var/backups/ultraleagueos-staging/` (staging dumps) — **note prior confusion**: it is easy to
  accidentally write a production backup into the staging directory by habit; always `ls` and
  `mv` to correct if so, as was done this session.
- A previous rehearsal script bug (Stage 5.2C) discovered and fixed: **a failed statement aborts
  the ENTIRE Postgres transaction (`25P02`)** — never bundle multiple deliberately-failing
  negative-test attempts inside one shared `withOrganizationContext`/transaction in any rehearsal
  script; give each its own. Also: a bare `@unique` field will throw a misleading "Unique
  constraint failed" instead of the intended FK violation if a rehearsal script accidentally
  reuses an id already consumed elsewhere — always mint a fresh id per negative test.
- Memory files to read for full continuity:
  `C:\Users\XPS\.claude\projects\C--UltraLeagueOS\memory\project_phase1_multitenancy_status.md`
  (very long, has a dedicated section per stage) and `MEMORY.md` (the index).
- Full prior-stage docs live in `documentation/architecture/PHASE1_STAGE5_*.md` — read the 5.2C
  one most recently for the closest-precedent format and gate template to follow when 5.2D's own
  doc gets written (`documentation/architecture/PHASE1_STAGE5_2D_PUBLIC_API_READ_TENANCY.md`,
  not yet created).

## Suggested next steps, in order

1. Convert the remaining `public/` pages using the established patterns (fixtures, standings,
   stats/*, share/* — including their `generateMetadata` exports — events, celebrations, root
   `/public`).
2. Convert `web/src/lib/api-v1/identifiers.ts` and every `api/v1/*` route that uses it — decide
   and document the `Club.shortName` ambiguity finding as its own named limitation before writing
   the final gate; do not silently fix it.
3. Convert or classify every remaining bare-auth `api/*` route (see list above).
4. Build a real staging rehearsal (disposable Org B, sentinel values per the spec's section 46,
   e.g. Org A score=91 vs Org B score=37) that empirically proves — not just reasons through —
   the `data-readiness/export` permission finding, plus the standard Pattern D/B/C isolation
   proofs the spec's section 45 requires.
5. Run local verification (`prisma validate/generate`, `tsc`, `lint`, `npm test`, `npm run build`)
   — none of this has been re-run since the edits in this file's "What has actually been done"
   section.
6. Only if a genuine schema change is required (unlikely — this is a read-hardening stage per the
   spec's own section 50) write a migration; otherwise none is needed.
7. Deploy following the established 2-tenant-then-production sequence, write the doc, update
   memory, report the final gate — being precise per the spec's section 65 about NOT_PRESENT vs
   PASS, and about the two architectural findings (#1 Club.shortName ambiguity, #2 Pattern-B
   RLS-fallback-bootstrap limitation) not being silently resolved into false PASS claims.
