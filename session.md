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
| 0 | Repository, project scaffold, documentation, environment template | In progress |
| 1 | Prisma schema, migrations, seed data, authentication, RBAC | Pending |
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
