---
title: Draft Day Go-Live Runbook
status: Draft
version: docs-0.1
last_updated: 2026-08-09
---

# Draft Day Go-Live Runbook

## Purpose

Govern the transition from rehearsal to an actual LIVE Ultra Basketball
Draft Day event, and the event itself. This runbook assumes
[DRAFT_DAY_OPERATOR_RUNBOOK.md](DRAFT_DAY_OPERATOR_RUNBOOK.md) has already
been read and rehearsed successfully.

**Read this before assuming production is ready:** as of Track F, production
(`app.neonultra.ng`, service `ultraos-web.service`) has diverged
significantly from the staging rehearsal environment. Production currently
holds 174 real Athletes/Players and 18 real Staff (staging's curated Season
Zero cohort is 58 players / 9 staff), is 13 migrations behind staging's
schema, and its automated backup service (`ultraos-backup.service`) is
currently failing outright. None of this is a rehearsal-workflow problem —
it is real, unstarted production-readiness work. See the Track F report,
§13 (Production Read-Only Audit), for full detail. Do not treat a passing
staging rehearsal as production readiness.

## Prerequisites

- Phase 9 Track F reported `PRODUCTION_RELEASE_CANDIDATE` (code readiness)
  — check the latest Track report before assuming this still holds.
- Production data reconciliation (Phase 9 Track G) has been completed
  separately — this runbook does not perform it.
- Production backup automation is confirmed working, not just present.
- A named, authorized administrator is available to give GO-LIVE
  authorization in person or in writing.

## T-24 Hours

- [ ] Take a fresh, verified production database backup (SHA-256 checked,
      `pg_restore --list` structurally validated). Do not rely on the
      automated backup service without confirming it actually ran — see the
      Emergency section on why.
- [ ] Confirm the release to be deployed: exact git state or release
      identifier, migration list, test/build results (see the latest Track
      report's Release Diff section).
- [ ] Verify media: all Club logos, Coach photos/fallbacks, Player
      photos/fallbacks render correctly against production's actual storage
      configuration (not staging's).
- [ ] Verify the actual Draft cohort in production matches what the league
      office intends to draft — do not assume it matches the staging
      rehearsal cohort by name or count.
- [ ] Verify all 8 Clubs and their SeasonClub records exist and are correct
      in production.
- [ ] Verify the selected Coach cohort (MEN/WOMEN pools) exists in production
      with correct Ultra Staff IDs — this requires re-running the Season Zero
      coach selection workflow against production data if it has not been
      done there yet.
- [ ] Confirm venue network reliability for both the control machine and the
      projector.

## T-4 Hours

- [ ] `systemctl is-active ultraos-web.service` returns `active`.
- [ ] Operator login works with the correct role on the production
      environment specifically (not staging credentials).
- [ ] Projector display loads and full-screens correctly.
- [ ] Control machine loads the correct DraftEvent's control room.
- [ ] Backup operator/machine is set up and can also log in.
- [ ] If any rehearsal was run against production's real DraftEvent to
      verify the workflow end-to-end, use the rehearsal reset action and
      confirm zero rehearsal allocations/picks remain, zero official
      assignments exist yet.

## T-60 Minutes

- [ ] Final readiness check: 0 RED items on the DraftEvent readiness view.
- [ ] Confirm the DraftEvent's `operatingMode` still reads REHEARSAL — it
      must not be switched to LIVE until the explicit authorization step
      below.
- [ ] Confirm no stale allocations or picks exist from any earlier test.
- [ ] Brief all staff: who reserves, who reveals, who confirms, who
      corrects, who has reset permission, and the emergency-stop procedure.

## GO-LIVE Authorization

This is a **human decision**, not a system state. Record it explicitly
before switching modes:

```
Authorized administrator: ______________________
Timestamp:                ______________________
Reason:                   ______________________
Event:                    ______________________ (DraftEvent ID / name)
Current mode:              REHEARSAL
New mode:                  LIVE
```

Only after this record exists, use "Start / resume LIVE" in the control
room. This is the **only** point in the entire Draft Day process where
`operatingMode` moves from REHEARSAL to LIVE. Nothing in Track F executed
this transition — it remains untested end-to-end in this codebase and
should be treated as the highest-risk single action of the event.

## Emergency Stop

Halt the Draft (pause, do not reset or switch modes) if:

- The control machine or projector loses connection and cannot recover
  within a few minutes.
- An allocation/pick is confirmed against data that turns out to be wrong at
  a level correction cannot safely fix (e.g., the wrong Player pool was
  loaded).
- Any unexpected official assignment appears that nobody authorized.
- The database backup for this event cannot be confirmed to exist.

Use "Pause", not Reset — Reset only ever removes REHEARSAL state and will
refuse to run against a LIVE event by design; it is not an emergency-stop
mechanism.

## Recovery

Same as rehearsal: reload the control page, reload the display page, restart
`ultraos-web.service` if truly necessary (never restart PostgreSQL), then
verify DraftEvent stage, current allocation/pick, and history match
expectations before resuming.

## Post-Draft

- [ ] Review every confirmed result for correctness.
- [ ] Formally mark the DraftEvent `COMPLETED` once the league office
      confirms the Draft is finished — there is currently no separate
      "finalization lock" beyond this status change; treat completion as
      final and use Correction (not casual data edits) for any post-hoc fix.
- [ ] Take a post-event production backup.
- [ ] Export/report official results.
- [ ] Export the AuditLog for the event for the official record.

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-0.1 | 2026-08-09 | Phase 9 Track F | Initial Go-Live runbook, informed by the Track F production read-only audit findings. |
