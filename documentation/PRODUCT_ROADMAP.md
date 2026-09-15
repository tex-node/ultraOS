---
title: Product Roadmap
status: Active
version: product-0.2
last_updated: 2026-09-15
---

# Product Roadmap

## 1. Purpose

This is the **user-facing product roadmap** for UltraLeagueOS. It sequences the capabilities an operator actually touches — onboarding a tournament, onboarding teams and players, scheduling, capturing scores/time/player data, and presenting statistics — into phases that each deliver something usable.

- Engine and schema delivery is tracked separately in `documentation/MULTI_SPORT_ROADMAP.md`.
- The target model is defined in `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`.
- This roadmap governs **what users can do and how intuitive it is**; the engine roadmap governs **how the domain model gets there**.

**Usability is a requirement, not a polish step.** Every phase carries explicit usability acceptance criteria. A phase is not `Done` until those are met with evidence.

## 2. Product north star

One clear flow, repeated for any sport:

```
Create tournament  →  Onboard teams / participants  →  Schedule  →  Capture match data  →  Present stats & results
   (P1)                    (P2)                          (P3)          (P4)                     (P5)
```

A first-time organizer should complete each step through guided, sport-aware screens with sensible defaults, and a courtside scorer should capture a full match without training. The same flow must work for basketball, volleyball, football, cricket, and tennis.

## 3. Personas

| Persona | Main job | Primary screens |
| --- | --- | --- |
| Tournament Organizer | Create a competition, invite teams, schedule it | Tournament setup, registrations, scheduling |
| Team Manager | Register a team, manage the roster | Team onboarding, roster management |
| Player / Athlete | Register as an individual or join a team | Public registration, profile |
| Scorer / Statistician | Capture scores, clock, and player events live | Match capture console |
| League Admin | Govern, review, correct, publish | Admin review, standings, audit |
| Fan / Media | Follow results and stats | Public match center, broadcast |

## 4. Usability standards (non-negotiable)

These apply to every phase and every screen.

1. **Wizard-first onboarding.** No blank screens. Every setup flow guides the user with defaults, a recommended path, and a preview of the result.
2. **Sport-aware UI.** The app reshapes to the chosen sport. A football tournament never shows a shot clock; a tennis draw never shows a roster limit. Capabilities come from the sport definition, not from scattered conditionals.
3. **One primary action per screen.** Secondary actions are available but visually subordinate.
4. **Reversible by default.** Destructive actions confirm, soft-delete where possible, and offer undo. Drafts autosave.
5. **Courtside-ready capture.** Capture works on a tablet, with large touch targets, dark mode, and keyboard shortcuts/numpad for fast operators.
6. **Offline-tolerant.** Capture survives a dropped connection, queues locally, syncs on reconnect, and clearly shows stale/unsynced state. Never silently lose an event.
7. **Plain-language status.** Human status labels and colors, consistent everywhere. No raw error strings or database terms shown to users.
8. **Empty states teach.** Every empty list explains what it is and offers the next action.
9. **Progressive disclosure.** Beginners see the essentials; advanced statistics and controls appear on demand.
10. **Accessible.** Sufficient contrast, visible focus, labeled controls, keyboard-operable.
11. **Fast.** Capture interactions respond under 1s; live updates propagate under 2s.
12. **No dead ends.** Every flow has a clear exit and a way back; failures state what happened and what to do next.

## 5. Phase overview

| Phase | Name | Outcome | Status |
| --- | --- | --- | --- |
| P0 | Platform foundation | Accounts, tenancy, auth, core admin shell | `Done` (hardening ongoing) |
| P1 | Tournament onboarding | Create a tournament a non-expert can run | `In progress` |
| P2 | Teams & participants onboarding | Get teams and players into the tournament | `In progress` |
| P3 | Scheduling | Generate and adjust a usable schedule | `In progress` |
| P4 | Match capture | Capture scores, time, and player data reliably | `In progress` |
| P5 | Stats & results presentation | Publish stats, standings, and match pages | `In progress` |
| P6 | Multi-sport expansion | The same flow works for every sport | `In progress` |
| P7 | Usability, offline, and scale | Intuitive, resilient, fast at real volume | `Not started` |

P0-P5 are partly delivered for basketball Season Zero; the roadmap makes them complete and sport-agnostic.

## 6. Phases

### P0 — Platform foundation

Already largely delivered; keep it healthy.

- Accounts, authentication, multi-role authorization.
- Organization tenancy with RLS and explicit context.
- Admin shell, navigation, media, audit, notifications.
- **Usability exit:** a new admin can log in and find every core area from navigation without documentation.

