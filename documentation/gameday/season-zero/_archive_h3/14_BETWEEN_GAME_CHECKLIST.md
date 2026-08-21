---
title: Season Zero Game Flow — Check-In, Opening, Closing, Between-Games
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Game Flow

## Purpose

The full rhythm of the day: check-in opening, before each game, after each
game, and the reset in between. Read top to bottom once, then use each
section as its own checklist during the event.

## Check-In Opening Procedure

| Time | Action |
|---|---|
| T-180 min | Check-in station active — players can start checking in |
| T-120 min | Initial attendance review by the Check-In Operator |
| T-60 min | Club readiness review on `/gameday` |
| T-30 min | Event Director resolves any absences/unavailable players for the first games of the day |

**Do not modify the permanent roster merely because someone is absent.**
Mark them ABSENT or UNAVAILABLE for the day at check-in — that's attendance,
not a roster change. A genuine roster change (like the Hawau/Adeshina swap
made ahead of this event) goes through the normal draft/correction workflow,
authorized explicitly, not inferred from a no-show.

## Per-Game Opening Procedure

Before **every** game, in order:

1. Head Scorer confirms the correct fixture is loaded (checks the Fixture ID
   against the [Fixture List](09_FIXTURE_LIST.md)).
2. Assistant Scorer confirms Home Club, Away Club, and division match the
   two teams actually on the court.
3. Shot-Clock Operator confirms the shot clock reads 20.
4. Event Director confirms both teams are ready.
5. Only then: **Start Game.**

This confirmation is spoken aloud, every time, even for game 11 of 12 when
everyone is tired. That's exactly when a wrong-fixture mistake happens.

## End-of-Game Procedure

Before finalizing:

1. Head Scorer reads the score aloud.
2. Assistant Scorer verifies it against the paper sheet.
3. Event Director confirms there is no unresolved score dispute.

Then: **Finalize.**

After finalization, verify all four of:
- `/live` shows the correct result.
- Standings updated correctly.
- Broadcast scorebug shows the final score.
- Game status shows FINAL.

If any of the four is wrong: **Reopen** through the authorized workflow
(Event Director approves, written reason required). Never edit the
database directly.

## Between-Games Reset

Checklist before moving to the next fixture:

- [ ] Correct next fixture loaded on the scorer console
- [ ] Previous game confirmed FINAL
- [ ] Shot clock reset to 20 for the new game
- [ ] Game clock reset to 10:00 for the new game (happens automatically on
      Start Game for the new fixture — verify it, don't assume it)
- [ ] Score for the new game starts at 0–0 — confirm you're not still looking
      at the previous game's score
- [ ] Incident panel clear of anything from the previous game (old incidents
      stay in the audit trail, they just shouldn't be mistaken for a live
      one)
- [ ] New manual score sheet in use — separate one per game, not a
      continuation
- [ ] Broadcast graphics operator has switched to the new game's scorebug
      URL
- [ ] Venue display operator has switched to the new game's clock URL
- [ ] All operators confirm ready before the next Per-Game Opening Procedure
      begins

## Related Topics

- [Fixture List](09_FIXTURE_LIST.md)
- [Incident Escalation Matrix](12_INCIDENT_MATRIX.md)
- [Event Close Checklist](17_EVENT_CLOSE_CHECKLIST.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
