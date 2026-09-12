# Phase 1, Stage 5.5B — Batch 7 Empirical Tenant-Isolation Proof

Status: CONDITIONAL PASS — Batch 7 empirically proven

Date: 2026-09-12

Scripts:
- `web/scripts/stage55b-batch7-empirical-proof.ts`
- `web/scripts/stage55b-batch7-cleanup.ts`

Proof run: against `ultraos_staging`, connected as the restricted `ultraos_staging`
role (`rolsuper=false`, `rolbypassrls=false`).

## Certification state

```text
STAGE_5_5: IN_PROGRESS
STAGE_5_5A: CLOSED/DEPLOYED
STAGE_5_5B: BATCH 7 CODE CERTIFIED
STAGE_5_5B_BATCH7_EMPIRICAL_PROOF: CONDITIONAL PASS
RLS_FALLBACK: RETAINED
ORGANIZATION_ID_DB_DEFAULT: RETAINED
STAGE_5_5C: NOT STARTED
```

## Qualification

The 21 genuine Batch 7 conversions are empirically proven through a controlled
staging proof. Two additional same-org operations were **blocked from testing**
because doing so would mutate existing real Neon Ultra records:

- `D-049` — same-org write against the real all-star slugs `zenith`/`pulse`.
- `E-064` — same-org `applySeasonZeroPlayerApproval` against the real cohort
  Applications.

These are **not failures**. They are deliberately untested data-safety
exclusions. No same-org test was fabricated against real production-like records
merely to remove the label.

## Scope — the 21 genuine conversions

- Group A (10 reads): `audit`, `display-monitoring`, `documents`, `equipment`,
  `incidents`, `notifications`, `rehearsals`, `runbooks` (checklist + runbook),
  `tasks`.
- Group B (1): `public/celebrations/actions.ts` well-wish submission.
- Group C (2): `rehearsal/broadcast/[fixtureId]`, `rehearsal/live/[fixtureId]`.
- Group D (4): `all-star-teams.ts` reads/writes.
- Group E (4): `season-zero-production-reconciliation.ts` reads/writes.

## Backup (taken before any staging mutation)

```text
UTC_TIMESTAMP: 20260912T010308Z
DATABASE:      ultraos_staging
BACKUP_PATH:   /var/backups/ultraleagueos-staging/stage55b_batch7_empirical_20260912T010308Z.dump
BYTE_SIZE:     839874
SHA256:        f42666d9bf8bdd3d3ce1ba1bc575519d050f611bfee7d8edc7ec87ec3829f0db
TOC_ENTRIES:   1253 (pg_restore --list)
```

## Runtime result

```text
Batch 7 empirical proof: 0 failures, 74 assertions run, 72 PASS, 0 FAIL, 2 BLOCKED
Cleanup assertions: 4/4 PASS
Residue: 0
```

Role verification (in-script, first line of output):

```text
Connected role bypasses RLS: NO (restricted, correct) (rolsuper=false, rolbypassrls=false)
```

## Proof matrix — 21 genuine conversions

| CSV # | File / function | Operation | Same-org | Cross-org | Audit | Status |
| --- | --- | --- | --- | --- | --- | --- |
| 19 | `audit/page.tsx` | auditLog read | A-001 | A-002 | n/a | PROVEN |
| 32 | `display-monitoring/page.tsx` | displayHeartbeat read | A-003 | A-004 | n/a | PROVEN |
| 33 | `documents/page.tsx` | opsDocument read | A-005 | A-006 | n/a | PROVEN |
| 36 | `equipment/page.tsx` | equipment read | A-007 | A-008 | n/a | PROVEN |
| 57 | `incidents/page.tsx` | incident read | A-009 | A-010 | n/a | PROVEN |
| 62 | `notifications/page.tsx` | opsNotification read | A-011 | A-012 | n/a | PROVEN |
| 100 | `rehearsals/page.tsx` | rehearsal read | A-013 | A-014 | n/a | PROVEN |
| 101 | `runbooks/page.tsx` | operationalChecklist read | A-017 | A-018 | n/a | PROVEN |
| 102 | `runbooks/page.tsx` | runbook read | A-019 | A-020 | n/a | PROVEN |
| 107 | `tasks/page.tsx` | opsTask read | A-015 | A-016 | n/a | PROVEN |
| 97 | `public/celebrations/actions.ts` | well-wish write | B-022/023 | B-024/025/026 | org stamped | PROVEN |
| 98 | `rehearsal/broadcast/[fixtureId]` | fixture + model | C-027 | C-028/031 | n/a | PROVEN |
| 99 | `rehearsal/live/[fixtureId]` | fixture + model | C-029 | C-028/031 | n/a | PROVEN |
| 120 | `all-star-teams.ts` `getAllStarTeams` | read | D-034 | D-032/033/037 | n/a | PROVEN |
| 121 | `all-star-teams.ts` candidate pool (season) | read | D-035/036 | excluded cross-org | n/a | PROVEN |
| 122 | `all-star-teams.ts` candidate pool (player) | read | D-035/036 | D-041 | n/a | PROVEN |
| 123 | `all-star-teams.ts` candidate pool (seasonClub) | read/write | D-038 | D-040/043/048 | D-044/045 | PROVEN |
| 222 | `season-zero-production-reconciliation.ts` application | read | E-050/053 | E-051/052/054 | n/a | PROVEN |
| 223 | `season-zero-production-reconciliation.ts` systemSetting | read | E-055 | E-056/058 | E-061 | PROVEN |
| 224 | `...duplicateCandidatesForApplication` canonical | read | E-053 | E-054 | n/a | PROVEN |
| 225 | `...duplicateCandidatesForApplication` candidates | read | E-053 | E-054 | n/a | PROVEN |

