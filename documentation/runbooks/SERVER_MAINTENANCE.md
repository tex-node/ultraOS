# Server Maintenance Checklist (raivstream VPS)

Host: Contabo VPS `vmi3208643`, 81.0.246.223, Ubuntu 24.04, SSH alias `raivstream`.
Shared host: UltraLeague OS production (`ultraos-web.service`, app.neonultra.ng) and staging
(`ultraos-staging-web.service`), the nightly backup (`ultraos-backup.timer`), Raivstream's
self-hosted Supabase (Docker, db.raivstream.com), Caddy, and anything else found in Step 2.

Purpose: apply pending security updates and the pending restart without losing data or leaving a
service down. Expected downtime: 5-15 minutes for every site on the host.

Time zones: the server shows CEST (Lagos + 1 h) until 25 Oct 2026, then CET (same as Lagos).

---

## Step 0: plan (the day before)

- [ ] Pick a quiet window: no game day, draft, broadcast or registration deadline. Avoid
      02:45-03:30 server time (the backup timer runs at 03:02).
- [ ] Tell anyone who uses the sites (coaches, scorers, Raivstream team) the window.
- [ ] Confirm you can open the **Contabo control panel** and its **VNC console** for this VPS. If SSH
      doesn't come back after the restart, that's how you get in.
- [ ] Allow 60 minutes in total.

## Step 1: Contabo snapshot (the real safety net)

- [ ] Contabo control panel -> your VPS -> **Snapshots** -> create snapshot, named
      `pre-maintenance-YYYYMMDD`. Wait until it shows as complete.
      If something goes badly wrong, restoring this snapshot puts the whole server back as it was.

## Step 2: record what's running now (baseline)

Open PowerShell on your PC and connect:
```
ssh raivstream
```
Then on the server, paste:
```bash
mkdir -p /root/maint && cd /root/maint && D=$(date +%Y%m%d)
systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' | sort > services-before-$D.txt
systemctl list-timers --all --no-pager > timers-before-$D.txt
docker ps --format '{{.Names}}  {{.Status}}' | sort > docker-before-$D.txt
ss -tlnp | awk 'NR>1{print $4}' | sort -u > ports-before-$D.txt
grep -hE '^[^#[:space:]].*\{' /etc/caddy/Caddyfile /etc/caddy/*.caddy /etc/caddy/sites/* 2>/dev/null | sed 's/[[:space:]]*{.*//' | tr ',' '\n' | sed 's/^[[:space:]]*//' | grep -E '\.' | sort -u > sites.txt
uname -r > kernel-before-$D.txt; df -h / ; free -h; uptime
wc -l services-before-$D.txt docker-before-$D.txt sites.txt; cat sites.txt
```
- [ ] Check `sites.txt` lists your real domains (app.neonultra.ng, db.raivstream.com, ...). Add any
      that are missing with `echo the.domain >> sites.txt`.

Check every site answers before you start, so you know what "working" looks like:
```bash
for u in $(cat sites.txt); do printf '%-40s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "https://$u"; done | tee sites-before-$D.txt
```
200, 301, 302, 401 and 403 all mean "up". 000 or 5xx means it was already broken before you started:
note it so you don't chase it afterwards.

## Step 3: fresh backups, copied off the server

Production database (the fixed backup service):
```bash
systemctl start ultraos-backup.service; systemctl show -p ExecMainStatus ultraos-backup.service
ls -lh /var/backups/ultraleagueos | tail -3
```
- [ ] `ExecMainStatus=0`, and the newest `.dump` has a matching `.sha256` and is about 1 MB or more.

Raivstream Supabase database (check the container name in `docker-before-*.txt`; usually `supabase-db`):
```bash
docker exec supabase-db pg_dumpall -U postgres | gzip > /root/maint/supabase-$D.sql.gz && ls -lh /root/maint/supabase-$D.sql.gz
```
- [ ] The file is clearly larger than a few KB.

Copy both to your PC. **In a second PowerShell window on your PC** (not the server):
```
mkdir C:\Backups\raivstream-vps -Force
scp "raivstream:/var/backups/ultraleagueos/*.dump" C:\Backups\raivstream-vps\
scp "raivstream:/root/maint/supabase-*.sql.gz" C:\Backups\raivstream-vps\
```
- [ ] Files are on your PC. (Staging data is covered by the Contabo snapshot.)

## Step 4: apply updates

Back in the server window:
```bash
apt update
apt list --upgradable 2>/dev/null | tee /root/maint/upgradable-$D.txt
apt upgrade
```
- [ ] If asked about a modified configuration file: choose **keep the local version currently
      installed** (the default, `N`). Your Caddy, Postgres and SSH settings must not be replaced.
- [ ] If Docker or PostgreSQL packages are in the list, their services restart during the
      upgrade. That's expected inside the window.
- [ ] Packages "kept back" are fine; don't force them.

