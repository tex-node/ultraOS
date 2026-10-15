# Backup & Restore Runbook (raivstream VPS)

Everything here runs on the shared Contabo VPS `vmi3208643` (81.0.246.223, Ubuntu 24.04,
SSH alias `raivstream`). Source of truth for the scripts/units is `deploy/ops/` in the
`tex-node/ultraOS` repo; this runbook is the operator view.

## What is backed up, when

| Time (server, CEST/CET) | Unit | What | Local path | R2 path |
|---|---|---|---|---|
| 03:00 | `ultraos-backup.timer` | `ultraleagueos` (production) | `/var/backups/ultraleagueos/ultraos-*.dump` | `<host>/ultraleagueos/` |
| 03:20 (+jitter) | `raivstream-backup.timer` | Raivstream Supabase (`supabase-db`, `pg_dumpall`) | `/var/backups/raivstream/supabase-*.sql.gz` | `<host>/raivstream_supabase/` |
| 03:35 (+jitter) | `ultraos-staging-backup.timer` | `ultraos_staging` | `/var/backups/ultraleagueos-staging/ultraos-*.dump` | `<host>/ultraos_staging/` |
| 04:00 (+jitter) | `backup-offsite.timer` | copies the newest of each to R2 | — | see above |
| 04:30 | cron (`backup-retention-all.sh`) | local retention | all three folders | — |
| 09:00 | `backup-freshness.timer` | alerts if anything is > 26 h old | — | — |

- Production and staging both live inside the `ultraos-postgres` container (127.0.0.1:55411),
  as databases `ultraleagueos` and `ultraos_staging`.
- Retention (local): **14 daily + one per week for 8 weeks**, applied by the shared
  `backup-retention.sh` (never deletes the newest). The inline prune in
  `web/scripts/backup-database.sh` is disabled (`ULTRA_BACKUP_RETENTION_DAYS=3650`) so there is a
  single owner of retention.
- Retention (off-site): R2 lifecycle rules (see below) — 30 days daily, 365 days monthly.
- Every backup/offsite unit has `OnFailure=backup-alert@%n.service`; alerts go to
  **texdevices@gmail.com** via the app's SMTP settings.

## Off-site (Cloudflare R2)

- Bucket: `vps-backups-raivstream`. Endpoint (account `3478db71b0394bf155af6281f8e07887`):
  `https://3478db71b0394bf155af6281f8e07887.r2.cloudflarestorage.com`.
- Credentials: `/etc/ultraos-backup/rclone.conf` (mode 600, root-only; never in git). The key is
  scoped to this one bucket.
- Layout: `r2:vps-backups-raivstream/<host>/<db>/` (daily) and `.../monthly/<host>/<db>/` (1st of
  the month).
- **Lifecycle rules to set in the Cloudflare dashboard** (R2 has no native daily+monthly tier, so
  two rules with disjoint prefixes):
  1. Prefix `<host>/` (e.g. `vmi3208643/`) → **Delete objects after 30 days**.
  2. Prefix `monthly/` → **Delete objects after 365 days**.
- Copies are **copy-only** (`rclone copy`, never `sync`) — a local deletion never propagates to R2.

## Verify a dump

```bash
# local
cd /var/backups/ultraleagueos && sha256sum -c ultraos-YYYYMMDD-HHMMSS.dump.sha256
# list what's in the dump
pg_restore --list ultraos-YYYYMMDD-HHMMSS.dump | head
# off-site: download and check
rclone --config /etc/ultraos-backup/rclone.conf copy \
  r2:vps-backups-raivstream/$(hostname -s)/ultraleagueos/ /tmp/check/
cd /tmp/check && sha256sum -c ultraos-YYYYMMDD-HHMMSS.dump.sha256
```

## Restore

Never restore over the live database. Restore into a scratch database on the same container
(`ultraos-postgres`, superuser role `ultraos`), check it, then drop it.

### UltraLeague OS production (`ultraleagueos`) / staging (`ultraos_staging`)

```bash
C=ultraos-postgres; U=ultraos; TDB=ultraos_restore_test
DUMP=/var/backups/ultraleagueos/ultraos-YYYYMMDD-HHMMSS.dump   # or download from R2 first
docker exec $C dropdb -U $U --if-exists $TDB
docker exec $C createdb -U $U $TDB
docker exec -i $C pg_restore -U $U -d $TDB --no-owner --no-acl < "$DUMP"
docker exec $C psql -U $U -d $TDB -Atc 'select count(*) from "Game"'
docker exec $C dropdb -U $U $TDB
```
To restore staging instead, use `pg_restore` against a scratch DB and the staging dump from
`/var/backups/ultraleagueos-staging/` (or R2 `.../ultraos_staging/`).

### Raivstream Supabase (`supabase-db`)

The dump is a `pg_dumpall` (roles + all databases), gzipped.

```bash
gunzip -c /var/backups/raivstream/supabase-YYYYMMDD-HHMMSS.sql.gz > /tmp/supabase.sql
# restore into a scratch container/DB, never the live one; pg_dumpall includes CREATE ROLE etc.
docker exec -i supabase-db psql -U postgres -d postgres < /tmp/supabase.sql
```

## Last drill

2026-10-15: restored `ultraos-20261015-091940.dump` into `ultraos_restore_test` and compared to
production — Game 53 = 53, GameEvent 9 = 9, Player 400 = 400, Application 342 = 342 (all MATCH);
scratch DB dropped.
