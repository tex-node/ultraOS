---
title: Season Zero Incident Escalation Matrix
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Incident Escalation Matrix

## Purpose

Classify every Game Day incident by severity so the right person acts
without a debate in the moment.

## P0 — GAME-CRITICAL

**Examples:** authoritative score uncertain, database unavailable, scorer
cannot write, score corruption, wrong game being scored, system assigning
a score to the wrong club.

**Who decides:** Event Director.
**Who fixes:** System Administrator (technical) + Event Director (competition
decision).
**Can the game continue?** No — pause immediately. Do not resume until the
authoritative score is confirmed and agreed between the digital record and
the manual paper record.

## P1 — OPERATIONAL

**Examples:** shot-clock display unavailable, broadcast graphics unavailable,
check-in device unavailable.

**Who decides:** Event Director, on report from the affected station.
**Who fixes:** System Administrator, or swap to the labelled backup device.
**Can the game continue?** Yes, generally — the authoritative scorer console
is unaffected. Shot clock can be tracked manually by voice/hand signal if the
device itself is down (not the shot-clock *value* in the software, just the
display device).

## P2 — PRESENTATION

**Examples:** club logo missing, public page unavailable, venue display
styling problem.

**Who decides:** whoever notices — no escalation needed.
**Who fixes:** System Administrator, after the current game, not during it.
**Can the game continue?** Yes, always. Never let a presentation-layer issue
touch competition state or interrupt play.

## Recording every incident

Every incident, regardless of severity, gets recorded through the scorer
console's Incidents panel (`GAME_DELAY`, `PLAYER_UNAVAILABLE`,
`CLOCK_CORRECTION`, `GAME_INTERRUPTION`, `GAME_ABANDONED`) or, for the two
score-specific workflows, the score correction / reopen tools — every one of
these writes an audited record (type, fixture/game, actor, timestamp,
reason, resolution). Never handle an incident by editing the database.

## Related Topics

- [Event Director Guide](../../runbooks/SEASON_ZERO_EVENT_DIRECTOR_GUIDE.md)
- [Emergency Procedures](13_EMERGENCY_PROCEDURES.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
