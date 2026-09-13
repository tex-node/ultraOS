# Ultra Sports League Operating System

## Project Report

**Report date:** September 2, 2026  
**Primary league:** Neon Ultra Basketball League  
**Target operating event:** Season Zero  
**Production URL:** https://app.neonultra.ng  
**Repository:** https://github.com/tex-node/ultraOS  
**Local workspace:** `C:\UltraLeagueOS`  
**Latest verified engineering record reviewed:** `session.md`, through August 23, 2026  
**Multi-sport planning baseline:** September 13, 2026

## Executive Summary

Ultra Sports League Operating System has moved from an interactive UI prototype into a real full-stack league operations platform. The system now includes PostgreSQL persistence, Prisma schema/migrations, authentication, multi-role authorization, application intake, participant internalization, permanent Athlete and Club identity models, SeasonClub registrations, draft preparation, live scoring, standings, public pages, event operations, media handling, content generation, broadcast surfaces, documentation, and a multi-tenancy foundation.

The public production app has been deployed at `https://app.neonultra.ng`. A separate isolated staging environment exists on the VPS under `/opt/ultraos-staging`, with its own database, service, backups, and media/import directories.

The most important current blocker for the full Draft Day rehearsal is not a code issue: approved coaches still require explicit administrator Season Zero selection and division classification before Staff provisioning and coach pool creation can safely continue.

## Current System Status

| Area | Status |
| --- | --- |
| Production deployment | Deployed |
| Staging environment | Active and isolated |
| Authentication | Implemented |
| Google OAuth | Implemented, provider/session verification still noted |
| Multi-role authorization | Implemented |
| Fan signup | Implemented |
| Role-specific applications | Implemented |
| Admin application review | Implemented |
| Application export and bulk email | Implemented |
| Permanent Athlete model | Implemented |
| Permanent Club + SeasonClub model | Implemented |
| Selected Season Zero player cohort | Internalized on staging |
| Season Zero real clubs | Created on staging |
| Club logos | Ingested on staging through MediaAsset |
| Coach onboarding | Blocked by human selection gate |
| Draft rehearsal | Not yet run |
| Multi-tenancy | Foundation implemented through Stage 5.2B-1 |
| AI vision | Architecture and validation foundation exists; real-video validation pending |

## Major Architecture Decisions

### Athlete vs Player

`Athlete` is the permanent human identity. `Player` is the athlete's season-specific registration. This preserves career history when an athlete changes clubs, divisions, or seasons.

### Club vs SeasonClub

`Club` is the permanent brand identity. `SeasonClub` is the club's participation in a specific season and division. Competitive records use `SeasonClub`; branding and long-term history use `Club`.

### Sport, Competition, Division

The platform added `Sport`, `Competition`, and `Division` early so Season Zero can be basketball-first without hardcoding the system into basketball-only assumptions.

### Fixture vs Game

`Fixture` represents the scheduled match. `Game` represents the live or played instance. This keeps postponements, cancellations, reschedules, and live scoring cleaner.

### User and Roles

`User` is the login identity. Role-specific capabilities are represented through multi-role assignments rather than one limiting role field. Every authenticated user retains fan capabilities by default.

### Organization Tenancy

The platform is being retrofitted for organization-based multi-tenancy, using PostgreSQL Row-Level Security and `organizationId` scoping across tenant-owned tables.

## Multi-Sport Direction

The platform is extending from basketball-first into a multi-sport league operating system covering volleyball, tennis, football, cricket, and other sports. The target model, migration sequence, and capability matrix are defined in `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`; staged delivery is tracked in `documentation/MULTI_SPORT_ROADMAP.md`. That architecture document is the single agreed reference until superseded.

Three foundational decisions are fixed for the design:

1. **Competing entities.** Individual sports (for example tennis) compete as individuals or teams of people; Clubs are not standard in those sports. The model therefore introduces an explicit Entrant abstraction rather than forcing every sport to reuse `SeasonClub`.
2. **Statistics.** One flexible, metric-and-definition stat model is used for all sports, rather than per-sport stat tables.
3. **Sport definitions.** A code registry of sport definitions is the authority, with database-backed configuration overriding declared defaults.