**Do not** run `do-release-upgrade` (the 26.04 upgrade the login banner offers). That's a separate,
bigger project with its own plan. **Do not** run `apt autoremove` until after the reboot is verified.

## Step 5: restart

```bash
cat /var/run/reboot-required.pkgs 2>/dev/null
reboot
```
- [ ] Wait 3 minutes, then on your PC: `ssh raivstream`.
- [ ] No answer after 10 minutes: open the Contabo **VNC console** and check the screen. If the server
      won't boot, restore the Step 1 snapshot from the control panel.

## Step 6: verify everything came back

```bash
cd /root/maint && D=$(date +%Y%m%d)
uptime; uname -r; cat kernel-before-*.txt
systemctl --failed --no-pager
systemctl list-units --type=service --state=running --no-legend --plain | awk '{print $1}' | sort > services-after.txt
echo "== services missing after reboot =="; comm -23 services-before-*.txt services-after.txt
docker ps --format '{{.Names}}  {{.Status}}' | sort > docker-after.txt
echo "== containers missing after reboot =="; comm -23 <(awk '{print $1}' docker-before-*.txt) <(awk '{print $1}' docker-after.txt)
ss -tlnp | awk 'NR>1{print $4}' | sort -u > ports-after.txt
echo "== ports no longer listening =="; comm -23 ports-before-*.txt ports-after.txt
for u in $(cat sites.txt); do printf '%-40s ' "$u"; curl -s -o /dev/null -w '%{http_code}\n' --max-time 10 "https://$u"; done | tee sites-after.txt
diff sites-before-*.txt sites-after.txt && echo "sites: same as before"
systemctl is-active ultraos-web.service ultraos-staging-web.service caddy
systemctl list-timers ultraos-backup.timer --no-pager
journalctl -b -p err --no-pager | tail -40
free -h
```
- [ ] `systemctl --failed` shows 0 units.
- [ ] The three "missing" lists are empty, or only list things you expect (one-off jobs).
- [ ] Every site gives the same code as before.
- [ ] `ultraos-web`, `ultraos-staging-web` and `caddy` all say `active`.
- [ ] The backup timer shows a NEXT run tonight.
- [ ] Kernel version changed (the restart applied it).

Then check in a browser:
- [ ] https://app.neonultra.ng loads; log in; open a standings or LBCL page.
- [ ] Staging through the tunnel (`ssh -L 4120:127.0.0.1:4120 raivstream`, then http://127.0.0.1:4120/coaching).
- [ ] https://db.raivstream.com dashboard loads.

### If something didn't come back

- A systemd service is down: `journalctl -u NAME -b --no-pager | tail -50`, then
  `systemctl restart NAME`. If it says "disabled", `systemctl enable --now NAME` (that's why it
  didn't start on boot).
- A Docker container is missing: `docker ps -a --filter status=exited` shows it. Start it from its
  compose folder with `docker compose up -d`. Then set `restart: unless-stopped` for it so it
  survives the next reboot.
- A site gives 502: the app behind Caddy is down; fix the app's service, not Caddy.
- Nothing fixes it and a core site is down: restore the Step 1 snapshot (you lose only what changed
  during the window), then ask for help with the logs from `/root/maint`.

## Step 7: tidy up (only after Step 6 is all green)

```bash
apt autoremove --purge
```
- [ ] Keep the Contabo snapshot for 7 days, then delete it (snapshots slow the disk a little and
      use your snapshot quota).
- [ ] Note the date, kernel version and anything that needed fixing at the bottom of this file
      under "Log".

---

## Follow-ups (separate tasks, not during the window)

1. **Memory pressure** (64% RAM, about half the swap in use, load around 5.8 before the restart).
   A week after the restart, check what's using memory: `ps aux --sort=-rss | head -15`. Supabase's
   Docker stack is usually the largest. Decide before adding AI vision work to this host: likely a
   bigger VPS or a separate GPU machine.
2. **Backup failure alert.** ✅ Done 2026-10-15. `OnFailure=backup-alert@%n.service` on every
   backup/offsite unit (emails the unit, host, time and last 30 journal lines), plus a 09:00
   freshness check that alerts if any local dump or R2 object is older than 26 h. See
   `deploy/ops/` and `documentation/runbooks/BACKUP_RESTORE.md`.
3. **Off-site backups.** ✅ Done 2026-10-15. `backup-offsite.timer` copies the newest dump of each
   database to Cloudflare R2 (`vps-backups-raivstream`, `r2:<host>/<db>/`), copy-only.
4. **Automatic security updates.** `apt install unattended-upgrades`, then
   `dpkg-reconfigure -plow unattended-upgrades`, with automatic reboots left OFF, so security
   fixes don't pile up again. Repeat this checklist each month for the restart.
5. **Ubuntu 26.04 upgrade**: plan separately, ideally by rebuilding on a fresh server rather than
   upgrading in place.

## Log

| Date | Done by | Kernel before -> after | Notes |
|---|---|---|---|
| | | | |
