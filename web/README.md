# Ultra Basketball League OS

This directory contains the production Next.js application. The approved Vite
prototype remains in `../UI` as a visual and workflow reference.

## Requirements

- Node.js 20 or newer
- PostgreSQL

## Local setup

```powershell
Copy-Item .env.example .env
npm install
npm run db:generate
npm run db:migrate -- --name initial_schema
npm run db:seed
npm run dev
```

Change `SEED_ADMIN_PASSWORD` before running the seed. Never use the example password
in a shared or production environment.

## Validation

```powershell
npm run db:validate
npm run typecheck
npm run lint
npm run build
```

## Architecture

- Next.js App Router with strict TypeScript
- PostgreSQL through Prisma ORM
- Auth.js credentials authentication with bcrypt password hashes
- JWT sessions containing the server-issued user role
- Server-side permission checks in `src/lib/authorization.ts`
- Full league domain schema in `prisma/schema.prisma`

## Athlete and player model

`Athlete` is the permanent career identity. `Player` is a season registration that
links an athlete to a season and, when assigned, a `SeasonClub`. Draft picks, game
events, statistics, and MVP votes reference the season registration. Awards, videos,
and scout reports remain attached to the athlete across seasons and club changes.

## Sport and club model

The competition hierarchy is:

```text
Sport -> Competition -> Season
                    \-> Division
```

`Club` is the permanent brand identity. `SeasonClub` registers that club in a
specific season and division, with that season's staff assignments, roster, draft
picks, fixtures, game records, and standing.

```text
Athlete -> Player
Club    -> SeasonClub
```

This preserves athlete and club history across seasons without duplicating permanent
identity or brand data.

Database migrations and seed execution require a reachable PostgreSQL instance.