`documentation/architecture/MULTI_SPORT_ARCHITECTURE.md` was accepted as the single agreed reference on September 13, 2026 (Gate G0). The five open questions (fixture generation, tennis format, cricket granularity, volleyball standings basis, definition-version retention) are resolved in its Section 9. Stage 1 of the migration sequence is now unblocked; progress is tracked in `documentation/MULTI_SPORT_ROADMAP.md`.

## Repository Hygiene Note

Unrelated product documents that did not describe the league operating system were removed from the repository on September 13, 2026: the root `NORTH_STAR.md`, `VISION.md`, and `PRODUCT_PHILOSOPHY.md` (a separate AI-storytelling product), and the `documentation/reference/` set describing an unrelated show-rundown/production-planning product. The repository now describes one product.

## Completed Work

### 1. Initial UI Prototype

- Built the original dark-mode Ultra Basketball UI.
- Added dashboard, clubs, players, draft, fixtures, live scoring, scoreboard, standings, match reports, and public-style views.
- Deployed the early UI to `https://app.neonultra.ng`.
- Preserved existing VPS files and Caddy sites during deployment.

### 2. Full-Stack Foundation

- Added Next.js/TypeScript application structure under `web`.
- Added Prisma and PostgreSQL.
- Added seed/system setup.
- Added authentication and authorization foundations.
- Added server-enforced permission checks.
- Added protected admin routes and public routes.

### 3. Authentication and Applications

- Added login, signup, and forgot-password entry points.
- Renamed fan signup entry points to simpler public "Signup" language.
- Added public fan signup at `/signup`.
- Added participant application hub at `/apply`.
- Added role-specific application flows for player, coach, scout, official, vendor, media, and volunteer.
- Enforced unique email to reduce duplicate accounts.
- Added Google signup/sign-in support.
- Added multi-role user model support through `UserRoleAssignment`.
- Added My Account-style account capability planning and profile linkage.

### 4. Application Review, Export, and Email

- Added admin review pages for applications.
- Added application category summaries.
- Added counts by application status and category.
- Added player gender counts and similar operational summaries.
- Added Excel export for player, coach, vendor, and scout data.
- Added bulk email capability.
- Added email status filtering: all, approved, rejected, submitted.
- Added personalized email tag replacement for recipient names.
- Improved bulk email behavior so one invalid recipient does not hide the status of the rest of the batch.

### 5. Player Application Improvements

- Updated player form fields and mandatory markers.
- Added gender dropdown.
- Added height and wingspan in feet.
- Added Nigerian state/city selection.
- Added position dropdown.
- Added academy/team field.
- Added profile picture upload with description: basketball picture or profile photo.
- Added two optional text fields for YouTube/Facebook previous appearance or reels links.
- Added upload validation protection against script injection and invalid image uploads.

### 6. Staff, Coach, Scout, and Media Uploads

- Added profile photo upload support for player, coach, and scout application pages.
- Added coach form descriptions for experience and division examples.
- Added Staff-to-User linkage support.
- Added media validation for JPG, PNG, and WebP uploads.
- Rejected unsafe formats such as SVG/script uploads.
- Preserved old media history when primary media is replaced.

### 7. Tier 1 League Operations

- Implemented or scaffolded the core Tier 1 modules: Clubs CRUD, Athletes and Players CRUD, Draft Room, Fixture management, Live Game Center, Scoreboard display, Standings recalculation, and public club, fixture, player, and standings pages.
- Ensured operational screens use `SeasonClub` for competitive participation.

### 8. Event Operations Module

- Added event operations concepts and models for seat zones, reservations, tickets, QR flow, fan check-in, vendors, vendor products, inventory, orders, order items, promo codes, and sponsor campaign concepts.
- Kept individual seat mapping, payments, ticketing expansion, and advanced commerce workflows out of the early operational scope.

### 9. Content Engine

- Added template-driven content generation without AI generation.
- Added content templates, content assets, and content jobs.
- Supported draft announcements, fixture announcements, result announcements, MVP announcements, standings updates, and sponsor reports.
- Added export support for text, HTML, PNG graphic data, and PDF-oriented workflows.
- Added graphic data API concepts for later use by Canva, Photoshop templates, LED displays, and social graphics.

### 10. Phase 1.5 Hardening

