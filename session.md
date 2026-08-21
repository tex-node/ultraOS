# Ultra Sports League Operating System - Development Log

This document is the persistent engineering record for Ultra Basketball's League
Operating System. Update it during every development session so implementation
status, decisions, verification results, and deployment changes remain traceable.

## Project Summary

- Product: Ultra Sports League Operating System
- League: Ultra Basketball
- Delivery target: Season Zero on August 15, 2026
- Repository: https://github.com/tex-node/ultraOS
- Local workspace: `C:\UltraLeagueOS`
- Current phase: Project initialization

## MVP Goal

Deliver a reliable full-stack application that supports:

- Authentication and role-based access
- League and season administration
- Club, staff, and player management
- Separate men's and women's drafts
- Fixture and venue management
- Operator-controlled live scoring
- Automatic standings recalculation
- Projector-friendly scoreboard display
- Public fixtures, clubs, players, matches, and standings
- Fan clubs and MVP voting
- Authorized scout notes and player ratings

The first complete demo must cover this workflow:

1. Admin logs in.
2. Admin views the league dashboard.
3. Admin manages clubs and players.
4. Admin runs a draft.
5. Admin creates fixtures.
6. An operator starts a game.
7. The operator updates the score and game events.
8. The public scoreboard reflects the game state.
9. The operator confirms the final result.
10. Standings recalculate automatically.

## Technical Baseline

- Framework: Next.js with TypeScript
- Styling: Tailwind CSS
- Database: PostgreSQL
- ORM: Prisma
- Authentication: NextAuth or Clerk, selected during initialization
- Authorization: Server-enforced role-based permissions
- Interface: Responsive, dark-mode-first sports operations UI
- Data updates: Polling or simple real-time updates for live game surfaces

## Roles

- `SUPER_ADMIN`: Full system access
- `LEAGUE_OPERATOR`: Fixture and live-game operations
- `TEAM_MANAGER`: Assigned club, roster, fixtures, and availability notes
- `COACH`: Roster, player statistics, and match reports
- `SCOUT`: Player profiles, ratings, notes, and shortlists
- `FAN`: Public pages, club following, fan clubs, and MVP voting

## MVP Boundaries

The following are explicitly excluded from this release:

- AI video tracking or vision
- Automated statistics detection
- Ticketing
- Payment processing
- Complex sponsorship management
- Player transfer marketplace

Extension points should remain available without introducing placeholder complexity
into Season Zero workflows.

## Delivery Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Repository, project scaffold, documentation, environment template | Complete |
| 1 | Prisma schema, migrations, seed data, authentication, RBAC | In progress |
| 2 | Admin dashboard, seasons, clubs, staff, and players | Pending |
| 3 | Draft room and roster assignment | Pending |
| 4 | Fixtures, venues, events, and standings | Pending |
| 5 | Live game center, game clock, scoring, and finalization | Pending |
| 6 | Scoreboard and public match center | Pending |
| 7 | Fan clubs, MVP voting, scout notes, and match reports | Pending |
| 8 | End-to-end testing, deployment, operations runbook | Pending |

## Development Standards

- Keep TypeScript strict.
- Enforce authorization on the server, not only in the interface.
- Use Prisma migrations for all schema changes.
- Keep game finalization and standings updates transactional.
- Prevent duplicate draft picks and duplicate MVP votes at the database level.
- Store timestamps consistently and present them in the league's configured timezone.
- Keep live-game operations recoverable after refresh or temporary network loss.
- Add focused tests for permissions, draft integrity, scoring, game finalization, and
  standings ranking.
- Do not commit secrets or local environment files.

## Decision Register

| Date | Decision | Reason | Status |
| --- | --- | --- | --- |
| 2026-06-15 | Add `Sport`, `Competition`, and data-driven `Division` entities before the first migration. | Keeps the platform multi-sport and avoids basketball-specific enum constraints in the operational schema. | Accepted |
| 2026-06-15 | Make `Club` permanent and use `SeasonClub` for seasonal participation. | Club identity, brand value, fans, and history must survive changes in season, division, roster, and staff. | Accepted |
| 2026-06-15 | Make `Athlete` the permanent identity and `Player` a season registration. | Athletes retain one career profile while clubs, eligibility, measurements, draft participation, and playing records vary by season. | Accepted |
| 2026-06-15 | Build clubs CRUD, athletes and players CRUD, draft room, fixtures, live game center, scoreboard, standings recalculation, then public pages. | This is the approved dependency order for the Season Zero operating path before August 15, 2026. | Accepted |
| 2026-06-14 | Use the attached MVP specification as the initial product contract. | The repository contains no existing implementation or documentation. | Accepted |
| 2026-06-14 | Maintain this file as the append-only development record. | Provides continuity across development sessions and deployments. | Accepted |
| 2026-06-14 | Prioritize the administrative game-day workflow before secondary fan features. | Season Zero operational reliability is the primary deadline. | Accepted |

## Risks And Open Decisions

- Authentication provider must be selected before implementing user provisioning.
- Production PostgreSQL provider and hosting environment are not yet specified.
- The live scoreboard update mechanism must be selected after deployment constraints
  are known.
