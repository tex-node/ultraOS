---
title: Multi-Sport Roadmap
status: Active
version: multi-sport-1.0
last_updated: 2026-09-13
---

# Multi-Sport Roadmap

## 1. How to use this roadmap

This roadmap guides delivery of the multi-sport architecture defined in `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`. That architecture document is the single agreed reference; this roadmap is the delivery plan and progress tracker.

For the user-facing product plan (onboarding, scheduling, capture, and statistics presentation), see `documentation/PRODUCT_ROADMAP.md`. The two roadmaps must stay aligned: product phases depend on engine stages, and the architecture document wins on any conflict.

- One phase maps to one architecture migration stage where practical.
- A phase starts only when its **entry gate** is met.
- A phase is `Done` only when its **exit criteria** are verified (tests, parity checks, documented evidence), not when code is written.
- Update the tracker as work happens; do not batch status changes.

## 2. Status legend

| Status | Meaning |
| --- | --- |
| `Not started` | No work begun. |
| `In progress` | Actively being worked. |
| `Blocked` | Cannot proceed; blocker named in Notes. |
| `In review` | Work complete, awaiting verification or acceptance. |
| `Done` | Exit criteria verified and evidenced. |
| `Deferred` | Intentionally postponed; reason recorded. |

## 3. Decision gates

| Gate | Decision | Status | Notes |
| --- | --- | --- | --- |
| G0 | Architecture doc accepted as single agreed reference | `Done` | Accepted 2026-09-13; all five acceptance criteria met. |
| G1 | Basketball definition parity proven (Stage 1) | `Done` | Stage 1 complete: registry, definitions, validators, overrides, consumed by onboarding. |
| G2 | Entrant backfill parity proven (Stage 2) | `Not started` | One TEAM Entrant per SeasonClub. |
| G3 | Stat projection parity proven (Stage 3) | `Not started` | Legacy stat reads byte-for-byte identical. |
| G4 | Volleyball pilot accepted (Stage 8) | `Not started` | Full competition runs from definition alone. |
| G5 | Second additional sport accepted (Stage 9) | `Not started` | Proves the engine generalizes. |
| G6 | Legacy basketball columns retired (Stage 10) | `Not started` | Only after G3, G4, G5 and Season Zero sign-off. |

## 4. Phases

### Phase 0 — Architecture acceptance

- **Entry:** root-doc cleanup complete; Season Zero not disrupted.
- **Deliverables:** accepted `MULTI_SPORT_ARCHITECTURE.md`; this roadmap.
- **Exit:** G0 met — all five acceptance criteria satisfied, open questions owned.
- **No code, no schema.**

### Phase 1 — Sport catalog and definition registry (Stage 1)

- **Entry:** G0.
- **Deliverables:** `web/src/lib/sports/` registry; basketball definition module; validator registry and `SportConstraint` handling; `SportDefinitionOverride` model + RLS + composite FKs; resolution function used by all future consumers.
- **Exit:** G1 — resolving basketball through the registry reproduces every existing rule value and capability flag.
- **Backfill:** none (registry only); optional override rows.

### Phase 2 — Entrant abstraction (Stage 2)

- **Entry:** G1.
- **Deliverables:** `Entrant`, `EntrantMember`; nullable `entrantId` on `Fixture`, `GameEvent`, `Standing`, `TeamStat`; backfill one TEAM Entrant per `SeasonClub`; entrant-side resolution helper.
- **Exit:** G2 — basketball fixtures, games, standings, and team stats resolve via Entrants with identical output; individual-sport Entrant supports `INDIVIDUAL`/`PAIR`.
- **Backfill script:** idempotent, one Entrant per SeasonClub.

### Phase 3 — Generic statistics (Stage 3)

- **Entry:** G2.
- **Deliverables:** `SportMetricDefinition`, `GameMetricValue`; basketball metric definitions; compatibility projection maintaining `PlayerStat`/`TeamStat`; ledger-derived metric computation for `ULTRA_NATIVE_EVENTS` games.
- **Exit:** G3 — projection reproduces legacy stat reads exactly; FIBA import path unaffected.
- **Evidence:** parity tests across a sample of real games.

### Phase 4 — Generalized rules (Stage 4)

- **Entry:** G3.
- **Deliverables:** `sportId` + `RuleValue`/`config` on `RuleSet`; snapshot JSON on `GameRuleSnapshot`; legacy fields retained.
- **Exit:** snapshot round-trips existing games; editing a definition never alters played games.
- **Backfill:** map existing `RuleSet` rows to rule values.

### Phase 5 — Generalized standings (Stage 5)

- **Entry:** G3.
- **Deliverables:** `drawn`/`ties`/`noResult`/`rank`; `StandingMetric`; Entrant FK; `StandingsEngine` with per-sport strategy.
- **Exit:** basketball standings unchanged; football (draws) and volleyball (set ratio) computable in tests.
- **Backfill:** recompute standings from completed games and verify parity.

