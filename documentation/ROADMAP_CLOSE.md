# Roadmap close — 2026-10-27

Status of every phase, as of the final streak. `DONE` means there is a test or a documented, reproduced verification;
`BLOCKED` names what is missing and who has to do it.

## Multi-sport platform (`MULTI_SPORT_ARCHITECTURE.md`, `MULTI_SPORT_ROADMAP.md`)

| Phase | Status | Evidence |
| --- | --- | --- |
| Sport registry, nine sports with scoring modules | **DONE** | unit suites per sport; five-sport concurrent stress run (v14) |
| Fixture generation (round robin / knockout, byes skipped) | **DONE** | `FINAL_LAUNCH_PROOF.md`; onboarding dry run: 4 teams → 6 fixtures |
| Live scoring console, sport-aware, offline queue | **DONE** | `e2e/scoring.spec.ts`; component suite (26) |
| Standings per sport, individual and team | **DONE** | `FINAL_LAUNCH_PROOF.md`; tennis to completion (v15) |
| Elo ratings, win probability, partner feed | **DONE** | 8 signed webhook deliveries received in the launch proof |
| Multi-tenant public routing `/t/<org>/<competition>` | **DONE** | `/register` and `/t/` verified 200 in the dry run |
| Onboarding wizard, including a NEW organization | **DONE** | `e2e/onboarding-dry-run.spec.ts` (was BROKEN until v22 - RLS refused every insert) |
| Tenant isolation for league admins | **DONE** | `e2e/multi-tenant-auth.spec.ts`: own 200, other 404, dual-role deterministic |
| Workspace shell shows the league you are in | **BLOCKED (partial)** | the league dashboard passes its own name; other pages still render the platform default. Cosmetic, needs a sweep of every `OperationsShell` call site. |
| Node 22 on the host | **DONE** | services run `/opt/node22/bin/node`; component suite 26/26 on the host |

## Coaching intelligence (`COACH_INTELLIGENCE_ROADMAP.md`)

| Phase | Status | Evidence |
| --- | --- | --- |
| I1–I3 plans, selection advisor, training | **DONE** | smoke checks in every deploy (`player plan`, `selection`, `training week`); component tests |
| I4 vision: YOLO installed, inference real | **DONE** | `VISION_EMPIRICAL_REPORT.md` (300/300 frames, precision 1.000) |
| I5 highlights from confirmed observations | **DONE** | 10.0 s clip probed and rendered; uploaded to R2 (v16/v17) |
| I6 athlete passport | **DONE** | smoke check `athlete passport` + provenance, every deploy |
| Coaching stack behind a flag, dark by default | **DONE** | flag on in both environments; signed-out visitors redirected to login (v21) |
| Coach-facing onboarding copy for the new features | **BLOCKED** | `CUSTOMER_ONBOARDING.md` covers the operator path; a coach-specific walkthrough of the selection advisor has not been written against the live UI. |

## Platform operations

| Item | Status | Evidence |
| --- | --- | --- |
| Test suites runnable on the deploy host | **DONE** | v21 runner + v22 Node 22: 1028 + 26 + 49 + 7 |
| Browser tests for the critical forms | **DONE** | 7 specs, all green against the deployed build |
| Node 22 upgrade | **DONE** | `runbooks/NODE_22_UPGRADE.md`, applied |
| Live payment key cannot reach staging | **DONE** | key removed, `BACHS_MOCK=1`, startup + deploy refusal, six unit tests |
| Bachs checkout against a real sandbox key | **BLOCKED (external)** | no sandbox key exists; the mock provider proves the flow, and the webhook is verified against the real signature scheme. Issuing a sandbox key at Bachs is the action required. |
| Staging representative of production | **DONE** | 2 organizations, 11 competitions after the v21 cleanup |
| Backups | **DONE** | `ultraos-backup.timer` active, nightly dumps plus a pre-deploy dump per release |
| Onboarding guide verified end to end | **DONE** | dry run with screenshots; five friction points corrected in the guide |

## Addendum — streak v23 (2026-10-27)

