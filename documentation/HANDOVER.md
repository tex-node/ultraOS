# Handover — UltraLeagueOS

**Read this first if you are picking this project up cold.** It is written so that a competent engineer or agent can be
productive in about thirty minutes: what the platform is, where it runs, how to deploy and test it, and what is still
missing.

---

## 1. What this platform is

UltraLeagueOS is a multi-sport league management platform: it runs competitions end to end — organisations, seasons,
fixtures, live scoring with sport-aware rules, standings and Elo ratings — and publishes them: a public tournament site, a
match centre, athlete passports, AI video analysis with auto-cut highlight clips, and a partner data feed (signed
webhooks + a REST API) for sportsbooks. It is genuinely multi-tenant: every organisation's data is isolated by PostgreSQL
row-level security, not by application filters.

## 2. Current state

| Area | State |
| --- | --- |
| Sports | Basketball, Football, Tennis, Volleyball, Cricket, Baseball, Table Tennis, American Football, Flag Race |
| Fixtures | Round robin (single/double) and knockout, byes skipped, generated in one transaction by the wizard |
| Scoring | Live console per sport (clock/period aware), offline queue, undo, finalisation, standings recalculation |
| Analytics | Elo, win probability, data-quality dashboard with integrity checks |
| Vision | YOLO inference, observation review, 10-second highlight clips uploaded to R2 |
| Coaching | Plans, selection advisor, training trends, athlete passports — behind `COACHING_ASSISTANT_ENABLED` (on) |
| Ticketing & payments | Bachs integration: ticketing webhook live; **subscription checkout only tested against the mock** |
| Tests | 1028 unit · 26 component · 49 database · 7 browser, all green on the host under Node 22 |
| Bugs known | See §7 — nothing blocks a launch; all are cosmetic or external |

## 3. Environment

| | Production | Staging |
| --- | --- | --- |
| Public URL | `https://app.neonultra.ng` (internal `http://127.0.0.1:4110`) | `http://127.0.0.1:4120` |
| App root | `/opt/ultraleagueos` | `/opt/ultraos-staging` |
| service | `ultraos-web.service` | `ultraos-staging-web.service` |
| Env file | `/opt/ultraleagueos/shared/web.env` | `/opt/ultraos-staging/shared/web.env` |
| Database | PostgreSQL 16 on the same host, app role subject to RLS; privileged URL in `shared/migrate.env` | second database on the same server |
| Node | **22.22.2** (`/opt/node22`, symlinked into `/usr/local/bin`) | same |
| Media | Cloudflare R2 (`pub-e130aa56d5b242f68e0574ce9e065d59.r2.dev`) | same bucket |
| Backups | nightly `ultraos-backup.timer` → `/var/backups/ultraleagueos/`; every deploy also writes a pre-deploy dump to `/var/backups/ultraleagueos-production/` | `ultraos-staging-backup.timer` |

SSH access is `ssh raivstream` (81.0.246.223). The VPS reads the repo with a read-only deploy key.

## 4. Deploy

**Always use the wrapper** — it keeps the full transcript and propagates the deploy's exit code:

```bash
ssh raivstream
cd <a checkout of this repo>          # or /opt/ultraos-staging/source after a deploy
bash deploy/ops/deploy-with-log.sh staging   --ref origin/main --migrate
bash deploy/ops/deploy-with-log.sh production --ref origin/main --migrate
```

Logs land in `deploy-logs/`. Inside, it runs `deploy/deploy.sh` (on the host at `/root/deploy.sh`), which fetches the ref,
runs `npm ci`, `prisma generate`, `next build`, optionally `prisma migrate deploy`, swaps the `current` symlink, restarts
the unit, runs the smoke test and prunes old releases.

**Never pipe a deploy through `grep`.** The pipeline's exit status is grep's, and a deploy that fails before printing a
matching line looks exactly like a deploy that printed nothing — that mistake is what "the silent deploy" in the v22
report actually was (see `session.md`, v23 Prompt 1).

## 5. Test

Run on the host, in `…/source/web` (Node 22 is the default there):

```bash
npm test              # unit — 1028 tests
npm run test:component # component — 26 tests (jsdom)
npm run test:db        # database — 49 tests against a scratch clone (≈6 min)
npm run test:e2e       # browser — needs a running deployment; see below
```

`test:e2e` targets `E2E_BASE_URL`. The runner scripts prepare the fixtures it needs:

```bash
export E2E_BASE_URL=http://127.0.0.1:4120
node --conditions=react-server --import tsx scripts/e2e-prepare.ts        --organization <orgId>   # admin, competition, live fixture
node --conditions=react-server --import tsx scripts/e2e-tenant-prepare.ts                          # two tenants with admins
npx playwright test e2e/registration.spec.ts e2e/scoring.spec.ts e2e/wizard.spec.ts e2e/multi-tenant-auth.spec.ts --project=chromium
```

`web/e2e/onboarding-dry-run.spec.ts` is separate: it creates a real organisation and writes screenshots.

## 6. Where things live

| Path | What |
| --- | --- |
| `web/src/app` | Next.js 16 App Router: public site, operations console, admin, API routes |
| `web/src/lib` | Domain logic: sports registry, scoring, standings, Elo, data feed, media, plans, security |
| `web/src/server` | Server-side services used by actions and scripts |
| `web/prisma` | Schema **and** the SQL migrations — RLS policies and GRANTs live in the same file |
| `web/scripts` | Operational and verification scripts (every claim in `session.md` has one) |
| `services/vision` | FastAPI + YOLO worker |
| `deploy/` | `deploy.sh`, ops scripts, runbooks |
| `documentation/` | Architecture, roadmaps, onboarding, launch proof, screenshots |
| `session.md` | The project's lab notebook — every streak, every bug, every failure |

