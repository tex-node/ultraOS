# Offline Scoring Runbook (P13 / Workstream A)

Status: Draft (A0). This runbook is filled in and signed off at Phase A4.

P13 lets a scorekeeper capture a full game with no network: writes land in a local
IndexedDB store and an outbox, then sync through the canonical write path
(`source = OFFLINE_SYNC`) when connectivity returns.

## Feature flag

Offline scoring is gated by `NEXT_PUBLIC_OFFLINE_SCORING_ENABLED`. It defaults to **off**.

- Enable: set `NEXT_PUBLIC_OFFLINE_SCORING_ENABLED="true"` in the environment and rebuild.
- Disable/rollback: remove or set the value to anything other than `true`, then rebuild.

Rollout order is `1 league → 1 region → all` (Phase A4).

## Sections completed in later phases

- **A2** — how the service worker and offline shell behave on a scorekeeper tablet.
- **A3** — how to force a sync and what each sync result status means.
- **A4** — recovery procedures, how to force a full resync, how to inspect IndexedDB in
  the field, the dead-letter queue, and admin sync-health.
