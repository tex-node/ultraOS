---
title: Draft Day Operator Runbook
status: Draft
version: docs-0.2
last_updated: 2026-08-09
---

# Draft Day Operator Runbook

## Purpose

Operate the Ultra Basketball Draft Day event — both the Main Draft
(`/draft-events/[id]/control` + `/draft-events/[id]/display`) and the
Secondary Draft (`/drafts/[id]` + `/drafts/[id]/display`) — safely, in either
REHEARSAL or LIVE mode. Verified end-to-end against a real Season Zero
rehearsal (9 coaches, 58 Main Draft players across 8 Clubs in Track E; all 13
real Secondary Draft players in Track F) of Phase 9.

## Prerequisites

- Role with `draft-event:operate`, `draft-event:reveal`, `draft-event:confirm`
  (control room), and `draft-event:correct` (correction/reset) — see
  [permissions.ts](../../web/src/lib/permissions.ts).
- A verified, checksummed database backup taken immediately before the event
  (see the Backup runbook).
- Confirmed `DraftEvent.operatingMode` for this run — never assume.

## Pre-Event

1. **Verify environment.** Confirm you are pointed at the correct database
   (`ultraos_staging` for rehearsal, the real production database only for the
   authorized LIVE event) and the correct deployed release.
2. **Verify backup.** A fresh `pg_dump` exists under
   `/opt/ultraos-staging/shared/backups/` (or the production equivalent), with
   a verified SHA-256 checksum and a successful `pg_restore --list`.
3. **Verify operating mode.** Open the control room
   (`/draft-events/[id]/control`) and read the mode banner at the top of
   "Event controls" — it renders sky-blue "Mode: REHEARSAL" or emerald
   "Mode: LIVE" and states in plain language whether confirmations write
   official assignments. **Never assume the mode from memory or from a prior
   run — always re-read this banner before touching any control.**
4. **Operator login.** Log in with an account holding the permissions above.
   Unauthenticated visits to any `/draft-events/*` operator page now redirect
   cleanly to `/login?callbackUrl=...` (fixed in Track E — previously showed a
   generic error page).
5. **Club assets.** Confirm all 8 Club logos render on
   `/public/clubs` and in the control room readiness panel (0 missing-logo
   warnings).
6. **Player assets.** Spot-check a few players on the control room's
   readiness list; confirm photos or the neutral `PersonAvatar` fallback
   render — never a broken image.
7. **Coach assets.** Same check for all 9 coaches on
   `/draft-events/[id]/coaches`.
8. **Control screen.** Load `/draft-events/[id]/control` on the operator
   machine.
9. **Projector display.** Load `/draft-events/[id]/display?token=<displayToken>`
   on the projector machine. This route requires no login — it is intentionally
   public so the venue projector doesn't need an authenticated session. Anyone
   with the link (and the event's `displayToken`, if one is set) can view it,
   so don't publish the link outside the venue.
10. **Network.** Confirm both control and display machines can reach the
    application host.
11. **Browser setup.** Full-screen the projector browser tab before the event
    starts; the display route is unstyled for anything narrower than a
    projector/TV viewport.

## Rehearsal vs. LIVE Check

Do this explicitly, every time, even if you just did it minutes ago:

1. Re-read the mode banner in the control room.
2. If REHEARSAL: confirmations are isolated — they never write
   `Player.seasonClubId` or `SeasonClub.headCoachId`/`assistantCoachId`. Use
   "Start / resume REHEARSAL".
3. If LIVE: confirmations write the official roster and coach assignments.
   Use "Start / resume LIVE" only when explicitly authorized to run the real
   event.
4. **Never** click "Start / resume LIVE" during a rehearsal, and never
   assume a previous session already set the mode correctly.

## Draft Operation

For each subject (a coach, or a Player squad/group):

1. **Set the stage** (dropdown + "Set stage") to the correct
   `DraftEventStage` — `MEN_COACH_ALLOCATION`, `WOMEN_COACH_ALLOCATION`,
   `MEN_SQUAD_ALLOCATION`, or `WOMEN_SQUAD_ALLOCATION`.
2. **Reserve.** Choose the division and subject type, click "Reserve
   rehearsal/official allocation". This randomly assigns the next coach (or
   squad) in the pool to a randomly-selected still-available Club, and stores
   the result server-side immediately — before anyone sees it. The projector
   shows an "On the clock..." suspense state with no identity revealed.
3. **Verify.** Read the "Current allocation" card in the control room — this
   is the operator-only preview of the real result.
4. **Reveal.** Click "Start suspense" (optional drumroll beat, sets status to
   `REVEALING` — still redacted on the projector), then "Reveal result". Only
   now does the projector show who was selected and which Club they went to.
5. **Confirm.** Click "Confirm rehearsal result" / "Confirm roster/coach
   assignment". In REHEARSAL this only marks the allocation `CONFIRMED` and
   moves the event forward. In LIVE this additionally writes the official
   `Player.seasonClubId` or `SeasonClub` coach field.
