# deploy/ops — raivstream VPS backups

Nightly backups of every UltraLeague OS database and the Raivstream Supabase stack, off-site
copies to Cloudflare R2, retention, and failure/freshness alerts. Operator runbook:
`documentation/runbooks/BACKUP_RESTORE.md`.

## Files

| File | Installed as |
|---|---|
| `backup-supabase.sh` | `/root/raivstream/scripts/backup-supabase.sh` |
| `backup-offsite.sh` | `/root/raivstream/scripts/backup-offsite.sh` |
| `backup-retention.sh` | `/root/raivstream/scripts/backup-retention.sh` |
| `backup-retention-all.sh` | `/root/raivstream/scripts/backup-retention-all.sh` |
| `send-alert.sh` | `/root/raivstream/scripts/send-alert.sh` |
| `backup-alert.sh` | `/root/raivstream/scripts/backup-alert.sh` |
| `backup-freshness.sh` | `/root/raivstream/scripts/backup-freshness.sh` |
| `raivstream-backup.{service,timer}` | `/etc/systemd/system/` |
| `ultraos-staging-backup.{service,timer}` | `/etc/systemd/system/` |
| `backup-offsite.{service,timer}` | `/etc/systemd/system/` |
| `backup-alert@.service` | `/etc/systemd/system/` |
| `backup-freshness.{service,timer}` | `/etc/systemd/system/` |
| `ultraos-staging-backup.service.d/privileged-role.conf` | `/etc/systemd/system/ultraos-staging-backup.service.d/` |
| `ultraos-backup.service.d/privileged-role.conf` | `/etc/systemd/system/ultraos-backup.service.d/` |
| `ultraos-backup.service.d/alerts-retention.conf` | `/etc/systemd/system/ultraos-backup.service.d/` |

The production unit `ultraos-backup.service` itself and `web/scripts/backup-database.sh` live in
the app repo (`web/`); the drop-ins above adapt them.

## Schedule (server time, CEST/CET)

`ultraos 03:00` → `raivstream 03:20` → `staging 03:35` → `offsite 04:00` → `retention (cron) 04:30`
→ `freshness 09:00`. Every backup/offsite unit has `OnFailure=backup-alert@%n.service`.

## Install / rebuild on the host

```bash
# from a checkout of the repo, on the VPS
sudo install -d -m 0755 /root/raivstream/scripts
sudo cp deploy/ops/*.sh /root/raivstream/scripts/
sudo sed -i 's/\r$//' /root/raivstream/scripts/*.sh
sudo chmod 0755 /root/raivstream/scripts/*.sh
sudo cp deploy/ops/*.service deploy/ops/*.timer /etc/systemd/system/
sudo sed -i 's/\r$//' /etc/systemd/system/raivstream-backup.* /etc/systemd/system/ultraos-staging-backup.* \
  /etc/systemd/system/backup-offsite.* /etc/systemd/system/backup-alert@.service /etc/systemd/system/backup-freshness.*
sudo install -d /etc/systemd/system/ultraos-backup.service.d /etc/systemd/system/ultraos-staging-backup.service.d
sudo cp deploy/ops/ultraos-backup.service.d/*.conf /etc/systemd/system/ultraos-backup.service.d/
sudo cp deploy/ops/ultraos-staging-backup.service.d/*.conf /etc/systemd/system/ultraos-staging-backup.service.d/
sudo sed -i 's/\r$//' /etc/systemd/system/ultraos-backup.service.d/*.conf /etc/systemd/system/ultraos-staging-backup.service.d/*.conf
sudo systemctl daemon-reload
sudo systemctl enable --now raivstream-backup.timer ultraos-staging-backup.timer backup-offsite.timer backup-freshness.timer
# retention cron
( crontab -l 2>/dev/null | grep -v backup-retention-all.sh; \
  echo '30 4 * * * /bin/bash /root/raivstream/scripts/backup-retention-all.sh >> /root/raivstream/backup-retention.log 2>&1' ) | crontab -
```

## Secrets (not in git)

- `/etc/ultraos-backup/rclone.conf` (mode 600, root-only) — R2 S3 credentials for bucket
  `vps-backups-raivstream`. Rebuild it from the Cloudflare R2 API token (access key id + secret,
  endpoint `https://<account-id>.r2.cloudflarestorage.com`).
- SMTP settings are read at send time from `/opt/ultraleagueos/shared/web.env` (the app's own
  settings) — never copied here.

## Notes

- Both `ultraleagueos` and `ultraos_staging` are databases inside the `ultraos-postgres` container
  (127.0.0.1:55411). The production unit needs a privileged `EnvironmentFile`
  (`/opt/ultraleagueos/shared/migrate.env`, superuser/BYPASSRLS) because the runtime role is subject
  to row-level security; staging mirrors this via its own drop-in.
- Retention is owned by `backup-retention-all.sh`; the inline prune in
  `web/scripts/backup-database.sh` is off unless `ULTRA_BACKUP_RETENTION_DAYS` is a positive number
  (units set 3650 to keep it inert, including against older deployed copies).
