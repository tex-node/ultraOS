# Launch readiness — what breaks, and how to fix it

This is the on-call document. It answers one question: **the platform owner is away for two weeks — what breaks, and what
do I do?** For how to operate day to day see `HANDOVER.md`; for how a league runs see `CUSTOMER_ONBOARDING.md`; for the
host's co-tenants and containment see `runbooks/SHARED_VPS_RISK.md`.

Everything below was executed on this host; the commands are not aspirational.

---

## 1. The three environments

| | production | staging | vision |
| --- | --- | --- | --- |
| URL | `https://app.neonultra.ng` (internal `http://127.0.0.1:4110`) | `http://127.0.0.1:4120` | `http://127.0.0.1:8010/health` |
| app root | `/opt/ultraleagueos` | `/opt/ultraos-staging` | `/opt/ultraos-staging/source/services/vision` |
| supervisor | `ultraos-web.service` | `ultraos-staging-web.service` | `ultraos-vision.service` (docker compose) |
| env file | `/opt/ultraleagueos/shared/web.env` | `/opt/ultraos-staging/shared/web.env` | `/opt/ultraos-vision/vision.env` |
| database | `ultraos` on `127.0.0.1:55411` | `ultraos_staging` on the same cluster | reads staging |
| backups | `/var/backups/ultraleagueos` (nightly 02:00) + `/var/backups/ultraleagueos-production` (pre-deploy) | same nightly job | `vision-env-*.tar.gz` in `/var/backups/ultraleagueos` |

Quick health check — all three should answer:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live   # 200
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4120/api/v1/live   # 200
curl -s http://127.0.0.1:8010/health   # {"status":"ok","analyzer":"yolov8n-person",...}
```

## 2. The two human-only items

Nothing in code blocks these; they need a person with a login.

1. **Bachs product IDs.** `BACHS_PRODUCT_PRO` and `BACHS_PRODUCT_ENTERPRISE` are unset in both env files, so pressing
   "Upgrade" reports *"No Bachs product configured for PRO"*. The sandbox key authenticates and the SDK targets
   `sandbox-api.bachs.io`, and the key lacks the `products:read` scope, so the IDs must be read from the **Bachs dashboard →
   Products**. After setting them: reboot the service, open `/settings/billing` on staging, upgrade with
   `4242 4242 4242 4242`, and confirm `Organization.plan` becomes `PRO` (the webhook does that, not the browser).
2. **One real game video for Vision.** The worker runs and analyses; every clip so far has been synthetic and produced
   **zero observations**, which is correct for film with no people in it. The confirm → highlight → R2 → match-centre leg
   has never run on a real detection. Record ~10 minutes of a real session, ingest with
   `node scripts/vision-ingest.ts --file … --fixture … --organization … --actor … --worker http://127.0.0.1:8010`, then
   confirm an observation at `/vision/games/<fixtureId>`.

## 3. "It is down" — the first four commands

```bash
systemctl status ultraos-web.service          # is it running, when did it start, why did it stop
journalctl -u ultraos-web.service -n 100 --no-pager
systemctl status ultraos-vision.service
df -h /
```

What each result means:

| symptom | likely cause | fix |
| --- | --- | --- |
| `ultraos-web` inactive/failed | crashed on boot, usually a bad env var or a missing migration | `journalctl -u ultraos-web.service -n 50`; fix the env file; `systemctl restart ultraos-web.service` |
| service active but every page 500s | the database or a required env var is missing | `curl -s http://127.0.0.1:4110/api/v1/live`; check `journalctl` for `DATABASE_URL` |
| `df -h /` above 90% | disk fill — the classic shared-VPS failure | §4 |
| vision `/health` not 200 | stack down or env file missing | `systemctl restart ultraos-vision.service`, then `journalctl -u ultraos-vision.service` |
| logins fail with a redirect loop | `AUTH_URL`/`AUTH_SECRET` changed, or the database is read-only | check the env file's `AUTH_URL` matches the public URL |

