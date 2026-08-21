---
title: Season Zero T-Minus Runbook
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero T-Minus Runbook

## Purpose

The single timeline from T-24h to event close. Follow it in order.

## Prerequisites

- Code freeze confirmed active (`SEASON_ZERO_GAME_DAY_CODE_FREEZE`).
- [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md) filled in with
  real names.

## T-24 HOURS

- [ ] Confirm code freeze still in effect; no unmerged feature work pending.
- [ ] Confirm `ultraos-web.service` active, no unresolved incidents open.
- [ ] Review the [Fixture List](../gameday/season-zero/09_FIXTURE_LIST.md) —
      12 fixtures + exhibition, correct order, correct clubs.
- [ ] Review the [Roster Pack](../gameday/season-zero/10_ROSTER_PACK.md) —
      confirm no last-minute player changes are pending.
- [ ] Review the [Coach Pack](../gameday/season-zero/11_COACH_PACK.md).
- [ ] Assign real people to every role in the
      [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md).
- [ ] Assign real devices to every station (fill in the
      [Device Checklist](SEASON_ZERO_DEVICE_READINESS_CHECKLIST.md)).
- [ ] Print the full [Game Day Pack](../gameday/season-zero/) — one copy per
      station plus a spare set.
- [ ] Begin charging every device that will be used.
- [ ] Confirm primary and secondary internet arrangements are booked/available.

## T-12 HOURS

- [ ] No feature development from this point — P0/P1 fixes only.
- [ ] Verify the most recent production backup exists and is checksum-verified.
- [ ] Confirm every operator has tested logging into their assigned account.
- [ ] Confirm physical equipment inventory (devices, chargers, hotspots,
      power banks) against the [Device Checklist](SEASON_ZERO_DEVICE_READINESS_CHECKLIST.md).

## T-6 HOURS

- [ ] All devices fully charged.
- [ ] Mobile hotspots charged and data-topped-up.
- [ ] Print (if not already): Fixture list, roster pack, manual score sheets
      (one per game — 13 total including exhibition), manual stat sheets (one
      per club per game), scorer guide, event director guide, incident sheet.
- [ ] Run the [Device Readiness Checklist](SEASON_ZERO_DEVICE_READINESS_CHECKLIST.md)
      on every device.

## T-4 HOURS

- [ ] Read-only production verification (service active, disk space,
      database connectivity — see
      [Monitoring Command Card](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md#monitoring-command-card)).
- [ ] No schema changes from this point unless a demonstrated P0 requires it.

## T-3 HOURS — VENUE ARRIVAL

- [ ] Power up every station.
- [ ] Connect primary network; test it actually reaches the app.
- [ ] Connect and test the backup network path.
- [ ] Position Head Scorer, Shot-Clock Operator, Broadcast Operator physically.
- [ ] Open the Check-In station.

## T-2 HOURS

- [ ] Execute the Venue Systems Rehearsal (15–30 minutes, isolated rehearsal
      state only) — see [Venue Rehearsal Plan](#venue-systems-rehearsal-plan) below.
- [ ] Close every P0 finding from the rehearsal before proceeding.
- [ ] Do not start speculative fixes — if it's not P0, it waits.

## T-90 MINUTES

- [ ] Roster/check-in review — who's actually present.
- [ ] Club readiness review on `/gameday`.
- [ ] Head Coach confirmation for every club with a game in the first slot.
- [ ] Broadcast graphics check.
- [ ] Venue display check.

## T-60 MINUTES

- [ ] Final production backup — see
      [Pre-Event Backup Procedure](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md#pre-event-backup-procedure).
      Verify SHA-256 and `pg_restore --list`.
- [ ] Event Director final GO/NO-GO review against this runbook.

## T-30 MINUTES

- [ ] Freeze all operational data changes except check-in status and
      legitimate Game Day incident/status updates.
- [ ] All operators at their stations.
- [ ] Manual score sheets laid out and ready.

## T-15 MINUTES

- [ ] Scorer logs in.
- [ ] Correct first fixture loaded and confirmed.
- [ ] Shot clock shows 20.
- [ ] Venue display live.
- [ ] Broadcast scorebug live.
- [ ] Backup device for the scorer station powered on and logged in, ready
      to swap in.

## T-5 MINUTES

Spoken confirmation, in order:

"Correct fixture." → "Correct teams." → "Clock ready." → "Shot clock ready."
→ "Scorer ready." → "Broadcast ready." → "Event Director ready."

## TIP-OFF

Start Game only on referee/Event Director cue — see the
[per-game opening procedure](../gameday/season-zero/14_BETWEEN_GAME_CHECKLIST.md).

## BETWEEN GAMES

Run the [Between-Games Checklist](../gameday/season-zero/14_BETWEEN_GAME_CHECKLIST.md)
before every subsequent game.

## FINAL GAME

Same opening procedure as every other game. After finalization, proceed
directly to [Event Close](../gameday/season-zero/17_EVENT_CLOSE_CHECKLIST.md).

## EVENT CLOSE

See [Event Close Checklist](../gameday/season-zero/17_EVENT_CLOSE_CHECKLIST.md).

## Venue Systems Rehearsal Plan

Run this on-site at T-2 hours with the **actual** scorer device, shot-clock
device, Event Director device, venue network, backup network, broadcast
computer, and projector/display — not a simulation. 15–30 minutes, isolated
rehearsal state only (a throwaway fixture, never one of the 12 real ones —
mirrors the same isolation approach used in the H.2 software rehearsal).

1. Log in on the real scorer device with the real operator account.
2. Load the correct (rehearsal) fixture.
3. Score +2.
4. Undo that score.
5. Reset the shot clock.
6. Confirm the venue display shows the change.
7. Confirm the broadcast scorebug shows the change.
8. Switch the scorer device from primary to backup network mid-session;
   confirm it keeps working.
9. Refresh the device; confirm state is still correct.
10. On the System Administrator's device, confirm `ultraos-web.service` shows
    active.
11. Confirm the manual paper score sheet was kept in sync throughout by the
    Assistant Scorer.
12. Test one incident report end-to-end (spoken communication from Floor
    Runner to Head Scorer to Event Director).

This is not a repeat of the full H.2 software rehearsal (31 automated checks,
already passed) — it's a physical confirmation that the real hardware, the
real venue network, and the real people can do the same thing the software
already proved it can do.

**This step must be physically executed by the on-site team — it cannot be
run from this environment.** Until it has been, treat
`VENUE_NETWORK_INTERRUPTION_TEST_REQUIRED` and this rehearsal as outstanding
in the [GO/NO-GO Matrix](../gameday/season-zero/17_EVENT_CLOSE_CHECKLIST.md).

## Related Topics

- [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md)
- [Device Readiness Checklist](SEASON_ZERO_DEVICE_READINESS_CHECKLIST.md)
- [Event Director Guide](SEASON_ZERO_EVENT_DIRECTOR_GUIDE.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
