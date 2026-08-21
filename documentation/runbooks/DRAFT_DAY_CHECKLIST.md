---
title: Draft Day Checklist
status: Draft
version: docs-0.1
last_updated: 2026-08-09
---

# Draft Day Checklist

Printable pre-flight checklist. Companion to
[DRAFT_DAY_OPERATOR_RUNBOOK.md](DRAFT_DAY_OPERATOR_RUNBOOK.md) — read that for
the full procedure behind each item.

Event: ______________________  Date: ______________________

Operator: ______________________  Second operator: ______________________

## Pre-Event

- [ ] Database backup taken and SHA-256 verified
- [ ] Correct deployed application version confirmed
- [ ] Correct `DraftEvent` selected (ID: ________________________)
- [ ] Operating mode explicitly confirmed on the control room banner (circle one): **REHEARSAL** / **LIVE**
- [ ] Operator login successful with correct role
- [ ] Control room loads correctly on operator machine
- [ ] Projector display loads correctly on venue screen, full-screened
- [ ] Club logos ready: 8 / 8
- [ ] Player cohort present: 58 / 58 selected
- [ ] Coach cohort present: 9 / 9 selected
- [ ] Player photos/fallbacks checked (broken image = fail this item)
- [ ] Coach photos/fallbacks checked — currently 7 real photos / 2 `PersonAvatar` fallbacks (Mcspencer Akpan, Imomoh Kewwe Blessing)
- [ ] Men's group counts confirmed: 7 / 7 / 7 / 7
- [ ] Women's group counts confirmed: 5 / 5 / 5 / 2
- [ ] **Women's Group 4 shortfall acknowledged** (2/5, intentional, warning only — do not fill artificially)
- [ ] **Men's coach surplus acknowledged** (5 coaches for 4 Clubs — 1 stays reserve, no automatic action)
- [ ] Internet/network connectivity confirmed on both control and projector machines
- [ ] Correction permission confirmed for at least one operator on site (`draft-event:correct`)
- [ ] Reset permission confirmed for at least one operator on site (`draft-event:correct`)
- [ ] Recovery procedure reviewed by the operating team (control refresh, display refresh, service restart)
- [ ] Audit logging confirmed working (spot-check a recent `AuditLog` entry)
- [ ] **Final GO / NO-GO authorization obtained** — signature: ______________________

## During Event (per allocation)

- [ ] Correct stage selected before reserving
- [ ] Reserve → operator-only preview verified in control room
- [ ] Reveal only when ready — projector shows no identity before this step
- [ ] Confirm — verify projector updates correctly
- [ ] Move to next stage once a pool is exhausted (system will refuse further reserves — expected, not an error)

## Post-Event

- [ ] All intended stages completed (or intentionally paused, noted below)
- [ ] Rehearsal reset performed with required reason (rehearsal runs only)
- [ ] Reset AuditLog entry confirmed
- [ ] Post-event backup taken
- [ ] Post-event readiness check shows 0 RED items
- [ ] Notes / incidents recorded below

Notes:

```




```

## Revision History

| Version | Date | Author | Change |
| --- | --- | --- | --- |
| docs-0.1 | 2026-08-09 | Phase 9 Track E | Initial checklist. |