- Added audit logging concepts and implementation paths for critical actions.
- Added backup/restore procedures and staging backup discipline.
- Added operations dashboard concepts for live games, finalization queues, roster gaps, officials gaps, fixture conflicts, and standings errors.

### 11. Documentation Framework

- Created the `documentation/` structure for long-term publishing.
- Added documentation standards, templates, roadmap, index, glossary, manuals, reference sections, runbooks, training, knowledge base, diagrams, screenshots, and assets folders.
- Established documentation compatibility goals for GitHub, MkDocs, Docusaurus, GitBook, PDF, and DOCX export.
- Added canonical terminology including Athlete, Player, Club, SeasonClub, DraftEvent, Fixture, Game, Standing, Application, Staff, Vendor, Fan Club, Competition, Division, Sport, Ultra Athlete ID, and Ultra Staff ID.

### 12. Season Zero Data Quality and Participant Internalization

- Added duplicate detection and duplicate resolution workflow.
- Added tryout metadata preview/import workflow.
- Added safeguards against inferring identities from email alone.
- Added controlled internalization flow: Application, User, Athlete, Player, Ultra Athlete ID, and User roles.
- Internalized the selected Season Zero player cohort on staging.
- Preserved all application records as permanent intake history.
- Corrected Rachel John's position to power forward during cleanup.

### 13. Season Zero Clubs and Logos

- Validated authoritative club logos from `C:\UltraLeagueOS\assets\clubs`.
- Verified file existence, size, SHA-256, PNG signatures, MIME type, readability, and media pipeline compatibility.
- Created 8 real permanent Clubs and 8 SeasonClubs on staging: APEX, SURGE, VORTEX, FLUX, EMBER, HALO, ECLIPSE, and NOVA.
- Ingested 8 official club logos through `MediaAsset`.
- Generated 16 display variants.
- Kept official club colours as `NULL` because they were not formally approved.
- Added null-safe UI fallbacks so pending colours do not break public pages, scoreboard, or draft display.

### 14. Draft Personnel and Media Readiness

- Added `/draft-readiness` as a read-only admin readiness dashboard.
- Verified Season Zero player group counts:

| Group | Count |
| --- | ---: |
| Men's Squad Group 1 | 7/7 |
| Men's Squad Group 2 | 7/7 |
| Men's Squad Group 3 | 7/7 |
| Men's Squad Group 4 | 7/7 |
| Women's Squad Group 1 | 5/5 |
| Women's Squad Group 2 | 5/5 |
| Women's Squad Group 3 | 5/5 |
| Women's Squad Group 4 | 2/5 |
| Secondary draft | 13 |

- Confirmed Women's Group 4 shortfall is an accepted warning, not an automatic blocker.
- Verified coach onboarding is blocked until administrators explicitly select Season Zero coaches.

### 15. Broadcast and Live Presentation

- Added live broadcast presentation layer work across G.19 and G.20 tracks.
- Added public live data API and broadcast resilience work.
- Added broadcast command center, browser source setup, diagnostics, presentation state, graphics data contract, and external graphics data contract documentation.
- Added live game story, live game pulse, live snapshot, and canonical statistics documentation.
- Preserved the rule that live presentation facts must trace back to structured system records and not unverified generated text.

### 16. AI Vision and Court Intelligence Foundation

- Added architecture for AI vision and player intelligence while keeping AI-driven production features outside the immediate Season Zero operational path.
- Added court calibration, court specification, vision observations, event matching, trajectory artifacts, and empirical validation foundations.
- Added metrics for detection, tracking, spatial quality, four-point spatial rules, and calibration quality.
- Added privacy-safe evaluation export patterns.
- Explicitly recorded that real video validation remains blocked until real Ultra game video and official court geometry are available.

### 17. Multi-Tenancy Foundation

- Added `Organization` and organization-scoped role assignments.
- Added `organizationId` columns to tenant-scoped tables.
- Backfilled Neon Ultra Basketball League as the first organization.
- Enabled and forced Row-Level Security across tenant tables.
- Created restricted application database role for enforced RLS.
- Added tenant context helpers.
- Converted high-risk authenticated write paths to tenant context.
- Added public tenant acquisition via `/apply/[organizationSlug]`.
- Changed application provenance so downstream provisioning uses `Application.organizationId`, not the current session alone.
- Fixed `UserRoleAssignment` RLS coverage gap.
- Converted application review, export, bulk email, and live approval provisioning paths to organization-aware data access.

