---
title: Draft Day GO / NO-GO Checklist
status: Draft
version: docs-0.1
last_updated: 2026-08-09
---

# Draft Day GO / NO-GO Checklist

Printable final authorization checklist. Companion to
[DRAFT_DAY_GO_LIVE_RUNBOOK.md](DRAFT_DAY_GO_LIVE_RUNBOOK.md) and
[DRAFT_DAY_CHECKLIST.md](DRAFT_DAY_CHECKLIST.md).

Event: ______________________  Date: ______________________

- [ ] Production backup verified (file exists, checksum verified, restore-list validated — do not trust the automated backup service without confirming it actually ran)
- [ ] Release version verified (git state / release identifier recorded)
- [ ] Migrations verified (all pending migrations applied to production; none outstanding)
- [ ] Environment verified (production `.env`/secrets present, not staging's)
- [ ] Media storage verified (production storage provider confirmed, not staging's local/dev config)
- [ ] Clubs 8/8
- [ ] Club logos 8/8
- [ ] Players — production cohort count confirmed and matches league office intent (do not assume it equals the staging rehearsal's 58)
- [ ] Main Draft player count confirmed
- [ ] Secondary Draft player count confirmed
- [ ] Coaches — production cohort count confirmed and matches league office intent (do not assume it equals staging's 9)
- [ ] MEN coach pool confirmed
- [ ] WOMEN coach pool confirmed
- [ ] Any known incomplete groups/warnings acknowledged in writing
- [ ] Any coach-pool surplus/shortfall acknowledged in writing
- [ ] Main Draft rehearsal isolation PASS (on production's actual DraftEvent, not just staging)
- [ ] Secondary Draft rehearsal isolation PASS (on production's actual DraftEvent, not just staging)
- [ ] Pre-reveal privacy PASS
- [ ] Correction PASS
- [ ] Recovery PASS
- [ ] Reset PASS
- [ ] Operator authentication PASS (unauthenticated visits redirect to login, not an error page)
- [ ] Projector PASS
- [ ] Control room PASS
- [ ] Audit logging PASS
- [ ] No stale rehearsal allocations or picks
- [ ] No official pre-Draft assignments exist
- [ ] Production data reconciliation (Phase 9 Track G or equivalent) completed and signed off separately — this checklist does not substitute for it
- [ ] **Human GO-LIVE authorization received** (name, timestamp, and reason recorded in the Go-Live Runbook)

Authorized by: ______________________  Signature: ______________________  Time: ______________________

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-0.1 | 2026-08-09 | Phase 9 Track F | Initial checklist. |
