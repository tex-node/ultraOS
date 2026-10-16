# Backup & restore runbook (raivstream VPS)

Covers every database on the host (`ssh raivstream`, `81.0.246.223`). Backups run
nightly; each is copied off-site to Cloudflare R2 encrypted. See also
`SERVER_MAINTENANCE.md` and `../../deploy/ops/README.md`.

## What is backed up, when, and where

| DB | Container / user | Nightly (server time) | Local dump dir | R2 path (`<host>/<db>/`) |
|---|---|---|---|---|
| Raivstream Supabase | `supabase-db` (`postgres`) | 03:26 (`raivstream-backup.timer`) | `/var/backups/raivstream/supabase-*.sql.gz` (+ `.sha256`) | `raivstream/daily|monthly/` |
| UltraLeague OS prod (`ultraleagueos`) | `ultraos-postgres` (`ultraos`) | 03:00 (`ultraos-backup.timer`) | `/var/backups/ultraleagueos/ultraos-*.dump` | `ultraleagueos/daily|monthly/` |
| UltraLeague OS staging (`ultraos_staging`) | `ultraos-postgres` (`ultraos_staging`) | 03:43 (`ultraos-staging-backup.timer`) | `/var/backups/ultraleagueos-staging/ultraos-*.dump` | `ultraleagueos-staging/daily|monthly/` |

Then: **04:00** off-site copy (`/root/ops/backup-offsite.sh` → R2, encrypted), **04:30**
retention (14 daily + newest of each of the last 8 ISO weeks; never the newest), **09:00**
freshness check (26 h staleness → email to `texdevices@gmail.com`).

- Dumps are **copy-only** to R2 (never `sync`); R2 lifecycle: `daily/`=30 d, `monthly/`=365 d.
- Off-site is **encrypted** by an rclone `crypt` remote (`r2crypt`). **Two secrets are
  required to decrypt:** the crypt password and the salt, stored at
  `/etc/ultraos-backup/rclone-crypt-password.txt` and `…-password-salt.txt` (mode 600).
  Both are also held **offline** by the owner — without them the off-site backups are lost.

## Restore — Raivstream Supabase (the important one)

The Raivstream dump is a **`pg_dumpall` plain SQL** dump (includes roles + all schemas:
`public`, `auth`, `storage`, `realtime`, …). Restore it into a **throwaway Postgres
container**, never the live Supabase cluster.

```bash
# 1. pick the newest local dump (or download one from R2 first — see below)
NEW=$(ls -t /var/backups/raivstream/supabase-*.sql.gz | head -n 1)

# 2. verify integrity
sha256sum -c "$NEW.sha256"

# 3. throwaway container (no volume, non-default port)
docker run -d --name restore_test -e POSTGRES_PASSWORD=testonly -p 127.0.0.1:55999:5432 postgres:16-alpine
docker exec restore_test pg_isready -U postgres

# 4. restore (ON_ERROR_STOP=0: Supabase extensions/roles are absent in vanilla PG)
zcat "$NEW" | docker exec -i restore_test psql -U postgres -d postgres -q -v ON_ERROR_STOP=0 > /tmp/restore.log 2>&1

# 5. compare row counts against live
for t in public.users public.videos public.generation_jobs public.credit_transactions public.story_projects auth.users; do
  echo "$t live=$(psql "$DATABASE_URL" -tAc "SELECT COUNT(*) FROM $t") restored=$(docker exec restore_test psql -U postgres -tAc "SELECT COUNT(*) FROM $t")"
done

# 6. clean up
docker rm -f restore_test
```

**Supabase-extension caveat (measured 2026-10-16):** a vanilla `postgres:16-alpine`
restore produces ~120 `ERROR` lines (`schema "net" does not exist`, `vault.*` relations/
functions, `extensions.verify`, `permission denied` on roles) — **none touch application
data**. For a *complete* restore use a **Supabase Postgres image** or pre-create
`pg_net`/`vault`/`pgcrypto` etc. before restoring.

### Download a dump from R2 (encrypted)

```bash
rclone --config /etc/ultraos-backup/rclone.conf copy \
  "r2crypt:$(hostname)/raivstream/daily/" /var/backups/roundtrip \
  --include "supabase-<stamp>.sql.gz"
# r2crypt decrypts transparently; then sha256sum against the local copy.
```

## Restore — UltraLeague OS prod / staging

Custom-format dumps → `pg_restore`:

```bash
NEW=$(ls -t /var/backups/ultraleagueos/ultraos-*.dump | head -n 1)
createdb -h 127.0.0.1 -p <scratch> ultraos_restore_test
pg_restore --dbname="postgresql://…/ultraos_restore_test" "$NEW"
# compare Game, GameEvent, Player, Application counts, then drop the scratch DB
```

## Drill results — 2026-10-16 (Raivstream)

Restored `supabase-20261016-012217.sql.gz` into a throwaway container; **all counts matched**:

| Table | live | restored |
|---|---|---|
| `public.users` | 55 | 55 |
| `public.videos` | 12 | 12 |
| `public.generation_jobs` | 558 | 558 |
| `public.credit_transactions` | 1539 | 1539 |
| `public.story_projects` | 89 | 89 |
| `auth.users` | 1 | 1 |

## Alerts / health

- Any backup/offsite unit failure → `backup-alert@%n.service` → email (Resend).
- 09:00 freshness check: newest local dump or newest R2 object older than 26 h → email.
- Check by hand: `systemctl list-timers | grep backup`, `crontab -l`, `tail /root/ops/logs/*.log`.
