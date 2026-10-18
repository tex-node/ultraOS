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