- The exact number of men's and women's clubs and draft ordering rules require product
  confirmation.
- Basketball game timing rules, period count, overtime behavior, and timeout rules
  require confirmation before the live clock is finalized.
- Player registration privacy and access requirements require confirmation.

## Environment And Deployment

No environment or deployment configuration exists yet.

Expected environment variables will include:

```env
DATABASE_URL=
AUTH_SECRET=
AUTH_URL=
```

Additional provider-specific variables will be documented after authentication,
database hosting, file storage, and real-time transport are selected.

## Verification Log

| Date | Check | Result | Notes |
| --- | --- | --- | --- |
| 2026-06-14 | Local workspace inspection | Passed | Workspace existed and was empty. |
| 2026-06-14 | GitHub repository clone | Passed | Repository cloned successfully; remote repository was empty. |
| 2026-06-14 | Product specification review | Passed | MVP scope, roles, models, workflows, exclusions, and deadline recorded. |

## Session Updates

### 2026-06-15 - Tier 1 Clubs CRUD

**Objective**

- Implement the first approved Tier 1 module using permanent `Club` identity and
  competitive `SeasonClub` registrations without mixing their responsibilities.

**Completed**

- Added authenticated operations navigation for dashboard and club administration.
- Added permanent Club list, detail, create, edit, and archive workflows.
- Added SeasonClub create, edit, and withdraw workflows.
- Added transactional SeasonClub creation with automatic empty standing creation.
- Added server-side validation that Club, Season, and Division share the same sport
  and competition.
- Added server-side validation that seasonal staff assignments match their required
  roles.
- Prevented permanent Club archival while active SeasonClub registrations exist.
- Prevented SeasonClub club, season, or division reassignment after roster or
  competitive records exist.
- Displayed roster counts, fixture counts, draft pick counts, seasonal staff, and
  standings only through SeasonClub records.
- Kept permanent Club screens focused on brand identity, colors, logo, history,
  website, sport, and fan base.

**Decisions**

- Archive replaces destructive Club deletion.
- Withdraw replaces destructive SeasonClub deletion.
- Creating a SeasonClub also creates its standing row so later standings operations
  have a stable one-to-one record.
- Tier 1 work remains limited to clubs; athlete and player CRUD is the next module.

**Verification**

- Prisma schema validation and client generation: Passed.
- TypeScript: Passed.
- ESLint: Passed.
- Production Next.js build: Passed.
- Generated routes include Club and SeasonClub create, read, and edit screens.
- No direct Club references were introduced for fixtures, standings, draft picks,
  rosters, game events, or statistics.

**Known issues**

- Database-backed browser testing remains blocked until PostgreSQL is provisioned and
  the initial migration and seed are applied.

**Next step**

- Implement Tier 1 step 2: Athlete and Player CRUD, keeping Athlete permanent and
  Player season-specific with optional SeasonClub assignment.

### 2026-06-15 - Multi-Sport And Permanent Club Architecture

**Objective**

- Correct the club and competition architecture before creating the initial
  migration.

**Completed**

- Added permanent `Sport`, `Competition`, and data-driven `Division` entities.
- Linked each season to a competition.
- Refactored `Club` into a permanent brand identity with colors, logo, founding
  year, status, web presence, fan club, and season history.
- Added `SeasonClub` for a club's participation in one season and division.
- Moved rosters, staff assignments, draft picks, fixtures, game records, statistics,
  and standings from `Club` to `SeasonClub`.
- Kept `Fixture` separate from `Game`.
- Retained optional `Staff.userId` login linkage and moved seasonal staff assignments
  onto `SeasonClub`.
- Added scout report visibility levels: private, club, league, and public.
- Added optional guest fan details for memberships without full user accounts.
- Updated Season Zero seed data for Basketball, Ultra Basketball, men's and women's
  divisions, permanent clubs, and men's Season Zero club registrations.

**Decisions**

- Club fan clubs remain attached to permanent clubs, not seasonal registrations.
- Athlete registrations retain `seasonId` and optional `seasonClubId`; athletes may
  enter a season before being assigned to a club.
- Cross-record consistency between season, division, draft, fixture, player, and
  SeasonClub records will be validated transactionally in application services.

**Verification**

- Prisma format and schema validation: Passed.
- Prisma client generation: Passed.
- TypeScript check after client generation: Passed.
- ESLint: Passed.
- Production Next.js build: Passed with build-only placeholder environment values.
- Stale direct fixture-to-Club and enum-based division references: None found outside
  the intended SeasonClub compound key.

**Known issues**

- Database migration and seed execution still require a reachable PostgreSQL
  instance.
- Guest fan identity deduplication rules require a product decision before the fan
  membership write API is implemented.

**Next step**

- Implement in this exact order: clubs CRUD; athletes and players CRUD; draft room;
  fixtures; live game center; scoreboard display; standings auto-recalculation;
  public club, fixture, and standings pages.

### 2026-06-15 - Athlete Career Architecture

**Objective**