### Phase 6 — Event vocabulary (Stage 6)

- **Entry:** G2.
- **Deliverables:** `typeKey` + `data` on `GameEvent`; `SportEventDefinition` catalog per sport; scorer renders from catalog; legacy `eventType` mapped.
- **Exit:** basketball scorer behaviour unchanged; volleyball/football/cricket event catalogs defined and unit-tested.
- **Note:** resolve cricket ball-by-ball granularity before this phase.

### Phase 7 — Registration sport unification (Stage 7)

- **Entry:** G2.
- **Deliverables:** `sportId` FKs on registration participant/form config; backfill from `RegistrationSport` enum; definition-driven `SportConfig`.
- **Exit:** the existing Volleyball + Flag Race preset reads from `Sport`; no behaviour change.

### Phase 8 — Volleyball pilot (Stage 8)

- **Entry:** G1–G3, Phase 6, Phase 7.
- **Deliverables:** full volleyball definition; capability-gated UI; competition setup → registration → fixtures → scoring → standings → public pages.
- **Exit:** G4 — a complete volleyball competition is operated end-to-end with no schema change and no basketball-only code paths.

### Phase 9 — Additional sports (Stage 9)

- **Entry:** G4.
- **Deliverables:** football, cricket, tennis definitions; sport-specific optional modules (extra time/penalties, innings/NRR, sets/draws); schedule/bracket strategies confirmed.
- **Exit:** G5 — each sport runs end-to-end from definitions alone; adding a further sport requires only a definition module.

### Phase 10 — Decommission legacy basketball columns (Stage 10)

- **Entry:** G3, G4, G5 and Season Zero sign-off.
- **Deliverables:** retire `PlayerStat`/`TeamStat` compatibility projection and legacy-only `GameEventType`/rule columns after migration to generic equivalents.
- **Exit:** G6 — no legacy-only engine columns remain; historical reads served from generic model + snapshots.

## 5. Progress tracker

| ID | Workstream | Deliverable | Phase | Status | Depends on | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| A0 | Architecture | Multi-sport architecture doc accepted | 0 | `Done` | — | Gate G0 met 2026-09-13 |
| A1 | Architecture | Multi-sport roadmap published | 0 | `Done` | — | This document |
| H1 | Hygiene | Remove unrelated product docs | 0 | `Done` | — | Raivstream + rundown/planner docs removed |
| D1 | Decision | Entrant abstraction confirmed | 0 | `Done` | — | Individual sports supported |
| D2 | Decision | Generic metric model confirmed | 0 | `Done` | — | No per-sport stat tables |
| D3 | Decision | Code registry + DB override confirmed | 0 | `Done` | — | Registry authority |
| S1.1 | Registry | `web/src/lib/sports/` skeleton | 1 | `Done` | G0 | Registry + basketball, volleyball, football, cricket, tennis definitions |
| S1.2 | Registry | Basketball definition module | 1 | `Done` | S1.1 | Parity test vs `ULTRA_RULES`/standings |
| S1.3 | Schema | `SportDefinitionOverride` + RLS + composite FK | 1 | `Done` | G0 | Migration authored (not applied); override UI shipped |
| S1.4 | Resolution | Definition resolver used by consumers | 1 | `Done` | S1.2 | Consumed by the `/competitions` tournament onboarding flow |
| S1.5 | Verification | Basketball parity evidence | 1 | `Done` | S1.2–S1.4 | Unit parity tests + registry consumed by onboarding |
| S1.6 | Validation | Validator registry + `SportConstraint` handling | 1 | `Done` | S1.2 | Registry + basketball/volleyball/football constraints; tests |
| S2.1 | Schema | `Entrant`, `EntrantMember` + RLS | 2 | `Done` | G1 | Migration authored (not applied); domain helpers + tests |
| S2.2 | Schema | Nullable `entrantId` on dependent tables | 2 | `Done` | S2.1 | Fixture (home/away/winner), GameEvent, Standing, TeamStat |
| S2.3 | Backfill | One TEAM Entrant per SeasonClub | 2 | `In progress` | S2.2 | `scripts/entrant-backfill.ts` authored; not run |
| S2.4 | Verification | Entrant parity evidence | 2 | `In progress` | S2.3 | `scripts/entrant-parity-check.ts` authored; not run |
| S3.1 | Schema | `SportMetricDefinition`, `GameMetricValue` | 3 | `Done` | G2 | Migration authored (not applied); catalog global, values tenant-owned |
| S3.2 | Domain | Basketball metric definitions | 3 | `Done` | S3.1 | In registry; sync script materializes catalog |
| S3.3 | Projection | `PlayerStat`/`TeamStat` compatibility projection | 3 | `In progress` | S3.2 | `metric-values.ts` + `game-metric-backfill.ts` authored; not run |
| S3.4 | Verification | Stat parity across real games | 3 | `In progress` | S3.3 | `game-metric-parity-check.ts` authored; not run |
| S4.1 | Schema | Rules `sportId` + `RuleValue`/`config` | 4 | `Done` | G3 | Migration authored (not applied); `rule-values.ts` + tests |
| S4.2 | Schema | Snapshot JSON on `GameRuleSnapshot` | 4 | `Done` | S4.1 | `sportId`/`definitionVersion`/`ruleValues` added |
| S4.3 | Backfill | Map existing `RuleSet` rows | 4 | `In progress` | S4.1 | `ruleset-sport-backfill.ts` authored; not run |
| S5.1 | Schema | Standings outcomes + `StandingMetric` + Entrant FK | 5 | `Done` | G3 | Migration authored (not applied); entrantId added in Stage 2 |
| S5.2 | Domain | `StandingsEngine` + per-sport strategy | 5 | `Done` | S5.1 | `standings.ts` + tests (football/volleyball/cricket) |
| S5.3 | Verification | Basketball standings parity | 5 | `In progress` | S5.2 | Unit parity passes; `standings-parity-check.ts` authored, not run |
| S6.1 | Schema | `typeKey` + `data` on `GameEvent` | 6 | `Not started` | G2 | — |
| S6.2 | Catalog | `SportEventDefinition` per sport | 6 | `Not started` | S6.1 | — |
| S6.3 | UI | Scorer renders from catalog | 6 | `Not started` | S6.2 | Basketball unchanged |
| S7.1 | Schema | Registration `sportId` FKs | 7 | `Not started` | G2 | — |
| S7.2 | Backfill | Map `RegistrationSport` enum to `Sport` | 7 | `Not started` | S7.1 | — |
| S7.3 | Domain | Definition-driven `SportConfig` | 7 | `Not started` | S7.1 | Presets generalize |
| S8.1 | Definition | Volleyball definition module | 8 | `Not started` | G1–G3, P6, P7 | — |
| S8.2 | Product | Volleyball competition end-to-end | 8 | `Not started` | S8.1 | Gate G4 |
| S9.1 | Definition | Football definition | 9 | `Not started` | G4 | — |
| S9.2 | Definition | Cricket definition | 9 | `Not started` | G4 | Ball-by-ball decision first |
| S9.3 | Definition | Tennis definition | 9 | `Not started` | G4 | Bracket vs round-robin |
| S10.1 | Cleanup | Retire compatibility projection | 10 | `Deferred` | G3–G5 | Only after sign-off |
| S10.2 | Cleanup | Retire legacy event/rule columns | 10 | `Deferred` | G6 | Irreversible; backup first |

