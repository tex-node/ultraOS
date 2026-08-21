---
title: Season Zero Incident Matrix
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Incident Matrix

| Incident | Severity | Immediate Action | Who Decides | Who Fixes | Can Game Continue? | Manual Fallback | Escalation |
|---|---|---|---|---|---|---|---|
| Wrong score entered | P1 | Call "Hold score." | Head Scorer + Assistant Scorer | Head Scorer (Undo/correction) | Yes, once corrected | Manual score sheet | Event Director if disputed |
| Scorer device failure | P1 | Backup scorer takes over | Event Director | Backup Scorer / System Admin | Yes, on backup device | Manual score sheet (mandatory) | System Administrator |
| Shot clock failure | P2 | Switch to manual shot-clock fallback | Event Director | Shot-Clock Operator / referees | Yes, with manual timing | Manual shot-clock count by referee | Event Director |
| Venue display failure | P2 | Continue without display | Floor Runner reports | System Administrator | Yes, unaffected | None needed — scorer is authoritative | System Administrator |
| Broadcast display failure | P2 | Continue without broadcast | Broadcast Operator reports | System Administrator | Yes, unaffected | None needed — scorer is authoritative | System Administrator |
| Internet outage | P0 | Switch to backup network immediately | System Administrator | System Administrator | Yes, on backup network; else manual | Manual score sheet (mandatory) | Event Director |
| Application outage | P0 | Switch to full manual scoring | Event Director | System Administrator (restart) | Yes, manual only until restored | Manual score sheet (mandatory) | Event Director |
| Database connectivity issue | P0 | Switch to full manual scoring | Event Director | System Administrator | Yes, manual only until restored | Manual score sheet (mandatory) | Event Director |
| Incorrect roster at check-in | P1 | Hold check-in for that player | Check-In Operator escalates | Event Director | Yes, after resolution | N/A — roster is production data, not editable courtside | Event Director |
| Jersey-number mismatch | P2 | Note discrepancy, continue game | Assistant Scorer | Check-In Operator (post-game correction) | Yes, unaffected | Manual score sheet notes player by name | N/A |
| Player eligibility dispute | P1 | Hold the player out pending decision | Event Director | Event Director | Yes, without that player | N/A | Event Director — final say |
| Wrong fixture opened | P1 | Stop immediately, do not enter further events | Head Scorer notices | Head Scorer (close, reopen correct fixture) | Pause until corrected | N/A | Event Director if any event was entered |
| Accidental finalization | P1 | Do not re-finalize; use Reopen | Event Director authorizes | System Administrator or Head Scorer with `result:confirm` | Yes, after Reopen | Manual score sheet as source of truth | Event Director |
| Clock discrepancy | P2 | Pause, agree on correct time | Head Scorer + Event Director | Head Scorer (clock correction incident) | Yes, after correction | Manual score sheet game-clock column | Event Director if disputed |

## Related Topics

- [Emergency Procedures](12_EMERGENCY_PROCEDURES.md)
- [Event Director Guide](07_EVENT_DIRECTOR_GUIDE.md)
