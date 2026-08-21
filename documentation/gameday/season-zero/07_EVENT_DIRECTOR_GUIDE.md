---
title: Season Zero Event Director Guide
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Event Director Guide

*Concise enough to use courtside.*

## Game Day Control Center

`/gameday` — live/next game, day progress, running order, club readiness, open incidents. This is your primary screen between games.

## Fixture Progression

12 fixtures in the [Fixture Running Order](01_FIXTURE_RUNNING_ORDER.md). Confirm the correct fixture is opened before every game.

## Readiness Checks (before every game)

- Club readiness — both clubs checked in, head coach present, roster verified.
- Check-in readiness — via `/gameday/checkin`.
- Scorer readiness — Head Scorer + Assistant Scorer at station, device logged in.
- Display readiness — venue projector showing the correct game.
- Broadcast readiness — scorebug live and matching the authoritative score.

## Authority — What Only the Event Director Decides

- GO / NO-GO before tip-off and before each subsequent game.
- Whether to pause for a dispute.
- Authorizing a `GAME_INTERRUPTION` or `GAME_ABANDONED` incident.
- Approving a score dispute resolution before a Reopen is used.
- Authorizing a service restart (executed by the System Administrator).
- Whether a game is abandoned.

## Score Dispute Procedure

1. Call "Hold score." 2. Compare digital state, verified visual state, and the signed manual sheet, in that priority order. 3. Reach agreement between Head Scorer, Assistant Scorer, and both clubs' representatives if needed. 4. Apply the correction through Undo/manual correction (not by editing the database). 5. Re-verify before resuming.

## Restart / Recovery Procedure

See [Emergency Procedures — Application Failure](12_EMERGENCY_PROCEDURES.md#c-application-failure). Only the System Administrator executes a restart, only with Event Director authorization.

## Who May Authorize Finalize

The Head Scorer executes Finalize, but only after the end-game verification sequence in the [Scorer Quick Guide](06_SCORER_QUICK_GUIDE.md) is complete. If in doubt, the Event Director gives the explicit go-ahead first.

## Emergency Escalation

Any P0 incident (see [Incident Matrix](11_INCIDENT_MATRIX.md)) is escalated to the Event Director immediately via the Floor Runner or directly.

## Related Topics

- [Operator Assignment Matrix](08_OPERATOR_ASSIGNMENT_MATRIX.md)
- [Incident Matrix](11_INCIDENT_MATRIX.md)
- [Emergency Procedures](12_EMERGENCY_PROCEDURES.md)
