---
title: Product Roadmap
status: Active
version: product-0.4
last_updated: 2026-09-20
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
| P8 | American football end-to-end | A new sport runs the full journey on definitions alone | `Not started` |
| P9 | Table tennis end-to-end | A new individual sport runs the full journey on definitions alone | `Not started` |
| P10 | Capture depth (soccer, tennis, volleyball) | Live depth stats per sport, all traceable to events | `Not started` |
| P11 | Tournament engine extensions | Swiss/double-elim/ladder formats, H2H + discipline tiebreaks, cross-sport leaders | `Not started` |
| P12 | Fan & organizer dual experience | Public portal + organizer workspace + tournament sub-sites (F1–F6 below) | `Not started` |

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

## 6b. Next phases: multi-sport data depth (P8–P11)

The programme below turns the multi-sport taxonomy (soccer, American football, tennis, table
tennis, volleyball) into product phases. Each phase is deliberately shaped so the only new code
is sport content (a definition, its capture console, its standings config) — never a new
architecture. The mapping table at the end shows where every element of that taxonomy already
lives, so nothing gets rebuilt under a new name.

### P8 — American football end-to-end (new sport)

**Goal:** a genuinely new sport runs the whole journey — onboarding, schedule, capture,
standings, presentation — with no engine change, proving the P6 exit criteria a second time.

**Already exists to build on:** the code-registry + scoring-module dispatch pattern, the
statistician live-console shape (header, roster strips, action log, reconciliation), period-based
clock handling, and per-sport standings config.

Deliverables:

- American football definition: quarters, downs and distance, line of scrimmage, timeouts;
  scoring values (TD 6, FG 3, safety 2, XP 1/2); standings on wins then points for/against.
- Capture console in the statistician-console shape: drive/field-state header (quarter, clock,
  down and distance, ball on, timeouts), passing / rushing / receiving / defense / special-teams
  entry, all attributed to players and stored as ledger events.
- Standings, match pages, and leaders for the sport.
- One fully scored exhibition game as the acceptance evidence.

Usability acceptance:

- A scorer captures a full game on a tablet without training, same console shape as basketball.
- Standings update on finalization; no stat is shown that cannot be traced to an event.

Depends on: P1–P5 patterns; engine additive definition + scoring module + standings config.

### P9 — Table tennis end-to-end (new individual sport)

**Goal:** a new individual sport runs the whole journey, including entrant-based draws.

**Already exists to build on:** the Entrant model (individual/pair), entrant-keyed fixtures and
standings, the tennis scoring module as the nearest structural neighbour.

Deliverables:

- Table tennis definition: games to 11 (win by 2), best of 5/7 match length, alternating serve
  (every 2 points, every point in deuce), expedite flag, binary win/loss standings on match
  points → head-to-head → set ratio → point ratio.
- Point-by-point capture with server indicator, stroke/error categorization (forehand/backhand,
  loop/smash/chop, edge/net balls), rally length, and scoring streaks.
- Entrant draws and knockout/bracket play for individuals.

Usability acceptance:

- A full best-of-5 match is captured point by point with the server always correct.
- Service alternation and deuce handling need no scorer intervention to stay right.

Depends on: P8 patterns; engine Entrant + scoring module (additive).

### P10 — Capture depth: soccer, tennis, volleyball

**Goal:** the sports already onboarded get their full live stat vocabulary, all traceable to
ledger events. Nothing here changes the capture shape — it extends each sport's event catalog,
derived metrics, and console panels.

**Already exists to build on:** per-sport event catalogs and metric definitions, the live box
score engine, x/y capture with zones (basketball), and the reports pages (box score,
play-by-play, shot chart) as the presentation pattern to copy per sport.

- **Soccer:** possession %, pass completion, dribbles, tackles/interceptions/clearances,
  goalkeeping (saves, clean sheets, penalty saves), corners/offsides/free-kicks/penalty splits.
  Expected goals (xG) and expected assists (xA) ship as **derived-only, methodology-documented**
  metrics — never hand-entered, always recomputed from events. Head-to-head history and form
  trends (last-N win rate, over/under thresholds) as derived views.
- **Tennis:** serve splits (1st/2nd in %, points won), return splits, break/set/match points
  saved and converted, rally-length bands (1–4, 5–8, 9+), forehand/backhand plus winners vs.
  unforced errors, net points; 7-point and 10-point super-tiebreak variants.
- **Volleyball:** rotation index R1–R6 with active lineup, libero swaps, substitution and
  timeout counters, serve ratings 0–3, pass ratings 0–3, hitting efficiency
  ((kills − errors) / attempts), digs/blocks splits, and zones 1–6 heatmaps from contact
  coordinates.

