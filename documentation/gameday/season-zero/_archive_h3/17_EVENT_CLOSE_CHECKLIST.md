---
title: Season Zero Event Close Checklist
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Event Close Checklist

## Purpose

After the final game (the All-Star exhibition and trophy presentation),
close the event out properly — don't just walk away from open stations.

## Checklist

- [ ] Verify all 12 official competitive games show FINAL.
- [ ] Verify Standings reflect all 12 results correctly.
- [ ] Verify no incidents remain open (`GAME_INCIDENT_RECORDED` without a
      matching `GAME_INCIDENT_RESOLVED`).
- [ ] Export/record final results (screenshot or save `/public/standings`
      and `/public/fixtures` as a record of the day, alongside the paper
      sheets).
- [ ] Take a post-event production backup — same procedure as the
      [pre-event backup](13_EMERGENCY_PROCEDURES.md#pre-event-backup-procedure),
      timestamp it clearly as post-event.
- [ ] Record the backup's SHA-256 checksum.
- [ ] **Do not immediately begin cleanup.** Preserve every paper sheet,
      device log, and the audit trail exactly as it stands until someone
      has actually reviewed the day's results end to end.
- [ ] Collect all manual score sheets and stat sheets — file them, don't
      discard them.
- [ ] Confirm every device is returned/charged for storage.

## Final GO/NO-GO reference

This checklist closes the loop that opened with the
[T-Minus Runbook](../../runbooks/SEASON_ZERO_T_MINUS_RUNBOOK.md). The formal
software + operations GO/NO-GO matrix for the event lives in the H.3 final
report delivered alongside this pack, not in a separate file — check that
report for the authoritative PASS/FAIL/READY/UNKNOWN status of every gate.

## Related Topics

- [Emergency Procedures — Pre-Event Backup Procedure](13_EMERGENCY_PROCEDURES.md#pre-event-backup-procedure)
- [T-Minus Runbook](../../runbooks/SEASON_ZERO_T_MINUS_RUNBOOK.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
