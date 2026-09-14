---
title: Multi-Sport Architecture
status: Accepted — single agreed reference (2026-09-13)
version: multi-sport-1.1
last_updated: 2026-09-13
---

# Multi-Sport Architecture

## 1. Purpose and scope

UltraLeagueOS began as a basketball-only operating system for the Neon Ultra Basketball League. This document defines how the platform extends to volleyball, tennis, football (association), cricket, and future sports without branching the product or forking the data model per sport.

This document is accepted as the **single agreed reference** as of 2026-09-13 (see [Section 12](#12-acceptance-criteria-for-this-document)). It is design-first: implementation proceeds through the additive stages in Section 7 and the [Multi-Sport Roadmap](../MULTI_SPORT_ROADMAP.md), and this document governs unless formally superseded.

Scope:

- The target domain model for multi-sport competition, participation, events, statistics, and standings.
- The capability matrix that declares what each sport supports.
- An additive, reversible migration sequence.
- Guardrails that preserve the existing Season Zero basketball data and the tenancy/RLS guarantees.

Non-goals: repainting the UI per sport, re-platforming auth/tenancy, or shipping any sport's competition rules as hardcoded logic.

Related references:

- `documentation/MULTI_SPORT_ROADMAP.md` — staged delivery and progress tracking.
- `documentation/reference/GLOSSARY.md` — canonical terminology.
- `documentation/architecture/PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md` — composite-FK and RLS patterns any new table must follow.
- `web/prisma/schema.prisma` — current data model.

## 2. Agreed decisions

These three decisions shape every other part of the design. They are fixed.

### D1 — Competing entity: the Entrant abstraction

Individual sports (tennis) compete as individuals or teams of people, and Clubs are not standard in those sports. The model therefore introduces an explicit **Entrant** abstraction (the competing unit in a Competition) rather than forcing every sport to reuse `SeasonClub`.

- A `SeasonClub` is represented as one `TEAM` Entrant (`Entrant.seasonClubId`).
- Individual sports create `INDIVIDUAL`, `PAIR`, or `RELAY` Entrants backed by `EntrantMember` rows referencing `Athlete`.
- Fixtures, games, standings, and team-level statistics reference `Entrant`, not `SeasonClub`, so a tennis draw and a football league use the same scheduling and results plumbing.

### D2 — Statistics: one generic metric model

One flexible, definition-driven stat model serves all sports. There are **no per-sport stat tables**.

- A `SportMetricDefinition` registry declares every metric a sport can capture (key, label, value type, scope, aggregation).
- Actual values live in generic rows (`GameMetricValue`) keyed by subject (player or entrant) and metric definition.
- The existing basketball `PlayerStat`/`TeamStat` tables are retained as a compatibility projection for Season Zero and retired only after parity is proven.

### D3 — Sport definition: code registry, DB override

A **code registry** of sport definitions is the authority for rules, structure, events, metrics, and standings behaviour. Database-backed configuration may override declared defaults per organization/competition/season.

- Code registry = versioned TypeScript modules under `web/src/lib/sports/`.
- DB override = `SportDefinitionOverride` rows (validated against the registry schema).
- Nothing about a sport's structure is inferred at runtime; a game always resolves an explicit, frozen definition.

## 3. Design principles

1. **One sport authority.** Mirror the existing `sport-rules.ts` facade idea: every consumer reads a resolved sport definition, never a sport-specific constant.
2. **Universal truth, sport-specific meaning.** Provenance, audit, corrections, tenancy, and scheduling are sport-agnostic. Only the vocabulary (events, metrics, structure) varies.
3. **Additive-only migrations.** Never drop or rewrite a column that Season Zero depends on. Add, backfill, dual-read, then deprecate.
4. **Frozen facts.** A played game's rules and definition version are snapshotted, exactly as `GameRuleSnapshot` does today.
5. **Capability-gated UI.** One shell; modules (draft, shot clock, court vision, innings) appear only when the sport definition enables them.
6. **Tenancy from day one.** Every new table carries `organizationId`, RLS, and composite FKs following Stage 5.4B.
7. **No inferred sport facts.** Determine sport from explicit configuration, never from a name, division label, or competition title.

## 4. Current-state coupling inventory

The org/ops layer (tenancy, applications, media, events, commerce, content, broadcast) is already sport-agnostic. The **engine layer** is basketball-shaped. The work is concentrated here.

| Area | Current state (basketball) | Multi-sport need |
| --- | --- | --- |
| Event vocabulary | `GameEventType` enum (`schema.prisma:114`) — REBOUND/ASSIST/STEAL/BLOCK/TURNOVER; 2/3/4-point; FREE_THROW | Per-sport event catalog: volleyball serve/ace/kill/block; football goal/card/offside; cricket runs/wicket/extra; tennis ace/break |
| Player stats | `PlayerStat` box-score columns (`schema.prisma:3155`) | Definition-driven metric values |
| Team stats | `TeamStat` basketball columns (`schema.prisma:3226`) | Metric values scoped to an Entrant |
| Rules | `RuleSet` halves/shot clock/four-point/Ultra Time (`schema.prisma:2953`) | Generic rule values per sport, snapshotted per game |
| Standings | `Standing` played/won/lost/pointsFor/Against (`schema.prisma:3268`) — no draws/sets/NRR | Sport standings strategy + secondary metrics |
| Match sides | `Fixture.homeSeasonClubId/awaySeasonClubId`; `Game` derives from them | `Entrant` sides |
| Structure | `Game.currentPeriod`, `clockSecondsRemaining`, `shotClockSecondsRemaining` (`schema.prisma:2885`); `game-rules.ts` hardcodes halves (`game-rules.ts:4`) | Sport structure (sets/innings/quarters/halves) from the definition |
| Registration sport | `RegistrationSport` enum (`schema.prisma:2109`) duplicates the `Sport` model | Single source of truth for sport |
| Application fields | Player positions and wingspan are basketball-specific (`application-config.ts:155`) | Sport-declared attributes |
| Geometry | `CourtSpecification`, court zones, attacking basket | Per-sport playing-surface specification |
| Modules | Draft, shot clock, Ultra Time, four-point treated as core | Optional capability modules |

## 5. Target model

### 5.1 Sport definition

A resolved `SportDefinition` is the single object every sport-aware component reads:

```ts
type SportDefinition = {
  key: string;                 // "BASKETBALL", "VOLLEYBALL", "TENNIS", "FOOTBALL", "CRICKET"
  slug: string;                // "basketball" — matches the Sport catalog slug
  name: string;
  version: number;             // definition version, snapshotted per game
  entities: ("TEAM" | "INDIVIDUAL" | "PAIR" | "RELAY")[]; // tennis = ["INDIVIDUAL","PAIR"]
  structure: StructureSpec;    // periods/sets/innings, durations, clock behaviour
  scoring: ScoringSpec;        // score units, multipliers, win condition
  events: SportEventDefinition[];
  metrics: SportMetricDefinition[];
  standings: StandingsSpec;
  roster?: RosterSpec;         // required for TEAM sports; absent for individuals
  surface?: SurfaceSpec;       // court/pitch/field geometry, when relevant
  capabilities: CapabilityKey[]; // draft, shotClock, ultraTime, fourPoint, innings, rotation, vision, ...
  rules?: SportRuleValue[];    // resolved rule values (snapshotted per game)
  constraints: SportConstraint[]; // entry-time validation / eligibility rules
};
```

This shape is implemented in `web/src/lib/sports/types.ts`; the registry and definitions live beside it in `web/src/lib/sports/`.

Persistence:

- Registry modules: `web/src/lib/sports/registry.ts` + `basketball.ts`, `volleyball.ts`, `tennis.ts`, `football.ts`, `cricket.ts`.
- DB override: `SportDefinitionOverride` table (`organizationId`, `sportId`, `version`, `config Json`, `isActive`), validated against the registry's schema before write. Resolution lives in `web/src/lib/sports/sport-override-store.ts`; a missing or invalid override falls back to the registered definition. Only declared rule values and default divisions are overridable; other fields require a new definition version.
- Existing `Sport` model stays the catalog identity (`schema.prisma:676`); the definition is the behaviour attached to it.

### 5.2 Entrant abstraction (D1)

New models:

```prisma
enum EntrantType { TEAM INDIVIDUAL PAIR RELAY }

model Entrant {
  id             String       @id @default(cuid())
  organizationId String
  competitionId  String
  seasonId       String
  divisionId     String
  type           EntrantType
  name           String
  shortName      String?
  logoUrl        String?
  primaryColor   String?
  secondaryColor String?
  // TEAM entrants wrap a club participation; individual entrants leave this null.
  seasonClubId   String?
  status         EntrantStatus @default(ACTIVE)
  seed           Int?
  members        EntrantMember[]
}

model EntrantMember {
  id             String   @id @default(cuid())
  organizationId String
  entrantId      String
  athleteId      String
  role           String   // PLAYER, CAPTAIN, PARTNER, ...
  order          Int?
}
```

Rules:

- Exactly one `TEAM` Entrant per `SeasonClub` (enforced by a unique constraint on `seasonClubId`).
- `INDIVIDUAL` has one member; `PAIR` two; `RELAY` n. Cardinality is validated against the sport definition.
- `Entrant` is the FK target for `Fixture` sides, `GameEvent` team attribution, `Standing`, and team-scoped metrics.
- Individual sports never require a `Club`. `Club` and `SeasonClub` remain valid and unchanged for team sports.

Implementation: pure helpers in `web/src/lib/entrant.ts`; schema + RLS in migration `20260913100000_entrant_abstraction`; idempotent backfill in `web/scripts/entrant-backfill.ts` and read-only parity verification in `web/scripts/entrant-parity-check.ts`.

### 5.3 Competition structure and capability modules

- `Competition`/`Season`/`Division` remain the hierarchy. A `SportDefinition` supplies structure, not the hierarchy.
- **Capability modules** are explicit toggles on the resolved definition, optionally narrowed per competition: `DRAFT`, `SHOT_CLOCK`, `ULTRA_TIME`, `FOUR_POINT`, `SUBSTITUTIONS`, `INNINGS`, `ROTATION`, `SURFACE_VISION`, `EXTRA_TIME`, `PENALTIES`.
- Feature UI and server actions check `capabilities` rather than the sport key, so a new sport composes existing modules.

### 5.4 Event vocabulary

Keep the universal event ledger; make the vocabulary data-driven.

- Retain universal columns on `GameEvent` (`schema.prisma:3042`): `sequenceNumber`, `period`, `clockSeconds`, `entrantId`, `playerId`, `points`, `status`, corrections/supersession, provenance (`source`, `sourceEventId`).
- Add `typeKey String` resolved against the sport's `events` catalog, plus `data Json?` for sport-specific payload (e.g. dismissal type, serve outcome, card colour).
- Retain the legacy `eventType GameEventType?` and basketball-specific fields (`basePointValue`, `multiplier`, `isUltraTime`, `isFourPointAttempt`, shot coordinates) for Season Zero compatibility. New sports use `typeKey` + `data` only.
- A `SportEventDefinition` declares for each event: key, label, category, whether it scores, its value expression, and the metrics it produces. The scorer console renders from this catalog.

### 5.5 Generic statistics (D2)

New models:

```prisma
enum StatSubjectType { PLAYER ENTRANT }
enum StatValueType  { COUNT DURATION DECIMAL PERCENTAGE }

model SportMetricDefinition {
  id             String   @id @default(cuid())
  organizationId String?
  sportId        String
  key            String
  label          String
  valueType      StatValueType
  subject        StatSubjectType
  aggregation    String   // SUM, MAX, RATIO, AVERAGE, ...
  category       String?
  derivedFromEventKeys String[]
  sortOrder      Int      @default(0)
}

model GameMetricValue {
  id                 String       @id @default(cuid())
  organizationId     String
  gameId             String
  subjectType        StatSubjectType
  playerId           String?
  entrantId          String?
  metricDefinitionId String
  period             Int?
  value              Decimal
  sourceEventId      String?
  statSource         StatDataSource?
}
```

- Existing `PlayerStat`/`TeamStat` remain readable. A **compatibility projection** maps basketball metrics to their legacy columns so current pages, PDFs, and broadcast contracts keep working unchanged.
- For `ULTRA_NATIVE_EVENTS` games, metric values are reproducible from the ledger via `derivedFromEventKeys`; the projection is a cache, not a source of truth.
- The `StatDataSource` provenance vocabulary (`schema.prisma:190`) is reused unchanged.

### 5.6 Standings

- `Standing` references `Entrant` (generalized from `SeasonClub`, `schema.prisma:3268`).
- Add: `drawn`, `ties`, `noResult`, `rank`, and `rankTiebreak`.
- Add a child `StandingMetric` (`standingId`, `metricKey`, `value`) for sport-specific columns: net run rate (cricket), set ratio and points ratio (volleyball), games ratio (tennis).
- The standings **strategy** comes from the sport definition: which outcomes exist, points awarded per outcome, and the ordered tiebreak chain. Computed by a per-sport strategy behind a single `StandingsEngine` interface.

Examples:

| Sport | Outcomes | Points | Primary tiebreak | Secondary metrics |
| --- | --- | --- | --- | --- |
| Basketball | W/L | W=2, L=1 | head-to-head, diff | — |
| Football | W/D/L | W=3, D=1 | goal difference | goals for |
| Volleyball | W/L | W=3, L=0 (or set-based) | set ratio | points ratio |
| Cricket | W/L/D/NR | W=2, D/NR=1 | net run rate | — |
| Tennis | W/L | table or bracket | sets/games ratio | head-to-head |

### 5.7 Rule sets

- `RuleSet` gains `sportId` and a normalized `RuleValue[]` (keyed by a `RuleDefinition`), or a validated `config Json` for simple cases. Both resolve through the sport definition.
- `GameRuleSnapshot` stays the immutable per-game copy; it freezes the resolved definition version and rule values as JSON, while continuing to expose the legacy basketball fields for existing games.
- Legacy basketball columns remain until the compatibility projection is retired.

### 5.8 Registration and roster

- Unify sport identity: replace `RegistrationSport` (`schema.prisma:2109`) usage with `sportId` FKs to `Sport`. Additive path: add nullable `sportId` to `RegistrationParticipantSport` and form config, backfill from the enum, then enforce.
- `SportConfig` (`web/src/lib/registration/sport-config.ts`) generalizes from two hardcoded sports to a definition-driven roster/eligibility schema. The existing all-female Volleyball + Flag Race preset becomes one preset among many.
- Player application fields (positions, wingspan, `application-config.ts:155`) become sport-declared attributes rendered from the definition.

### 5.9 Playing surface

- Replace basketball-only `CourtSpecification` usage with a `SurfaceSpec` declared by the sport definition (court, pitch, field) plus a per-venue surface instance.
- Court/field zones and vision geometry remain optional capabilities; a cricket pitch or tennis court supplies its own spec. Vision stays capability-gated and never blocks core operation.

### 5.10 Optional modules

Draft, shot clock, Ultra Time, four-point, innings, and rotation are capability modules, not core assumptions. A cricket organization never sees a draft; a tennis event never sees a shot clock.

### 5.11 Validation and constraints

Validation happens at entry, before an event is accepted, and is declared per sport rather than hardcoded. This was adopted from the FIBA benchmark (`documentation/architecture/FIBA_BENCHMARK.md`).

- A `SportConstraint` declares a check that applies to a context (EVENT, LINEUP, PERIOD_TRANSITION, SUBMISSION) with a severity of `BLOCK` or `WARN`, and the definition version it belongs to.
- A code-registered **validator registry** implements each constraint key; the sport definition only references keys. Validators are resolved from the match's frozen definition version, exactly like rules.
- The engine validates that an event's type exists and its actors are eligible; it does not encode the sport's meaning. Scoring, eligibility, and sequencing rules are supplied by validators.
- Constraints that cannot be decided from rules alone (for example association-football offside, cricket DLS targets) are `WARN` and advisory at most, never `BLOCK`, until a validated data source exists.

Examples:

| Sport | Constraint | Severity |
| --- | --- | --- |
| Basketball | Player may not be active with five fouls | BLOCK |
| Basketball | Scoring event requires an eligible active player | BLOCK |
| Volleyball | Rotation order must follow the service rotation | BLOCK |
| Football | A player with a red card may not re-enter | BLOCK |
| Cricket | Innings cannot exceed overs limit (unless all out) | BLOCK |
| Football | Offside suspicion | WARN (deferred) |

## 6. Capability matrix

| Dimension | Basketball | Volleyball | Tennis | Football | Cricket |
| --- | --- | --- | --- | --- | --- |
| Competing entity | TEAM | TEAM | INDIVIDUAL / PAIR | TEAM | TEAM |
| Structure | 2 halves (4 quarters variant) | Best-of-5 sets (25/15) | Best-of-3/5 sets, games | 2 × 45 min halves | Innings / overs |
| Clock | Running + shot clock | Rally, no clock | No clock | Running | No clock |
| Scoring unit | 1/2/3/4 pts | Rally point | 15/30/40, game, set | Goal | Run |
| Draws | No (OT) | No | No | Yes | Yes / No-result |
| Event catalog | shot, rebound, assist, steal, block, turnover, foul, sub | serve, ace, kill, block, dig, set, error | ace, double fault, break, winner, error | goal, assist, offside, corner, yellow/red, sub | runs, boundary, wicket, extra, over, dismissal |
| Stat model | Generic (box-score projection) | Generic | Generic | Generic | Generic |
| Standings strategy | W/L, diff | W/L, set & point ratio | W/L, set & game ratio | W/D/L, GD | W/L/D/NR, NRR |
| Surface | Court | Court | Court | Pitch | Pitch / oval |
| Optional modules | draft, shotClock, ultraTime, fourPoint, substitutions, surfaceVision | rotation, substitutions | — | extraTime, penalties, substitutions | innings |

This matrix is the contract. Adding a sport means adding a definition module and, at most, extending the matrix — not altering the engine.

## 7. Migration sequence

Every stage is additive-only, dual-read, backfill, then deprecate. Each stage is independently deployable and reversible from a pre-stage backup. RLS and composite FKs are applied to every new table in the stage that introduces it.

| Stage | Name | Adds | Backfill | Exit criteria |
| --- | --- | --- | --- | --- |
| 0 | Acceptance | Nothing (documentation only) | — | This document accepted; schema frozen |
| 1 | Sport catalog | `SportDefinitionOverride`; validator registry; `sportId` on rule/definition-referencing tables | Basketball definition registered with no behaviour change | Registry resolves basketball identically to today |
| 2 | Entrant | `Entrant`, `EntrantMember`; nullable `entrantId` on `Fixture`, `GameEvent`, `Standing`, `TeamStat` | One `TEAM` Entrant per existing `SeasonClub` | Basketball fixtures/games resolve Entrants identically |
| 3 | Generic stats | `SportMetricDefinition`, `GameMetricValue` | Backfill Basketball `PlayerStat`/`TeamStat` into metric values | Projection reproduces legacy stat reads exactly |
| 4 | Rules | `sportId` + `RuleValue`/`config` on `RuleSet`; snapshot JSON | Backfill existing `RuleSet` rows | Snapshot round-trips existing games |
| 5 | Standings | `drawn`/`ties`/`noResult`/`rank`, `StandingMetric`, Entrant FK | Backfill standings from legacy columns | Basketball standings unchanged; football draws computable |
| 6 | Event vocabulary | `typeKey`, `data`, `SportEventDefinition` catalog | Map legacy `GameEventType` to keys | Scorer reads catalog for basketball with no change |
| 7 | Registration sport | `sportId` on registration participant/form config | Backfill from `RegistrationSport` enum | Volleyball/Flag Race config reads from `Sport` |
| 8 | Sport pilot | Volleyball end-to-end definition | — | A full volleyball competition runs without schema change after Stage 8 |
| 9 | Additional sports | Football, cricket, tennis definitions | — | Each runs end-to-end from definitions alone |
| 10 | Cleanup | Deprecate legacy basketball columns/enums | — | Compatibility projection retired; only after parity and sign-off |

Rollback: every stage keeps its predecessor readable. A failed stage is rolled back by restoring the pre-stage backup; no stage deletes data that an earlier stage reads.

## 8. Compatibility and guardrails

- **Season Zero is sacred.** Basketball data, live scoring, standings, broadcast contracts, and the FIBA import path must behave identically at every stage. The compatibility projection is the mechanism.
- **Tenancy.** Every new model carries `organizationId`, RLS policies, and composite FKs following `PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md`. A sport definition override is organization-scoped.
- **Frozen facts.** A game's definition version and rules are snapshotted; editing a definition never changes a played game.
- **No sport inference.** Sport is read from explicit configuration, never guessed.
- **No cross-sport coupling.** Adding a sport must not require editing another sport's module or the engine.
- **Public contract stability.** Existing public/broadcast payloads remain valid; multi-sport payloads are additive and versioned.

## 9. Resolved questions (decision log)

All open questions are resolved as of 2026-09-13. These decisions are binding for the phases named.

| # | Question | Decision | Applies from | Owner |
| --- | --- | --- | --- | --- |
| Q1 | Football/cricket fixture-generation scope | Phase 8 (volleyball pilot) implements **round-robin only** (single and double). Phase 9 adds **knockout** (single elimination) and **group-stage-plus-knockout**. All generation sits behind one `FixtureGenerator` interface with modes `ROUND_ROBIN`, `KNOCKOUT`, `GROUP_STAGE`. No football/cricket schedule formats before Phase 9. | Phase 8 | Engineering Lead |
| Q2 | Tennis competition shape | First tennis competition is a **round-robin league table** (singles and doubles), best-of-3 sets with best-of-5 configurable for finals. Singles use `INDIVIDUAL` Entrants, doubles use `PAIR`. **Single-elimination bracket** is a follow-on Phase 9 structure, not part of the first tennis definition. | Phase 9 | Engineering Lead |
| Q3 | Cricket ball-by-ball granularity | Store a **ball-by-ball ledger** as `GameEvent` rows with `typeKey` + `data` (runs off bat, extra type, dismissal, batter, bowler). Retain dot balls (they affect balls faced and economy). Materialize `OverSummary` and `InningsSummary` projections for performance and net run rate. Warn above 1,000 events per game. | Phase 9 | Engineering Lead |
| Q4 | Volleyball standings basis | **Match points are primary**: 3–0 and 3–1 wins = 3; 3–2 win = 2; 3–2 loss = 1; other loss = 0. Tiebreak by **set ratio**, then **point ratio**. Stored as `Standing.leaguePoints` plus `StandingMetric` rows for sets and points. | Phase 8 | Engineering Lead |
| Q5 | Deprecated definition-version retention | Published sport definition versions are **immutable**; changes create a new version. A version referenced by any snapshotted game is retained **indefinitely**. Unreferenced superseded versions are retained **24 months**, then archived to cold storage; never hard-deleted. | Phase 1 | Engineering Lead |

Rationale summary:

- **Q1/Q2** minimise new engine surface for the first pilot and reuse the Entrant and standings models immediately; bracket/knockout advancement is deferred to a dedicated structure so it does not complicate the pilot.
- **Q3** delivery-level truth is required for correct individual cricket statistics and net run rate; aggregated-only storage cannot recover it.
- **Q4** adopts the standard international match-points model, which maps cleanly onto the generic standings model.
- **Q5** guarantees historical games stay explicable while bounding storage growth.

## 10. Risks

- **Scope creep into the engine.** Mitigation: the capability matrix is the contract; nothing enters the engine that is not a reusable capability.
- **Migration blast radius.** Mitigation: additive-only, per-stage backups, dual-read, parity tests.
- **Stat double-truth.** Mitigation: the ledger is the source of truth for native games; the projection is a cache with provenance.
- **UI drift per sport.** Mitigation: capability-gated single shell, one design system.
- **Season Zero regression.** Mitigation: parity tests gate every stage; legacy columns persist until sign-off.

## 11. What this document is not

- It is not permission to start schema work; that begins after acceptance.
- It is not a UI specification.
- It is not a commitment to a single sport's exact competition format; formats are confirmed in the roadmap's pilot phase.

## 12. Acceptance criteria for this document

All criteria were met on 2026-09-13, granting Gate G0. This document is the **single agreed reference**.

| # | Criterion | Status |
| --- | --- | --- |
| 1 | D1, D2, and D3 confirmed as fixed | Met — 2026-09-13 |
| 2 | Target model in Section 5 reviewed and accepted | Met — 2026-09-13 |
| 3 | Capability matrix in Section 6 signed off (basketball, volleyball, plus football, cricket, and tennis) | Met — 2026-09-13 |
| 4 | Migration sequence in Section 7 accepted as the delivery order | Met — 2026-09-13 |
| 5 | Open questions resolved with owners (Section 9) | Met — 2026-09-13 |

Changes to D1–D3 require re-acceptance (a new Gate G0 review) before dependent phases continue. All other changes follow the change control in `documentation/MULTI_SPORT_ROADMAP.md`. Implementation proceeds only through the additive stages in Section 7.