Usability acceptance (per sport):

- A full match's depth stats are captured live by one statistician without leaving the console.
- Every derived number links back to the events it came from; xG/xA show their methodology.

Depends on: P4/P5 patterns; engine metric definitions + derived-stats extensions (additive).

### P11 — Tournament engine extensions

**Goal:** formats and fairness rules beyond round-robin/knockout/group-stage, without touching
completed tournaments.

**Already exists to build on:** the `CompetitionFormat` enum, per-division format/group-count
overrides, the schedule generator with clash-aware slotting, bracket auto-advancement from
winners, and per-sport standings config (e.g. football's 3/1/0 already lives in its definition).

Deliverables:

- **Swiss-system** and **double-elimination** formats plus custom ladders, as new enum values
  with generators following the existing pure-function pattern.
- **Head-to-head and discipline/fair-play tiebreakers** in the standings engine (currently
  points/difference only), applied per the sport's configured order.
- **Cross-sport leaders**: top scorers, assists leaders, MVP metrics, discipline leaders across
  tournaments.
- **Match states**: add `POSTPONED` to `FixtureStatus` (today: SCHEDULED/LIVE/FINAL/CANCELLED,
  with PAUSED living on the game) with the postpone/cancel/reschedule-with-reason flow.

Usability acceptance:

- A Swiss tournament runs start to finish with correct pairings each round.
- A tied table visibly shows which tiebreaker decided each place.
- Postponing a fixture keeps its history and notifies affected teams.

Depends on: P3/P5 patterns; engine format + standings extensions (additive).

### Mapping note: the proposed greenfield architecture already exists

An external multi-sport specification proposed new `matches` / `match_events` tables, a Redis
aggregation layer, a separate mobile offline store, and an API gateway. The programme above does
**not** rebuild those, because each already exists here under its established name:

| Proposed concept | Existing equivalent | Notes |
| --- | --- | --- |
| `matches` table | `Fixture` + its live `Game` instance | Status states live here today |
| `match_events` event-sourcing table | `GameEvent` ledger (sequence numbers, ACTIVE/VOIDED/CORRECTED status, audit, x/y/zone) | Scores and stats are already derived, never mutated in place; undo/redo rides on it |
| Sport engine strategy | Code registry + scoring-module dispatch + per-sport standings config | Adding a sport = a definition + module, no engine change (P6 exit criteria) |
| Standings/aggregation engine | `recalculateStandings` + derived-stats + reconciliation | Extended per phase, not replaced |
| Offline-first store | P7 (offline-tolerant queueing) | Web-first; a separate native store is out of scope until P7 evidence demands it |
| Redis live cache | Deferred | Current live surfaces poll/stream from the database; add a cache only on measured need |
| API gateway | Existing Next.js routes + versioned `/api/v1` | No new gateway layer |

Any future proposal that reintroduces a parallel table, cache, or engine must first show the
existing equivalent cannot meet the requirement, per the change-control rule in section 10.

### Scope notes (2026-09-19 delivery)

What "Done" means for P8–P11 above, precisely:

- **Capture consoles**: American football scores through a new POINTS module in the existing
  console shape; table tennis reuses the SETS engine with its own buttons; volleyball, tennis
  and soccer depth arrives as catalog events + metrics that render through the existing
  scorer/statistician consoles. No sport got a bespoke console.
- **Not built**: an xG/xA model (needs per-shot weights — the events it would consume now
  exist), rally-length derivation, rotation UI, numeric serve/pass ratings, tiebreak-variant UI,
  later-round Swiss/double-elim advancement UI (round one generates; later rounds pair via the
  tested helpers, operator-driven), and ladder season management.
- **Standings**: H2H mini-tables and fair-play (yellow 1 / red 3) are live in the engine and
  wired into recalculation; POSTPONED frees scheduling slots and is excluded from boards.
- **Leaders**: top scorers + discipline from the live ledger; per-tournament and MVP views
  remain follow-ups.

## 6c. Fan & organizer dual experience (F1–F6) — PROPOSED, pending approval

The programme below turns the operator-built platform into two clean experiences on one
backend: a **fan-facing marketplace** (discover, tickets, food, live) and an **organizer
workspace** (build, schedule, score, sell, pay out). Nothing here rebuilds the domain —
every phase composes what already exists (event operations, public pages, registrations,
tenancy, `GameControlGrant` scoping) under a strict portal/workspace split with
tournament sub-sites. Status of every item is `Not started`; nothing starts until the
phase list in this section is approved.

**Already exists to build on:** zone-based ticketing with QR delivery and gate check-in
(`/public/tickets`, `/gameday/checkin`), vendor/product/order pipelines with promo codes,
public tournament/team/player/fixture/standing pages, live scoreboard and broadcast
surfaces, shareable registration links (`/giesm`, `/register`), organization tenancy with
RLS, the `UserRole` + `UserRoleAssignment` permission matrix, and event-scoped
`GameControlGrant` controllers. The mapping table at the end shows where each proposed
concept lives today, so nothing gets rebuilt under a new name.

### F1 — Dual-shell IA: public portal vs organizer workspace

**Goal:** a guest never sees admin clutter; an organizer never hunts through fan pages.
One backend, two shells, explicit context switching.

Deliverables:

- Public portal shell: global nav (logo, sport switcher, search, city selector, cart,
  Live Center, Sign In/Register, prominent "Organize an Event" entry).
- Organizer workspace shell (`/admin`): left-sidebar nav (dashboard, builder, scheduler,
  scorekeeping, ticketing, vendors, staff). Existing ops routes move under it without URL
  breakage (redirects preserved).
- Strict context switching: guest sessions never render admin controls; deep links across
  shells re-auth the target context instead of leaking it.

Usability acceptance:

- A guest browsing a tournament sub-site encounters zero admin controls or terminology.
- An organizer reaches any workspace area within two taps from the workspace dashboard.
- Every moved route keeps its old URL working via redirect.

Depends on: P0 shell patterns. Engine impact: none (route groups + components only).

### F2 — Tournament sub-sites (`/t/:slug`)

**Goal:** every tournament gets an immersive micro-site: hero banner with LIVE/UPCOMING
status + share, and tabs for Overview, Fixtures & Stats, Tickets, Food & Drinks.

Deliverables:

- Path-based sub-sites (`/t/:slug`; organization- or competition-scoped slugs, unique per
  organization). Subdomain-per-tournament (`slug.neonultra.ng`) is explicitly deferred.
- Overview tab: rules, venue map, featured teams, media gallery, sponsor logos.
- Fixtures tab: interactive brackets/group tables reusing the standings engine; match
  detail view with player stats and point-by-point/event timeline.
- Tickets and Vendors tabs mount the F4/F5 flows inside the sub-site chrome.

Usability acceptance:

- A fan shared one link sees the right tournament, its live state, and can buy a ticket
  within three taps.
- Sub-sites render fully on a phone; share previews (title/image) are correct.

Depends on: F1. Engine impact: none (reads existing competition/season/division + public APIs).

### F3 — Fan discovery hub (`/`)

**Goal:** a global home that answers "what can I watch / attend near me" in seconds.

Deliverables:

- Live-now hero (marquee LIVE matches with real-time scores → scoreboard/stats).
- Upcoming tournaments grid (venue, dates, sport tags, Get Tickets CTA).
- Quick actions (games near me, order food at venue, live standings), featured sport hubs
  (soccer, volleyball, tennis, table tennis, all-sports), team/tournament/venue search,
  city selector.

Usability acceptance:

- A first-time visitor finds a nearby live or upcoming event without typing.
- Search finds any team, tournament, venue, or match within three taps from the hub.

Depends on: F1, F2. Engine impact: none (read-only composition; city/venue filter uses
existing venue data).

### F4 — Ticketing depth + gate operations

**Goal:** sell the right ticket to the right fan, scan them in at the gate.

Deliverables:

- Tiered passes (day pass, full-tournament pass) on top of existing zone inventory;
  individual seat maps stay deferred (zones only, per current event-ops scope).
- Discount/invite codes (extends existing promo-code model), instant QR delivery to
  email + in-app wallet.
- Gate Scanner web app (staff-facing, `GATE_MANAGER` role): QR validation with
  offline-tolerant queueing and visible sync state.

Usability acceptance:

- A fan buys a pass and receives a scannable QR without creating an account first
  (account linking stays optional, as today).
- A gate staffer validates entry in under 3 seconds per fan on a phone, offline-safe.

Depends on: F2. Engine impact: additive — pass-tier fields on ticketing models, QR payload
versioning; no change to the reservation/ledger semantics.

### F5 — Vendor marketplace + unified cart

**Goal:** fans order food/merch alongside tickets in one checkout; vendors run their stalls.

Deliverables:

- Vendor onboarding + menu approvals + commission/revenue-share configuration.
- Live order tracking pipeline (Received → Preparing → Ready for pickup / Out for seat
  delivery) with fan-facing status updates.
- Unified cart: tickets + food + merchandise in a single checkout flow.
- **External dependency:** a real payment provider decision + signed webhook
  reconciliation. The platform is provider-neutral today (operators confirm references
  manually); single-checkout cannot launch until this is resolved.

Usability acceptance:

- One checkout, one receipt, one QR wallet for tickets + pre-ordered food.
- A vendor sees only their own orders, updates status in one tap, and payout figures
  match the configured commission.

Depends on: F2; payments decision (owner + date required). Engine impact: additive —
order-status pipeline states, cart grouping, vendor payout reports; payment webhooks are
new integration surface, not a new ledger (money stays integer kobo, as today).

### F6 — Organizer RBAC + workspace dashboard

**Goal:** least-privilege staff access and one dashboard that runs the event.

Deliverables:

- New roles (additive `UserRole` values, organization-scoped like today): Tournament
  Director (brackets, schedules, standings), Scorekeeper/Referee (active match pads
  only), Vendor Manager (stall orders + menu availability), Gate Manager (QR validation
  only). `SUPER_ADMIN` keeps full access.
- Competition-scoped grants following the existing `GameControlGrant` pattern, so a
  scorekeeper's access dies with the tournament.
- Workspace dashboard: revenue, ticket sales, live match status, vendor payouts.

Usability acceptance:

- A scorekeeper sees only their assigned live matches — no brackets, no payouts.
- A tournament director runs scheduling → scoring → standings → publishing without
  leaving the workspace.
- Every grant is revokable in one action with an audit record.

Depends on: F1; F4/F5 for the staff surfaces. Engine impact: additive — new enum values
+ permission namespaces + scoped-grant rows; existing roles and grants unchanged.

### Mapping note: the proposed dual architecture already has a backend

| Proposed concept | Existing equivalent | Notes |
| --- | --- | --- |
| Discovery hub / sport hubs | `/public/*` pages, `/live`, `/leaders` | Reassembled under one hub shell, not rebuilt |
| Tournament sub-site | Competition + season + division + public APIs | New presentation route (`/t/:slug`); no new tenant layer |
| Ticket inventory + QR | Zone reservations, QR tickets, `/gameday/checkin` | Add pass tiers + email/wallet delivery; seat maps deferred |
| Food ordering + cart | Vendor/product/order models, promo codes | Add status pipeline + unified checkout + payment gateway |
| Organizer workspace | Operations shell + role-gated routes | Re-homed under `/admin` with redirects; same guards |
| Tournament Director / Scorekeeper / Vendor / Gate roles | `UserRole` + `UserRoleAssignment` + `GameControlGrant` | Additive roles + namespaces; same enforcement pattern |
| Live scorepads | Scorer/statistician consoles per sport | Already tablet-ready; mounted in workspace chrome |

### Scope notes (2026-09-20 proposal)

What "Done" means for F1–F6, precisely:

- **No new tenant layer.** Sub-sites resolve organization + competition from the slug
  within the existing tenancy/RLS model.
- **No parallel commerce tables.** Tickets, orders, and payouts extend the event-ops
  models; the integer-kobo, provider-neutral money rules stand until the F5 payments
  decision lands.
- **No new scoring engine.** Scorepads are the existing consoles in workspace chrome.
- **Not in scope:** subdomain-per-tournament hosting, individual seat maps, native
  mobile apps, social publishing, dynamic ticket pricing.

## 7. Progress tracker

Reality check (2026-09-15): the engine (Stages 1–9) is implemented and applied to **staging and
production**; all backfills/parity checks pass. The GIESM 2026 volleyball registration is **live**
at `https://app.neonultra.ng/giesm`. Volleyball is now operable end-to-end through the app: onboard a
team, generate a round-robin schedule, capture rally points (sets via `GamePeriodScore`), and the
match auto-finalizes into standings. Football and cricket now have specialised scoring too (goals,
including own goals; runs and wickets by innings) and finalization permits draws/ties where the
sport allows them. Scoring is now a dispatched module registry (`lib/sports/scoring-modules.ts`:
sets/goals/runs) so the console and server action have no sport-specific branching, and cricket has
an innings engine (overs, wickets, innings-end, chase target). Cricket now shows innings, overs,
wickets, and the chase target in the console, and the tennis scoring engine
(`lib/sports/tennis-scoring.ts`: points/games/sets/tiebreak) is implemented and tested. Remaining
gaps: drag-drop rescheduling, offline capture, tennis fixtures (the individual-entrant fixture
migration) before tennis is playable, and deeper per-sport presentation on public pages.

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
| P6.4 | Tennis end-to-end | P6 | `In progress` | P6.1 |
| P6.5 | Knockout and group-stage formats | P6 | `In progress` | Engine S9 |
| P7.1 | Offline hardening and recovery drills | P7 | `Not started` | P4.6 |
| P7.2 | Command palette, shortcuts, bulk ops | P7 | `Not started` | — |
| P7.3 | Accessibility audit and fixes | P7 | `Not started` | — |
| P7.4 | Localization and timezone support | P7 | `Not started` | — |
| P7.5 | Performance for large tournaments | P7 | `Not started` | — |
| P7.6 | Guided tours and contextual help | P7 | `Not started` | — |
| P7.7 | Usability testing and fixes to closure | P7 | `Not started` | All |
| P8.1 | American football definition (quarters, downs, scoring values, standings) | P8 | `Done` | P1-P5 patterns |
| P8.2 | American football capture console (drive/field state + phase entry) | P8 | `Done` | P8.1 |
| P8.3 | American football standings, leaders, and exhibition game evidence | P8 | `Done` | P8.2 |
| P9.1 | Table tennis definition (11-point games, serve alternation, expedite) | P9 | `Done` | P8 patterns |
| P9.2 | Table tennis point-by-point capture (serve, strokes, rally length, streaks) | P9 | `Done` | P9.1 |
| P9.3 | Table tennis entrant draws and standings (match → H2H → set → point) | P9 | `Done` | P9.2 |
| P10.1 | Soccer depth (possession, passing, goalkeeping, derived xG/xA, H2H, trends) | P10 | `Done` | P4/P5 patterns |
| P10.2 | Tennis depth (serve/return splits, key points, rally bands, tiebreak variants) | P10 | `Done` | P10.1 |
| P10.3 | Volleyball depth (rotation, libero, ratings 0–3, efficiency, zones 1–6) | P10 | `Done` | P10.1 |
| P11.1 | Swiss-system format | P11 | `Done` | P3 patterns |
| P11.2 | Double elimination and custom ladders | P11 | `Done` | P11.1 |
| P11.3 | H2H and discipline/fair-play tiebreakers in standings | P11 | `Done` | P5 patterns |
| P11.4 | Cross-sport leaders (scorers, assists, MVP, discipline) | P11 | `Done` | P5.3 |
| P11.5 | POSTPONED match state with reason and history | P11 | `Done` | P3.4 |
| F1.1 | Public portal shell (nav, sport switcher, search, city, cart, Live Center) | P12/F1 | `In progress` | P0.2 |
| F1.2 | Organizer workspace shell (`/admin`) with redirects for moved routes | P12/F1 | `In progress` | P0.2 |
| F1.3 | Strict guest/organizer context switching | P12/F1 | `Done` | F1.1 |
| F2.1 | Tournament sub-sites (`/t/:slug`) with Overview/Feed tab | P12/F2 | `Done` | F1.1 |
| F2.2 | Sub-site Fixtures & Stats tab (brackets, match detail) | P12/F2 | `Done` | F2.1 |
| F3.1 | Fan discovery hub (`/`) with live hero + tournament grid | P12/F3 | `Done` | F2.1 |
| F3.2 | Sport hubs, search, city selector, quick actions | P12/F3 | `Done` | F3.1 |
| F4.1 | Tiered passes (day/full-tournament) + QR email/wallet delivery | P12/F4 | `Not started` | F2.1 |
| F4.2 | Gate Scanner web app + Gate Manager role | P12/F4 | `Not started` | F4.1 |
| F5.1 | Vendor onboarding, menu approvals, commission configuration | P12/F5 | `Not started` | F2.1 |
| F5.2 | Order status pipeline + live tracking | P12/F5 | `Not started` | F5.1 |
| F5.3 | Unified cart (tickets + food + merch) + payment provider decision | P12/F5 | `Not started` | F4.1 |
| F6.1 | Tournament Director / Scorekeeper-Referee / Vendor Manager roles + scoped grants | P12/F6 | `Not started` | F1.2 |
| F6.2 | Workspace dashboard (revenue, sales, live status, payouts) | P12/F6 | `Not started` | F6.1 |

## 8. Relationship to the engine roadmap

Product phases depend on engine stages but are not blocked by the full engine programme:

- P1 needs engine Stage 1 (sport catalog).
- P2 needs engine Stage 2 (Entrant) for individual sports.
- P4 needs engine Stages 1, 2, and 6 (event catalog).
- P5 needs engine Stages 3 and 5 (statistics, standings).
- P6 needs engine Stages 1-9.
- P12 needs only additive engine touchpoints (new `UserRole` values, pass-tier and
  order-status fields); no new tenant layer, tables, or ledgers.

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
