# Local E2E — the four-minute browser loop

The Playwright suite exists to catch what unit tests cannot: a renamed input, a button that stopped submitting, a tenant that
sees another tenant's league. It runs against a **production build** (`next build && next start`), because the service worker is
gated to production and dev-mode caching produces stale-chunk failures.

Until now that meant running it against a deployed environment, and a staging deploy on this host costs about **25 minutes**. A
loop that expensive does not get used between changes — which is how a streak ends with one e2e run at the end and no idea which
change broke what. This harness removes that constraint.

```bash
npm run test:e2e:local          # normal run: reuses .next when src/ has not changed
npm run test:e2e:local -- --build   # force a production build
npm run test:e2e:local -- --fresh   # wipe the database first (after a schema change)
```

## What it does

| Step | What happens | Time |
| --- | --- | --- |
| postgres | `docker compose -f docker-compose.test.yml up -d --wait` — Postgres 16 on **127.0.0.1:55432** | ~1 s |
| migrations | `prisma migrate deploy` (112 migrations) | ~7 s |
| seed | `prisma/seed-test.ts` — two organizations, two sports, one venue | ~5 s |
| preparation | `e2e-prepare.ts` (admin, open competition, LIVE fixture) + `e2e-tenant-prepare.ts` (two tenants) | ~7 s |
| build | `next build`, **skipped when `.next/BUILD_ID` is newer than every file under `src/`** | 0 s / ~6 min |
| playwright | registration, scoring, wizard, multi-tenant — 7 tests, chromium | ~25 s |

**Measured on this machine:** warm run **1.0 min**, cold build **7.0 min** (build alone 369 s). The warm path is the one that
matters for bisection; the shared type-check is what makes a cold build slow, and it stays because it is the check that catches
the broken-import class of error a test run is supposed to surface.

## Resetting

```bash
docker compose -f docker-compose.test.yml down -v     # wipe the volume
npm run test:e2e:local -- --fresh                     # or: wipe + migrate + seed + run
```

The database is deliberately left running after a run: migrations and seeding are idempotent, so the next run starts in 1 min
instead of 7.

## First-time setup

```bash
docker compose -f docker-compose.test.yml up -d --wait   # creates the volume and the roles
npx playwright install chromium                          # once per machine
```

`docker/test-db/01-roles.sql` creates `ultraos_app` and `ultraos_staging` before the migrations run. Without it the first
`GRANT` fails with `role "ultraos_app" does not exist`, because those roles exist on the server but not in a fresh container —
and creating them matters, since RLS behaves differently under the owning account, which is exactly what the multi-tenant spec
is there to catch.

## Why the seed is minimal

`prisma/seed-test.ts` is **not** the demo seed. The demo seed builds a whole league; that would slow the suite down and quietly
supply state the specs are supposed to create themselves. The test seed creates only what the preparation scripts assume:

- the `e2e-league` organization, forced to the **ENTERPRISE** plan (FREE caps a tenant at one competition, and
  `e2e-prepare.ts` already creates one — the wizard spec hit that quota instead of a success message),
- the `neon-ultra` organization, because the public homepage resolves that slug as a constant and throws
  `OrganizationNotFoundError` without it, which surfaces as a 900-second webServer timeout that looks like a build problem,
- football and basketball, and one venue (a fixture cannot be created without one).

## Environment

`web/.env.test` is committed on purpose: nothing in it is a secret and a developer should not need credentials to run the
suite. It points at the local container, sets a test-only `AUTH_SECRET` (sessions cannot be replayed against a real deployment),
enables `BACHS_MOCK=1`, and turns the coaching flag on so the multi-tenant spec can walk into that subtree.

## When it fails

The harness prints a timing table, so the first question — "did the app fail, or did the build?" — is answered by looking at
which step took the time. A 900-second failure with `Timed out waiting from config.webServer` is the old symptom of the homepage
throwing; in this harness the server is started explicitly and probed at `/api/v1/live`, so that failure mode now names the step.