## Current Verified Season Zero Staging Baseline

| Metric | Value |
| --- | ---: |
| Applications | 341 |
| Approved applications | 225 |
| Approved coach applications | 8 |
| Coach applications pending Season Zero selection | 8 |
| Coaches explicitly selected | 0 |
| Permanent Clubs | 8 |
| SeasonClubs | 8 |
| Men's SeasonClubs | 4 |
| Women's SeasonClubs | 4 |
| Club logos | 8 |
| Club logo variants | 16 |
| Selected Players | 58 |
| MAIN_DRAFT Players | 45 |
| SECONDARY_DRAFT Players | 13 |
| Selected Player SeasonClub assignments | 0 |
| Official Draft allocations | 0 |
| Staff records | 0 |
| Player legacy photos | 58 |
| Player MediaAsset-backed photos | 0 |

## Environments

### Production

- URL: `https://app.neonultra.ng`
- VPS deployment path: `/opt/ultraleagueos`
- Production systemd unit: `ultraos-web.service`
- Production port: `4110`
- Caddy is used for HTTPS and routing.
- Existing unrelated VPS applications and Caddy entries must always be preserved.

### Staging

- VPS path: `/opt/ultraos-staging`
- App path: `/opt/ultraos-staging/current`
- Database: `ultraos_staging`
- Service: `ultraos-staging-web.service`
- Port: `127.0.0.1:4120`
- Shared imports: `/opt/ultraos-staging/shared/imports`
- Shared media: `/opt/ultraos-staging/shared/media`
- Backups: `/opt/ultraos-staging/shared/backups`

## Important Backups Recorded

| Date | Purpose | File | SHA-256 |
| --- | --- | --- | --- |
| 2026-08-09 | Before Track C club onboarding | `/opt/ultraos-staging/shared/backups/track-c-before-clubs-20260809T114810Z.dump` | `e1f4047c6ea7231ae894d9fe65c1370052e75d7ba0ac682de9e736addef13b91` |
| 2026-08-09 | Before Track D coach onboarding | `/opt/ultraos-staging/shared/backups/ultraos_staging_track_d_pre_coach_onboarding_20260809T123035Z.dump` | `06f6e6c2cd013ee5685cd42f20ba95d8747f7485ec64a41448044ba3c2510d94` |

## Outstanding Work

### Immediate Human Decisions

1. Classify all 8 approved coach applications as Season Zero selected, not selected, or pending.
2. Assign explicit men's or women's draft division classification for selected coaches.
3. Confirm whether all selected coaches should be provisioned as permanent Staff.
4. Provide or confirm coach photographs after Staff profiles exist.
5. Confirm official club colours before marking club branding complete.

### Immediate Engineering Work

1. Continue Track D after coach selections are made.
2. Provision selected coaches into Staff with Ultra Staff IDs.
3. Create men's and women's draft coach pool entries.
4. Verify coach presentation payloads.
5. Convert selected player legacy photo URLs into primary `MediaAsset` usages or explicitly accept legacy-photo mode for rehearsal.
6. Complete authenticated browser verification for protected staging pages.
7. Reach `READY_FOR_FULL_DRAFT_REHEARSAL`.

### Draft Day Work

1. Run the full Draft Day rehearsal in a later authorized phase.
2. Verify rehearsal mode never writes official `Player.seasonClubId`.
3. Verify rehearsal mode never assigns coaches to `SeasonClub`.
4. Verify reset preserves Clubs, SeasonClubs, Players, Staff, DraftSquads, and MediaAssets.
5. Verify LIVE mode still supports official assignments without running a real live draft prematurely.
6. Prepare recovery procedures for projector/display/browser refresh.

### Season Zero Operations Work

1. Finalize fixtures and venue schedule.
2. Confirm scorer, official, event director, and check-in staffing.
3. Capture jersey numbers before first game.
4. Run live scoring dry runs.
5. Verify standings recalculation after finalized games.
6. Confirm public match center, scoreboard, and standings pages under realistic traffic.
7. Prepare event-day runbooks and manual score sheets.

### Multi-Tenancy Remaining Work

