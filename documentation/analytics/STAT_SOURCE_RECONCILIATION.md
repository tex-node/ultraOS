# Stat Source Reconciliation

How `StatDataSource` provenance works today, and the honest state of import-vs-live
reconciliation after Track G.15.

## The `StatDataSource` enum (`prisma/schema.prisma`)

| Value | Used by | Status |
|---|---|---|
| `ULTRA_NATIVE_LIVE_SCORER` | Scorer console (`recordScore`, `recordStatEvent`, corrections) | Active since Track H. |
| `ULTRA_NATIVE_LIVE_STATISTICIAN` | Statistician console (`recordStatisticianShot`, `recordStatisticianStat`, `recordSubstitution`) | **New in G.15.** |
| `EVENT_DERIVED` | `rebuildGameStatsFromEvents()` — stamped on the `PlayerStat`/`TeamStat` rows it materializes | **New in G.16.** Distinct from `ULTRA_NATIVE_LIVE_STATISTICIAN` (which tags the raw events) — this tags a *derived, verified snapshot* built from them. |
| `FIBA_LIVESTATS_PDF_IMPORT` | `src/lib/game-result-import.ts` | Active — all 11 real Season Zero games. |
| `GENIUS_SPORTS_IMPORT` | — | Declared, never exercised by any code path. |
| `MANUAL_ADMIN_ENTRY` | — | Declared, never exercised. |
| `CSV_IMPORT` | — | Declared, never exercised. |
| `EXTERNAL_PROVIDER` | — | Declared, never exercised. |

Provenance is tracked at two granularities: `Game.statSource` (whole-game category) and
`GameEvent.source` (per-event — lets one otherwise-native game contain, say, one manually
corrected event without mislabeling the whole game).

## What G.15 reconciles: scorer vs. statistician (live vs. live)

Both are live, native sources for the *same* game, operated independently and in real time. See
[`LIVE_SCORE_STAT_RECONCILIATION.md`](../gameday/LIVE_SCORE_STAT_RECONCILIATION.md) for the full
mechanics. This was the P0 priority for this track — comparing two simultaneous, independent
inputs is the safety-critical case (a wrong live number can mislead the broadcast/public in real
time), and reuses the existing `replayScore()` invariant rather than inventing new math.

## What G.15 did not build: native vs. import (live vs. after-the-fact)

The G.15 brief (Part XXV) also asked for reconciliation between a game's **live-captured**
events and a **later official PDF import** of the same game — e.g. a statistician records a
player at 12 points/5 rebounds live, and the official post-game FIBA report says 12/6. This is a
genuinely different problem: it compares two *sequential*, not simultaneous, sources, needs a
UI for surfacing per-player/per-team differences after the fact, and needs a decision path for
which source becomes canonical without silently discarding the other's provenance.

This was explicitly deferred rather than half-built, per the track's own priority ordering
(P0: live capture and cross-console reconciliation, before P1/P2 polish) and its instruction not
to spend disproportionate effort on secondary features while primary ones remain unwired. Both
data sources already exist and are fully preserved with distinct provenance
(`ULTRA_NATIVE_LIVE_SCORER`/`ULTRA_NATIVE_LIVE_STATISTICIAN` vs. `FIBA_LIVESTATS_PDF_IMPORT`) —
nothing is silently overwritten today, because no code path currently lets a PDF import
overwrite a native game's data or vice versa (`game-result-import.ts` upserts by `fixtureId`
independent of any existing `GameEvent` ledger). Building the *comparison and reconciliation UI*
for this scenario is a clearly scoped follow-up, not an open safety risk in the meantime.

## Never destroyed

Consistent with Part I.4-I.6 of the G.15 brief: no code path in this system ever deletes a
`GameEvent` row or a `PlayerStat`/`TeamStat` row to make room for another source's numbers.
Corrections supersede (`status: CORRECTED` + a new event), voids mark (`status: VOIDED`), and
imports upsert additively. This invariant is what makes the deferred import-reconciliation work
safe to build later — the source data it would need is already being preserved today.
