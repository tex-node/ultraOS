---
title: UI Overhaul Design Brief
status: Accepted (2026-09-20)
version: design-brief-1.0
last_updated: 2026-09-20
---

# UI Overhaul Design Brief

## 1. Purpose

This brief commissions a **complete visual and responsive redesign** of UltraLeagueOS —
every screen listed in Section 7 — without changing information architecture, routes, or
backend behavior (except where explicitly noted). The app works; it must now look, feel,
and respond like one coherent product on **mobile, tablet, and desktop**.

Related references:

- `documentation/PRODUCT_ROADMAP.md` — what users can do (unchanged by this brief).
- `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md` — domain model (unchanged).
- `UI/NEON_ULTRA_CLAUDE_DESIGN_SYSTEM.md` — the visual authority: palette, type, spacing,
  radii, glow, shells, components, motion, responsive rules, accessibility, and copy style.
  Where this brief and that document disagree on a visual value, the system document wins.
- `docs/product/ui-guidelines.md`, `docs/product/user-journeys.md` — prior product notes.
- `documentation/standards/` — documentation and asset standards.

## 2. Design mandate

1. **One product, two experiences.** The fan portal (public, guest-safe, marketplace
   energy) and the organizer workspace (`/admin`, dense, calm, operational) must feel
   like siblings, not two apps. Shared tokens and components; distinct density and chrome.
2. **Responsive is not an adaptation step.** Every screen is designed for three breakpoints
   from the start (Section 4). No desktop-only screens except the broadcast graphics
   surfaces (Section 4.5), which are fixed-format by nature.
3. **Courtside-first capture.** Scorekeeper consoles are tablet-first: large touch targets,
   running score always visible, one-tap common events, readable in sunlight and loud gyms.
4. **Trust through clarity.** Money (kobo-accurate), tickets (QR + status), orders
   (pipeline state), and standings (tiebreak provenance) must read unambiguously on a phone.
5. **No dead ends, no raw errors.** Every empty state teaches the next action; every
   failure states what happened and what to do next (existing usability standards stand).
6. **Dark-mode-first, daylight-capable.** Keep the dark brand; guarantee contrast and
   readability outdoors (gate scanning, courtside) and on projectors (scoreboard).

## 3. Design system (to be built)

- **Tokens:** color (brand emerald + sport accents + semantic success/warn/danger/info),
  type scale, spacing, radii, elevation, breakpoints, motion durations.
- **Components:** button (sizes incl. 52px+ courtside), input/select/date, tabs, cards,
  tables (responsive → stacked), badges/pills, steppers (order pipeline, onboarding),
  sheets/modals, toasts, empty-state, skeleton loaders, QR card, score bug, bracket node.
- **Rules:** one primary action per screen; destructive actions confirm; touch targets
  ≥ 44px (≥ 52px on capture surfaces); visible focus; locale-aware dates/numbers.

## 4. Responsive specification

All screens must be reviewed at all three breakpoints unless an exception is stated.
Breakpoints (per the design system): **mobile** < 768px (single column, bottom-safe
actions), **tablet** 768–1279px (two-column, touch-first), **desktop** ≥ 1280px (full
density, sidebar shell).

| # | Context | Primary device | Key requirements |
| --- | --- | --- | --- |
| 4.1 | Fan browsing (hub, sub-sites, match/team/player pages, standings, stats) | Mobile | Thumb-reach CTAs, readable scores at arm's length, share works from mobile Safari/Chrome |
| 4.2 | Courtside capture (scorer + statistician consoles, substitution, incidents) | Tablet (landscape + portrait) | Sticky score/clock header, one-tap events, no horizontal scroll, works with sweaty hands |
| 4.3 | Gate operations (scanner, verification, QR ops) | Mobile | Sub-3-second validate flow, huge status feedback, offline pill + scan log visible |
| 4.4 | Organizer workspace (dashboard, builder, scheduler, orders, vendors, content, admin) | Desktop (tablet-usable) | Sidebar shell, dense tables that stack on mobile, bulk actions reachable |
| 4.5 | Presentation surfaces (scoreboard, display clock, broadcast graphics, draft display) | Fixed/projector/OBS | 16:9-safe, transparent broadcast overlays, distance-legible type; NOT reflowed for phones |
| 4.6 | Account/auth/apply/registration | Mobile | Short forms, progress indication, duplicate-resolution clarity |

## 5. Screen inventory — fan portal

Every route below is in scope for redesign. "Note" calls out what the redesign must solve.

