---
title: Season Zero Venue Mini-Rehearsal Script
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Venue Mini-Rehearsal Script

**Executable in 15–30 minutes. This is a PHYSICAL VENUE rehearsal for human operators, using real devices, the real network, and a SAFE isolated rehearsal fixture — never a real production Fixture.**

1. Connect every device to the venue network.
2. Log in on each device with its assigned operator account.
3. Open `/gameday` and confirm it loads.
4. Open the scorer console on a rehearsal fixture only (`recordOrigin: REHEARSAL`) — never fixture IDs from the running order.
5. Open the venue display route and confirm it renders.
6. Open the broadcast scorebug route and confirm it renders.
7. Open `/gameday/checkin` and confirm it loads for the Check-In Operator's account.
8. Simulate a score using the rehearsal fixture only.
9. Test a 4-point score and confirm it displays correctly on scorer, display, and broadcast.
10. Test Ultra Time (final-minute double scoring) and confirm the multiplier applies.
11. Test the shot clock start/reset.
12. Test a score correction (Undo).
13. Confirm the venue display refreshes/redraws correctly after the correction.
14. Disconnect the primary network on the scorer device.
15. Switch that device to the backup network.
16. Verify the application recovers and shows the correct current state.
17. Test the manual score fallback procedure — fill a manual sheet in parallel.
18. Restore the normal network and device state.
19. Confirm zero production residue: no rehearsal Fixture, Game, or GameEvent left behind, and the rehearsal fixture is cleaned up per the established H.2 rehearsal-cleanup procedure.

**Do not execute this against real production games. This script tests the physical setup (devices, network, power), not the software logic — that was already exhaustively tested in the H.2 rehearsal matrix.**

## Related Topics

- [Network + Power Commissioning](10_NETWORK_POWER_COMMISSIONING.md)
- [T-Minus Runbook](16_T_MINUS_RUNBOOK.md)