**Tenant pattern (do not deviate):** every tenant table gets `organizationId`, `@@unique([organizationId, id])`, RLS
`ENABLE` + `FORCE`, the canonical `tenant_isolation` policy on `app.current_org_id`, and `GRANT`s in the same migration.
Verify with `deploy/ops/verify-tenant-table.sh <table>`, **as the app role**.

## 7. Operational gaps — what a human has to do

**Bachs live migration — PARTIAL (verified 2026-10-29):** production has a `sk_live_…` key that differs from the one in
`cred/`, but the webhook signing secret is still the original, neither product id is set, and there is no
`ORG_UPGRADED_BY_BACHS` row in production. Two runbooks cover the rest: **`runbooks/BACHS_LIVE_MIGRATION.md`** (live keys,
proof payment, rollback) and **`runbooks/ROTATE_SECRETS.md`** (every secret, the leak procedure, and the `export $(…|xargs)`
root cause).

**CLOSED in v24:** the Bachs sandbox key is on staging (`BACH_IO=sk_sandbox_…`, `BACHS_MOCK` removed, live-key banner
gone); the vision worker runs under Docker Compose with the real analyzer (`/health` → `yolov8n-person`); the branding
sweep is finished (login, public header, operator page labels, page titles); Node 22 is the host default.

1. **`BACHS_PRODUCT_PRO` / `BACHS_PRODUCT_ENTERPRISE` do not exist anywhere in `cred/`.** They are the only thing between
   the "Upgrade" button and Bachs: the sandbox key authenticates and the SDK targets `sandbox-api.bachs.io`, but
   `createSubscriptionCheckout()` stops with "No Bachs product configured for PRO". Read both ids off the Bachs dashboard
   (Products) and set them in staging and production. The key itself lacks the `products:read` scope, so they cannot be
   listed through the API.
2. **The sandbox checkout has therefore never completed a payment.** Once the product ids exist: click Upgrade on staging,
   pay with `4242 4242 4242 4242`, and confirm the webhook flips `Organization.plan` to PRO.
3. **CLOSED in v25** — the vision worker is under systemd (`ultraos-vision.service`), its config lives at
   `/opt/ultraos-vision/vision.env` outside any checkout, its logs rotate (10 MB x 3), its artifacts sit on the
   `vision-data` volume, and every service has a memory cap. See **`documentation/runbooks/SHARED_VPS_RISK.md`** for what
   else runs on the shared host and how to spot pressure.
4. **No footage with people in it.** The pipeline was proved end to end on synthetic clips; the orange-circle clip
   correctly produced **zero** observations (there are no people in it), so the "confirm an observation → HIGHLIGHT_CLIP →
   R2 → public match centre" leg has not been exercised with a real detection. The first real game video closes it.
5. **Bachs live product ids.** Production has the live key; the two live product ids are missing for the same reason as
   (1).
3. **The public portal header and the Ultra-Basketball operator pages still carry platform/demo naming**
   (`portal-shell.tsx` prints "NEON ULTRA"; `gameday`, `live`, `broadcast`, `launch-readiness` say "Season Zero"). A new
   organisation's own workspace, tab title and footer are correct — this is the remaining mechanical sweep.
4. **One deploy produced no output in v22** and a retry worked; the cause is now understood (a filtered pipeline) and the
   wrapper prevents it. No action needed beyond §4.
5. **The vision worker is not running, and has no systemd unit.** It is `services/vision` (FastAPI + Celery, port
   8010) with a venv at `/opt/ultraos-vision/venv` — deliberately outside any checkout, because deploys run
   `git clean -fdx`. Nothing on the host currently listens on 8010 (the 8000 listener is an unrelated Kong gateway), so
   video analysis only runs when someone starts the worker by hand. **Starting it under a systemd unit is the remaining
   infrastructure piece for vision**; the code, the venv and the YOLO weights are all in place, and
   `documentation/COACH_INTELLIGENCE_ROADMAP.md` records the inference measurements.

## 8. Read next, in this order

1. **`documentation/CUSTOMER_ONBOARDING.md`** — what a customer does, with screenshots and the friction points found by
   doing it.
2. **`documentation/MULTI_SPORT_ARCHITECTURE.md`** — how sports, scoring and standings are modelled.
3. **`documentation/COACH_INTELLIGENCE_ROADMAP.md`** — the coaching stack and the vision pipeline.
4. **`documentation/ROADMAP_CLOSE.md`** — every phase, marked DONE or BLOCKED with the evidence behind it.
5. **`documentation/FINAL_LAUNCH_PROOF.md`** — a whole league through the stack, with the webhook deliveries it produced.
6. **`documentation/runbooks/NODE_22_UPGRADE.md`** — how the host moved to Node 22, and how to roll it back.
7. **`documentation/runbooks/BACHS_LIVE_MIGRATION.md`** — finishing the live migration: keys, webhook secret, product ids, the ₦100
   proof payment, and the rollback that restores the previous env.
8. **`documentation/runbooks/ROTATE_SECRETS.md`** — rotating any secret, what breaks while you do, what to do in the first
   minute after a leak, and how to check whether one already escaped.
9. **`documentation/runbooks/SHARED_VPS_RISK.md`** — the shared host: co-tenants, the heavy workloads, the three
   containment layers, and when to move Vision to its own VPS.
10. **`documentation/PROJECT_RETROSPECTIVE.md`** — the three bugs that mattered, the three investments that paid, what I would
    do differently, and the risks that remain. Read it before changing anything structural.
11. **`session.md`** — the honest history. Read the last two streaks first; they contain the two security bugs that
   mattered most (tenant isolation at sign-in, and a privilege escalation through the same policy fallback).
