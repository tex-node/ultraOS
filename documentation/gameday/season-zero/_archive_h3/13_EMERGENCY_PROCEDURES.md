---
title: Season Zero Emergency Procedures
status: Final
version: docs-1.0
last_updated: 2026-08-13
---

# Season Zero Emergency Procedures

## Purpose

What to do when something fails. Every procedure here ends the same way:
the authoritative digital score and the audited correction workflow win —
never a raw database edit, never a guess.

## Authoritative Score Hierarchy

1. **Authoritative digital score** — the Ultra League OS scorer/Game state.
   This is the record that counts.
2. **Visual verification** — the venue display and broadcast scorebug. These
   read from the same authoritative state; they are not a second source of
   truth, they're a window onto the first one.
3. **Manual fallback** — the paper score sheet, kept live by the Assistant
   Scorer throughout every game.

**If the digital score and the paper score disagree: do not guess.** Pause
the game if it isn't already. The Event Director determines the last
verified state, using whichever record has clearer, more specific evidence
(a specific basket, a specific time), then applies it through the audited
correction workflow (Undo, manual correction, or Reopen if already
finalized). Never a raw database edit, regardless of how confident anyone is.

## Display Failure Procedure

If the venue display or projector fails, the game can continue **if**:
- the authoritative scorer console is working, and
- the official score is known, and
- the manual paper backup is being maintained.

Do not stop competition merely because presentation fails. Only the Event
Director can decide it's operationally necessary to pause for a display
issue (e.g. the crowd genuinely cannot follow the game).

## Broadcast Failure Procedure

If the scorebug or broadcast graphic fails: **do not alter Game state to
repair presentation.** The broadcast team may switch to a manual graphics
fallback (a title card, a manually-updated overlay — whatever they have).
Ultra League OS remains the authoritative record regardless of what the
stream shows.

## Internet Failure Procedure

If the scorer's device loses internet:

1. **Stop** attempting digital scoring on that device.
2. Assistant Scorer continues the paper record — this is exactly why it's
   kept live throughout, not filled in afterward.
3. Notify the Event Director immediately.
4. Switch the scorer device to the secondary network (mobile hotspot) — see
   [Network & Power Plan](04_NETWORK_POWER_PLAN.md).
5. Refresh the scorer page.
6. Determine the last server-confirmed event (the event feed on the scorer
   console shows exactly what was recorded, in order, with timestamps).
7. Reconcile any events that happened during the outage using the normal
   scorer/correction workflow — enter them as if they're happening now, with
   accurate game-clock context from the paper sheet.
8. Confirm the reconciled score against the venue/paper record with the
   Event Director before resuming.
9. Resume.

**Never bulk-edit database rows to "catch up."** Enter each missed event
individually through the normal console, exactly like it does anywhere else
in this system.

## Application Failure Procedure

If the application itself is unavailable (not just one device's network):

1. Pause the game where appropriate.
2. Record the physical score and clock on paper immediately.
3. System Administrator checks service status (see Monitoring Command Card
   below).
4. Check `ultraos-web.service` specifically.
5. Restart the service **only if genuinely required**, and only with the
   Event Director's authorization.
6. Reload the scorer console.
7. Compare the recovered authoritative state against the manual sheet.
8. Reconcile any gap using the audited correction workflow.
9. Resume.

**Do not restart PostgreSQL casually.** H.2 proved a full application
service restart preserves score, clock, and every event — there is no
evidence a database-level restart is ever the right first move, and it's a
much bigger blast radius than restarting the web service.

## Database Failure Procedure (documentation only — do not simulate this)

If the database itself becomes unavailable:

- Manual scoring becomes the temporary operational record for the duration.
- **Do not repeatedly restart the database blindly** — that risks making a
  real problem worse.
- Escalate immediately to the System Administrator and Event Director.
- Restore service before attempting any digital reconciliation — don't try
  to partially reconcile against a half-recovered database.

This procedure is documented only. It was deliberately not simulated against
production per the H.3 spec's explicit instruction — a real PostgreSQL
outage is not something to rehearse on the live database.

## Pre-Event Backup Procedure

The final backup before competition begins, taken after final roster/fixture
verification (around T-60 minutes per the
[T-Minus Runbook](../../runbooks/SEASON_ZERO_T_MINUS_RUNBOOK.md)):

```bash
sudo -u ultraos bash -c '
set -euo pipefail
set -a; source /opt/ultraleagueos/shared/web.env; set +a
backup_dir=/var/backups/ultraleagueos
timestamp=$(date -u +%Y%m%d-%H%M%S)
backup_path=${backup_dir}/ultraos-${timestamp}-pre-tipoff.dump
db_url=$(printf %s "$DATABASE_URL" | sed -E "s/([?&])schema=[^&]*&?/\1/; s/\?&/\?/; s/[?&]$//")
install -d -m 0750 "$backup_dir"
pg_dump --dbname="$db_url" --format=custom --compress=9 --file="$backup_path"
sha256sum "$backup_path" > "$backup_path.sha256"
echo "Backup created: $backup_path"
'
```

Then verify:

```bash
sha256sum -c /var/backups/ultraleagueos/ultraos-<timestamp>-pre-tipoff.dump.sha256
pg_restore --list /var/backups/ultraleagueos/ultraos-<timestamp>-pre-tipoff.dump | head -5
```

Record the timestamp, filename, size, SHA-256, and confirm the `pg_restore
--list` output looks structurally valid (hundreds of TOC entries, no error)
before considering the event GO. **Do not run this prematurely** — it should
happen after the final roster is locked in, not hours before when more
changes might still land.

## Monitoring Command Card

Safe, read-only commands for the System Administrator. Nothing here mutates
data.

**Service status:**
```bash
systemctl is-active ultraos-web.service
systemctl status ultraos-web.service --no-pager
```

**Recent logs:**
```bash
journalctl -u ultraos-web.service --since '10 minutes ago' --no-pager
```

**Disk space:**
```bash
df -h /
```

**Database connectivity (read-only check):**
```bash
sudo -u ultraos bash -c 'set -a; source /opt/ultraleagueos/shared/web.env; set +a; psql "$DATABASE_URL" -c "select 1;"'
```

**Backup verification:**
```bash
ls -la /var/backups/ultraleagueos/ | tail -5
sha256sum -c /var/backups/ultraleagueos/<latest-file>.sha256
```

**Application health (from any machine):**
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://app.neonultra.ng/live
```

No destructive commands, no database mutation shortcuts appear on this card
by design — anything beyond read-only checks goes through the application's
own audited tools, or waits for a calm moment off the clock.

## Related Topics

- [Incident Escalation Matrix](12_INCIDENT_MATRIX.md)
- [Network & Power Plan](04_NETWORK_POWER_PLAN.md)
- [Event Director Guide](../../runbooks/SEASON_ZERO_EVENT_DIRECTOR_GUIDE.md)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-1.0 | 2026-08-13 | UltraLeagueOS Team | Initial version |
