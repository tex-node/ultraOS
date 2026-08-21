---
title: Season Zero T-Minus Runbook
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero T-Minus Runbook

## T-24 Hours

- [ ] Confirm operator assignments (names) are filled in on the [Operator Assignment Matrix](08_OPERATOR_ASSIGNMENT_MATRIX.md).
- [ ] Confirm devices are charging.
- [ ] Confirm the print pack has been printed (see [Print Pack Index](00_PRINT_PACK_INDEX.md)).
- [ ] No UNKNOWN item is silently marked READY — every outstanding item gets an owner and a deadline.

## T-12 Hours

- [ ] Devices charging.
- [ ] Operators confirmed.
- [ ] Network equipment ready.
- [ ] Backup hotspot ready.
- [ ] Printed pack complete.
- [ ] No code changes since freeze unless logged as a P0/P1 fix.

## T-6 Hours

- [ ] All devices at or near 100% charge.
- [ ] Power banks charged.
- [ ] Routers/hotspots charged.
- [ ] Chargers packed.
- [ ] Printed pack packed.
- [ ] Operator contact group active.

## T-3 Hours

- [ ] Arrive at venue.
- [ ] Begin station setup — do not wait until T-30 to discover power/network problems.

## T-2 Hours

- [ ] Execute the [Venue Mini-Rehearsal](15_VENUE_MINI_REHEARSAL.md).
- [ ] Any P0 found must be fixed and retested before GO.

## T-60 Minutes

- [ ] Final production backup — record filename, timestamp, size, SHA-256; verify with `pg_restore --list`.
- [ ] Service health check.
- [ ] Database health check.
- [ ] Fixtures re-verified read-only.
- [ ] Rosters re-verified read-only.
- [ ] Jersey numbers re-verified (captured or explicitly still pending).
- [ ] Coach assignments re-verified read-only.
- [ ] Game Day Control Center loads correctly.
- [ ] Scorer console loads correctly.
- [ ] Check-in loads correctly.
- [ ] Displays load correctly.
- [ ] Primary network confirmed.
- [ ] Backup network confirmed.
- [ ] Power confirmed.
- [ ] Printed fallback pack present and accessible.

## T-30 Minutes

- [ ] Lock configuration — no more changes except attendance, legitimate incidents, and authorized All-Star selection.
- [ ] No code deployments.

## T-10 Minutes

- [ ] All operators at station.
- [ ] Spoken readiness check (see [Scorer Quick Guide](06_SCORER_QUICK_GUIDE.md) pre-game checklist).

## Tip-Off

- [ ] Event Director gives final GO for Fixture 1.

## Between Games

- [ ] Run the [Between-Game Checklist](13_BETWEEN_GAME_CHECKLIST.md) after every game.

## Event Close

- [ ] Run the [Event Close Checklist](17_EVENT_CLOSE_CHECKLIST.md).

## Related Topics

- [Venue Mini-Rehearsal](15_VENUE_MINI_REHEARSAL.md)
- [Event Close Checklist](17_EVENT_CLOSE_CHECKLIST.md)
