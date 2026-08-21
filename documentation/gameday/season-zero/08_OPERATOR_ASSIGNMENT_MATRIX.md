---
title: Season Zero Operator Assignment Matrix
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Operator Assignment Matrix

Names have not been supplied as of 2026-08-13 — all marked TO BE ASSIGNED. Nothing here is invented.

| Role | Primary Person | Backup Person | Device | Login Verified | Arrival Time | Briefed | Ready |
|---|---|---|---|---|---|---|---|
| Event Director | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Head Scorer | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Assistant Scorer | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Shot-Clock Operator | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Check-In Operator | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Broadcast Graphics Operator | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Venue Display Operator | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| System Administrator | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |
| Floor Runner | TO BE ASSIGNED | TO BE ASSIGNED | DEVICE TO BE ASSIGNED | [ ] | _____ | [ ] | [ ] |

## Authority Matrix (from current production `permissions.ts`, verified read-only)

| Capability | Held by roles |
|---|---|
| Score a game (`game:operate`) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Operate the shot clock (same console, `game:operate`) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Check in players (`check-in:operate`) | SUPER_ADMIN, LEAGUE_OPERATOR, VOLUNTEER |
| Finalize a game (`result:confirm`) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Correct a score (Undo, same console) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Reopen a finalized game (`result:confirm`) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Report an incident (same console) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Resolve an incident (same console) | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Access admin/operations views (`operations:manage`) | SUPER_ADMIN, LEAGUE_OPERATOR |
| Restart the application/service | Not an in-app permission — requires server (`root`/`ultraos`) access; System Administrator only |
| Authorize emergency manual scoring | Event Director (operational authority, not a software permission) |

A Check-In Operator holding only `VOLUNTEER` can run `/gameday/checkin` without scorer/admin access (verified working as of the H.3 access-boundary fix). A Head Scorer needs `SUPER_ADMIN`, `LEAGUE_OPERATOR`, or `OFFICIAL`.

## Related Topics

- [Device Assignment Matrix](09_DEVICE_ASSIGNMENT_MATRIX.md)
- [T-Minus Runbook](16_T_MINUS_RUNBOOK.md)
