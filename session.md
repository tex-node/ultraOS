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
