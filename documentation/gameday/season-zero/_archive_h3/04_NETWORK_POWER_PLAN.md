---
title: Season Zero Network & Power Plan
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Network & Power Plan

## Purpose

Document the recommended Game Day network and power architecture, and what
happens if each layer fails. This does not redesign the application for
offline operation — Ultra League OS is an online application; this plan is
about giving the critical devices more than one path to the internet.

## Network architecture

**PRIMARY NETWORK** — venue broadband / dedicated router.
`NETWORK DETAILS TO BE CONFIRMED ON SITE`

**SECONDARY NETWORK** — 4G/5G mobile hotspot or router, independent of the
venue's own connection.
`HOTSPOT DEVICE TO BE ASSIGNED`

**TERTIARY** — an individual operator's personal phone hotspot, as a last
resort only.

The Head Scorer's device — the single most critical device in the building —
should have at least two of these three configured and tested before
tip-off, not improvised mid-event.

## Dependency chain

| Layer | What depends on it | What happens if it fails |
|---|---|---|
| Venue Wi-Fi / broadband | Every device on the primary network | Switch affected devices to secondary network (hotspot); see [Internet Failure Procedure](13_EMERGENCY_PROCEDURES.md#internet-failure-procedure) |
| Mobile hotspot (secondary) | Devices switched over from primary | Fall back to tertiary (personal hotspot) or paper — see the same procedure |
| VPS (`raivstream`) | The entire application, for everyone | See [Application Failure Procedure](13_EMERGENCY_PROCEDURES.md#application-failure-procedure) |
| Cloudflare / DNS / media (R2) | Public site, club logos, player photos | Cosmetic only — see [Display Failure Procedure](13_EMERGENCY_PROCEDURES.md#display-failure-procedure). Scoring itself does not depend on media loading. |
| Local device Wi-Fi radio / battery | That one device only | Swap to the labelled backup device for that station |

## Power contingency matrix

| Equipment | Primary power | Backup power | Battery expectation | Failure action |
|---|---|---|---|---|
| Scorer device | Mains, plugged in | Power bank | Full charge + power bank should cover the full day | Swap to backup scorer device immediately; do not let the Head Scorer's device run on unmonitored battery during a live game |
| Shot-clock device | Mains, plugged in | Power bank | Same as above | Swap to backup device |
| Event Director device | Mains or full battery | Power bank | Full day | Low priority to swap immediately — this device doesn't write competition state |
| Network router (primary) | Mains | UPS if available, otherwise none | N/A | Switch all devices to secondary network |
| Broadcast computer | Mains | `TO BE CONFIRMED` | `TO BE CONFIRMED` | Broadcast team uses manual graphics fallback; Ultra League OS remains authoritative regardless — see [Broadcast Failure Procedure](13_EMERGENCY_PROCEDURES.md#broadcast-failure-procedure) |
| Venue display / projector | Mains | `TO BE CONFIRMED` | `TO BE CONFIRMED` | Game continues on manual score sheet visibility alone if needed — see [Display Failure Procedure](13_EMERGENCY_PROCEDURES.md#display-failure-procedure) |
| Charging hub | Mains | `TO BE CONFIRMED` | N/A | Rotate devices to whatever power is available; prioritize the Head Scorer's device |

**The software competition state remains authoritative even if a display
loses power entirely** — the game clock, shot clock, and score all live on
the server, not on any single screen. Losing a display is a presentation
problem, never a data-loss problem.

## Related Topics

- [Emergency Procedures](13_EMERGENCY_PROCEDURES.md)
- [Device Readiness Checklist](../../runbooks/SEASON_ZERO_DEVICE_READINESS_CHECKLIST.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version — network/hotspot/power specifics marked UNKNOWN pending on-site confirmation |