6. **Move to the next stage** once a division/subject-type pool is exhausted
   — reserving again correctly throws ("No eligible subject remains." /
   "No eligible SeasonClub remains.") rather than silently reusing a claimed
   subject or Club.

### Coach surplus (Men's pool)

Season Zero has 5 Men's coaches for 4 Men's Clubs by design. After 4
successful reserve/reveal/confirm cycles, the 5th reserve attempt will fail
with "No eligible SeasonClub remains." — this is expected, not a bug. The
5th coach stays in the pool, untouched, unassigned, not auto-promoted to
assistant, not removed. A separate administrative decision (outside this
runbook) determines their role.

### Incomplete groups (e.g. Women's Group 4)

A squad with fewer members than its target size (e.g. 2/5) still allocates
normally — `confirmAllocation` does not block on squad size. Do not add fake
players to "complete" a group before the event; the shortfall is a readiness
warning, not a blocker.

## Correction

Use when a single allocation was revealed or confirmed in error.

1. Requires `draft-event:correct` permission.
2. In the control room's "Allocation history" list, find the specific
   allocation and enter a **required** reason in its correction form, then
   click "Correct this result".
3. This marks that one allocation `CORRECTED` (not deleted — the wrong
   result stays in the audit trail) and writes a
   `DRAFT_EVENT_ALLOCATION_CORRECTED` AuditLog entry. If it had already
   written an official assignment (LIVE + CONFIRMED), that official write is
   reversed in the same transaction.
4. **Known limitation:** correcting an allocation does not free its exact
   subject/Club pairing for immediate re-reservation within the same event —
   a database uniqueness constraint on
   `(draftEventId, operatingMode, subjectType, draftSquadId/staffId)` prevents
   a second row for the same subject. If the same coach or squad genuinely
   needs to be re-drawn, a full rehearsal reset (below) is currently the only
   path. Treat correction as "void this specific bad result and keep it
   auditable," not as "let me immediately retry the same subject."

## Recovery

All Draft state lives in the database, not in browser memory — verified in
Track E by restarting the application service mid-rehearsal (16 confirmed
allocations in place) and confirming full recovery.

- **Control refresh:** reload `/draft-events/[id]/control`. The current
  allocation, stage, and full history reload from the server exactly as they
  were.
- **Display refresh:** reload the projector tab. It re-fetches from the
  server; nothing is lost, and nothing not-yet-revealed leaks.
- **Application service restart:** if the web service itself needs a
  restart, it is safe to do so — persisted state (event stage, allocations,
  displaySequence) survives. **Never restart PostgreSQL** as part of Draft Day
  recovery.
- **State verification after any recovery:** re-open the control room and
  confirm the stage, current allocation (if any), and allocation history
  match what you expect before continuing.

## Emergency

Do **not**:

- Manually edit the database during a live Draft.
- Manually delete `DraftAllocation` rows — use Correction or Reset.
- Switch between REHEARSAL and LIVE casually, or "just to test something."
- Restart PostgreSQL as a troubleshooting step.
- Directly edit `SeasonClub.headCoachId`/`assistantCoachId` or
  `Player.seasonClubId` outside the Draft workflow.

If something looks wrong, stop, use Correction for a single bad result or
Reset for the whole rehearsal, and record what happened.

## Post-Draft

1. **Verify completion.** Confirm every stage reached `COMPLETED`
   allocations for its full pool (or the event was intentionally paused).