- Correct the player domain before migrations by separating permanent athlete
  identity from season-specific participation.

**Completed**

- Added `Athlete` as the permanent personal and career profile.
- Reworked `Player` into an athlete registration unique to one season.
- Kept club assignment, playing position, measurements, jersey number, and
  eligibility status on the season registration.
- Added athlete-level awards, videos, and scout reports.
- Preserved draft picks, game events, player statistics, and MVP votes against the
  season registration so historical records remain season-correct.
- Updated seed logic to upsert athletes independently from Season Zero registrations.
- Updated the dashboard to count athlete identities.

**Decisions**

- Career statistics will be calculated from season registrations and game statistics
  rather than stored as a second mutable aggregate.
- Clubs played for and draft history are derived from historical season
  registrations and draft picks.
- Scout reports attach to athletes and may optionally be scoped to a season.

**Verification**

- `npx prisma format`: Passed.
- `npm run db:validate`: Passed.
- `npm run db:generate`: Passed.
- `npm run typecheck`: Passed.
- `npm run lint`: Passed.
- `npm run build`: Passed with build-only placeholder environment values.

**Known issues**

- The initial database migration still requires a reachable PostgreSQL instance.

**Next step**

- Complete verification, then implement Tier 1 in this order: authentication, clubs,
  players, draft room, fixtures, live scoring, league table, and public match center.

### 2026-06-15 - Full-Stack Foundation

**Objective**

- Begin Phase 1 while preserving the deployed Vite prototype.

**Completed**

- Created the production Next.js application in `web/` with App Router, strict
  TypeScript, Tailwind CSS, and ESLint.
- Added the complete PostgreSQL Prisma domain schema for users, seasons, clubs,
  players, staff, drafts, fixtures, games, statistics, standings, fan clubs, scout
  notes, and MVP votes.
- Added database constraints preventing duplicate draft selections, duplicate draft
  positions, duplicate fan memberships, and duplicate per-game MVP votes.
- Added deterministic Season Zero seed data for the admin account, eight clubs,
  sample players, coaches, fan clubs, standings, venue, and fixtures.
- Added Auth.js credential authentication with bcrypt password verification, JWT
  sessions, active-account checks, and role claims.
- Added the server-side role permission matrix and reusable authorization guards.
- Added the initial login and protected database-backed dashboard routes.
- Added environment and local setup documentation.

**Decisions**

- Preserve `UI/` unchanged as the approved prototype and build the production
  application in `web/`.
- Use Auth.js credentials with internally provisioned users for the operational MVP,
  avoiding a required third-party identity provider.
- Use PostgreSQL and Prisma 7 with the PostgreSQL driver adapter.
- Model club staff through normalized `Staff` records instead of fixed coach and
  manager columns on each club.

**Verification**

- `npm run db:validate`: Passed.
- `npm run db:generate`: Passed.
- `npm run typecheck`: Passed.
- `npm run lint`: Passed.
- `npm run build`: Passed with build-only placeholder environment values.
- `npm audit --omit=dev`: Five moderate advisories, no high or critical advisories.
  Current advisories are transitive through Next.js/PostCSS and Prisma development
  tooling; npm's proposed fixes incorrectly downgrade major packages.

**Known issues**

- No reachable PostgreSQL connection was supplied, so the initial migration has not
  been created/applied and the seed has not been executed.
- Auth.js v5 is currently distributed under its beta tag.
- The approved prototype interface has not yet been decomposed and ported into the
  production application.

**Next step**

- Provision or identify PostgreSQL, apply the initial migration and seed, then port
  the approved application shell and dashboard into `web/`.

### 2026-06-15 - Project Status Report

**Objective**

- Document all developed prototype features, remaining MVP requirements, suggested
  enhancements, technical risks, and delivery priorities.

**Completed**

- Audited the deployed UI screens and browser interactions.
- Compared the prototype against the original Season Zero product specification.
- Created `PROJECT_REPORT.md`.
- Classified features as developed, prototype-only, not developed, or suggested.
- Added a phased delivery recommendation and production-readiness assessment.

**Decisions**

- Treat browser-only interactions as prototypes rather than completed operational
  features.
- Prioritize authentication, database persistence, live-game recovery, scoreboard
  synchronization, and standings integrity over additional mock interface work.

**Verification**

- Report checked against `UI/src/app/App.tsx`, deployment configuration, current
  development log, and the original MVP scope.

**Known issues**

- No implementation changes were made in this reporting session.

**Next step**

- Start Phase 1 of the full-stack operational core.

### 2026-06-15 - UI Deployment

**Objective**

- Validate the supplied Vite UI and deploy it to the shared VPS without replacing
  existing application files or Caddy site definitions.

**Completed**

- Added the supplied UI prototype under `UI/`.
- Installed dependencies and generated a reproducible npm lockfile.
- Built the production bundle successfully with Vite.
- Selected a static Caddy deployment to avoid consuming or conflicting with existing
  application ports.
- Reserved `app.neonultra.ng` for the application.
- Deployed release `20260615-020000` to
  `/opt/ultraleagueos-ui/releases/20260615-020000`.
