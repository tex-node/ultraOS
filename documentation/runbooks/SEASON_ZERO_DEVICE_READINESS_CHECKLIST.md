---
title: Season Zero Device Readiness Checklist
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Device Readiness Checklist

## Purpose

Per-device checklist to run at T-6h ([T-Minus Runbook](SEASON_ZERO_T_MINUS_RUNBOOK.md))
for every device that will touch the application on Game Day. Print one copy
per device and check it off physically.

## Device

Station: `____________________`   Operator: `____________________`
Device label: `____________________`

## Checklist

- [ ] Boots correctly, no pending OS update mid-boot
- [ ] Charger present and confirmed working
- [ ] Battery at 100% or on continuous power
- [ ] Browser is current (Chrome/Safari/Edge — whichever is standard for this device)
- [ ] Correct URL bookmarked (see table below)
- [ ] Screen sleep / auto-lock disabled for the event window
- [ ] Automatic OS update / restart disabled for the event window, where it can
      be done safely — do not disable security-critical updates permanently,
      only defer them past the event
- [ ] Browser zoom level appropriate for the operator (scorer console tap
      targets are large by design — confirm they're comfortable at 100% zoom
      first)
- [ ] Touch controls tested and responsive (tap each control once during
      rehearsal, not during a live game)
- [ ] Wi-Fi credentials entered and confirmed connecting
- [ ] Mobile hotspot fallback configured on this device, if one is assigned
      to it
- [ ] Correct operator account logged in and tested (one real action taken
      during the venue rehearsal, then undone/verified)
- [ ] No password written on or taped to the device
- [ ] System time and date correct (matters for shot-clock/game-clock
      accuracy since the server computes remaining time from timestamps)
- [ ] Charger physically labelled with the same station name as the device
- [ ] Device physically labelled with its station name

## Bookmark by station

| Station | URL |
|---|---|
| Head Scorer | `https://app.neonultra.ng/games/[fixtureId]/live` (per-fixture — see [Fixture List](../gameday/season-zero/09_FIXTURE_LIST.md)) |
| Event Director | `https://app.neonultra.ng/gameday` |
| Check-In | `https://app.neonultra.ng/gameday/checkin` |
| Broadcast Graphics | `https://app.neonultra.ng/broadcast/game/[gameId]/scorebug` (created per-game once each fixture starts) |
| Venue/Public Display | `https://app.neonultra.ng/display/game/[gameId]/clock` |
| System Administrator | SSH to `raivstream` — see [Monitoring Command Card](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md) |

## Notes

Physical device inventory (make/model/OS) is not known to this system and is
not invented here. Use `DEVICE TO BE ASSIGNED` on the printed sheet until the
real hardware is confirmed at T-6h.

## Related Topics

- [T-Minus Runbook](SEASON_ZERO_T_MINUS_RUNBOOK.md)
- [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