**Roll back a bad deploy** (the previous release is always kept — five are):

```bash
ln -sfn /opt/ultraleagueos/releases/release-<previous>-<stamp> /opt/ultraleagueos/current
systemctl restart ultraos-web.service
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4110/api/v1/live
```

## 4. Disk at 100% (the emergency that happens most)

Order matters: free space first, then find out why.

```bash
# 1. space, safely. These three never touch a running service.
docker builder prune -f
find /tmp -maxdepth 1 -type d -name '*-build*' -mtime +1 -exec rm -rf {} +
rm -rf /opt/ultraos-staging/source/node_modules/.cache
df -h /

# 2. still full? images and old releases are the next largest, in that order.
docker system df                                  # "reclaimable" counts SHARED layers - read the ACTIVE column
docker image prune -a -f --filter "until=168h"    # only images no container references
ls -1dt /opt/ultraleagueos/releases/release-* | tail -n +4   # inspect before removing

# 3. what actually grew
du -sh /* 2>/dev/null | sort -h | tail -10
du -sh /var/backups/* /var/lib/docker /tmp 2>/dev/null | sort -h | tail -5
```

If `/var/backups` is the culprit, the nightly retention (14 daily + 8 weekly, 30 for the vision config) has failed —
check `systemctl status ultraos-backup.timer` and `journalctl -u ultraos-backup.service`.

**What a deploy costs, measured on 2026-10-28** (two full cycles, staging + production each):

| | value |
| --- | --- |
| net growth per cycle | **7 MB** |
| transient peak during a build | **+1.35 GB**, released again afterwards |
| what keeps steady state flat | the release window (`--keep 5`, 1.4 GB each = 6.9 GB) |
| build cache | 0 B — the web deploy does not run `docker build` |

So a deploy needs ~1.5 GB of headroom, not 2 GB of permanent growth. The hygiene block at the end of every deploy (builder
cache, `node_modules/.cache`, stale `/tmp/*-build*` dirs, then `df -h /`) is belt-and-braces on top of that window, and each
line is `|| true` so a cleanup can never turn a green deploy red.

**Never** `docker system prune --volumes` blindly: it deletes the `vision-data` volume, which holds in-flight work.

## 5. "It is really bad" — restore

Backups live in `/var/backups/ultraleagueos` (nightly, `ultraos-<UTC>.dump`, custom format, with `.sha256`) and
`/var/backups/ultraleagueos-production` (a dump taken by `deploy.sh` before every production release).

```bash
# 0. verify the dump before trusting it
sha256sum -c /var/backups/ultraleagueos/ultraos-<ts>.dump.sha256

# 1. restore INTO A SCRATCH DATABASE FIRST, never straight over production
createdb -h 127.0.0.1 -p 55411 -U postgres ultraos_restore_check
pg_restore --dbname=ultraos_restore_check --no-owner --no-privileges /var/backups/ultraleagueos/ultraos-<ts>.dump
psql -h 127.0.0.1 -p 55411 -U postgres ultraos_restore_check -c 'select count(*) from "Organization";'

# 2. only then, a real restore (stop the app first so nothing writes mid-restore)
systemctl stop ultraos-web.service
pg_restore --dbname=<production-dsn> --clean --if-exists --no-owner --no-privileges /var/backups/ultraleagueos/ultraos-<ts>.dump
systemctl start ultraos-web.service

# 3. the vision configuration, if /opt/ultraos-vision was lost
mkdir -p /tmp/vision-restore && tar -xzf /var/backups/ultraleagueos/vision-env-<ts>.tar.gz -C /tmp/vision-restore
install -m 0640 -g ultraos /tmp/vision-restore/ultraos-vision/vision.env /opt/ultraos-vision/vision.env
systemctl restart ultraos-vision.service && curl -s http://127.0.0.1:8010/health
```

