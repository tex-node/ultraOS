# Season Zero Production Deployment Plan

This plan prepares deployment only. Do not deploy until reviewed and approved.

Production architecture:

- Application: Next.js web app.
- Database: PostgreSQL configured by `DATABASE_URL`.
- Domain: `app.neonultra.ng`.
- Reverse proxy: Caddy.
- File storage: configured S3-compatible storage where `R2_BUCKET`, `S3_BUCKET`, or `FILE_STORAGE_BUCKET` is set.
- Backups: local backup directory plus off-host destination.

Release layout:

```text
/opt/ultraos/releases/<timestamp>
/opt/ultraos/current
```

Deployment principles:

- Build immutable release directories.
- Preserve existing Caddy entries.
- Preserve existing VPS files and apps.
- Do not overwrite the static prototype until production release is approved.
- Run database migrations before switching the `current` symlink.
- Keep the previous release available for rollback.

Pre-deploy checks:

```text
npm run db:validate
npm run db:generate
npm run typecheck
npm run lint
npm test
npm run build
npm run season-zero:preflight
npm run season-zero:env
```

Migration process:

1. Create a database backup.
2. Verify backup checksum.
3. Copy backup off-host.
4. Run migrations against production.
5. Verify `_prisma_migrations`.
6. Run `npm run season-zero:preflight`.

Release process:

1. Build locally or on the release host.
2. Copy release to `/opt/ultraos/releases/<timestamp>`.
3. Install production dependencies.
4. Generate Prisma client.
5. Run migrations.
6. Run preflight.
7. Update `/opt/ultraos/current`.
8. Reload process manager.
9. Verify `/login`, `/dashboard`, `/operations`, `/launch-readiness`, public pages, and Draft Day routes.

Rollback process:

1. Switch `/opt/ultraos/current` back to the previous release.
2. Reload process manager.
3. If a migration caused data damage, restore the verified backup into a temporary database first and compare critical counts.
4. Restore production database only with commissioner approval.

Caddy and DNS:

- Maintain existing Caddy server blocks.
- Add or update only the `app.neonultra.ng` upstream if approved.
- Keep HTTPS certificate active.
- Do not remove unrelated entries.

Health checks:

- Application build succeeds.
- Database reachable.
- Migrations current.
- Login works.
- Operations dashboard loads.
- Launch readiness report loads.
- Public pages load.
- QR check-in route loads.
- Draft display route recovers after refresh.
