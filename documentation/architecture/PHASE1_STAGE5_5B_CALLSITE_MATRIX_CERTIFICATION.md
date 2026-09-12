# Stage 5.5B — Call-Site Matrix Certification and Provenance

Status: CERTIFIED (artifact under version control)

Certification date: 2026-09-12

Certified artifact: `documentation/architecture/PHASE1_STAGE5_5B_CALLSITE_MATRIX.csv`

This document certifies the corrected Stage 5.5B explicit-context call-site
matrix and records its full lineage. It exists because the matrix was, until
this commit, an untracked file that had already been overwritten once by a
faulty regeneration (see "Why the raw Batch 6 matrix was invalid"). It is
committed so future regenerations can be diffed against a known-good baseline
instead of being trusted or distrusted on faith.

## Certification statement

The committed CSV contains **283 data rows** (excluding the header) and was
independently re-counted from the committed file:

```text
TOTAL: 283
B: 213
C: 70
D: 0
E: 0
```

The Batch 7 remediation (see "Lineage") drove the E-classified set to zero.
The Batch 6 corrected state (`B=190/C=68/D=0/E=25`) is recorded below as an
intermediate lineage point, not as the final committed state.

The CSV was reconstructed and reconciled from `session.md` evidence plus direct
source inspection — **it was not recovered byte-for-byte** from any prior
version, because the previous file was never under version control. See
"Reconstruction caveat".

## Lineage

| Stage | B | C | D | E | Total | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Batch 5 baseline (last known-good before the drift) | 180 | 68 | 0 | 35 | 283 | Recorded in `session.md` |
| Batch 6 raw (as found on disk) | 186 | 15 | 0 | 81 | 282 | Classification-generator drift; invalid |
| Corrected Batch 6 (reconciled) | 190 | 68 | 0 | 25 | 283 | 10 genuine conversions applied to Batch 5 |
| Batch 7 (final, committed) | 213 | 70 | 0 | 0 | 283 | 22 conversions + 3 reclassifications |

### Why the raw Batch 6 matrix was invalid

The Batch 6 regeneration tool was not a faithful classifier:

1. It did not preserve prior manual "intentionally platform-global"
   classification judgments. It re-derived classification from the model's
   schema shape alone (`organizationId` column present or not), so any `C`
   classification that rested on written business-logic reasoning rather than
   schema shape was silently reverted to `E`.
2. It had a real text-matching bug in candidate discovery and line
   attribution: it matched the literal text `prisma.<model>.<method>(` when it
   appeared **inside code comments**, not only at real Prisma call sites. This
   misattributed rows to the wrong line/function in files whose Phase 1
   doctrine comments happen to quote a call shape.

The raw Batch 6 matrix is therefore not a valid input and must not be used to
recompute counts. It was never regenerated with that classifier during this
reconciliation.

### Why the C rows were restored

The 53 missing `C` rows from Batch 6 were all `web/src/lib/data-hygiene.ts`
(`auditRealData` / `purgePlan`), the intentionally platform-global
demo/rehearsal residue diagnostic — the same rows Batch 4 had reclassified
`E -> C` with documented reasoning matching Stage 5.2C's and Stage 5.2D's own
prior "platform-global diagnostic" precedent. They were restored because the
regeneration silently reverted a business-logic judgment on schema shape
alone. Access is gated by `requirePlatformPermission("data:readiness")` (since
Stage 5.2D), not merely by role name; `purgePlan` is CLI-only
(`scripts/data-purge-plan.ts`) and never web-routed.

Recorded correction (2026-09-12): the batch logs consistently wrote "53"
`data-hygiene.ts` rows, but the authoritative CSV contains **54** rows
(`#128`–`#181`), all `C`, and a direct count of the source file confirms
**54** real `prisma.<model>.` call sites — 17 in `auditRealData` (lines
15–43) and 37 in `purgePlan` (lines 52–115). The "53" was an off-by-one
undercount in the narrative log, not a lost or spurious matrix row. The
corrected-Batch-6 total `C=68` is unchanged; the split is 54 (data-hygiene) +
14 (other platform-global) rather than the previously written 53 + 15.

### Why the missing 283rd row was restored

`web/src/app/coaches/actions.ts`'s `applyCoachPhotoImport` row (the real
`tx.staff.findMany()` call now at line 294) was dropped entirely by the
Batch 6 regeneration's candidate discovery: it collapsed
`previewCoachPhotoImport` and `applyCoachPhotoImport` into a single fabricated
row attributed to a nonexistent `readCoachPhotoFiles` Prisma call at line 209.
The real line 209 is `return { file, ultraStaffId, error: null };`, not a
Prisma call. `applyCoachPhotoImport` was restored as its own row, bringing the
total back to 283. Both coach rows are correctly attributed and classified
`B` (already wrapped in `withOrganizationContext`):

```text
#23  coaches/actions.ts:224  previewCoachPhotoImport  staff  B
#283 coaches/actions.ts:294  applyCoachPhotoImport    staff  B
```

The same comment-matching bug affected `web/src/app/training/actions.ts`,
which was corrected in place (lines 27 and 58, both `B`, code unchanged):

```text
#109 training/actions.ts:27 createTrainingSession      trainingSession       B
#110 training/actions.ts:58 recordTrainingAttendance   athleteTrainingRecord B
```

## The 10 genuine Batch 6 conversions

These were real conversions from Batch 6 and were preserved (not reverts):