1. Continue Phase 1 Stage 5.2B-2 for club, season, competition, and venue administration.
2. Convert remaining admin/write paths to explicit organization context.
3. Resolve `PublicIdCounter`, `ultraAthleteId`, `ultraStaffId`, and `SystemSetting.key` organization-scoping in Stage 5.4.
4. Remove the Stage 3 database-level Neon Ultra default bridge before any second real organization is onboarded.
5. Rehearse second-organization application intake and provisioning end to end.

### Media and Storage Remaining Work

1. Decide whether staging and production should continue local persistent media or move all media to Cloudflare R2.
2. Bulk import coach photos after Staff provisioning.
3. Bulk normalize player photos into MediaAsset-backed profile photos.
4. Add replacement-conflict review for all bulk media imports.
5. Define long-term media retention and archival rules.

### Authentication and Account Work

1. Complete live Google OAuth verification if not already operational for all target users.
2. Complete email verification policy.
3. Complete password reset email delivery policy.
4. Confirm admin onboarding and emergency access procedure.
5. Continue preventing duplicate accounts through email identity enforcement.

### Commerce and Fan Operations Remaining Work

1. Complete payment provider decision.
2. Connect reservations, concessions, merchandise, and ticketing to a real payment flow when authorized.
3. Add operational refund/cancellation policies.
4. Expand fan club membership workflows.
5. Build sponsor reporting dashboards after real event activity exists.

### Broadcast and Public API Remaining Work

1. Run broadcast surfaces against real live games.
2. Verify external graphics consumers with actual production timing.
3. Confirm rate limits, cache policy, CORS policy, and public data safety under load.
4. Add more operator recovery runbooks.

### AI Vision Remaining Work

1. Obtain real Ultra game video.
2. Obtain official court dimensions and mark official court geometry.
3. Run empirical validation against real footage.
4. Keep AI-generated content and AI-driven stats out of official workflows until validated.
5. Maintain public-safety and privacy constraints for all exports.

### Documentation Remaining Work

1. Expand Administrator Guide.
2. Expand Operations Handbook.
3. Expand Technical Manual.
4. Expand Quick Start Guide.
5. Expand Training Curriculum.
6. Expand Developer Guide.
7. Expand API Reference.
8. Expand Governance Manual.
9. Expand Knowledge Base.
10. Add screenshots and diagrams following the established standards.

## Known Risks

- Coach onboarding cannot proceed safely without human selection.
- Player photos currently exist as legacy URLs, not primary MediaAsset-backed profile photos.
- Club colours are intentionally pending and should not be guessed.
- Multi-tenancy still has known deferred work before onboarding a second real organization.
- Real game-day load, broadcast consumption, and scoring workflows still require live rehearsal.
- AI vision functionality is not production-proven against real Ultra video.
- The VPS hosts other apps, so future deployment/restart commands must verify working directory and service identity before acting.
- The git working tree contains many modified and untracked files; future commits should be scoped carefully.
- The engine layer (rule sets, event types, statistics, standings) remains basketball-shaped; multi-sport implementation proceeds only through the additive stages of the accepted `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`, beginning with Stage 1 (sport catalog), and must preserve Season Zero basketball parity at every stage.

## Recommended Next Sequence

1. Administrator reviews `/coaches/season-zero-selection`.
2. Administrator marks selected Season Zero coaches and records decision reasons.
3. Administrator supplies explicit MEN/WOMEN division classification for selected coaches.
4. Engineering resumes Track D coach Staff provisioning and coach pool creation.
5. Engineering converts or verifies player and coach media readiness.
6. Engineering reruns `/draft-readiness` and formal Track D gate.
7. If ready, authorize Track E full Draft Day rehearsal.
8. After successful rehearsal, finalize operational runbooks and Season Zero event-day checklist.

## Safety Notes

- Do not assign players to Clubs or SeasonClubs before the official draft allocation.
- Do not assign coaches to Clubs or SeasonClubs before the official draft allocation.
- Do not infer coach selection from approved application status.
- Do not infer identities from email alone where duplicate review requires human classification.
- Do not modify official club logos.
- Do not invent official club colours.
- Do not run the full draft rehearsal until explicitly authorized.
- Preserve production Caddy entries and unrelated VPS applications during every deployment.