Fidelity labels:
- Groups A/B/C pages and the `"use server"` action call NextAuth's `auth()` and
  cannot run from a bare script, so their exact inline logic is replicated while
  calling the real `withOrganizationContext`/`resolveDefaultPublicOrganization`/
  `buildLivePresentationModelForGame` entry points (`BEHAVIORAL_REPLICATION`).
- Groups D/E call the real imported library functions directly (`REAL_FUNCTION`).

## Exact blocked cases

```text
D-049 BLOCKED  All-star same-org writes against the REAL slugs (zenith/pulse).
               SystemSetting.key is globally unique and those keys belong to Neon
               Ultra; a disposable org cannot own them and mutating Neon Ultra's
               real exhibition data is out of scope. Same-org writes proven with
               proof-only slug keys; real-slug DENIAL proven (D-037).

E-064 BLOCKED  Season Zero reconciliation same-org write against the REAL cohort
               Applications. The 58 authoritative cohort ids are real Neon Ultra
               rows; applySeasonZeroPlayerApproval flips Application.status, which
               is out of scope. Read isolation against real cohort data and
               same-org writes on disposable ids are proven (E-055/E-060).
```

## Negative controls + known DB-level gap

```text
F-065  Bare (unscoped) prisma read of Org A's player id -> null (restricted role / RLS)
F-066  Raw SQL count of Org A players under no context -> 0
F-067  Org B raw updateMany on Org A's player id -> 0 rows affected
F-068  Org A's player unchanged after Org B's forged update
F-069  Same-org control succeeds (test is not passing because everything is broken)
F-070  KNOWN DB-LEVEL GAP (outside Batch 7 scope, surfaced not hidden):
       raw Player.create with organizationId=B, athleteId=Org A athlete,
       seasonId=Org B season SUCCEEDS at the database level because
       Player.athleteId / Player.seasonId are simple, non-composite FKs. The
       Batch 7 application-level guard denies the same attack; no schema change
       was made in Batch 7. This remains open and must be reviewed before any
       fallback-elimination decision.
```

## Cleanup and residue

Cleanup runs in a `finally` path inside `withOrganizationContext`, followed by an
independent restricted-role check:

```text
CLN-071 Residue: disposable Organizations            0
CLN-072 Residue: disposable Users                    0
CLN-073 Residue: disposable Neon-Ultra well-wish athletes  0
CLN-074 Locator baseline after cleanup               257 resource / 0 token
```

Independent post-run verification (privileged read-only): `batch7_orgs=0`,
`batch7_users=0`, `neon_ww_athletes=0`, `allstar_proof_settings=0`,
`s0_resolution_test_rows=0`, `resource_locators=257`.

## Staging restoration evidence

The active staging release (`/opt/ultraos-staging/releases/20260908-030506`)
predates Batch 7, so the two Batch 7 library files were copied in to run the
proof and then restored; the copied scripts were removed. The staging service was
never restarted.

```text
ORIGINAL (before proof):
  all-star-teams.ts                        1f80169477575dd5b49544360b97df3b89d271ff976597702e794027fa4cb0e0
  season-zero-production-reconciliation.ts b50c9483e878db40a7487c483c5659ac3365afa4a91c7a0eeaa02f943bae910f

RESTORED (after proof):
  all-star-teams.ts                        1f80169477575dd5b49544360b97df3b89d271ff976597702e794027fa4cb0e0
  season-zero-production-reconciliation.ts b50c9483e878db40a7487c483c5659ac3365afa4a91c7a0eeaa02f943bae910f

Copied proof/cleanup scripts remaining in release: none
```

This is a valid controlled proof of the changed code, but it is **not yet a
production deployment certification**. The proof must be re-run after the actual
Batch 7 code is deployed in a later controlled release.

## Static verification

```text
PRISMA_VALIDATE: PASS
TSC:             PASS
TESTS:           466/466 PASS
LINT:            6 pre-existing warnings, 0 errors (no new)
BUILD:           PASS (BUILD_ID m0Pr6YsZySwQSTvN2zYeC)
CLASSIFIER:      283 rows, B=213 / C=70 / D=0 / E=0 (matches committed matrix)
```

## Safety

No production access, deployment, restart, environment change, RLS policy
change, RLS-fallback change, tenant-table default change, or migration. Stage
5.5C has not started. The 347 unrelated working-tree entries were not committed.

## Recommendation

**CONDITIONAL PASS — Batch 7 empirically proven.** No further Batch 7
remediation is indicated. Next decisions (not started automatically):

1. whether to commit the two proof scripts as regression tooling; and then
2. conduct a separate Stage 5.5C readiness review.

Before deciding whether RLS-fallback elimination is safe, explicitly review the
known `Player` simple-FK gap, the retained RLS fallback, the tenant-table
defaults, and any remaining cross-tenant relational-integrity exceptions.
