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

## Event Operations v2

Event Operations uses permanent `VenueSection` records and event-specific
`SeatZone` inventory. Season Zero launches with zone reservations rather than
individual seat maps:

```text
Venue -> VenueSection
Event -> SeatZone -> SeatReservation -> Ticket -> CheckIn
```

The fan wallet groups a seat reservation with food, drink, and merchandise items:

```text
Vendor -> VendorProduct -> VendorInventory
Event  -> Order -> OrderItem
```

Amounts are stored as integer kobo. Payment processing is provider-neutral:
reservations and orders remain pending until an authorized operator records a
verified payment reference. QR codes only identify tickets, accreditation, and
collection orders; they do not prove payment by themselves.

Operator routes:

- `/events` event setup, zones, accreditation, reservations, and sponsor metrics
- `/vendors` products, event inventory, campaigns, and promo codes
- `/orders` payment confirmation and fulfillment
- `/check-in` ticket, accreditation, and collection verification

Fan routes begin at `/public/events`.

## Communications and Content Engine

The content engine converts existing operational records into deterministic,
reviewable assets without AI:

```text
Database record -> ContentTemplate -> ContentJob -> ContentAsset
```

Supported content types include draft picks, fixtures, results, MVPs, standings,
sponsor performance, and fan-club reports. Each generated asset stores rendered
text, rendered HTML, and structured graphic data. Operators can export text, HTML,
JSON, 1080x1080 PNG, or PDF from `/content`.

Graphic data endpoints are available at:

```text
/api/content/draft/:pickId
/api/content/fixture/:fixtureId
/api/content/match/:fixtureId
/api/content/mvp/:fixtureId
/api/content/standings/:seasonId
/api/content/sponsor/:campaignId
/api/content/fan-club/:fanClubId
```

These JSON endpoints can later feed Canva, Photoshop templates, social publishing,
or venue displays while retaining `SeasonClub` for competitive team data and
`Club` for permanent identity and branding.

`Organization` is reserved for a post-Season-Zero migration. It should sit above
competitions (`Organization -> Competition -> Season`) so one operator can manage
Ultra Basketball, Ultra Volleyball, Ultra Football, and Ultra Esports without
changing the existing competition-to-season relationship.
