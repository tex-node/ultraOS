# Data capability and provenance

How the app tells the difference between "this stat is a real zero" and "this stat was never
captured," and between "this came from our own live scorer" and "this came from an imported
PDF" - without hundreds of boolean flags.

## NULL means NOT_CAPTURED, 0 means a real zero

Every Ultra-specific stat column added to `PlayerStat`/`TeamStat` (fourPointsMade,
ultraTimePoints, ultraTimeFieldGoalsMade, etc.) is a **nullable** `Int`. There is no separate
`fourPointsMadeCaptured: Boolean` sidecar field - the column's own nullness *is* the
availability signal. This was a deliberate choice (the 45-section spec that produced this work
explicitly asked for "the smallest clean architecture," not a wall of availability booleans).

Concretely:

- A game imported from a FIBA/Genius Sports PDF (`src/lib/game-result-import.ts`) never writes
  any of these columns - standard FIBA box scores have no visibility into 4PT or Ultra Time at
  all, so they correctly stay `null` (NOT_CAPTURED) forever for that game, not `0`.
- A game scored natively through the live scorer (`recordScore`/`recordStatEvent` in
  `src/app/games/actions.ts`) writes real `0`s for these fields the first time any shot touches
  a player's row, because for a natively-scored game every shot category genuinely *is*
  observed - a player with zero 4PT attempts in a fully-tracked game has a real, known zero.
- Fields nothing in the scorer UI captures yet - `assistedFourPointMakes`,
  `unassistedFourPointMakes`, `fourPointQualificationMethod`, shot `x`/`y`/`courtZone` - stay
  `null` even for native games, because they're genuinely not captured (no assist-attribution
  or shot-location UI exists in this phase). Never fabricated to make a stat line "look"
  complete.

## `GameDataCapability`

A single enum on `Game` (`src/lib/game-data-capability.ts` has the shared read-side helpers):
`BOX_SCORE_ONLY` → `PLAY_BY_PLAY` → `ULTRA_NATIVE_EVENTS` → `SHOT_LOCATION` → `VISION_ENRICHED`
(ordered weakest to richest; each level is a strict superset of the previous one's guarantee).

- Set to `ULTRA_NATIVE_EVENTS` when `startGame` creates a brand-new `Game` row (native scoring
  from the first event).
- Left at the schema default `BOX_SCORE_ONLY` for every PDF-imported game - a box score import
  never has 4PT/Ultra Time visibility, so it's never claimed to.
- Callers (API routes, the live scorer UI, broadcast payloads) should call
  `hasUltraStatDerivation(capability)` / `hasEventLedger(capability)` /
  `hasShotLocation(capability)` from `game-data-capability.ts` rather than re-deriving the same
  reasoning ad hoc, and should never infer capability from whether a field happens to be
  non-null (a `BOX_SCORE_ONLY` game and an `ULTRA_NATIVE_EVENTS` game can both have a populated
  `points` column).

## `StatDataSource`

The queryable *category* of where a stat/event came from - `ULTRA_NATIVE_LIVE_SCORER`,
`FIBA_LIVESTATS_PDF_IMPORT`, `GENIUS_SPORTS_IMPORT`, `MANUAL_ADMIN_ENTRY`, `CSV_IMPORT`,
`EXTERNAL_PROVIDER`. Distinct from the pre-existing free-text `Game.resultSource` (which holds
the *specific reference*, e.g. an exact PDF filename) - `statSource` is what you'd filter or
group by, `resultSource` is what you'd show a human for provenance detail.

Set on `Game`, `PlayerStat`, and `TeamStat` by both write paths:
`game-result-import.ts` defaults to `FIBA_LIVESTATS_PDF_IMPORT` (overridable via
`GameResultImportInput.statSource` for a future non-FIBA source), and every native write in
`games/actions.ts` sets `ULTRA_NATIVE_LIVE_SCORER`.

**Known gap:** the 11 real Season Zero games were imported *before* the `statSource` column
existed, so their `Game`/`PlayerStat`/`TeamStat` rows currently have `statSource: null` in
production. Re-running the import is unnecessary (idempotency guards would block it once
`Fixture.status === "FINAL"` anyway) - a small one-off backfill script
(`UPDATE ... SET "statSource" = 'FIBA_LIVESTATS_PDF_IMPORT' WHERE "resultSource" IS NOT NULL`)
is the correct fix, and is called out explicitly as outstanding work in
[season-zero-import-reconciliation.md](../operations/season-zero-import-reconciliation.md).