## 6. Cross-cutting workstreams

These run alongside every phase and are not optional.

| Workstream | Requirement | Evidence |
| --- | --- | --- |
| Tenancy | Every new table has `organizationId`, RLS, composite FKs | Migration review |
| Provenance | Every derived value traces to a ledger event or named source | Provenance tests |
| Testing | Unit + parity + integration tests gate each phase | Test output recorded |
| Data safety | Pre-phase backup; additive-only; rollback rehearsed | Backup log |
| Documentation | Architecture, glossary, and this roadmap updated in the same change | Doc diff |
| Season Zero protection | Basketball parity verified before stage completion | Parity report |
| Public contracts | Existing payloads remain valid; additions are versioned | Contract tests |

## 7. Resolved questions and owners

All questions resolved 2026-09-13. Full decisions and rationale are in `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md`, Section 9.

| # | Question | Decision | Status | Owner |
| --- | --- | --- | --- | --- |
| Q1 | Football/cricket fixture-generation scope | Round-robin in Phase 8; knockout and group-stage in Phase 9; single `FixtureGenerator` interface | `Resolved` | Engineering Lead |
| Q2 | Tennis competition shape | Round-robin league first; single-elimination bracket in Phase 9 | `Resolved` | Engineering Lead |
| Q3 | Cricket ball-by-ball event granularity | Ball-by-ball ledger + innings/over projections | `Resolved` | Engineering Lead |
| Q4 | Volleyball standings basis | Match points primary; tiebreak set ratio, then point ratio | `Resolved` | Engineering Lead |
| Q5 | Deprecated definition-version retention | Immutable versions; referenced retained indefinitely; unreferenced 24 months then archived | `Resolved` | Engineering Lead |

## 8. Change control

- This roadmap may be updated freely as long as the architecture document remains the single agreed reference.
- Changing a decision in the architecture (D1–D3) requires re-acceptance (Gate G0) before dependent phases continue.
- Phase exit criteria may not be weakened; if a criterion cannot be met, record a `Blocked` status with the reason and an owner.
- Every change to this file updates `last_updated` and is committed with the work it describes.