### P1 — Tournament onboarding

**Goal:** an organizer creates a runnable tournament in one guided flow.

Journey:

1. Choose sport (basketball, volleyball, football, cricket, tennis).
2. The app applies the sport definition: structure, scoring, event set, standings rules, and which modules appear.
3. Choose a format template (e.g. round-robin, double round-robin; knockout and group-stage arrive in P6).
4. Name the tournament, set dates, choose divisions (men's, women's, age grades) and optional pool/category.
5. Confirm venues.
6. See a readiness checklist of what remains before the tournament can start.

Deliverables:

- Sport picker driven by the sport definition registry.
- Format templates with plain-language summaries ("Each team plays every other team twice").
- Guided tournament/competition/season/division creation.
- Venue setup with reuse of existing venues.
- Tournament dashboard: status, next actions, readiness checklist.

Usability acceptance:

- A first-time organizer completes setup without external help in under 10 minutes.
- The chosen sport visibly changes the available setup options.
- Every step has a default and can be revisited without losing data.
- The dashboard always shows the single most valuable next action.

Depends on: engine Stage 1 (sport catalog).

### P2 — Teams and participants onboarding

**Goal:** teams and individuals get into the tournament quickly and correctly.

Journey:

- **Team sports:** invite or register teams, capture team identity (name, short name, colors, logo), then build the roster (players, coach, manager) by search, invite, or bulk import.
- **Individual sports:** register individual entrants and pairs directly, with no club required.

Deliverables:

- Public, shareable registration links per tournament (individual and team modes).
- Team onboarding wizard: identity → roster → review.
- Participant onboarding: search existing Athletes, invite, or create; duplicate detection with a clear resolution path.
- Bulk roster import (CSV/Excel) with a validation preview and per-row corrections.
- Eligibility checks surfaced inline (age, gender, division, roster size/count).
- "Team ready" and "Player ready" states so organizers can see who still needs action.

Usability acceptance:

- A team manager completes registration and a full roster without a support call.
- Bulk import reports exactly which rows failed and why, and lets the user fix them in place.
- Duplicate detection proposes matches and lets a human decide; nothing is merged silently.
- Search finds an existing athlete before creating a duplicate.

Depends on: P1; engine Stage 2 (Entrant) for individual sports.

### P3 — Scheduling

**Goal:** produce and adjust a schedule that everyone can trust.

Journey:

1. Select participants and format.
2. Generate a schedule (round-robin in P3; knockout/group-stage in P6).
3. Auto-assign dates, times, and venues from availability and constraints.
4. See and resolve conflicts (team double-booking, venue clash, insufficient rest).
5. Publish the schedule to teams and the public.

Deliverables:

- Schedule generator with sensible defaults.
- Drag-and-drop rescheduling with immediate conflict feedback.
- Venue and date availability management.
- Conflict detection with a "fix" suggestion, never a silent recalculation.
- Postponement/cancellation/reschedule with a reason and history.
- Published schedule view (admin + public), with calendar and list views.

Usability acceptance:

- Generating a full league schedule takes one action and produces a conflict-free result where one exists.
- Any manual change shows its consequences before it is applied.
- Organizers can reschedule a fixture in under 30 seconds and notify affected teams.
- The public schedule is readable on a phone.

Depends on: P1, P2; engine Stage 2.

### P4 — Match capture

**Goal:** capture scores, time, and player data reliably during a match.

Journey:

1. Open today's matches from a match-day view.
2. Confirm the lineup and start the clock.
3. Capture events with minimal taps: scores, clock control, fouls/cards/errors, substitutions, and player attribution.
4. See the running score, period/set/innings, and time always visible.
5. Finalize the match and hand off to statistics.

Deliverables:

- Match-day command view (what is live, what is next, what needs finalizing).
- Sport-aware capture console driven by the event catalog (basketball and volleyball first; football, cricket, tennis in P6).
- Clock and period/set/innings control with pause/resume and corrections.
- Player attribution with fast selection and lineup awareness.
- **Substitution holding bay:** select incoming bench players and auto-swap the outgoing player.
- **Actions under review:** flag an action during play and resolve it at the next break without disturbing the live clock.
- Undo/correction with a reason and a full audit trail — never destructive.
- Entry-time validation from the sport's constraints (see `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`, Section 5.11).
- Offline-tolerant queueing with sync and visible connection status.
- Scorer and independent statistician paths with reconciliation where applicable.

Usability acceptance:

- A scorer starts a match and captures a full game without training, on a tablet.
- Common events are one tap; the running score is always visible.
- A mistaken entry is corrected in two taps with an audit record.
- A dropped connection does not lose events; recovery is automatic and visible.
- The same console shape works when switching sport, with only the event buttons changing.

Depends on: P3; engine Stages 1, 2, 6 (definitions, Entrant, event catalog).

### P5 — Stats and results presentation

**Goal:** turn captured data into trustworthy results and readable statistics.

Journey:

- Results confirm and standings update.
- Match pages show the score, timeline, and player/team stats.
- Season leaders and team profiles update automatically.
- Public and broadcast surfaces present the same verified facts.

Deliverables:

- Automatic standings/table computation from finalized matches, per sport.
- Match center: results, match report, timeline, and per-player stats.
- Team and player season statistics with leaders and filters.
- Public pages: tournament, teams, players, fixtures, results, standings.
- Broadcast/live presentation fed by verified structured data only.
- Official scoresheet export and completion of the **FIBA parity checklist** for basketball (`documentation/architecture/FIBA_BENCHMARK.md`).
- Exports (PDF/CSV) for schedules, results, and statistics.

Usability acceptance:

- Standings and stats update correctly and immediately after finalization.
- A fan can find any team, player, or match within three taps from the tournament page.
- No stat is shown that cannot be traced to captured data.
- Public pages are fast and readable on a phone.
- The basketball parity checklist passes, or each remaining gap is explicitly recorded as deferred with an owner.

Depends on: P4; engine Stages 3, 5 (statistics, standings).

### P6 — Multi-sport expansion

**Goal:** run the same journey for volleyball, football, cricket, and tennis with only a sport definition added.

Deliverables, in order:

1. **Volleyball** end-to-end pilot (sets, rotations, match-point standings).
2. **Football** (halves, goals, cards, draws, extra time/penalties).
3. **Cricket** (innings/overs, ball-by-ball capture, NRR).
4. **Tennis** (individual/pair entrants, sets/games, round-robin first, brackets later).
5. Knockout and group-stage formats across team sports.

Usability acceptance:

- Onboarding, scheduling, capture, and presentation all work per sport with no new screens — only sport-aware content.
- An organizer can switch sport without relearning the product.
- Adding the next sport requires no engine change (see the engine roadmap's exit criteria).

Depends on: P1-P5; engine Stages 1-9.

### P7 — Usability, offline, and scale

**Goal:** make the product genuinely intuitive and dependable at real volume.

Deliverables:

- Offline-first capture hardening and recovery drills.
- Command palette, keyboard shortcuts, and bulk operations for power users.
- Accessibility audit and fixes across core flows.
- Localization/timezone support.
- Performance work for large tournaments (hundreds of teams, thousands of matches).
- In-product guided tours and contextual help.
- Usability testing with real organizers, scorers, and fans, with fixes tracked to closure.

Usability acceptance:

- Task success rate targets met in usability tests (organizer setup, scorer capture, fan lookup).
- Core flows pass an accessibility audit.
- Capture remains responsive and lossless through simulated network loss.

## 7. Progress tracker

Reality check (2026-09-15): the engine (Stages 1–9) is implemented and applied to **staging and
production**; all backfills/parity checks pass. The GIESM 2026 volleyball registration is **live**
at `https://app.neonultra.ng/giesm`. Volleyball is now operable end-to-end through the app: onboard a
team, generate a round-robin schedule, capture rally points (sets via `GamePeriodScore`), and the
match auto-finalizes into standings. Football and cricket now have specialised scoring too (goals,
including own goals; runs and wickets by innings) and finalization permits draws/ties where the
sport allows them. Remaining gaps: drag-drop rescheduling, offline capture, and deeper per-sport
presentation (cricket overs/wickets, football cards) on public pages.

| ID | Deliverable | Phase | Status | Depends on |
| --- | --- | --- | --- | --- |
| P0.1 | Accounts, auth, roles, tenancy | P0 | `Done` | — |
| P0.2 | Admin shell and navigation | P0 | `Done` | — |
| P1.1 | Sport picker from definition registry | P1 | `Done` | Engine S1 |
| P1.2 | Format templates with plain-language summaries | P1 | `In progress` | P1.1 |
| P1.3 | Guided tournament/competition/season/division setup | P1 | `Done` | P1.1 |
| P1.4 | Venue setup and reuse | P1 | `In progress` | — |
| P1.5 | Tournament readiness dashboard | P1 | `Done` | P1.3 |
| P1.6 | Sport rules customization per organization | P1 | `Done` | Engine S1.3 |
| P2.1 | Public registration links (individual + team) | P2 | `In progress` | P1.3 |
| P2.2 | Team onboarding wizard (identity → roster → review) | P2 | `In progress` | — |
| P2.3 | Participant search, invite, create with duplicate handling | P2 | `In progress` | — |
| P2.4 | Bulk roster import with validation preview | P2 | `In progress` | — |
| P2.5 | Inline eligibility checks | P2 | `In progress` | P2.2 |
| P2.6 | Team/player readiness states | P2 | `Not started` | P2.2 |
| P3.1 | Round-robin schedule generator | P3 | `Done` | P2 |
| P3.2 | Drag-and-drop reschedule with conflict feedback | P3 | `Not started` | P3.1 |
| P3.3 | Venue/date availability | P3 | `In progress` | P1.4 |
| P3.4 | Postpone/cancel/reschedule with history | P3 | `In progress` | P3.1 |
| P3.5 | Public schedule view | P3 | `In progress` | P3.1 |
| P4.1 | Match-day command view | P4 | `Not started` | P3.1 |
| P4.2 | Sport-aware capture console (basketball) | P4 | `In progress` | Engine S1 |
| P4.3 | Clock and period/set/innings control | P4 | `Done` | — |
| P4.4 | Player attribution and lineup awareness | P4 | `In progress` | Engine S2 |
| P4.5 | Undo/correction with audit trail | P4 | `In progress` | — |
| P4.6 | Offline-tolerant queueing and sync | P4 | `Not started` | P4.2 |
| P4.7 | Scorer/statistician reconciliation | P4 | `In progress` | — |
| P4.8 | Actions-under-review workflow | P4 | `Not started` | P4.2 |
| P4.9 | Substitution holding bay | P4 | `Not started` | P4.2 |
| P5.1 | Automatic standings per sport | P5 | `Done` | Engine S5 |
| P5.2 | Match center and match report | P5 | `In progress` | — |
| P5.3 | Team/player season stats and leaders | P5 | `In progress` | Engine S3 |
| P5.4 | Public tournament/team/player/fixture pages | P5 | `In progress` | P5.1 |
| P5.5 | Broadcast/live presentation from verified data | P5 | `In progress` | P5.2 |
| P5.6 | PDF/CSV exports | P5 | `In progress` | — |
| P5.7 | Official scoresheet + FIBA parity checklist | P5 | `Not started` | P5.2 |
| P6.1 | Volleyball pilot end-to-end | P6 | `Done` | P1-P5, Engine S8 |
| P6.2 | Football end-to-end | P6 | `In progress` | P6.1 |
| P6.3 | Cricket end-to-end | P6 | `In progress` | P6.1 |
| P6.4 | Tennis end-to-end | P6 | `Not started` | P6.1 |
| P6.5 | Knockout and group-stage formats | P6 | `In progress` | Engine S9 |
| P7.1 | Offline hardening and recovery drills | P7 | `Not started` | P4.6 |
| P7.2 | Command palette, shortcuts, bulk ops | P7 | `Not started` | — |
| P7.3 | Accessibility audit and fixes | P7 | `Not started` | — |
| P7.4 | Localization and timezone support | P7 | `Not started` | — |
| P7.5 | Performance for large tournaments | P7 | `Not started` | — |
| P7.6 | Guided tours and contextual help | P7 | `Not started` | — |
| P7.7 | Usability testing and fixes to closure | P7 | `Not started` | All |

## 8. Relationship to the engine roadmap

Product phases depend on engine stages but are not blocked by the full engine programme:

- P1 needs engine Stage 1 (sport catalog).
- P2 needs engine Stage 2 (Entrant) for individual sports.
- P4 needs engine Stages 1, 2, and 6 (event catalog).
- P5 needs engine Stages 3 and 5 (statistics, standings).
- P6 needs engine Stages 1-9.

The engine roadmap is in `documentation/MULTI_SPORT_ROADMAP.md`. When a product phase and an engine stage conflict on sequencing, the architecture document wins.

## 9. Definition of done per phase

A phase is `Done` only when:

1. Every listed deliverable is implemented and reachable from normal navigation.
2. The phase's usability acceptance criteria are verified with evidence (test script, recording, or usability session).
3. Season Zero basketball parity is unaffected.
4. Documentation and this tracker are updated in the same change.

## 10. Change control

- Add or reprioritise deliverables freely; keep them mapped to a phase and a status.
- Do not weaken a usability standard or a phase's acceptance criteria; if a criterion cannot be met, mark the item `Blocked` with a reason and owner.
- Changes to sport behaviour require the architecture document to be updated first (it remains the single agreed reference).
- Every update refreshes `last_updated` and is committed with the work it describes.
