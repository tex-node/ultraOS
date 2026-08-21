---
title: Season Zero Manual Score Sheet
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Manual Score Sheet

## Purpose

Printable paper fallback the Assistant Scorer keeps running in real time for
every game, live alongside the digital scorer console — not filled in after
the fact. This is the manual record referenced by the
[Authoritative Score Hierarchy](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md#authoritative-score-hierarchy)
when the digital and visual score disagree.

## Print one per game

```
ULTRA BASKETBALL — SEASON ZERO — MANUAL SCORE SHEET

Fixture ID: ______________________     Game #: _____ of 12
Division:  [ ] MEN   [ ] WOMEN         Tip time: __________

HOME CLUB: ___________________   AWAY CLUB: ___________________

SCORE BY HALF
                HALF 1          HALF 2          FINAL
HOME            ________        ________        ________
AWAY            ________        ________        ________

RUNNING SCORE LOG (mark every basket as it happens)
Time    Club    Player #    Pts    Running Home    Running Away
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
____    ____    ________    ___    ____________    ____________
(continue on the back if needed)

ULTRA TIME (final minute of Half 2 — all points doubled)
[ ] Ultra Time began at clock: __________
Points scored during Ultra Time are already doubled above — do not double
them again when totaling.

SHOT CLOCK NOTES (only if relevant to a dispute)
_____________________________________________________________

FOULS                           TIMEOUTS (if applicable)
HOME: [ ][ ][ ][ ][ ][ ][ ][ ]  HOME: [ ][ ]
AWAY: [ ][ ][ ][ ][ ][ ][ ][ ]  AWAY: [ ][ ]

INCIDENT NOTES (delay, interruption, dispute, correction — reference the
digital incident record by type/time, don't re-litigate it here)
_____________________________________________________________
_____________________________________________________________

SCORE CORRECTIONS MADE DURING THE GAME
Time        What changed                          Who authorized
________    ___________________________________    _______________
________    ___________________________________    _______________

FINAL SCORE
HOME: __________          AWAY: __________          Winner: ____________

SIGN-OFF
Head Scorer signature: _____________________  Time: __________
Assistant Scorer signature: ________________  Time: __________
Event Director verification: _______________  Time: __________
```

## Notes

- Do not invent competition rules not already defined in the
  [Ultra Rules Engine](../../web/src/lib/game-rules.ts) (2 halves × 10:00,
  20s shot clock, +1/+2/+3/+4, Ultra Time = 2× in the final minute of Half 2).
  This sheet records what happened, it doesn't define new rules.
- Timeouts are included as an optional field only because the printed sheet
  should have room for them if the Event Director calls for tracking — Ultra
  Rules as implemented do not currently model timeouts as a scored event.

## Related Topics

- [Manual Player Stats](SEASON_ZERO_MANUAL_PLAYER_STATS.md)
- [Scorer Quick Guide](SEASON_ZERO_SCORER_QUICK_GUIDE.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
