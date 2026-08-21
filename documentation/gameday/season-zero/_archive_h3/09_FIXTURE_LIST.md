---
title: Season Zero Fixture List
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Fixture List

## Purpose

Authoritative Game Day fixture order, pulled directly from production
(read-only) at H.3 verification time. Cross-check this against `/gameday`
and `/public/fixtures` on the day — this document is a snapshot, the app is
the live source of truth.

## Verification

- 12 official competitive fixtures confirmed, all `SCHEDULED`, all 0–0.
- No duplicate club at the same time slot.
- No missing club, no invalid division matchup (every fixture is
  Men-vs-Men or Women-vs-Women, correctly).
- No duplicate fixture rows.
- 1 exhibition match (Zenith vs Pulse), isolated on `NoveltyMatch` —
  confirmed not part of the 12 competitive fixtures or Standings.

## Order of play — Saturday, 15 August 2026 (times shown in Lagos/WAT)

| # | Time | Division | Home | Away | Fixture ID |
|---|---|---|---|---|---|
| 1 | 10:00 | Women's | Eclipse | Ember | `cmsp9a72000004pkk8hx0mlzs` |
| 2 | 10:35 | Men's | Apex | Flux | `cmsp9a72y00024pkkblu1v755` |
| 3 | 11:10 | Women's | Eclipse | Halo | `cmsp9a73700044pkkc7hlibcl` |
| 4 | 11:45 | Men's | Apex | Surge | `cmsp9a73g00064pkkfilc2sve` |
| 5 | 12:20 | Women's | Eclipse | Nova | `cmsp9a73p00084pkkmdiw8ic1` |
| 6 | 12:55 | Men's | Apex | Vortex | `cmsp9a741000a4pkk4b1ckf84` |
| 7 | 13:30 | Women's | Ember | Halo | `cmsp9a74b000c4pkk6odrffxt` |
| 8 | 14:05 | Men's | Flux | Surge | `cmsp9a74j000e4pkka6v3qmsx` |
| 9 | 14:40 | Women's | Ember | Nova | `cmsp9a74r000g4pkk5ta3tc49` |
| 10 | 15:15 | Men's | Flux | Vortex | `cmsp9a74y000i4pkkwu4qb4gx` |
| 11 | 15:50 | Women's | Halo | Nova | `cmsp9a755000k4pkknteevnb6` |
| 12 | 16:25 | Men's | Surge | Vortex | `cmsp9a75d000m4pkk5achuyne` |
| 13 | 17:00 | Exhibition | Zenith | Pulse | NoveltyMatch — separate from the 12 above |

Trophy presentation follows the exhibition match.

## Related Topics

- [Roster Pack](10_ROSTER_PACK.md)
- [Between-Games Checklist](14_BETWEEN_GAME_CHECKLIST.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Pulled from production at H.3 verification |
