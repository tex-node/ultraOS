---
title: Season Zero Access Matrix
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Access Matrix

**Canonical file — print this one:**
[runbooks/SEASON_ZERO_ACCESS_MATRIX.md](../../runbooks/SEASON_ZERO_ACCESS_MATRIX.md)

## Summary

Maps every Game Day station to the real `Permission` values verified against
production code. Found and fixed one real gap during H.3: the Check-In
station now accepts the dedicated `check-in:operate` permission (held by
`VOLUNTEER`) as well as `game:operate`, so a check-in volunteer doesn't need
to be over-granted scorer/finalize access just to run attendance.

## Related Topics

- [Operator Role Matrix](01_OPERATOR_ROLE_MATRIX.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