- Added the `app.neonultra.ng` Caddy site without replacing existing site blocks.
- Obtained a valid Let's Encrypt certificate and activated public HTTPS.

**Decisions**

- Deploy immutable timestamped releases under `/opt/ultraleagueos-ui/releases`.
- Point `/opt/ultraleagueos-ui/current` to the active release.
- Serve the single-page application directly through Caddy with an `index.html`
  fallback.
- Do not apply `npm audit fix --force`; it would upgrade React Router outside the
  supplied dependency range and requires a separate compatibility test.

**Verification**

- `npm run build`: Passed.
- Vite transformed 2,218 modules and generated the production bundle.
- Existing VPS directories, application containers, ports, and Caddy entries were
  inspected before deployment.
- `app.neonultra.ng` and `/opt/ultraleagueos-ui` were unused.
- Caddy configuration validation: Passed.
- Public homepage: `200 OK`.
- Immutable JavaScript asset caching: Verified.
- SPA fallback route `/dashboard`: `200 OK`.
- Browser smoke test: Login and dashboard navigation passed.

**Known issues**

- The production dependency audit reports a high-severity advisory for the pinned
  React Router version. The prototype does not currently import React Router, but the
  dependency should be upgraded and retested.
- The generated JavaScript bundle is approximately 623 KB before gzip and should be
  split as the application grows.
- This deployment is a UI prototype with in-memory sample data, not the full Next.js
  and PostgreSQL application.

**Next step**

- Begin the full application scaffold and connect the approved UI flows to
  authenticated backend data.

### 2026-06-14 - Project Initialization

**Completed**

- Cloned `tex-node/ultraOS` into `C:\UltraLeagueOS`.
- Confirmed that the repository has no existing application files or history to
  preserve.
- Reviewed the supplied Ultra Basketball MVP specification.
- Established the initial delivery phases and engineering constraints.
- Created this development log.

**Current state**

- Application scaffold: Not started
- Database schema: Not started
- Authentication: Not started
- Tests: Not configured
- Deployment: Not configured

**Next implementation step**

Scaffold the Next.js TypeScript application, configure Tailwind and Prisma, add the
environment template, and implement the initial database schema and seed structure.

### 2026-06-15 - Tier 1 Operational Core

**Objective**

- Implement the August-critical league operations using permanent Athlete and Club
  identities with season-specific Player and SeasonClub registrations.

**Completed**

- Added the Prisma domain model, initial migration, and seed data for Sport,
  Competition, Division, Season, Club, SeasonClub, Athlete, Player, Draft, Fixture,
  Game, statistics, standings, staff, scouting visibility, and fan membership.
- Implemented authentication and role-based permissions for operational routes.
- Implemented Clubs, Athletes, Players, Draft Room, Fixtures, Live Game Center,
  Scoreboard Display, automatic standings recalculation, and public match-center
  pages.
- Kept Club as permanent brand identity and used SeasonClub for every competitive
  relationship, including rosters, fixtures, draft picks, game events, statistics,
  and standings.
- Enforced finalized games as read-only in both server actions and the live-game UI.

**Decisions**

- Fixture remains the scheduled match; Game is its live or played instance.
- Athlete and Club survive across seasons; Player and SeasonClub carry competitive
  season context.
- Finalizing a game atomically confirms the winner and recalculates the season table.
- Tier 1 excludes AI vision, video archives, payments, ticketing, transfers, and
  advanced scouting workflows.

**Verification**

- Prisma schema validation and client generation: Passed.
- Initial migration and seed applied to a real local PostgreSQL database.
- TypeScript typecheck, ESLint, standings tests, and production build: Passed.
- Browser-tested login, dashboard, clubs, athletes and players, fixtures, live
  scoring, scoreboard polling, game finalization, and standings recalculation.
- Browser-tested draft creation, status transition, player selection, SeasonClub
  assignment, roster update, and draft board rendering.
- Browser-tested public home, clubs, fixtures, players, standings, and finalized
  match-center pages.

**Known issues**

- This Tier 1 build has not yet replaced the separately deployed static UI prototype.
- Production deployment and production database migration require a dedicated release
  step after review.

**Next step**

- Review the Tier 1 implementation and prepare the production release plan.

### 2026-06-15 - Phase 1.5 Hardening

**Objective**

- Add dispute-ready audit trails, rapid database recovery tooling, and an
  operations mission-control dashboard before expanding product scope.

**Completed**

- Added append-only `AuditLog` records linked to authenticated users.
- Added transactional audit coverage for draft picks and state changes, fixture
  creation/edit/cancellation, score changes and corrections, game finalization,
  standings recalculation, and fixture-official assignments.
- Added an operator audit ledger with actor, action, entity, timestamp, and details.
- Added timestamped PostgreSQL backup scripts, SHA-256 verification, retention,
  guarded restore tooling, a nightly systemd timer, and a restore drill runbook.
- Replaced dashboard counters with mission-control alerts for live games, paused
  games awaiting finalization, undersized rosters, missing officials, venue/time
  conflicts, and standing inconsistencies.
