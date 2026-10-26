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

Applying the engine migrations and backfills to staging is governed by `documentation/architecture/MULTI_SPORT_STAGING_MIGRATION_BACKFILL_RUNBOOK.md` (planning only until approved).

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
| G2 | Entrant backfill parity proven (Stage 2) | `Done` | Verified on staging 2026-09-15 (8 entrants); production pending. |
| G3 | Stat projection parity proven (Stage 3) | `Done` | Verified on staging 2026-09-15 (2,200 values, 0 mismatches); production pending. |
| G4 | Volleyball pilot accepted (Stage 8) | `Done` | Staging pilot: 4 clubs, 6 fixtures, results + set-based standings; capture UI still basketball (S6.3). |
| G5 | Second additional sport accepted (Stage 9) | `In review` | **Football is now implemented end to end (streak v10)**: definition + `FOOTBALL_GOALS` module, capture console with Timer and goal/card buttons, W/D/L standings at 3/1/0, a `DRAW` finalisation so a level match is a real result (verified 1-1 on staging, 1 point each), `CARD_ISSUED` on the partner feed with player and colour, and football in the bulk export. The selection layer that replaces the caveat is the same one described below. **Streak v15:** the pool ceiling is fixed at the layer that ignored it (the pg adapter takes `max`, not a query-string `connection_limit`): 40 simultaneous writes now complete 40/40 in 1.9 s, with the measured numbers for 30 vs 40 slots and a 15 s transaction budget. Tennis was played to completion (107 rallies, 107 score deliveries, exactly one winner column) and exposed a broken individual-sport standings write. A five-step onboarding wizard creates a league - org, competition, season, participants and fixtures - in one transaction. Confirmed vision observations are cut into playable highlight clips with ffmpeg. **Streak v14:** concurrency is measured rather than asserted - five sports scored at once in one organization, 40 writes, 40 win-probability deliveries, per-sport standings, and a documented connection-pool ceiling (27 of 40 simultaneous writes rejected; 8 in flight completes in ~1.1 s). The stress test also found that rally-point sports (tennis) emitted no feed events at all. **Streak v13:** the sportsbook story became real: historical **Elo** ratings (with a margin-of-victory multiplier and home advantage) are computed per sport, stored in a tenant-isolated table, shown on the public club and tournament pages, and feed the win-probability PRIOR state - returning "unknown" rather than 1500 for an unrated team. The vision service also gained its detector (YOLOv8n + ByteTrack) and a training-session bridge, and partners got an integration dashboard at /partner/dashboard. **Streak v12:** the gap between "supports eight sports" and "can be trusted with each one" closed a little: the cricket chase is verified end to end (and a silent boundary-scoring bug fixed), flag race gained a stopwatch console and a time-ordered race table (its standings are a race leaderboard, not a W/L table of zeroes), and a named win-probability model now rides the data feed for the sportsbook use case. Fan MVP voting landed on the match centre with the full tenant checklist. **Streak v11:** baseball (9 innings, `BASEBALL_RUNS`) and flag race (heats/final, registered but deliberately not scorable - races are timed) joined the registry, and the scorebug problem was solved properly: `/broadcast/game/[gameId]/generic-scorebug` renders any sport with sport-appropriate labels, so the product no longer 404s a broadcast graphic for a football or tennis match. `/embed/live/[orgSlug]/[fixtureId]` gives partners a public 420x128 iframe with an Embed Code button in the capture console - the distribution half of "multi-sport data provider". **Also in v10:** `/operations/matchday` lists every LIVE fixture regardless of sport with its console link (verified with basketball, tennis and volleyball live at once), and the last non-null `homeSeasonClub!` assumptions in the UI were replaced by `fixtureSide()`. **Streak v6 added the parts that were missing:** a tennis CAPTURE CONSOLE (deuce/advantage banner, end-match/retirement, every point an event through the same `applyScoringDelivery` the action runs - verified with a 72-point match on staging), PUBLIC tennis standings (played/W/L, sets W-L, set %, games W-L, game % - games summed from per-set scores, ranked by the engine) and a knockout bracket view. Volleyball now has a CSV ingestion path too (28 metric rows, standings 3-1, 11 catalog definitions). **Streak v7 closed two of those gaps:** the scoring path now resolves rules from the frozen `GameRuleSnapshot` -> season `RuleSet` -> definition, so `SETS_TO_WIN=2` really does end a match at two sets (verified 2-1 through the console code, and `GAMES_PER_SET` is a declared rule now instead of a silently ignored structure field); and the review queue renders **definition-driven columns**, so a volleyball CSV can be uploaded, reviewed, approved and ingested into `GameMetricValue` rows (verified: 28 rows, 0 skipped, real authenticated page render at 200 with Kills/Aces and no REB column). Still open: the bracket is rendered from `Fixture.round` because no `BracketNode` component exists, and the review UI has only basketball + volleyball templates so far. **Streak v9** made the API and the public surfaces sport-agnostic: every `/api/v1` game route, `/api/v1/live` and the public snapshot now format a side through one `apiTeam()` helper (a club OR an entrant), which fixed three separate 500s on individual-sport fixtures; the keyed export returns clubs and entrants through the same helper; and the Team DNA card's provenance badge is derived from the games instead of a hardcoded BOX_SCORE_ONLY. **Streak v8** finished the label half of the rule-set work (the live console header now resolves the same snapshot -> RuleSet precedence as the engine, so a best-of-3 fixture no longer reads "Best of 5") and made the athlete passport multi-sport: it aggregates `GameMetricValue` by the metric definition's sport into a By-sport section and merges metric-only games into the timeline, so a volleyball player's kills/aces/blocks and their matches are visible instead of an empty basketball block. **Tennis pilot run 2026-10-18 (streak v5, Prompt 3)**: 4 INDIVIDUAL entrants, best-of-3 (SETS_TO_WIN=2 rule set), 6 round-robin matches scored point by point through `tennis-scoring.ts`, entrant-vs-entrant fixtures with `null` season clubs, one `GamePeriodScore` per set, and standings ranked by wins → set ratio → game ratio with head-to-head deciding ties. Public sub-site `/t/<slug>` renders the tennis competition and its INDIVIDUAL entrant rows (verified in the default public org). **Not done:** the capture console has no tennis mode, there is no computed tennis standings page, and best-of-3 needs the rule override because the definition defaults to best-of-5. Detail: `MULTI_SPORT_PILOT.md`. No basketball assumption broke - the gaps are missing wiring, not model conflicts. |
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

