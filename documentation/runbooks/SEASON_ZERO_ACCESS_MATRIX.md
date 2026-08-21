---
title: Season Zero Access Matrix
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Access Matrix

## Purpose

Map each Game-Day station to the real, verified `Permission` values in
[permissions.ts](../../web/src/lib/permissions.ts) and the `UserRole` that
carries them. No passwords appear here. This was checked against the actual
authorization code, not assumed.

## Station → Permission Map

| Station | Required permission(s) | Role(s) that already carry it |
|---|---|---|
| Scorer (score/stat/shot-clock/undo) | `game:operate` | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Finalize / Reopen a game | `result:confirm` | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Check-in station | `game:operate` **or** `check-in:operate` | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL, VOLUNTEER |
| Incident reporting/resolution | `game:operate` | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Game Day Control Center (`/gameday`) | `game:operate` | SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL |
| Broadcast scorebug / clock display | none — public, read-only | anyone with the URL |
| Public `/live` | none — public, read-only | anyone |
| All-Star roster add/lock/unlock | `staff:manage` | SUPER_ADMIN, LEAGUE_OPERATOR |

## Findings from this verification pass

**ACCESS_BLOCKER found and fixed:** `VOLUNTEER` carries the dedicated
`check-in:operate` permission, but the check-in station's route and its
submit action were gated on `game:operate` only — a Volunteer account
genuinely could not reach `/gameday/checkin`. Rather than granting Volunteers
`game:operate` (which would also hand them scorer/incident access — over-broad,
against the "do not broaden permissions for convenience" instruction), the
check-in route and action were changed to accept `game:operate` **or**
`check-in:operate` (`requireAnyPermission`, added in
[authorization.ts](../../web/src/lib/authorization.ts)). Verified with
`npm run typecheck` and deployed under the H.3 code freeze as a scoped P1
operational fix.

**Documented, not fixed — procedural, not a code gap:** there is no permission
tier between "can operate the scorer" and "can finalize/reopen a game" — both
require `game:operate`/`result:confirm` together, held by the same roles
(SUPER_ADMIN, LEAGUE_OPERATOR, OFFICIAL). The Head Scorer / Event Director
separation described in the
[Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md) is therefore a
**human process boundary, not a system-enforced one** — if the Head Scorer's
account also carries `result:confirm`, they are technically capable of
finalizing or reopening without the Event Director's sign-off. This is not a
new gap introduced for Season Zero (it mirrors how `OFFICIAL` was already
scoped in H.1), and splitting it into two new permission tiers this close to
the event is exactly the kind of scoring-architecture change the freeze
prohibits. Documented here so the Event Director enforces the boundary by who
holds which login, not by assuming the software will stop someone.

## Action required

Assign one real account per station before T-24h
([T-Minus Runbook](SEASON_ZERO_T_MINUS_RUNBOOK.md)). Recommended:

- Head Scorer, Assistant Scorer (if they also touch the console), Shot-Clock
  Operator, Event Director: `OFFICIAL` role account each (or share the
  existing gameday admin account only if truly one person is covering
  multiple stations — not recommended).
- Check-In Operator: a `VOLUNTEER` role account is now sufficient and
  correctly scoped — no need to hand out a wider role.
- Broadcast / Public Display Operators: no login needed at all.

## Related Topics

- [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md)
- [permissions.ts](../../web/src/lib/permissions.ts)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version; found and fixed check-in ACCESS_BLOCKER |