| Item | Status | Evidence |
| --- | --- | --- |
| The v22 "silent deploy" | **RESOLVED** | root cause: the pipeline's exit status was grep's, not the deploy's; demonstrated, not assumed. Two unfiltered transcripts in `deploy-logs/`, one under `bash -x`, and `deploy/ops/deploy-with-log.sh` now keeps the log and propagates the deploy's status |
| RLS bootstrap pattern audited | **DONE** | 91 RLS-forced tables enumerated, every `$queryRaw`/`$executeRaw` classified; two bare reads fixed (`duplicateIdentityReport`, `upsertGoogleUser`), two vestigial fallbacks removed; static ratchet (5 tests in `npm test`) plus a database proof in `test:db` |
| Workspace branding for a tenant | **DONE** | Test League B: sidebar, tab title and footer all read "Test League B", 0 occurrences of "Neon Ultra" |
| Public portal header + Ultra-Basketball operator pages still platform/demo-named | **BLOCKED (partial)** | `portal-shell.tsx` prints "NEON ULTRA"; `gameday`, `live`, `broadcast`, `launch-readiness` say "Season Zero". Mechanical sweep: each page must resolve and pass its organization. Cosmetic. |
| Vision worker running under systemd | **BLOCKED** | nothing listens on 8010; the venv and code are in place. Needs a unit file - the last infrastructure piece. |
| Bachs sandbox key | **BLOCKED (external)** | staging runs `BACHS_MOCK=1`; a real checkout has never run against Bachs. |
| `BACHS_PRODUCT_PRO` / `_ENTERPRISE` in production | **BLOCKED (external)** | unset; a real upgrade fails before reaching Bachs. |
| Handover document | **DONE** | `documentation/HANDOVER.md`, every command and link checked against the host (one claim corrected: the vision worker) |
## Addendum — streak v24 (2026-10-27): operational launch

| Item | Status | Evidence |
| --- | --- | --- |
| Bachs sandbox key on staging | **DONE** | `BACH_IO=sk_sandbox_…`, `BACHS_MOCK` removed, live-key banner absent, SDK reports environment `sandbox` |
| Bachs product ids (`BACHS_PRODUCT_PRO`, `_ENTERPRISE`) | **BLOCKED (external)** | not present in `cred/`; `createSubscriptionCheckout` stops with "No Bachs product configured for PRO". The key also lacks the `products:read` scope, so they cannot be listed through the API - read them off the Bachs dashboard |
| A completed sandbox payment (4242…) | **BLOCKED** | depends on the product ids above |
| Vision worker deployed | **DONE** | 4 containers Up; `/health` → `{"status":"ok","analyzer":"yolov8n-person","database_configured":true,"storage_configured":true}` |
| Vision worker under systemd | **BLOCKED** | `docker compose` with `restart: unless-stopped` survives crashes, not reboots |
| Vision pipeline end to end | **PARTIAL** | ingest → poller → real YOLO analyzer → COMPLETED on a 300-frame clip; **0 observations**, the correct answer for a clip with no people |
| Confirm → HIGHLIGHT_CLIP → R2 → match centre | **BLOCKED** | needs one real detection; this host has no footage with people in it |
| Branding sweep | **DONE** | `/login`, public header, password reset, page titles and four operator eyebrows verified on the deployed build |
| Node 22 default on the host | **DONE** (v22) | `/opt/node22/bin/node`, both services |
## Addendum — streak v26 (2026-10-28): handoff

| Item | Status | Evidence |
| --- | --- | --- |
| Vision configuration backed up | **DONE** | `deploy/ops/backup-vision-config.sh` runs inside the 02:00 nightly unit; archive `vision-env-<ts>.tar.gz` (4 KB, 0640) contains `vision.env`, restores byte-identical to `/tmp`, sha256 sidecar verified |
| Deploy disk growth bounded | **DONE** | post-deploy hygiene block in `deploy.sh` (builder cache, `node_modules/.cache`, stale `/tmp` build dirs) plus `df -h` in the deploy log |
| Media mount cannot silently default | **DONE** | `${VISION_MEDIA_DIR:?...}` mounted read-only at `/data/media`; unset → named error citing the runbook; set → resolves `…/shared/media -> /data/media`, worker opens a real file |
| On-call document | **DONE** | `documentation/LAUNCH_READY.md`, 8 sections, every command executed as a stranger would; restore path verified against the newest dump (sha256 OK, 1712 objects) |
| Shell scripts cannot acquire CRLF again | **DONE** | `.gitattributes` forces LF for `*.sh`, `*.yml`, `Dockerfile`, units — after a CRLF copy broke the live deploy script during this streak |
| Bachs product IDs | **BLOCKED (external)** | unchanged: not in `cred/`, key lacks `products:read`; needs the dashboard |
| One real game video for Vision | **BLOCKED (external)** | unchanged: no footage with people on the host |