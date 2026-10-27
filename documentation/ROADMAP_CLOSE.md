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