- Added normalized fixture-official assignments and an audited resolution workflow.

**Verification**

- Applied both migrations to a fresh PostgreSQL 16 database and seeded successfully.
- Completed a custom-format backup and restored it into a separate database; user,
  fixture, and audit-log counts matched the source.
- Browser-tested mission control, official assignment, audit creation, audit ledger,
  and immediate alert-count refresh.
- Prisma validation and generation, TypeScript, ESLint, tests, and production build:
  Passed.

**Known issues**

- Backup jobs still require production installation, off-host replication, and a
  timed production-like restore drill before they can be considered operationally
  proven.
- The minimum roster threshold is currently five players and should become a
  competition setting when league configuration is implemented.

**Next step**

- Install the nightly backup timer during the production release and complete a
  documented restore drill against a temporary database.

### 2026-06-15 - Ultra Event Operations Module v2

**Objective**

- Add bootstrap event access, accreditation, QR check-in, zone reservations,
  concessions, merchandise, fan-club benefits, and sponsor reporting.

**Completed**

- Added permanent venue sections and event-specific VIP Courtside, Premium, and
  General Admission zones with atomic capacity controls.
- Added guest and authenticated fan reservations, unguessable QR tickets,
  provider-neutral payment status, and audited venue check-in.
- Added player, coach, official, media, VIP guest, and fan accreditation with
  approval, revocation, QR identification, and check-in.
- Added vendors, categorized products, event inventory, stock reservation, payment
  settlement, fulfillment states, and QR collection.
- Added a fan wallet order combining admission, snacks, drinks, and merchandise.
- Added fan-club-only zones, early access fields, seat discounts, and product
  discounts.
- Added promo codes, sponsor campaigns, public impression tracking, redemptions,
  units sold, and attributed revenue.
- Seeded a published Season Zero opening event with 20 VIP, 80 Premium, and 200
  General Admission places plus concessions, merchandise, and a sponsor offer.

**Decisions**

- Season Zero uses zone inventory rather than individual seat maps.
- Prices use integer kobo; the application does not store floating-point money.
- Fan Wallet is an order interface, not stored monetary value.
- Payment remains provider-neutral until a gateway is selected. Operators confirm a
  verified reference before admission or collection.
- QR scans open a protected verification screen; GET requests never perform
  check-in or collection writes.

**Verification**

- Applied all three migrations from zero to PostgreSQL 16 and seeded twice
  successfully.
- Browser-tested public event discovery, two-seat Premium reservation, ticket QR,
  snack ordering, sponsor promo discount, operator payment, ready status, fan
  entry, order collection, media accreditation, approval, and check-in.
- Verified sponsor metrics for impressions, redemptions, sponsored units, and
  revenue.
- Verified append-only audit records for settlement, fulfillment, fan entry,
  accreditation changes, and collection.
- Prisma validation and generation, TypeScript, ESLint, unit tests, and production
  build: Passed.

**Known issues**

- A payment provider and webhook reconciliation are intentionally not implemented.
- Camera scanning is delegated to the device QR reader; manual code entry remains
  available.
- Individual section, row, and seat mapping remains a future capacity upgrade.

**Next step**

- Select a Nigerian payment provider, implement signed webhook reconciliation, and
  perform production event-load testing before enabling paid public bookings.

## Update Template

Append new entries below using this structure:

```md
### YYYY-MM-DD - Session Title

**Objective**

- What this session intended to deliver.

**Completed**

- Code, schema, interface, infrastructure, or documentation changes.

**Decisions**

- Important decisions and their rationale.

**Verification**

- Commands, tests, builds, or manual workflows checked.

**Known issues**

- Remaining defects, limitations, or risks.

**Next step**

- The highest-priority continuation point.
```

### 2026-06-15 - Communications and Content Engine

**Objective**

- Generate operational announcements and reports directly from league records.

**Completed**

- Added versioned content templates, auditable generation jobs, and immutable
  generated assets.
- Added draft, fixture, result, MVP, standings, sponsor, and fan-club adapters.
- Added operator studio and template editing routes under `/content`.
- Added text, HTML, JSON graphic data, 1080x1080 PNG, and PDF exports.
- Added public structured graphic endpoints under `/api/content`.
- Seeded templates plus representative draft, final match, MVP, and standings data.

**Decisions**

- Generation is deterministic and template-driven; no AI dependency is required.
- Generated HTML escapes all record-derived values.
- Content jobs record failures and successful generation is audit logged.
- A future `Organization` belongs above `Competition`, not between `Competition`
  and `Season`.

**Verification**

- Applied all four migrations from zero to PostgreSQL 16 and seeded repeatedly.
- Browser-tested operator login, the content studio, result generation, asset
  preview, template management, export links, completion state, and audit logging.
- Verified all seven structured graphic-data API adapters.
- Prisma validation and generation, TypeScript, ESLint, seven unit tests including
  PNG/PDF rendering, and production build: Passed.

**Known issues**

- Social-network publishing and editable visual design templates are intentionally
  deferred.

**Next step**