2. **Reset (rehearsal only).** Use the "Reset rehearsal allocations" control
   with a required reason (e.g. "Track E end-to-end Season Zero Draft Day
   rehearsal completed."). This deletes only that event's `REHEARSAL`-mode
   allocations, resets the current stage to `INTRO`, and writes a
   `DRAFT_EVENT_REHEARSAL_RESET` AuditLog entry with the reason and the
   count of deleted rows. It never touches permanent identities (Players,
   Athletes, Staff), Clubs, SeasonClubs, or MediaAssets.
3. **Reports/backup.** Take a fresh post-event backup for the record.
4. **Audit.** Review the `AuditLog` entries for the event
   (`DRAFT_EVENT_*` / `ADMIN_OFFLINE_INTAKE_*` actions) for a complete trail.
5. **Finalization gate.** A rehearsal reset returning the readiness check to
   zero RED items means the system is ready for another rehearsal — it does
   **not** by itself authorize a LIVE event. LIVE authorization is a
   separate, explicit administrator decision outside this runbook.

## Rollback

- **Wrong single result:** use Correction (above).
- **Rehearsal gone wrong entirely:** use Reset (above) — staging/rehearsal
  only, requires a reason, fully audited.
- **LIVE event gone wrong:** do not attempt to "reset" a LIVE event with the
  rehearsal reset action — it explicitly refuses to run against a
  LIVE-mode `DraftEvent`. Recovering from a bad LIVE confirmation requires a
  deliberate, authorized correction with full understanding of the official
  data it wrote; treat this as an incident, not a routine operation.

## Secondary Draft Operation

As of Track F, the Secondary Draft (`Draft`/`DraftPick`, e.g. the 13 MEN
`SECONDARY_DRAFT` players) participates in the same REHEARSAL/LIVE safety
model as the Main Draft: a `Draft` can be linked to a governing `DraftEvent`
(`Draft.draftEventId`), and its effective operating mode is derived from that
event — a `Draft` with no linked `DraftEvent` is always treated as REHEARSAL,
the safe default. This applies at `/drafts/[id]`.

1. **Eligibility.** The rehearsal pool must be exactly the legitimate
   `SECONDARY_DRAFT`-classified Players for the season — verify the count
   before starting (13 for the current MEN cohort). Do not modify draft
   classifications to adjust the pool.
2. **Reserve/select.** Use the "Reserve a pick (rehearsal-safe)" form: choose
   player, destination SeasonClub, and round. This creates a `DraftPick` in
   `RESERVED` status — the result is persisted immediately but not yet public.
3. **Pre-reveal secrecy.** While a pick is `RESERVED` or `REVEALING`, the
   public display (`/drafts/[id]/display`) shows "On the clock..." only —
   player identity and destination Club are withheld until `REVEALED`. This
   mirrors the exact fix applied to the Main Draft's premature-reveal defect
   in Track E, and is covered by its own regression test (below).
4. **Reveal.** "Start suspense" (optional) then "Reveal" — now the projector
   shows the player and Club.
5. **Confirm.** In REHEARSAL this only marks the pick `CONFIRMED`; in LIVE it
   additionally writes `Player.seasonClubId`.
6. **Correction.** Each pick in the "Draft board" list has its own correction
   form once revealed — requires a reason, marks that pick `CORRECTED`
   (preserved for audit, not deleted), and reverses the official write if the
   pick had made one.
7. **Recovery.** Identical guarantee to the Main Draft — all state is
   server-persisted; refreshing the operator page, refreshing the display, or
   restarting the application service does not lose confirmed picks.
8. **Reset.** "Reset rehearsal picks" requires a reason, deletes only that
   Draft's `REHEARSAL`-mode picks, and refuses to run if the Draft's governing
   DraftEvent is LIVE.
9. **LIVE prohibition during rehearsal.** Never link a rehearsal Secondary
   Draft to a LIVE-mode DraftEvent, and never flip the shared DraftEvent to
   LIVE while Secondary Draft rehearsal is still in progress on it.
10. **Finalization warning.** Confirming the last pick does not "finalize"
    anything by itself — there is no separate finalization step for Secondary
    Draft yet (see Notes). Treat confirmed LIVE picks as final and correct
    them deliberately if wrong, the same way you would for the Main Draft.
11. **Legacy atomic path.** The original one-step "Make pick" form still
    exists (collapsed under "Legacy atomic pick" on the operator page) for
    compatibility — it now also respects the linked DraftEvent's operating
    mode instead of writing official assignments unconditionally, but it has
    no reserve/reveal suspense step. Prefer the rehearsal-safe workflow above
    for any real event.

## Notes

- `reserveNextAllocation` (Main Draft) and `reserveSecondaryDraftPick`
  (Secondary Draft) both pick/require the destination Club — Main Draft picks
  it **randomly** among unclaimed Clubs; Secondary Draft has the operator
  choose the destination Club explicitly, matching its existing per-pick
  design. Neither lets an operator manually override an already-reserved
  result.
- The public display routes (`/draft-events/[id]/display`,
  `/drafts/[id]/display`) require no login; access is controlled only by
  knowing the URL and, if set, the governing event's `displayToken`.
- Real integration coverage of the REHEARSAL/LIVE isolation guarantees lives
  at `web/scripts/rehearsal-isolation-integration-test.ts` (Main Draft,
  `npm run test:rehearsal-isolation`) and
  `web/scripts/secondary-draft-isolation-integration-test.ts` (Secondary
  Draft, `npm run test:secondary-draft-isolation`) — both use fully
  disposable fixtures against a real database and clean up after themselves;
  neither is part of the `npm test` suite because that suite has no reachable
  database by design.
- There is currently no explicit "finalize the Draft" action for either
  system beyond confirming the last pick/allocation — see the Finalization
  Safety review in the Track F report for what a real finalization gate
  would need before LIVE use.

## Related Topics

- [DRAFT_DAY_CHECKLIST.md](DRAFT_DAY_CHECKLIST.md)
- [draft-events.ts](../../web/src/lib/draft-events.ts)
- [draft-events/actions.ts](../../web/src/app/draft-events/actions.ts)

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-0.1 | 2026-08-09 | Phase 9 Track E | Initial runbook, written and verified against a real end-to-end Season Zero rehearsal. |
| docs-0.2 | 2026-08-09 | Phase 9 Track F | Added Secondary Draft operation now that it participates in REHEARSAL/LIVE isolation; replaced the Track E warning (Secondary Draft unsafe) with the verified procedure. |
