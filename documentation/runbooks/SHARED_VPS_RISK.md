# Shared VPS risk — what is on the host, and how it is contained

The UltraLeagueOS platform runs on a **shared VPS** (`raivstream`, 81.0.246.223). This runbook records what else is on
that box, which of our processes is heaviest, the three containment layers applied in streak v25, and the escalation path
if pressure recurs.

Measured on 2026-10-28, before the cleanup described below:

| | value |
| --- | --- |
| disk | 193 GB, **135 GB used (70%)** |
| memory | 11 GiB RAM, **4.6 GiB used**, 7.4 GiB buff/cache; **11 GiB swap, 5.1 GiB used** |
| docker | 17 images (15.5 GB, all referenced), 30 containers, 24 volumes |
| `/tmp` | **4.3 GB** of build scratch from previous verification runs |
| OOM kills (last hour) | 0 |
| uptime | 8 days |

## 1. What else runs here

| workload | what it is | our exposure |
| --- | --- | --- |
| `supabase-db`, `supabase-meta`, `supabase-rest` | a Supabase stack on **`127.0.0.1:5432`** | it owns port 5432, which is why our app database is on **`:55411`** and containers reach it through `ultraos-pg-bridge` (socat on `172.17.0.1:5433`) |
| `powervend-db`, `powervend-meta`, `powervend-rest` | a second Supabase-style stack | shares memory and disk with us |
| `kong` | an API gateway on `127.0.0.1:8000` | it owns port 8000, which is why the vision API is on **`8010`** |
| `ultraos-postgres` | our PostgreSQL 16 | the platform's data |
| `ultraos-vision-*` (4 containers) | this repo's vision stack | the heaviest new tenant (see §2) |
| `ultraos-web.service`, `ultraos-staging-web.service` | production and staging Next.js | the deploy builds peak at ~5 GB RSS |

**Nothing on this host is dedicated to us.** A disk fill by any tenant stops every service; the OOM killer picks by memory
score, not by ownership.

## 2. Which of our workloads is heavy

| workload | peak seen | bound today |
| --- | --- | --- |
| `next build` (deploy) | ~5 GB RSS, 212 s | none (`NODE_OPTIONS=--max-old-space-size=6144`); runs on the deploy path only |
| `vision` worker (YOLO on 300 frames) | ~63 MB idle, model inference in-process | **2 GiB** cgroup cap |
| `vision` API | ~59 MB | **1 GiB** |
| `vision` beat / redis | ~50 MB / 7 MB | **256 MiB / 512 MiB** |
| `ffmpeg` (highlight clips, **web** process) | **3.5 GB** at the 16 Oct OOM kill | **1536 MB address space + 120 s watchdog** since v25 |

The 16 Oct OOM is the reason this runbook exists: ffmpeg is spawned by the **web** app (not the worker), so an unbounded
cut could take down the league platform itself.

## 3. The three containment layers (streak v25)

1. **Log rotation** — every vision container uses `json-file` with `max-size: 10m`, `max-file: 3` (30 MB per container,
   120 MB for the stack) via the `x-logging` anchor. Verified with
   `docker inspect … --format '{{json .HostConfig.LogConfig}}'`.
2. **Durable storage** — the named volume `ultraos-vision_vision-data` at `/data` in `vision-api` and `vision-worker`.
   Proved by writing a file in the worker, `docker kill`ing it, and reading the file back from a separate container.
3. **Memory caps** — `deploy.resources.limits.memory` per service (2 G / 1 G / 256 M / 512 M), visible in
   `docker stats --no-stream`.
4. **Bounded ffmpeg** — `src/lib/media/ffmpeg.ts` applies `ulimit -v` and a watchdog to every cut and reports which bound
   was hit (`FFMPEG_MEMORY_LIMIT_MB`, `FFMPEG_TIMEOUT_MS`).

Plus two operational fixes found while doing this:

- the vision stack's env file lives at **`/opt/ultraos-vision/vision.env`**, outside any checkout, because `git clean -fdx`
  on every deploy deleted the in-tree `.env` and left the stack unable to recreate itself;
- `ultraos-vision.service` (systemd, `Type=oneshot`, `RemainAfterExit=yes`) brings the stack up at boot and can stop it.

## 4. Routine checks

```bash
df -h /                                       # expect < 70%
free -h                                       # watch swap: 5 GiB used is normal, growing is not
docker system df                              # "reclaimable" counts SHARED layers - read the ACTIVE column
journalctl -k --since "24 hours ago" | grep -iE 'oom-killer|killed process'
du -sh /tmp/* | sort -h | tail -5             # build scratch accumulates here
docker stats --no-stream                     # LIMIT column must show the caps
```

**A note on `docker system prune`:** on 2026-10-28 it reclaimed only **1.04 GB**, because every one of the 17 images is
referenced by a running container - the "15.47 GB reclaimable" is shared-layer arithmetic, not freeable space. The real
win that day was `/tmp`: **4.3 GB of build scratch** from earlier verification runs (`/tmp/livekey-build`,
`/tmp/node22-check`, `/tmp/lockfix`, deploy checkouts) brought the host from 71% to **69%**.

## 5. Escalation path

| trigger | first response | escalation |
| --- | --- | --- |
| disk > 80% | prune `/tmp` scratch, then `docker image prune -a` for tags not in use | move the vision stack's images to a dedicated host |
| swap > 8 GiB used, or an OOM kill of a **our** process | check `docker stats`, confirm caps are applied, restart the offending container | dedicate the vision worker |
| `next build` OOM again | it already has 6 GB; check co-tenants' memory | build off-host (CI artifact) and deploy the artifact |
| vision backlog with clips rendering continuously | cap concurrency at 1 (already), raise the worker cap to 3 G | **dedicated VPS for Vision** |

### Dedicated VPS for Vision — trade-offs

| | shared (today) | dedicated |
| --- | --- | --- |
| blast radius | an OOM or disk fill takes the league platform down | isolation |
| cost | £0 | one instance + backup + monitoring |
| data path | database and media are local (fast) | the DB connection and the media mount cross the network; media should become R2-only |
| operations | one host, one deploy path | a second host, a second deploy path, a queue that must tolerate the split |
| verdict | **acceptable now** with the three layers | worth doing when rendering is continuous or a second league's volume lands |
