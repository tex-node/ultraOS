---
title: Season Zero Operator Role Matrix
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Operator Role Matrix

## Purpose

Define exactly who does what on Game Day, and where authority boundaries sit,
so no two people improvise a decision that belongs to one of them. Names are
left as placeholders — fill in during T-24h operator assignment
([T-Minus Runbook](SEASON_ZERO_T_MINUS_RUNBOOK.md)).

## Roles

### 1. Event Director — `[NAME TO BE ASSIGNED]`

**Authority:** highest Game-Day operational authority. Every other role defers
to the Event Director on anything this table marks as their call.

**Responsibilities:**
- Final GO/NO-GO before tip-off and before each subsequent game.
- Authorizes `GAME_INTERRUPTION` and `GAME_ABANDONED` incidents.
- Approves score disputes and major corrections before a Reopen is used.
- Escalation point for every incident.
- Final event close-out sign-off.

**Must NOT:** operate the scorer console directly during a live game (that's
the Head Scorer's job) except to take over in a declared emergency.

### 2. Head Scorer — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Sole operator of the authoritative scorer console (`/games/[fixtureId]/live`).
- Score entry, stat entry, period transitions, finalization.
- Coordinates shot-clock resets with the Shot-Clock Operator.

**Must NOT:** finalize a game before the Assistant Scorer has verbally
verified the score (see [Between-Games Checklist](../gameday/season-zero/14_BETWEEN_GAME_CHECKLIST.md)).

### 3. Assistant Scorer — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Independent visual verification of every score/stat entry against the court.
- Player identification support.
- Maintains the [manual paper backup](SEASON_ZERO_MANUAL_SCORE_SHEET.md) in
  real time, every game, no exceptions.
- Immediately challenges any entry that looks wrong — out loud, before the
  next possession if possible.

**Must NOT** operate the scorer console at the same time as the Head Scorer
unless explicitly taking over (e.g. Head Scorer device fails) — two people
entering events into the same game simultaneously is exactly the concurrency
scenario H.2 tested and fixed, but it's still confusing for both people. Only
one active hand on the controls at a time.

### 4. Shot-Clock Operator — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Start / Stop / Reset the 20-second shot clock via the scorer console.
- Coordinates with the Head Scorer and referees on when to reset.

### 5. Check-In / Roster Operator — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Runs `/gameday/checkin`: marks each rostered player PRESENT / LATE / ABSENT
  / UNAVAILABLE as they arrive.
- Reports club readiness to the Event Director.

### 6. Broadcast Graphics Operator — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Runs the scorebug (`/broadcast/game/[gameId]/scorebug`) for the stream.
- Verifies the broadcast output matches the authoritative score.

**Must NOT** change any authoritative score. The scorebug is a read-only
window onto the Head Scorer's console — it has no input controls.

### 7. Public Display Operator — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Runs the venue projector (`/display/game/[gameId]/clock`).
- Monitors `/live` for anyone checking the public site.

### 8. System Administrator — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Application/service health (`ultraos-web.service`).
- Login/device technical support.
- Controlled service restart if genuinely required (see
  [Application Failure Procedure](../gameday/season-zero/13_EMERGENCY_PROCEDURES.md)).

**Must NOT** edit competition state directly in the database under any
circumstances, including during an incident. Every correction goes through
the audited Undo / Correction / Reopen workflow, even under pressure.

### 9. Floor Runner / Communication — `[NAME TO BE ASSIGNED]`

**Responsibilities:**
- Relays referee decisions, player numbers, and substitution confirmations
  between the court and the scorer table.
- Carries incident information between stations when it's faster than typing.

## Authority Summary

| Decision | Decided by |
|---|---|
| GO/NO-GO to start a game | Event Director |
| What the score is | Head Scorer, verified by Assistant Scorer |
| Whether to pause for a dispute | Event Director |
| Whether to reopen a finalized game | Event Director authorizes; System Administrator or Head Scorer with `result:confirm` executes |
| Whether to restart the service | Event Director authorizes; System Administrator executes |
| Whether a game is abandoned | Event Director only |

## Related Topics

- [Access Matrix](SEASON_ZERO_ACCESS_MATRIX.md)
- [Event Director Guide](SEASON_ZERO_EVENT_DIRECTOR_GUIDE.md)
- [Scorer Quick Guide](SEASON_ZERO_SCORER_QUICK_GUIDE.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version for Season Zero H.3 |