| Row | File:line | Model |
| --- | --- | --- |
| 28 | `content/actions.ts:38` | contentTemplate |
| 29 | `content/actions.ts:47` | contentTemplate |
| 30 | `content/actions.ts:57` | contentJob |
| 31 | `content/actions.ts:113` | contentJob |
| 59 | `media/[assetId]/page.tsx:15` | mediaAsset |
| 60 | `media/page.tsx:14` | mediaAsset |
| 61 | `media/page.tsx:19` | mediaAsset |
| 125 | `broadcast-presentation-state.ts:31` | systemSetting |
| 126 | `broadcast-presentation-state.ts:51` | auditLog |
| 127 | `broadcast-presentation-state.ts:67` | auditLog |

## Batch 6 final E=25 list (intermediate)

This is the corrected E set at the close of the Batch 6 reconciliation — the
Batch 5 E set minus the 10 genuine conversions above.

```text
#19   audit/page.tsx:7                              AuditPage                        auditLog
#32   display-monitoring/page.tsx:13                DisplayMonitoringPage            displayHeartbeat
#33   documents/page.tsx:12                         DocumentsPage                    opsDocument
#36   equipment/page.tsx:12                         EquipmentPage                    equipment
#57   incidents/page.tsx:13                         IncidentsPage                    incident
#62   notifications/page.tsx:13                     NotificationsPage                opsNotification
#97   public/celebrations/actions.ts:19             submitWellWish                   announcement
#98   rehearsal/broadcast/[fixtureId]/page.tsx:19   RehearsalBroadcast               fixture
#99   rehearsal/live/[fixtureId]/page.tsx:21        RehearsalLive                    fixture
#100  rehearsals/page.tsx:12                        RehearsalsPage                   rehearsal
#101  runbooks/page.tsx:14                          RunbooksPage                     operationalChecklist
#102  runbooks/page.tsx:15                          RunbooksPage                     runbook
#106  standings/page.tsx:30                         Standings                        standing
#107  tasks/page.tsx:14                             TasksPage                        opsTask
#120  all-star-teams.ts:67                          getAllStarTeams                  systemSetting
#121  all-star-teams.ts:105                         getAllStarCandidatePool          season
#122  all-star-teams.ts:108                         getAllStarCandidatePool          player
#123  all-star-teams.ts:115                         getAllStarCandidatePool          seasonClub
#222  season-zero-production-reconciliation.ts:47   seasonZeroProductionReconciliation application
#223  season-zero-production-reconciliation.ts:51   seasonZeroProductionReconciliation systemSetting
#224  season-zero-production-reconciliation.ts:85   duplicateCandidatesForApplication  application
#225  season-zero-production-reconciliation.ts:89   duplicateCandidatesForApplication  application
#279  system-health-loader.ts:113                   computeBrowserSourceHealth        fixture
#280  tenant-context.ts:11                          resolveActiveOrganizationId       userRoleAssignment
#282  tenant-context.ts:69                          resolveDefaultPublicOrganization  club
```

## Batch 7 resolution of the E set (final committed state)

Batch 7 closed all 25 rows. 22 were genuine conversions to explicit
organization context; 3 were matrix corrections, not code changes:

- `#279 system-health-loader.ts:113` -> `B`. Matrix false positive: the
  attributed line is prose in `buildSystemHealth`'s doc comment quoting a
  historical `prisma.fixture.findFirst`; the real read at line 145 has run
  inside `withOrganizationContext` since Stage 5.2C.
- `#280 tenant-context.ts:11` -> `C`. `resolveActiveOrganizationId` reads
  `UserRoleAssignment` bare because it is the bootstrap resolver that
  establishes a signed-in user's organization before any tenant context can
  exist. Reclassified as platform-global infrastructure.
- `#282 tenant-context.ts:69` -> `C`. Matrix false positive: the attributed
  line is again doc-comment prose; the real `resolveDefaultPublicOrganization`
  delegates to `resolveActiveOrganizationBySlug`, which reads the
  platform-global `Organization` table.

The 22 genuine conversions (pages scoped with `withOrganizationContext`;
`all-star-teams.ts` and `season-zero-production-reconciliation.ts` library
functions given explicit scoped `db`/`organizationId`; `standings/page.tsx`
type-only reference replaced with `Prisma.StandingGetPayload`;
`public/celebrations/actions.ts` converted to the Pattern D public
organization resolution) are recorded in full in the `session.md` Batch 7
entry.

## Reconstruction caveat

The previous CSV was untracked and was overwritten in place by the faulty
Batch 6 regeneration. There is no git history, backup, or snapshot of the
Batch 5 or corrected-Batch-6 file. The corrected matrix was **reconstructed**
from:

- the Batch 4, 5, and 6 entries in `session.md`, which record every row
  `number`/file/line/classification changed by hand; and
- direct inspection of the actual current source code (ground truth) for every
  file named in those entries.

No claim is made that the earlier file was recovered byte-for-byte. Field text
for rows changed during Batch 7 was rewritten during remediation; the counts,
identities, and classifications are certified, not the historical string
content.

## Integrity checks performed on the committed artifact

```text
DATA_ROWS:                                    283
B/C/D/E:                                      213 / 70 / 0 / 0
NUMBER_RANGE:                                 1..283, all distinct
DUPLICATE_CALLSITE_IDENTITIES:                0
ROWS_MISSING_FILE_OR_LINE:                    0
UNEXPLAINED_CLASSIFICATIONS:                  0
applyCoachPhotoImport_PRESENT:                YES (#283)
data-hygiene.ts_ROWS:                         54, all C
coaches/actions.ts_ROWS:                      #23, #283, both B and correctly attributed
training/actions.ts_ROWS:                     #109, #110, both B and correctly attributed
```

## Scope and safety

This commit contains only the matrix CSV and this certification document.
No application behavior, RLS policy, RLS fallback, `organizationId` database
default, staging data, migration, or production deployment was changed by this
task. Stage 5.5C has not started.