- Connect approved design templates or social publishing clients to the structured
  graphic-data API after Season Zero content operations are validated.

### 2026-06-15 - Full-Stack VPS Deployment

**Objective**

- Deploy the authenticated Next.js application to `app.neonultra.ng` without
  replacing other VPS applications, directories, ports, or Caddy sites.

**Completed**

- Deployed immutable release `20260615-224119` under
  `/opt/ultraleagueos/releases/20260615-224119`.
- Activated `/opt/ultraleagueos/current` as a release symlink.
- Added the isolated `ultraos-web.service` bound to `127.0.0.1:4110`.
- Added a dedicated PostgreSQL 16 container bound to `127.0.0.1:55411`, with data
  stored under `/opt/ultraleagueos/shared/postgres`.
- Applied all four migrations and seeded the production administrator, Season Zero,
  clubs, fixtures, event operations, and content templates.
- Installed and verified nightly database backups with SHA-256 checksums.
- Updated only the existing `app.neonultra.ng` Caddy block to proxy the full
  application while preserving the previous static UI at `/demo/`.
- Preserved a full Caddy backup at
  `/etc/caddy/Caddyfile.backup-before-ultraos-full-20260615-224700`.

**Decisions**

- Application releases are read-only and owned by `root:ultraos`.
- Runtime secrets, PostgreSQL data, npm cache, and backups remain outside releases.
- Caddy is the only public ingress; application and database ports bind to loopback.
- Existing Caddy content outside the Ultra site block must remain byte-for-byte
  unchanged.

**Verification**

- VPS Linux production build: Passed.
- PostgreSQL health check, migrations, seed, and manual backup checksum: Passed.
- Caddy validation and reload: Passed.
- Non-Ultra Caddy content comparison: Identical.
- Browser-tested HTTPS login, dashboard, content studio, public events, and `/demo/`.
- Representative existing applications returned HTTP 200 after deployment.
- Active TLS certificate is valid from June 14 through September 12, 2026.

**Known issues**

- `npm audit` reports six moderate dependency advisories; no forced major-version
  upgrades were applied during deployment.

**Next step**

- Change the generated administrator password after handoff and run a production
  restore drill before the first live event.

### 2026-06-15 - Fan Signup and Password Recovery Entry

**Objective**

- Add visible authentication entry points for signup and password recovery without
  granting operational roles.

**Completed**

- Added `/signup` with full name, email, password, and password confirmation.
- Added server-side validation, bcrypt password hashing, duplicate-email handling,
  and `FAN` role assignment.
- Added immediate server-side sign-in after successful signup, redirecting fans to
  `/public/events`.
- Added prominent signup and forgot-password buttons to the login page.
- Added signup links from public navigation.
- Added `/forgot-password` with neutral reset-request messaging and audit logging
  for active accounts.
- Updated login redirects so fans land on public events while operators continue to
  the dashboard.
- Added `USER_SIGNED_UP` audit logging for created accounts.

**Decisions**

- Public signup only creates `FAN` users. Operational roles remain controlled by
  administrators.
- Signup does not return the password to client state; the server action performs
  sign-in directly after account creation.
- Forgot-password requests do not reveal whether an email exists.
- Full reset-token delivery is deferred until an email/SMS provider is configured.

**Verification**

- TypeScript, ESLint, unit tests, and production build: Passed.
- Applied migrations and seed to a temporary PostgreSQL 16 database.
- Browser-tested signup, automatic sign-in, and fan redirect to `/public/events`.
- Verified created users are active `FAN` accounts and audit rows are recorded.
- Deployed release `20260615-234638` and browser-tested the live login buttons,
  `/signup`, and `/forgot-password` on `app.neonultra.ng`.

**Known issues**

- Email verification and reset-token delivery are not implemented yet.

**Next step**

- Add email verification and reset-token delivery before opening public signup
  beyond controlled launch testing.

### 2026-06-16 - Multi-Role Applications and Google OAuth

**Objective**

- Separate public fan signup from participant applications, support one user with
  multiple roles and profiles, and add Google sign-in/sign-up.

**Completed**

- Added `/apply` as the participant application hub for player, coach, scout,
  official, media, vendor, and volunteer applications.
- Added `/applications` review queues for league operators and administrators.
- Added `Application`, `ApplicationType`, and `ApplicationStatus` with reviewer
  tracking and audit logging.
- Added `UserRoleAssignment` so one `User` can hold multiple active roles.
- Added explicit role support for player, official, vendor, media, and volunteer
  access.
- Kept `FAN` as the base capability for every authenticated user.
- Added account-linked application submission; unauthenticated applicants are sent
  to login or fan signup before submitting.
- Added approval provisioning that creates or links athlete, player registration,
  staff, vendor, media, and volunteer profiles and grants the approved role.
- Added `/account` with active roles, fan capabilities, submitted applications,
  reservations, orders, fan memberships, accreditation status, and profile summary.
- Added Google OAuth through Auth.js while preserving credential login.
- Configured Google users to upsert by unique email and receive the default `FAN`
  role without creating duplicate accounts.
