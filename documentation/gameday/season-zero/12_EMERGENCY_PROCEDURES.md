---
title: Season Zero Emergency Procedures
status: Final
version: docs-2.0
last_updated: 2026-08-13
---

# Season Zero Emergency Procedures

## Authoritative Score Hierarchy

When sources disagree, resolve in this order — never guess:

1. Authoritative digital Game state (the scorer console's current record).
2. Verified visual/operator state (what the Head Scorer and Assistant Scorer both witnessed and agree happened).
3. Signed manual score sheet.

## A. Internet Failure

1. System Administrator switches the affected device to the backup network.
2. If backup network also fails: Assistant Scorer switches to full manual scoring on paper immediately, timestamped.
3. Head Scorer stops entering events until connectivity confirmed restored.
4. On restore: reconcile any events entered just before the outage against the manual sheet before resuming digital entry.

## B. Scorer Device Failure

1. Backup Scorer device takes over per the Scorer Handover procedure.
2. New operator logs in, opens the same fixture, confirms current score/clock/event history before entering anything.
3. No new score entered until the backup operator has confirmed the authoritative current state.

## C. Application Failure

1. Switch to full manual scoring on paper immediately.
2. System Administrator checks service health (`systemctl is-active ultraos-web.service`) and restarts only with Event Director authorization.
3. On restore: verify the game state matches the manual sheet before resuming digital entry; reconcile any gap manually via Undo/correction, never by direct database edit.

## D. Venue Display Failure

1. Scorer console and manual sheet remain authoritative — game continues uninterrupted.
2. Broadcast may continue independently.
3. System Administrator attempts to restore the display without pausing the game.

## E. Broadcast Failure

1. Close/disconnect the scorebug source — the scorer and game state continue unaffected.
2. Public `/live` remains authoritative for anyone checking remotely.
3. Never change the score to try to fix a graphics issue.

## F. Shot Clock Failure

1. Switch to the manual shot-clock fallback per Event Director/referee procedure (visible hand-count or physical backup clock).
2. Competition score is never modified to compensate for a shot-clock issue.
3. Document the actual fallback used, in real time, for future events.

## G. Database / Infrastructure Failure

1. Documentation-only fallback (not simulated in software rehearsal). Switch to full manual scoring immediately.
2. System Administrator escalates to hosting/infrastructure support.
3. Every game played during the outage is reconciled from the signed manual sheets once the system is restored — never reconstructed from memory.

## H. Score Dispute

1. Call "Hold score."
2. Compare the three-source hierarchy above.
3. Event Director hears both clubs if needed, then decides.
4. Correction applied through Undo/manual correction, never a direct database edit.

## I. Accidental Finalization

1. Do not attempt to re-finalize.
2. Event Director authorizes a Reopen; System Administrator or Head Scorer (holding `result:confirm`) executes it, with a documented reason.
3. Game returns to `LIVE`/`PAUSED` for correction, then is re-finalized after verification.

## J. Power Failure

1. Devices switch to battery power immediately — this is why every station needs a charged device per the Device Assignment Matrix.
2. If a station cannot maintain power, fall back to the manual score sheet for that game.
3. System Administrator confirms router/hotspot backup power separately — a network outage from lost router power is treated as Procedure A.

## Related Topics

- [Incident Matrix](11_INCIDENT_MATRIX.md)
- [Event Director Guide](07_EVENT_DIRECTOR_GUIDE.md)
