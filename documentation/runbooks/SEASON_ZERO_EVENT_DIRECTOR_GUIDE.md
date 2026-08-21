---
title: Season Zero Event Director Guide
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Event Director Guide

## Purpose

Your decisions, in one place. Everyone else defers to you on anything below.

## GO/NO-GO authority

Before tip-off and before every subsequent game, confirm out loud with the
Head Scorer, Shot-Clock Operator, and Broadcast Operator:
"Correct fixture, correct teams, clock ready, shot clock ready, scorer ready,
broadcast ready." Only then does the game start. See the
[per-game opening procedure](../gameday/season-zero/14_BETWEEN_GAME_CHECKLIST.md).

## Game delay

Record a `GAME_DELAY` incident with the reason. The game clock does not need
to be running for this — it's informational. Decide whether to hold the next
game's slot or let the whole day's schedule slip; the system will not
auto-adjust the printed schedule for you.

## Game interruption

Recording a `GAME_INTERRUPTION` incident automatically pauses the game if it
was live. Resolve it with a one-line note once play can resume, then have
the Head Scorer tap Resume.

## Score dispute

**Do not guess.** Pause the game if it isn't already paused. Ask the Head
Scorer to read the digital score, the Assistant Scorer to read the paper
score, and reconcile using the audited correction tools (a manual +/- entry,
or Undo if it's the single most recent event) — never a direct edit. Once
agreed, confirm verbally with both scorers before resuming.

## Clock correction

Only you authorize this. The game must be Paused. The Head Scorer enters the
correct minutes/seconds under Incidents → Clock Correction with a reason —
this is a real, audited change to the game clock, not just a note.

## Player unavailable

Record a `PLAYER_UNAVAILABLE` incident. This does not touch the permanent
roster — use the [Check-In station](../gameday/season-zero/03_DEVICE_CHECKLIST.md)
to mark them ABSENT or UNAVAILABLE for the day if that's also true.

## Game abandonment

The most serious call you make. Record a `GAME_ABANDONED` incident with a
full reason — this pauses the game and creates a permanent record, but does
not auto-finalize or auto-decide a winner. You decide what happens to the
result afterward (reschedule, forfeit per whatever off-system league policy
applies, etc.) — the software has no built-in forfeit rule to fall back on.

## System outage / service restart authority

Only you authorize a service restart, and only the System Administrator
executes it. See the
[Application Failure Procedure](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md).
H.2 proved score, clock, and events all survive a real restart — but confirm
it's genuinely necessary before pulling that lever mid-game.

## Reopen authorization

You approve every Reopen before it happens, even though the software doesn't
technically stop a `result:confirm` account from doing it without asking you.
State the reason out loud, have it typed into the reopen form, confirm the
game returns to Paused, oversee the correction, confirm re-finalization.

## Final score verification

Before every finalize: score read aloud, verified, no open dispute. After
every finalize: check `/live`, standings, and the broadcast scorebug all
show the confirmed result. If any of them are wrong, that's a Reopen, not a
database edit.

## Related Topics

- [Operator Role Matrix](SEASON_ZERO_OPERATOR_ROLE_MATRIX.md)
- [Incident Escalation Matrix](../gameday/season-zero/12_INCIDENT_MATRIX.md)
- [Emergency Procedures](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