- Documented required Google OAuth environment variables in `web/.env.example`.
- Added `cred/` to `.gitignore` so local OAuth credential files are not committed.
- Deployed release `20260616-080000` to `/opt/ultraleagueos/releases/20260616-080000`.
- Applied the applications and multi-role profile migrations to production.
- Added Google OAuth runtime values to `/opt/ultraleagueos/shared/web.env`.
- Preserved the existing Caddy site and `/demo/` static UI route.

**Decisions**

- Keep `User.role` temporarily as a compatibility display/primary-role field while
  authorization moves to active `UserRoleAssignment` rows.
- Access is granted if any active role has the required permission.
- Application approval performs conservative provisioning and leaves sensitive
  operational assignment details, such as exact club placement, under operator
  control.
- Google OAuth uses the same `User.email` identity boundary as password accounts.

**Verification**

- Prisma validation and client generation: Passed.
- TypeScript, ESLint, unit tests, and production build: Passed.
- Google OAuth credentials were sourced from the local ignored `cred/` directory
  and written to the ignored local `web/.env`.
- Production build, migration deploy, service restart, Caddy validation, HTTPS
  route checks, and Auth.js provider discovery: Passed.

**Known issues**

- Password reset email delivery and email verification are still pending provider
  selection.
- OAuth production secrets must remain in `/opt/ultraleagueos/shared/web.env` and
  must not be committed.

**Next step**

- Complete a live Google OAuth browser sign-in after the Google consent screen is
  available to the operator, then configure email verification and password reset
  delivery.

### 2026-08-09 - Season Zero Club Logo Source Validation

**Objective**

- Validate the authoritative Season Zero club logo files in
  `C:\UltraLeagueOS\assets\clubs` before any media ingestion.

**Completed**

- Confirmed all 8 expected logo files exist.
- Recorded file sizes and SHA-256 checksums.
- Validated each file through the existing media upload validation pipeline as a
  `CLUB_LOGO`.
- Confirmed each file has a valid PNG signature and readable image dimensions.
- No alternate, generated, recoloured, prototype, rehearsal, or demo assets were
  used.

**Validated files**

| Club | File | Size bytes | MIME | Dimensions | SHA-256 |
| --- | --- | ---: | --- | --- | --- |
| APEX | `Apex M.png` | 2188954 | image/png | 1024 x 1536 | `abbf1a01522e307b9506e73e25dc90d0c324cf175ee0ba98c9a434d6c28683b4` |
| SURGE | `Surge M.png` | 897051 | image/png | 873 x 714 | `44df03bae2d3856f7dadb9c693f559b117d4ba6f7eacbd714a2f2089ada115b5` |
| VORTEX | `Vortex M.png` | 2190669 | image/png | 1024 x 1536 | `ad675f0cc7be255b40650e869f3a1f24ce4a468d631f124d125bff9c6eb3b9af` |
| FLUX | `Flux M.png` | 2264062 | image/png | 1024 x 1536 | `f52280a93b927e891bd569ddec22cdb80ff64a7ae145c0db5b20259275ca5a83` |
| EMBER | `Ember F.png` | 687939 | image/png | 877 x 718 | `0dbed3f48fbb39ab119340ab8924eda7dc5ca9e1dcdc2b228c52918063523299` |
| HALO | `Halo F.png` | 2320412 | image/png | 1024 x 1536 | `0a09633ef50fc2a41219dc1406d6fae9b8b22a8cc12babd80caf9fb9c11b9d81` |
| ECLIPSE | `Eclipse F.png` | 2204880 | image/png | 1024 x 1536 | `2ad948c263b15e4f2f592dec61b2c5da83692ff9470af9a50b01149e0a5fe66f` |
| NOVA | `Nova F.png` | 1025115 | image/png | 905 x 744 | `36de71418dc8c4532089bdfb7f83ee6380a5b36e215aa431b26a3e3f56d5712a` |

**Verification**

- File existence: Passed.
- File readability: Passed.
- PNG MIME/signature validation: Passed.
- Existing media pipeline validation: Passed.

**Next step**

- Ingest these exact files as `CLUB_LOGO` media assets once the remaining Club
  creation inputs, especially official colours, are confirmed.

### 2026-08-09 - Phase 9 Track C Season Zero Club Onboarding Applied to Staging

**Objective**

- Create the 8 real Season Zero permanent Clubs and 8 SeasonClubs on staging.
- Ingest the exact authoritative club logos from `C:\UltraLeagueOS\assets\clubs`
  through the existing media pipeline.
- Keep official colours pending and stored as `NULL`.

**Completed**

- Added a staging migration to allow `Club.primaryColor` and
  `Club.secondaryColor` to be nullable.
- Updated club forms, import logic, public club pages, draft display, and
  scoreboard rendering to tolerate pending colours with UI-only fallbacks.
- Copied the authoritative logo files to
  `/opt/ultraos-staging/shared/imports/clubs`.
- Revalidated staging logo checksums before ingestion.
- Ran `scripts/season-zero-club-onboarding.ts --apply` on staging.
- Created 8 permanent Clubs, 8 active SeasonClubs, 8 Standing rows, 8 public
  `CLUB_LOGO` MediaAssets, and 16 logo variants.

