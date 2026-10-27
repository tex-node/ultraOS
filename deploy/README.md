# Deployment

UltraLeagueOS deploys from git. `deploy/deploy.sh` builds a release on the VPS from a git ref and
swaps the `current` symlink — no tarballs, no hand-assembled overlays.

## How a release is produced

1. `git fetch` in `<app-root>/source` (a checkout on the VPS) and `checkout --force <ref>`.
2. `npm ci` → `prisma generate` → `next build` (Node heap raised to 4 GB).
3. Copy the built `web/` into `<app-root>/releases/release-<sha>-<timestamp>/web`.
4. Optionally `prisma migrate deploy` with the privileged database URL.
5. `chown` the release to the app-root owner, swap `<app-root>/current`, restart the service.
6. Prune old releases (keeps the last 5).

The service unit runs from `<app-root>/current/web`, so a symlink swap + restart is atomic.

## A fresh host needs these env values (feature flags included)

`deploy.sh` reads `<app-root>/shared/web.env` (the `--env-file`) for the build and the service. That file
is **not tracked** (it holds secrets), so a new host starts empty and every feature flag silently reads
"off". This list is the reproducibility checklist; `web/.env.example` carries the same names with
placeholder values and comments.

**Required**

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | app role, subject to RLS. The privileged URL for migrations lives in `shared/migrate.env`. |
| `AUTH_SECRET` | signs session JWTs; also the JWT salt source (see the smoke test below) |
| `AUTH_URL` | the public origin. **https** changes the session cookie to `__Secure-authjs.session-token` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | sign-in |
| `R2_*` | media storage (or `MEDIA_STORAGE_PROVIDER=LOCAL_PERSISTENT_STORAGE` + `MEDIA_LOCAL_ROOT`) |
| `SMTP_*` / `EMAIL_FROM` | transactional email |
| `BACH_API_BASE` / `BACHS_KEY` / `BACHS_SANDBOX_KEY` / `BACHS_WEBHOOK_SECRET` | payments. **Staging must use `BACHS_SANDBOX_KEY`** (a sandbox key, `sk_sandbox_…`), never the production `sk_live_…` one. Since v22 the server refuses to start and the deploy refuses to run when `APP_ENV=staging` and the key is `sk_live_…`; `BACHS_MOCK=1` is the supported way to run a test environment with no sandbox key at all. Legacy names `BACH_IO` / `BACH_WEBHOOK` are still read. |

**Feature flags — a missing flag means OFF, which is how the coaching stack shipped dark for a day**

| Variable | Default | Effect |
| --- | --- | --- |
| `COACHING_ASSISTANT_ENABLED` | `false` | Every `/coaching` route (I2 selection advisor, I3 training, I6 passport entry points). **Production is `true` since 2026-10-18.** Server-side only: no `NEXT_PUBLIC_` prefix, deliberately. |
| `NEXT_PUBLIC_OFFLINE_SCORING_ENABLED` | `false` | The offline capture UI (P13). Client-visible, so it is baked into the browser bundle at build time. |
| `VISION_WORKER_URL` | `http://127.0.0.1:8010` | Where `scripts/vision-ingest.ts` POSTs `/analyze`. Optional: without it the `GameVideo` row is `READY_FOR_ANALYSIS` and the worker's poller collects it. Port 8000 on the staging host is an unrelated Kong gateway. |
| `VISION_WORKER_TOKEN` | empty | Bearer token for the worker when it sits behind an authenticating proxy. |
| `TESSERACT_BINARY` / `OCR_PREPROCESS` | `tesseract` / on | The image-scoresheet OCR path only; `OCR_PREPROCESS=off` disables the upscale/median/sharpen preprocessing. The CSV/XLSX path needs neither. |
| `MEDIA_LOCAL_ROOT` | `<cwd>/.media` | Where local media (incl. ingested videos) is stored. Staging: `/opt/ultraos-staging/shared/media`. |
| `VISION_*` (`services/vision/.env`) | from `.env.example` | The vision stack reads its own `.env`, which is **gitignored** and therefore wiped by every deploy's `git clean`. The deploy script now recreates it from `.env.example` when missing (it never overwrites an existing one, because it may hold real credentials). Starting the stack without checking `DATABASE_URL` there will fail with "env file not found" or a connection error, which is configuration, not a broken service. |
| `CRON_SECRET` | empty (**endpoint disabled**) | Shared secret for `GET /api/cron/drain-feeds`, the partner data-feed drain. **Fails closed:** with it unset the route answers 503 and refuses everything, so a host that forgets the variable cannot expose an endpoint that makes the server POST to partner webhook URLs. Generate with `openssl rand -hex 32` and install the timer with `deploy/ops/install-feed-drain-timer.sh <app-root> <port> <env>`. |

**Check a new host with:** `bash /root/smoke-test.sh` after the first deploy — it fails if a coaching route
404s, which is exactly what a missing flag looks like.

## One-time setup (already done)

- A read-only **deploy key** (`/root/.ssh/ultraos_deploy` on the VPS) is registered on
  `tex-node/ultraOS`.
- The VPS `~/.ssh/config` maps the alias `github.com-ultraos` → that key.
- Repo URL used by the script: `git@github.com-ultraos:tex-node/ultraOS.git`.

## Deploy

