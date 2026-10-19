---
title: Architecture Documentation
status: Active
version: docs-1.0
last_updated: 2026-10-20
---

# Architecture

This folder documents the system's architecture, deployment topology, data flows, integration boundaries, and the
major design decisions behind them. Diagrams live in `../diagrams/`; Mermaid is preferred for anything new.

## Start here

| Document | What it answers |
| --- | --- |
| [`MULTI_SPORT_ARCHITECTURE.md`](./MULTI_SPORT_ARCHITECTURE.md) | The agreed multi-sport engine: definitions, entrants, scoring modules, standings, and which sports are implemented. The single reference — the roadmap defers to it. |
| [`STAGING_RELEASE_COMMIT_PLAN.md`](./STAGING_RELEASE_COMMIT_PLAN.md) | How a release reaches staging, in what order, and what must be true at each step. |
| [`HANDOVER_STAGE5_2D_IN_PROGRESS.md`](./HANDOVER_STAGE5_2D_IN_PROGRESS.md) | The in-flight state of Stage 5.2D (public API read tenancy) and what the next agent needs before touching it. |

## Phase 1 · multi-tenancy (Stage 5)

These are the working documents from the tenancy programme. They were written stage by stage and are the record of
*why* the current tenant-scoping rules look the way they do — including the RLS fallback and its removal.

| Stage | Document | Scope |
| --- | --- | --- |
| 5.2A | [`PHASE1_STAGE5_2A_TENANCY_SCAN.md`](./PHASE1_STAGE5_2A_TENANCY_SCAN.md) | The scan of every read/write path before any scoping was added. |
| 5.2B-1 | [`PHASE1_STAGE5_2B1_PUBLIC_TENANT_ACQUISITION.md`](./PHASE1_STAGE5_2B1_PUBLIC_TENANT_ACQUISITION.md) | How a public request acquires an organization. |
| 5.2B-2 | [`PHASE1_STAGE5_2B2_LEAGUE_STRUCTURE_ADMINISTRATION.md`](./PHASE1_STAGE5_2B2_LEAGUE_STRUCTURE_ADMINISTRATION.md) | Admin surfaces for league structure. |
| 5.2B-3 | [`PHASE1_STAGE5_2B3_DRAFT_TRYOUT_COACH_TENANCY.md`](./PHASE1_STAGE5_2B3_DRAFT_TRYOUT_COACH_TENANCY.md) | Draft, tryout and coach flows. |
| 5.2B-4 | [`PHASE1_STAGE5_2B4_VENDOR_EVENT_RESERVATION_TENANCY.md`](./PHASE1_STAGE5_2B4_VENDOR_EVENT_RESERVATION_TENANCY.md) | Vendors, events and reservations. |
| 5.2C | [`PHASE1_STAGE5_2C_ANALYTICS_VISION_DATA_READ_TENANCY.md`](./PHASE1_STAGE5_2C_ANALYTICS_VISION_DATA_READ_TENANCY.md) | Analytics and vision read paths. |
| 5.2D | [`PHASE1_STAGE5_2D_PUBLIC_API_READ_TENANCY.md`](./PHASE1_STAGE5_2D_PUBLIC_API_READ_TENANCY.md) | Public API read tenancy. |
| 5.4A | [`PHASE1_STAGE5_4A_TENANT_SCOPED_PUBLIC_IDS.md`](./PHASE1_STAGE5_4A_TENANT_SCOPED_PUBLIC_IDS.md) | Tenant-scoped public identifiers. |
| 5.4B | [`PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md`](./PHASE1_STAGE5_4B_RELATIONAL_INTEGRITY.md) | Composite foreign keys and relational integrity. |
| 5.5A | [`PHASE1_STAGE5_5A_GLOBAL_TENANT_BOOTSTRAP_LOCATOR.md`](./PHASE1_STAGE5_5A_GLOBAL_TENANT_BOOTSTRAP_LOCATOR.md) | The global bootstrap locator. |
| 5.5B | [`PHASE1_STAGE5_5B_EXPLICIT_CONTEXT_CERTIFICATION.md`](./PHASE1_STAGE5_5B_EXPLICIT_CONTEXT_CERTIFICATION.md) | Certification that every call site sets context explicitly. |
| 5.5 | [`PHASE1_STAGE5_5_TENANT_BOOTSTRAP_RLS_FALLBACK_ELIMINATION.md`](./PHASE1_STAGE5_5_TENANT_BOOTSTRAP_RLS_FALLBACK_ELIMINATION.md) | Removing the RLS fallback — the end state the rest of the programme was working towards. |

Operational patterns that came out of this work (the tenant-table checklist, the app-role verification) live in
[`../../docs/patterns/tenant-database-migrations.md`](../../docs/patterns/tenant-database-migrations.md).
