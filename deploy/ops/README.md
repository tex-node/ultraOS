# deploy/ops — VPS-wide operations (NOT UltraLeague-only)

These files run on the shared **raivstream VPS** (`ssh raivstream`, `81.0.246.223`).
That host runs **several projects** — do **not** treat this folder as UltraLeague-only
and do not delete a script because UltraLeague doesn't reference it.

| Project | Backed up by | Schedule (server time) |
|---|---|---|
| UltraLeague OS production (`ultraleagueos`) | `ultraos-backup.timer` | 02:00 Africa/Lagos (+jitter) |
| Raivstream Supabase (`supabase-db`) | `raivstream-backup.timer` | 03:20 (+jitter) |
| UltraLeague OS staging (`ultraos_staging`) | `ultraos-staging-backup.timer` | 03:35 (+jitter) |
| off-site copy → Cloudflare R2 | `backup-offsite.timer` | 04:00 |
| retention (14 daily + 8 weekly) | `backup-retention.timer` | 04:30 |
| freshness check (26 h → email) | `backup-freshness.timer` | 09:00 |
| Powervend, syncshowflow, Redis | not ours — **do not touch** | — |

## Files here and where they install on the host

| File | Installs to |
|---|---|
| `backup-supabase.sh`, `backup-retention.sh`, `backup-retention-all.sh`, `backup-offsite.sh`, `backup-freshness.sh`, `backup-alert.sh`, `r2-configure.sh` | `/root/ops/` |
| `backup-offsite.{service,timer}`, `backup-freshness.{service,timer}`, `backup-retention.{service,timer}`, `backup-alert@.service` | `/etc/systemd/system/` |
| `raivstream-backup.{service,timer}` + `.service.d/script-path.conf` | `/etc/systemd/system/` |
| `ultraos-staging-backup.{service,timer}` + `.service.d/privileged-role.conf` | `/etc/systemd/system/` |
| `ultraos-backup.service.d/retention-defer.conf` | `/etc/systemd/system/ultraos-backup.service.d/` |

Every backup/offsite/retention/freshness unit sets **`OnFailure=backup-alert@%n.service`**,
which emails the failing unit + last 30 journal lines.

## Alerting

`backup-alert.sh` sends via **Resend** (`RESEND_API_KEY` read at runtime from
`/root/raivstream/.env`; never in git). Recipient defaults to `texdevices@gmail.com`.

## Off-site (R2)

- `r2-configure.sh` builds `/etc/ultraos-backup/rclone.conf` (mode 600) from a root-only
  source file, then shreds the source. Defines `[r2]` (Cloudflare S3) + `[r2crypt]`
  (rclone crypt over `r2:vps-backups-raivstream`).
- Layout: `r2:<bucket>/<host>/<db>/daily/<file>` and `…/<db>/monthly/<file>` on the 1st.
  **Copy-only** (never `sync`). Lifecycle: `daily/`=30 d, `monthly/`=365 d.
- **Two crypt secrets are required to decrypt** (password **and** salt). Stored at
  `/etc/ultraos-backup/rclone-crypt-password.txt` and `…-password-salt.txt` (mode 600),
  and held **offline by the owner**. Without both, off-site restores are impossible.

## Retention

`backup-retention.sh` keeps the **newest 14 dumps + the newest of each of the last 8 ISO
weeks**, never deletes the newest, `DRY_RUN=1` reports only. The prod/staging units set
`ULTRA_BACKUP_RETENTION_DAYS=3650` (`retention-defer.conf`) so `web/scripts/backup-database.sh`'s
inline 14-day prune does not fight this rule.

## Secrets

**Never in git.** Runtime credentials live in root-only env files on the host
(`/etc/ultraos-backup/*`, `*.env`, mode 600).

## History

A duplicate design was committed 2026-10-15 19:51 (`16b8628`) and **never installed**.
The design described above is the one **deployed** on the VPS (backups 2026-10-15,
off-site + freshness + alerts 2026-10-15/16) and is what this folder now matches.