RPO: the nightly dump (up to ~24 h of data) plus the pre-deploy dump for release-level recovery. RTO: ~15 minutes to a
working restore if the dump verifies; longer if the host itself must be rebuilt (the repo + env files + a deploy is the
whole rebuild path — which is why the vision env file is now backed up too).

## 6. The weekly five-minute check

```bash
df -h /                                          # < 70%
free -h                                          # swap used should be stable, not climbing
systemctl is-active ultraos-web.service ultraos-staging-web.service ultraos-vision.service
systemctl list-timers --no-pager | grep -E 'backup|freshness'
journalctl -k --since "7 days ago" | grep -icE 'oom-killer|out of memory'
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}' | grep vision
```

Expected answers: one `active` per line, the backup timers with a next-run time in the future, zero OOM lines, and the four
vision containers under their caps (2 G / 1 G / 256 M / 512 M).

### Monthly (five minutes) — the growth checks

```bash
# 1. Vision media. This is the one that will surprise you: video accumulates silently.
du -sh /opt/ultraos-staging/shared/media/originals
du -sh /opt/ultraos-staging/shared/media          # includes variants/ and the vision/ scratch dir

# 2. Container disk. Read TOTAL and ACTIVE together - see the warning below.
docker system df

# 3. Backups: count and age, not just size.
ls -la /var/backups/ultraleagueos-production/ | tail -5
ls -1 /var/backups/ultraleagueos/ultraos-*.dump | wc -l
```

| metric | today (2026-10-28) | act when | action |
| --- | --- | --- | --- |
| `shared/media/originals` | **14 MB** (2 mp4) | **> 50 GB** | Video retention policy: delete source videos older than N days, keep clips on R2 permanently. The media directory is a cache for analysis, not the archive - R2 is. |
| `docker system df` images | **15.5 GB**, 17 images, 16 active | **> 20 GB** | `docker image prune -a --filter "until=168h"` — but only images no container references can go |
| `/var/backups/ultraleagueos-production` | **76 MB**, 10 dumps | **> 500 MB** | the keep-10 retention is in every deploy; if it tires, run `/usr/local/sbin/prune-pre-deploy-dumps.sh` |
| `/var/backups/ultraleagueos` | **23 MB** | > 2 GB | retention is 14 daily + 8 weekly; check `systemctl status ultraos-retention.timer` |
| vision config archives | **4 KB**, 1 archive | > 20 (30-day retention) | normal |

**The `docker system df` trap.** "RECLAIMABLE 15.47 GB (99%)" does **not** mean 15 GB is free: every image is referenced by
a container, and the figure counts shared layers. `docker system prune` on 2026-10-28 reclaimed **1.04 GB**. The real
levers are the release window (`--keep 5`, in every deploy) and, if you ever need it, untagging old images explicitly.

**Why `media/originals` is the metric that matters.** Everything else on this list is bounded by a mechanism that runs
automatically. Video is bounded only by how much footage gets ingested, and the directory sits on the same 193 GB disk as
production. At 14 MB today there is no urgency; at 50 GB the decision is whether to keep source video at all, and that
decision is cheaper to make in advance.

## 7. Who to call

1. **You** (the owner) — for anything involving Bachs, the Bachs dashboard, DNS, or a payment.
2. **The next agent** — `documentation/HANDOVER.md` plus `session.md` contain every decision and every failure; start with
   the last two streaks.
3. **Nothing else.** There is no pager, no monitoring service and no on-call rota: the platform's alerting today is the
   weekly check above and the backup freshness timer (`deploy/ops/backup-freshness.sh`).

## 8. What is knowingly unfinished

| item | effect | effort |
| --- | --- | --- |
| Bachs product IDs | revenue blocked (upgrades fail before reaching Bachs) | minutes, needs the dashboard |
| One real game video | vision's last leg unproven | one recording |
| No off-host backup copy verification | a host loss loses both the data and its backup if `/var/backups` is on the same disk | medium — `backup-offsite.sh` exists; confirm it runs |
| `docker compose` not pinned to a version | a future compose upgrade could change interpolation behaviour | low |