**Backup**

- Staging database backup:
  `/opt/ultraos-staging/shared/backups/track-c-before-clubs-20260809T114810Z.dump`
- SHA-256:
  `e1f4047c6ea7231ae894d9fe65c1370052e75d7ba0ac682de9e736addef13b91`

**Staging verification**

| Check | Result |
| --- | ---: |
| Clubs | 8 |
| SeasonClubs | 8 |
| Men's SeasonClubs | 4 |
| Women's SeasonClubs | 4 |
| Standing rows | 8 |
| Staff records created | 0 |
| Selected player SeasonClub assignments | 0 |
| Draft allocations created | 0 |
| Active primary club logo usages | 8 |
| Club logo assets | 8 |
| Club logo variants | 16 |

**HTTP smoke checks**

- `/login`: 200
- `/public/clubs`: 200
- `/public/clubs/cmslqrdfv0000xrkkh3z4bsev`: 200
- `/media/assets/cmslqrdi00003xrkkeaecs587/file`: 200 image/png
- `/media/assets/cmslqrecs001uxrkknt80hvoc/file`: 200 image/png
- `/api/content/club/cmslqrdfv0000xrkkh3z4bsev`: 200

**Validation**

- Local Prisma validation and generation: Passed.
- Local TypeScript: Passed.
- Local tests: Passed.
- Local lint: Passed with existing `<img>` warnings only.
- Local production build: Passed.
- Staging Prisma validation, generation, migration deploy, TypeScript, tests,
  production build, service restart, database verification, and HTTP smoke
  checks: Passed.

**Notes**

- Official colours intentionally remain unset in the database.
- No coaches, staff assignments, player assignments, fixtures, draft picks, or
  official draft allocations were created in this step.

### 2026-08-09 - Phase 9 Track D Coach Onboarding Readiness Gate

**Objective**

- Prepare the people, media, and presentation readiness layer for a full Draft
  Day rehearsal without running the rehearsal.

**Completed**

- Created and verified a staging backup before Track D work.
- Verified Track C baseline on `ultraos_staging`.
- Confirmed all 8 approved coach applications remain `PENDING` for Season Zero
  selection.
- Stopped real coach provisioning at the required human decision gate.
- Added `/draft-readiness` as a read-only Draft Personnel & Media Readiness
  dashboard.
- Improved Season Zero coach selection auditing so future status changes record
  old state, new state, actor, timestamp, and optional reason.
- Deployed the dashboard and audit improvement to staging only.

**Backup**

- Staging database backup:
  `/opt/ultraos-staging/shared/backups/ultraos_staging_track_d_pre_coach_onboarding_20260809T123035Z.dump`
- Size: `409578` bytes
- SHA-256:
  `06f6e6c2cd013ee5685cd42f20ba95d8747f7485ec64a41448044ba3c2510d94`
- Verification: Passed

**Readiness state**

| Area | Result |
| --- | --- |
| Clubs | 8 permanent, 8 SeasonClubs, 8 logos |
| Players | 58 selected, 45 MAIN_DRAFT, 13 SECONDARY_DRAFT |
| Player SeasonClub assignments | 0 |
| Official Draft allocations | 0 |
| Staff | 0 |
| Coach applications | 8 approved, 8 pending, 0 selected |
| Coach provisioning | Blocked by human selection gate |
| Player photos | 58 legacy URLs, 0 primary MediaAsset-backed photos |
| Club logos | 8 primary MediaAsset-backed logos, 16 variants |

**Validation**

- Staging `npm run db:validate`: Passed.
- Staging `npm run db:generate`: Passed.
- Staging `npm run typecheck`: Passed.
- Staging `npm run lint`: Passed with existing `<img>` warnings only.
- Staging `npm test`: Passed.
- Staging `npm run build`: Passed.
- Staging `npm run data:audit-real`: Passed.
- HTTP smoke:
  - `/login`: 200
  - `/draft-readiness`: 307 unauthenticated redirect
  - `/coaches/season-zero-selection`: 307 unauthenticated redirect
  - `/public/clubs`: 200
  - Apex logo media endpoint: 200 image/png

**Human action required**

- Administrator must classify all approved coach applications at
  `/coaches/season-zero-selection`.
- Selected coaches must then receive explicit MEN/WOMEN draft division
  classification before Staff provisioning and coach pool creation.

**Safety**

- No production data changed.
- No production deployment occurred.
- No Caddy changes occurred.
- No commit or push occurred.
- No Applications, Users, Athletes, Players, Clubs, SeasonClubs, or MediaAssets
  were deleted.
- No coach was selected automatically.
- No coach was provisioned as Staff.
- No coach was assigned to a Club or SeasonClub.
- No selected Player was assigned to a Club or SeasonClub.
- No official Draft allocation was created.
- No Draft group was rebalanced.
- Women Group 4 remains intentionally incomplete.
- No official Club colour was invented.
- Official Club logos were not modified.
- `TryOutsPlayers.xlsx` was not modified.