```bash
# staging
bash /root/deploy.sh \
  --app-root /opt/ultraos-staging \
  --service ultraos-staging-web.service \
  --env-file /opt/ultraos-staging/shared/web.env \
  --migrate

# production
bash /root/deploy.sh \
  --app-root /opt/ultraleagueos \
  --service ultraos-web.service \
  --env-file /opt/ultraleagueos/shared/web.env \
  --migrate
```

Omit `--migrate` when no migrations have changed. Add `--ref <sha|branch>` to deploy a specific
revision (default `origin/main`).

**Pass a remote-tracking ref (`--ref origin/<branch>`) or a sha, not a bare branch name.** The script
runs `git fetch --all --prune` and then `git checkout --force <ref>`; a bare branch name resolves to
the **local** branch in `<app-root>/source`, which is only as new as the last time that worktree was
updated. On 2026-10-18 `--ref ops/reconcile-backup-design` deployed a five-commit-stale tree: the fetch
had updated `origin/ops/reconcile-backup-design` and said so, the checkout silently stayed on the old
local branch, and the deploy still reported success. The release name carries the resolved sha - check
it against the commit you meant to ship before believing a deploy.

## The smoke test runs automatically

`deploy.sh` no longer ends at "service: active", because that is not proof the app can serve a page. On
2026-10-18 a release passed `tsc` and `next build`, then the production server refused to boot because
two dynamic segments used different slug names (`/players/[id]` vs `/players/[playerId]`) - **Next.js
rejects that at startup, not at build time** - and every route returned 500 while the deploy reported
success.

Every deploy now:

1. copies `deploy/ops/smoke-test.sh` from the deployed ref to `<app-root>/smoke-test.sh` (a release only
   contains `web/`, so the script cannot live inside it),
2. runs it against the new release, and
3. **exits 5 with rollback instructions** if any route fails - a deploy that boots but serves nothing is
   a failed deploy.

Run it by hand at any time:

```bash
bash /root/smoke-test.sh                       # staging (mints a session from the DB)
BASE_URL=https://app.neonultra.ng AUTH_TOKEN=<cookie-value> bash /root/smoke-test.sh   # any env
bash /root/smoke-test.sh --help 2>/dev/null || true
```

It asserts, for each route, both `200` **and** the page's signature text - so an error boundary, a
redirect to `/no-league`, or a blank shell fails the check rather than passing as "200 OK". It also
reports the service state and the error count since the service started. Env: `BASE_URL`, `AUTH_TOKEN`
(reuse a session cookie instead of minting), `SMOKE_EMAIL` (default `texdevices@gmail.com`), `SMOKE_ORG`,
`APP_ROOT`, `ENV_FILE`, `MIGRATE_ENV`, `ROUTES_FILE` (replace the route set), `SERVICE`. `SKIP_SMOKE=1`
or `--skip-smoke` bypasses it for a deliberate emergency deploy.

## Migrations

`--migrate` runs `prisma migrate deploy` using the **privileged** database URL read from
`<app-root>/shared/migrate.env` (`DATABASE_URL=...`), never from the app's runtime role (which is
subject to RLS). `--migrate-db-url` overrides the file if needed.

## Release layout

```
<app-root>/
  source/                     # git checkout used to build
  releases/release-<sha>-<ts>/web
  current -> releases/release-<sha>-<ts>
  shared/                     # web.env, migrate.env, media, backups
```

## Rollback

Point `current` at a previous release and restart:

```bash
ls -1dt /opt/ultraleagueos/releases/release-*      # pick a target
ln -sfn /opt/ultraleagueos/releases/<target> /opt/ultraleagueos/current
systemctl restart ultraos-web.service
```

Database rollback is a restore from a verified backup (see the migration runbooks).

## Notes

- `npm ci` runs on every deploy (the source checkout is cleaned with `git clean -fdx`), so builds
  are reproducible but take a few minutes.
- The VPS has ~6 GB of usable RAM; builds use `--max-old-space-size=4096` to avoid the TypeScript
  step OOM-ing.
- The script never prints env values.

### Payments: staging must never hold a live Bachs key

Both environments read `BACHS_KEY`, falling back to the legacy name `BACH_IO`. Until 2026-10-27 **staging held the same
`sk_live_…` key as production**, which means a checkout created on staging was a real Bachs checkout and a curious click
could have charged a real customer. What prevented it was only that `BACHS_PRODUCT_PRO` / `BACHS_PRODUCT_ENTERPRISE`
were unset, so the action failed before reaching the network - a configuration accident, not a control.

Rules:

1. **Staging**: set `BACHS_KEY` (or `BACH_IO`) to a sandbox key, and set `BACHS_MOCK=1` when no sandbox key exists yet.
   `/settings/billing` shows a red warning while a live key is detected outside production.
2. **Production**: the live key belongs here, together with `BACHS_PRODUCT_PRO`, `BACHS_PRODUCT_ENTERPRISE` and
   `BACHS_WEBHOOK_SECRET`.
3. A key is rotated by updating `shared/web.env` and restarting the service - never by editing code.

The check is `NODE_ENV`-independent on purpose: `next start` sets `NODE_ENV=production` on staging too, so the detection
uses `APP_ENV`, then a loopback `AUTH_URL`/`NEXTAUTH_URL`, then `NODE_ENV` as the last resort.