| Screens | Route(s) | Note |
| --- | --- | --- |
| Discovery hub | `/` | Hero (live/upcoming), quick actions, sport chips, city filter, search, tournament grid — mobile-first |
| Portal home (legacy) | `/public` | Align with hub or retire; no two competing homes |
| Tournament sub-sites | `/t/[slug]`, `/t/[slug]/fixtures` | Hero + tabs; sub-nav must survive small screens |
| Match center | `/public/fixtures`, `/public/fixtures/[id]` | Pre-game/live/final states; stats, timeline, box score on phones |
| Clubs & teams | `/public/clubs`, `/public/clubs/[id]` | Brand-led headers, rosters, results |
| Players | `/public/players`, `/public/players/[id]` | Career view, season stats, share |
| Standings | `/public/standings` | Tiebreak transparency on narrow tables |
| Stats hub + compare + records | `/public/stats`, `/public/stats/players`, `/public/stats/compare/players`, `/public/stats/compare/teams`, `/public/stats/records` | Leaderboards readable without horizontal scroll |
| Live center | `/live` | Live-now cards → scoreboard/stats |
| Leaders | `/leaders` | Cross-sport leaders, phone-readable |
| Celebrations | `/public/celebrations` | Media-forward, shareable |
| Share cards | `/public/share/game/[id]`, `/public/share/player/[id]`, `/public/share/record/[key]`, `/public/share/team/[id]` | Correct social previews; mobile share sheet |
| Events & tickets | `/public/events`, `/public/events/[id]` | Zone cards, pass tiers, promo field, reserve flow |
| Ticket wallet | `/public/tickets/[code]` | QR legibility, email-QR, wallet-order upsell |
| Orders (fan) | `/public/orders/[code]` | Pipeline stepper must read at a glance |
| Auth | `/login`, `/signup`, `/signup/support-club`, `/forgot-password` | Calm, minimal, trustworthy |
| Account & profile | `/account`, `/profile` | Roles, applications, reservations, orders in one place |
| Applications | `/apply`, `/apply/[organizationSlug]`, `/apply/[organizationSlug]/[role]` | Wizard-first, per-role copy |
| Registrations | `/register/[organizationSlug]/[eventSlug]`, `/registrations`, `/registrations/[id]`, `/giesm` | Tournament + event signup clarity |

## 6. Screen inventory — organizer workspace

Shell (`/admin` hub, workspace sidebar) is redesigned as part of this brief; all screens
below adopt it. Capture consoles are tablet-first; everything else is desktop-first,
tablet-usable, mobile-readable.

