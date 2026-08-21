# Runbook: Live Data Staleness Recovery

G.20, Part VI-VII, XXXVI, XXXVIII-XXXIX. What "stale" means here, and what to do about it.

## The freshness model

Defined in `src/lib/system-health.ts`, calibrated against the two real polling cadences that
exist in this codebase — public `/live` polls every 8s, every browser-source graphic polls every
3-5s (see `BROWSER_SOURCE_SETUP.md`). These are the only real signals available to calibrate
against, not arbitrary round numbers.

| State | Snapshot (event ledger) age, while LIVE with clock running |
|---|---|
| FRESH | ≤ 30s |
| DELAYED | 30-120s |
| STALE | > 120s |

**Critically**: this only applies while the game is actually expected to be producing updates.
A PAUSED, NOT_STARTED, or FINAL game reports `NOT_APPLICABLE`, never a false STALE alarm (Part
VII: "do not infer outage solely because no scoring event occurred... use actual signals" — here,
the clock-running state itself).

## Recognizing staleness as an operator

- **Diagnostics page**: the Snapshot row shows the freshness state directly.
- **Public `/live`**: currently shows the last-known score/state without a staleness indicator of
  its own (Part XXXVIII notes this as a real gap — see "Known limitation" below). If you suspect
  staleness, check `/broadcast/diagnostics` directly rather than trusting the public page's
  silence as proof everything is fine.
- **Browser sources**: same limitation — a graphic keeps showing its last successfully-fetched
  state. This is the deliberate, documented failure mode (Part XXXIX: "retain last-known state +
  stale indicator, or hide - do not switch to fake zero values"). This track chose **retain
  last-known state**; a visible staleness badge on the graphics themselves was not built this
  track (see Known limitation).

## What actually causes staleness

The event ledger stops advancing. Real causes: the statistician's console isn't being actively
used (only the scorer is scoring, no `game:record-stats` events are landing), a network issue on
the statistician's device, or a genuinely quiet defensive stretch (not a fault at all — this is
exactly why the threshold gives 120s of margin before CRITICAL).

## Recovery

There is no "recovery action" for staleness itself — it isn't a broken system, it's an accurate
report that the event ledger hasn't moved. Recovery means getting the statistician recording
events again. Once a new event lands, Snapshot health returns to FRESH on the very next
diagnostics read — no manual reset needed anywhere.

## Known limitation

Part XXXVIII/XXXIX asked for a visible "LIVE DATA DELAYED" indicator directly on the public
`/live` page and on browser-source graphics themselves, distinct from the internal diagnostics
page. This track built the underlying freshness *model* and surfaced it on `/broadcast/diagnostics`
and the `/gameday` health strip (both internal, authenticated surfaces) but did not extend it to
the public-facing pages/graphics themselves — deferred, not silently dropped. See the G.20 final
report's "Deferred" section for the reasoning (avoiding a rushed, under-tested public-facing UI
change late in an already large track).
