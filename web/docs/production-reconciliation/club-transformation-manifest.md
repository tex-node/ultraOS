# Production Club Transformation Manifest (Preview Only — Not Applied)

All 8 production Clubs are confirmed the same June 15 demo/seed batch as the demo Draft (identical `cmqfqpn...` cuid prefix, `createdAt` within milliseconds of each other). Each has exactly 1 Standing row and 1 demo Player (`*.athletes.neonultra.ng`) attached; some also have Fixtures.

| Current ID | Current name | Current code | SeasonClub ID | Current division | → Proposed name | → Proposed code | → Proposed division | Fixtures | Standings | Demo Players | Safe to transform now? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `cmqfqpno7000clgkkozvuomx8` | Apex | APX | `cmqfqpnod000dlgkku9sqb9nm` | Men's | APEX | APEX | Men's (no change) | 1 | 1 | 1 | **YES** — rename only |
| `cmqfqpnph000olgkkuti0zjnx` | Surge | SRG | `cmqfqpnpm000plgkk6fofe078` | Men's | SURGE | SURGE | Men's (no change) | 1 | 1 | 1 | **YES** — rename only |
| `cmqfqpnl40006lgkktpjc55ci` | Vortex | VTX | `cmqfqpnm20007lgkk0nfwj431` | Men's | VORTEX | VORTEX | Men's (no change) | 2 | 1 | 1 | **YES** — rename only |
| `cmqfqpnou000ilgkkw8pzjn9j` | Flux | FLX | `cmqfqpnoz000jlgkkv1i612md` | Men's | FLUX | FLUX | Men's (no change) | 2 | 1 | 1 | **YES** — rename only |
| `cmqfqpnr60016lgkki03b7gd1` | Ember | EMB | `cmqfqpnrb0017lgkkm9i40f6u` | **Men's** | EMBER | EMBER | **Women's** | 0 | 1 | 1 | **NO** — division change touches a SeasonClub with a live Standing row; resolve demo-season entanglement first |
| `cmqfqpnqn0010lgkkjt7kjjnk` | Halo | HLO | `cmqfqpnqs0011lgkkg2pvftnj` | **Men's** | HALO | HALO | **Women's** | 0 | 1 | 1 | **NO** — same reason |
| `cmqfqpnrp001clgkkuohxx99t` | Eclipse | ECL | `cmqfqpnrt001dlgkkskzah895` | **Men's** | ECLIPSE | ECLIPSE | **Women's** | 0 | 1 | 1 | **NO** — same reason |
| `cmqfqpnq1000ulgkkfwm41ewz` | Nova | NVA | `cmqfqpnq6000vlgkk3tyi7n08` | **Men's** | NOVA | NOVA | **Women's** | 0 | 1 | 1 | **NO** — same reason |

## Why the division fix isn't flagged safe yet

A SeasonClub's division is load-bearing for Fixture/Standing/Draft logic elsewhere in the app (e.g. `eligibleSeasonClubs()` filters by `divisionId`). Reassigning EMBER/HALO/ECLIPSE/NOVA's SeasonClub from Men's to Women's while their existing demo Standing rows (and Ember/Vortex/Flux's Fixtures) still reference them under Men's Division risks leaving those rows in an inconsistent state. This needs the same decision as the demo Draft/DraftPick (§ demo data report): resolve or explicitly accept the demo-season entanglement before changing division, not something to do incidentally while renaming.

## What IS safe to apply now (once schema is deployed)
Renaming all 8 Clubs' `name`/`shortName` to the authoritative values, and adding `officialSlogan`/`crowdChant`/`identityKeywords`/`brandingStatus` — none of that touches Fixture/Standing/division logic. **Not applied this session** — schema for the branding fields doesn't exist in production yet, and this task explicitly said not to apply until schema deployment has occurred.

## Logos
Source files ready at `C:\UltraLeagueOS\assets\clubs` (all 8, checksums previously verified against staging's already-ingested MediaAssets). Not uploaded to production — no `MediaAsset` table exists there yet.