| Area | Screens | Note |
| --- | --- | --- |
| Workspace home | `/admin`, `/dashboard` | Live numbers + section cards; no dead links per role |
| Tournaments | `/competitions`, `/competitions/new`, `/competitions/[id]`, `/competitions/[id]/schedule`, `/competitions/[id]/settings`, `/competitions/[id]/sport-rules`, `/competitions/[id]/teams`, `/competitions/[id]/teams/new` | Builder wizard feel; schedule conflicts visible pre-save |
| Clubs & seasons | `/clubs`, `/clubs/new`, `/clubs/[id]`, `/clubs/[id]/edit`, `/clubs/[id]/seasons/new`, `/clubs/import`, `/season-clubs/[id]/edit`, `/season-clubs/[id]/roster` | Brand vs season-context separation must be obvious |
| Athletes & players | `/players`, `/players/new`, `/players/[id]`, `/players/[id]/edit`, `/players/[id]/seasons/new`, `/players/import`, `/players/photos/import`, `/athletes/[athleteId]/training` | Permanent identity vs season registration clarity |
| Coaches & staff | `/coaches`, `/coaches/import`, `/coaches/assignments`, `/coaches/photos/import`, `/coaches/season-zero-selection`, `/coaches/[ultraStaffId]`, `/staff/[ultraStaffId]`, `/staff-planner` | Selection workflow needs decision-state clarity |
| Drafts | `/drafts`, `/drafts/new`, `/drafts/[id]`, `/drafts/[id]/display`, `/draft-events`, `/draft-events/new`, `/draft-events/[draftEventId]`, `/draft-events/[draftEventId]/coaches`, `/draft-events/[draftEventId]/control`, `/draft-events/[draftEventId]/display`, `/draft-events/[draftEventId]/player-pool`, `/draft-events/[draftEventId]/readiness`, `/draft-events/[draftEventId]/squads`, `/draft-events/[draftEventId]/squads/new`, `/draft-events/[draftEventId]/squads/[squadId]`, `/draft-cohort`, `/draft-readiness` | Draft-day readability at projector distance; rehearsal vs live unmistakable |
| Fixtures | `/fixtures`, `/fixtures/new`, `/fixtures/[id]`, `/fixtures/[id]/edit` | Status lifecycle (incl. postponed) always visible |
| Scorer console | `/games/[fixtureId]/live` | Tablet-first per Section 4.2; clock sports vs set sports distinct |
| Statistician console | `/games/[fixtureId]/stats`, `/games/[fixtureId]/stats/live`, `/games/[fixtureId]/stats/reconciliation`, `/games/[fixtureId]/stats/reports`, `/games/[fixtureId]/stats/reports/box-score`, `/games/[fixtureId]/stats/reports/play-by-play`, `/games/[fixtureId]/stats/reports/shot-chart`, `/games/[fixtureId]/video` | Reconciliation warnings unmissable; reports printable |
| Exhibition | `/novelty-matches`, `/novelty-matches/[matchId]/live` | Clearly non-competitive styling |
| Game day | `/gameday`, `/gameday/checkin` | Command-center density; check-in roster triage |
| Gate | `/check-in`, `/check-in/[code]`, `/qr-operations` | Phone-first per Section 4.3; admit/deny unmistakable |
| Scoreboard & displays | `/scoreboard/[gameId]`, `/display/game/[gameId]/clock`, `/display-monitoring` | Fixed-format per Section 4.5 |
| Broadcast suite | `/broadcast`, `/broadcast/control`, `/broadcast/diagnostics`, `/broadcast/stats`, `/broadcast/graphics`, `/broadcast/graphics/preview`, `/broadcast/game/[gameId]/scorebug`, `/broadcast/game/[gameId]/player-spotlight`, `/broadcast/game/[gameId]/leader`, `/broadcast/game/[gameId]/team-comparison`, `/broadcast/game/[gameId]/record-watch`, `/broadcast/game/[gameId]/milestone`, `/broadcast/game/[gameId]/game-story`, `/broadcast/game/[gameId]/ultra-time`, `/broadcast/game/[gameId]/four-point-moment`, `/broadcast/game/[gameId]/final` | Transparent OBS overlays stay pixel-stable; control panel tablet-usable |
| Orders & vendors | `/orders`, `/vendors`, `/vendors/[id]` | One-tap status; vendor-scoped views; payout math explicit |
| Events | `/events`, `/events/new`, `/events/[id]`, `/events/[id]/debrief`, `/events/[id]/registration` | Zones/passes/promos/inventory in one mental model |
| Content & media | `/content`, `/content/templates`, `/content/assets/[slug]`, `/media`, `/media/upload`, `/media/[assetId]`, `/announcements`, `/documents`, `/notifications` | Studio density; approval states visible |
| People ops | `/applications`, `/applications/[category]`, `/applications/internalization`, `/participants/search`, `/participants/all-star-roster`, `/participants/offline-intake`, `/player-registrations/[id]/edit`, `/tryouts`, `/tryouts/[group]`, `/tryouts/reconciliation`, `/data-quality/duplicates`, `/data-quality/duplicates/[groupId]`, `/data-quality/season-zero-production`, `/data-quality/season-zero-production/[applicationId]/duplicates`, `/data-readiness`, `/imports`, `/imports/[importJobId]` | Duplicate-resolution and review queues need decision-state clarity |
| Governance | `/access`, `/audit`, `/operations`, `/incidents`, `/equipment`, `/runbooks`, `/tasks`, `/launch-readiness`, `/data-readiness` | Audit/trace readability; no raw internals to guests |
| Training | `/training`, `/training/new`, `/training/[sessionId]` | Session tracking clarity |
| Standings & stats (ops) | `/standings` | Engine-accurate tables |
| Venue | `/venue-map` | Map-first on mobile |
| Vision lab | `/vision`, `/vision/videos`, `/vision/games/[fixtureId]`, `/vision/failures` | Clearly experimental surfaces; never confuse with official data |
| Rehearsal | `/rehearsals`, `/rehearsal/live/[fixtureId]`, `/rehearsal/broadcast/[fixtureId]` | Rehearsal watermarking unmistakable vs live |
| System | `/no-league`, `/account` (staff view), `/profile` | Friendly dead-end-free states |

Out of scope for visual redesign (functional surfaces, not screens): `/api/*` endpoints.

## 7. Delivery stages (for approval)

| Stage | Scope | Status |
| --- | --- | --- |
| D1 | Design tokens + core components + shell prototypes (portal + workspace) | Done — `22eb92c`, gallery at `/design` |
| D2 | Fan portal wave (hub, sub-sites, match/club/player pages, tickets/wallet, auth) | Done — `90b689f` |
| D3 | Capture & gate wave (consoles, gate scanner, scoreboard) | Done — `48bae2d` |
| D4 | Workspace wave (dashboard, builder, drafts, orders, vendors, content, governance) | Done — `48bae2d` |
| D5 | Presentation wave (broadcast suite, displays, share cards, print styles) | Done — `48bae2d` |
| D6 | Polish + accessibility audit + performance pass | Done — `48bae2d` + `beeb7d4` (print styles, focus-visible, reduced-motion, entrant-safe ops pages) |

## 8. Approval required

| # | Item | Status |
| --- | --- | --- |
| B1 | This brief accepted as the redesign reference | Accepted 2026-09-20 |
| B2 | Screen inventory complete (no missing route) | Accepted 2026-09-20 |
| B3 | D1–D6 stages approved for implementation | Accepted 2026-09-20 |