Environment status: the multi-sport migrations (Stages 1.3–7) were **applied to staging and
production on 2026-09-15**, the backfills were run on both, and every parity check reported
`PARITY OK` (Entrant 8; metrics 2,200; rules 0 rows; standings 8 basketball + 4 volleyball pilot;
events 9; registration forms). The GIESM 2026 volleyball registration is live at `/giesm` on both
environments. Backups: staging `/opt/ultraos-staging/backups/multisport_giesm_premigration_20260915T063015Z.dump`;
production `/var/backups/ultraleagueos/multisport_giesm_premigration_20260915T095941Z.dump`.

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
| S2.3 | Backfill | One TEAM Entrant per SeasonClub | 2 | `Done` | S2.2 | Run on staging 2026-09-15: 8 entrants + 36/9/8/24 refs |
| S2.4 | Verification | Entrant parity evidence | 2 | `Done` | S2.3 | Staging `entrant:parity-check` PARITY OK |
| S3.1 | Schema | `SportMetricDefinition`, `GameMetricValue` | 3 | `Done` | G2 | Migration authored (not applied); catalog global, values tenant-owned |
| S3.2 | Domain | Basketball metric definitions | 3 | `Done` | S3.1 | In registry; sync script materializes catalog |
| S3.3 | Projection | `PlayerStat`/`TeamStat` compatibility projection | 3 | `Done` | S3.2 | Staging: 2,080 player + 120 entrant values (batched) |
| S3.4 | Verification | Stat parity across real games | 3 | `Done` | S3.3 | Staging `metrics:parity-check` PARITY OK (2,200 values) |
| S4.1 | Schema | Rules `sportId` + `RuleValue`/`config` | 4 | `Done` | G3 | Migration authored (not applied); `rule-values.ts` + tests |
| S4.2 | Schema | Snapshot JSON on `GameRuleSnapshot` | 4 | `Done` | S4.1 | `sportId`/`definitionVersion`/`ruleValues` added |
| S4.3 | Backfill | Map existing `RuleSet` rows | 4 | `Done` | S4.1 | Staging: no RuleSet/snapshot rows (nothing to migrate) |
| S5.1 | Schema | Standings outcomes + `StandingMetric` + Entrant FK | 5 | `Done` | G3 | Migration authored (not applied); entrantId added in Stage 2 |
| S5.2 | Domain | `StandingsEngine` + per-sport strategy | 5 | `Done` | S5.1 | `standings.ts` + tests (football/volleyball/cricket) |
| S5.3 | Verification | Basketball standings parity | 5 | `Done` | S5.2 | Staging backfill + `standings:parity-check` PARITY OK (8) |
| S6.1 | Schema | `typeKey` + `data` on `GameEvent` | 6 | `Done` | G2 | Migration authored (not applied); `event-catalog.ts` + tests |
| S6.2 | Catalog | `SportEventDefinition` per sport | 6 | `Done` | S6.1 | Registry events + catalog sync script |
| S6.3 | UI | Scorer renders from catalog | 6 | `Not started` | S6.2 | Catalog available; scorer console migration pending |
| S7.1 | Schema | Registration `sportId` FKs | 7 | `Done` | G2 | Migration authored (not applied); `sportId` FK + `sportIds` mirror |
| S7.2 | Backfill | Map `RegistrationSport` enum to `Sport` | 7 | `Done` | S7.1 | Staging: 2 forms mapped; `registration-sport:parity-check` PARITY OK |
| S7.3 | Domain | Definition-driven `SportConfig` | 7 | `In progress` | S7.1 | `configuredSports` bridge shipped; config schema generalization deferred |
| S8.1 | Definition | Volleyball definition module | 8 | `Done` | G1–G3, P6, P7 | Rules, capture plan, sport-aware standings |
| S8.2 | Product | Volleyball competition end-to-end | 8 | `Done` | S8.1 | Staging pilot created; standings validated via parity check. Scorer console UI migration remains (S6.3) |
| S9.1 | Definition | Football definition | 9 | `Done` | G4 | Definition + rules; draws/GD standings covered by tests |
| S9.2 | Definition | Cricket definition | 9 | `Done` | G4 | Definition + rules; ball-by-ball ledger + NRR covered by tests |
| S9.3 | Definition | Tennis definition | 9 | `Done` | G4 | INDIVIDUAL/PAIR; round-robin first; set-ratio standings covered |
| S9.4 | Domain | Fixture generator (round-robin / knockout / group-stage) | 9 | `Done` | S9.1 | `fixtures.ts` + tests (Q1 formats) |
| S10.1 | Cleanup | Retire compatibility projection | 10 | `Deferred` | G3–G5 | Plan: `architecture/STAGE10_LEGACY_DECOMMISSION_PLAN.md`; gates unmet |
| S10.2 | Cleanup | Retire legacy event/rule columns | 10 | `Deferred` | G6 | Irreversible; backup + audit first (plan doc) |

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
