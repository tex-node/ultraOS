---
title: FIBA Benchmark
status: Active
version: benchmark-1.0
last_updated: 2026-09-13
---

# FIBA Benchmark

## 1. Purpose

This document benchmarks an external, FIBA Organizer-derived multi-sport plan (produced by a separate agent) against UltraLeagueOS's accepted architecture and roadmaps. It records what to adopt, what to reject, and the concrete changes made to our plan as a result.

It is a supporting document, not an authority. `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md` remains the single agreed reference.

## 2. What FIBA Organizer and FIBA LiveStats actually are

Sourced from FIBA and its vendor (Genius Sports / SportingPulse / GameDay):

- **FIBA Organizer** — a browser-based competition management platform: schedules, results, standings, season and historical statistics, and a membership database of clubs, players, coaches, referees, and venues. It also provides unique player IDs that track players across their careers, transfer/tribunal management, single registration across multiple events, reporting, and a built-in website. ([FIBA competition management](https://about.fiba.basketball/en/services/data-and-video-solutions/competition-management), [fibaorganizer.com](https://www.fibaorganizer.com/))
- **FIBA LiveStats** — a Windows-laptop statistics application used by official FIBA competitions. It records FIBA Statistics Manual statistics point-and-click, and produces box score, play-by-play, shot charts, plus-minus, start/rotation/combination summaries, and a printable official scoresheet. It has in-venue TV-graphics and scoreboard feeds, a responsive Match Centre in 25+ languages, and API/XML export. Integration with Organizer is via **import/export**, not a live write API. ([FIBA LiveStats](https://about.fiba.basketball/en/services/data-and-video-solutions/fiba-live-stats))

Key takeaway: "integrate with FIBA LiveStats" means **file/XML import-export**, not a live API. UltraLeagueOS has already begun this path with FIBA box-score import.

## 3. Alignment with our plan

The external plan is directionally close to ours. Its north star (a sport-agnostic core with sport-specific modules) matches our capability-module and sport-definition model.

| External plan | UltraLeagueOS equivalent | Verdict |
| --- | --- | --- |
| Agnostic core + per-sport modules | Capability modules + `SportDefinition` | Aligned |
| Immutable event log + derived read models | `GameEvent` ledger + metric projections | Aligned (ours is richer) |
| Config over code; per-sport event types | Code registry + `SportEventDefinition` catalog | Aligned |
| Pluggable validators; validate at entry | Not yet modelled | **Adopt** |
| Offline-first scorer | Product roadmap P4.6 / P7.1 | Aligned (gap to close) |
| Live feed, API, webhooks | Public API + broadcast; webhooks new | Aligned; add webhooks |
| Basketball as reference implementation | Season Zero | Aligned |
| Phased sport expansion | Engine Stages 8-9 | Broadly aligned |

## 4. Divergences, risks, and corrections

1. **Greenfield framing.** The plan recommends React Native + NestJS/FastAPI + Redis + Kubernetes + Supabase + Turborepo, i.e. a re-platform. Rejected. Our stack (Next.js 16, Prisma 7, PostgreSQL + RLS, NextAuth, existing broadcast/API, self-hosted) already delivers most of it. A tablet-focused PWA plus a local queue achieves offline without a native rewrite.
2. **Multi-tenancy absent.** No org isolation, RLS, or composite FKs, despite the plan later selling multi-tenant SaaS as a Milestone 5 feature. Tenancy is already our foundation and a prerequisite for serving multiple federations.
3. **No Entrant abstraction.** The plan's match model holds two teams. Individual sports (tennis singles/doubles) break it. Our Entrant abstraction (team/individual/pair/relay) already resolves this.
4. **Thinner event model.** The plan's `{ type, actorId, timestamp, payload }` omits team attribution, period/clock, sequence ordering, correction/void/supersession, and provenance — all required for official statistics and corrections (FIBA's own "actions under review").
5. **"No changes to the core engine" is overstated.** Cricket innings/overs, tennis point→game→set progression, DLS, and best-of-sets win conditions are new engine capabilities, not configuration. Our capability-module model states this honestly.
6. **Unrealistic validators.** Football offside and cricket DLS targets cannot be validated from rules alone without spatial tracking/video. They must be advisory and deferred, never enforced.
7. **Timeline ignores our baseline.** The plan's first two milestones (basketball MVP and production parity) are largely already built here: live scoring, standings, public match centre, broadcast, FIBA import.
8. **Missing product areas.** Registration/intake, scheduling conflict handling, event and commerce operations, content engine, media, and vision governance are absent from the plan but core to us.

## 5. FIBA parity checklist (basketball)

A verification checklist for basketball feature parity with the FIBA toolset. Status is relative to the current UltraLeagueOS baseline.

| Capability | FIBA source | Our status |
| --- | --- | --- |
| Membership database (clubs, players, coaches, referees, venues) | Organizer | Have |
| Competition/schedule/result/standings management | Organizer | Have |
| Season, competition, and historical statistics | Organizer | Have (career view partial) |
| Unique player identity across careers (Ultra Athlete ID) | Organizer | Have |
| Transfers / tribunal | Organizer | Missing (deferred) |
| Single registration across multiple events | Organizer | Partial |
| Built-in public website / match centre | Both | Have (public pages) |
| Live statistics capture | LiveStats | Have |
| Box score | LiveStats | Have |
| Play-by-play | LiveStats | Have |
| Shot charts | LiveStats | Partial (fields exist; sparse capture) |
| Plus-minus, rotation, combination summaries | LiveStats | Partial |
| Official scoresheet PDF | LiveStats | Gap (verify/complete) |
| "Actions under review" correction workflow | LiveStats | Model have; UX partial |
| Substitution holding-bay UX | LiveStats | Missing (adopt in P4) |
| TV-graphics and scoreboard feeds | LiveStats | Have (broadcast) |
| API and XML export | LiveStats | API have; XML export gap |
| Webcast/Match Centre multilingual (25+) | LiveStats | Partial (i18n deferred) |

This checklist becomes an explicit basketball acceptance gate in the product roadmap.

## 6. Decisions taken from this benchmark

Adopt:

- Add an explicit **validation/constraints** concept to `SportDefinition` and a validator registry (engine Stage 1, item S1.6).
- Add **offline capture queue** (already P4.6) and **SSE/WebSocket + webhooks** as explicit distribution work.
- Add **"actions under review"** and **substitution holding-bay** UX to match capture (P4).
- Add the **FIBA parity checklist** as a basketball acceptance gate (product roadmap).
- Record explicitly that standings are **fixture-result projections**, not pure event-replay projections, so the model is not misunderstood.

Reject or defer:

- Wholesale re-platform; early native mobile apps; Kubernetes/multi-region; community module marketplace; AI referee enforcement; offside/DLS enforcement; a 24-month greenfield timeline.

## 7. Relationship to our documents

- `documentation/architecture/MULTI_SPORT_ARCHITECTURE.md` — single agreed reference; Section 5.11 (validation) and Section 6 reflect this benchmark.
- `documentation/MULTI_SPORT_ROADMAP.md` — engine Stage 1 (S1.6) and distribution work.
- `documentation/PRODUCT_ROADMAP.md` — P4 capture UX and the FIBA parity gate.
