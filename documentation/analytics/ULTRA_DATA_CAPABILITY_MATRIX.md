# Ultra Data Capability Matrix

What each `GameDataCapability` level actually guarantees, and exactly which Season Zero and
future-game scenarios map to which level. This governs every "never show 4PT/Ultra Time data
for a game that never captured it" rule across the analytics and card systems (Tracks G.9-G.14)
— G.15 didn't change the levels, only added the first real path to reach the higher ones.

## The five levels (`prisma/schema.prisma`, `GameDataCapability`)

| Level | Guarantees | Reached by |
|---|---|---|
| `BOX_SCORE_ONLY` | Final aggregate `PlayerStat`/`TeamStat` rows only. No event-level truth. | Default for every `Game` row. All 11 real Season Zero games (`FIBA_LIVESTATS_PDF_IMPORT`). |
| `PLAY_BY_PLAY` | Chronological `GameEvent` rows exist, but not necessarily with full Ultra provenance. | Not currently reached by any code path — reserved for a future partial-capture scenario (e.g. a scorer-only game with no statistician). |
| `ULTRA_NATIVE_EVENTS` | Event-level *and* Ultra-specific provenance (4PT, Ultra Time multiplier) genuinely derived from real events, not inferred. | `startGame()` in `src/app/games/actions.ts` sets this immediately when a game is started through the live scorer console — true for every native game, whether or not a statistician console is also used. |
| `SHOT_LOCATION` | Everything above, plus real `x`/`y`/`courtZone` on shot events. | Not reached by any code path yet. `GameEvent.x`/`y`/`courtZone` exist in the schema but are never populated. |
| `VISION_ENRICHED` | Everything above, plus vision-pipeline-derived enrichment. | Not reached by any code path yet. |

## The 3-tier collapsed view (`src/lib/game-data-capability.ts`)

Most consumers (analytics cards, public pages, broadcast graphics) only need the coarser
3-tier `GameAnalyticsCapability`, computed by `getGameAnalyticsCapability()`:

| `GameAnalyticsCapability` | Maps from | What it unlocks |
|---|---|---|
| `BOX_SCORE_ONLY` | `BOX_SCORE_ONLY` | Basic box score cards only. No Game Pulse, no DNA event-derived detail, no 4PT/Ultra Time. |
| `EVENT_LEVEL` | `PLAY_BY_PLAY` | Event feed / play-by-play surfaces, still no Ultra-specific claims. |
| `FULL_ULTRA` | `ULTRA_NATIVE_EVENTS` or higher | Everything, including 4PT and Ultra Time breakdowns. |

## Real scenarios

| Scenario | `GameDataCapability` | `GameAnalyticsCapability` |
|---|---|---|
| Any of the 11 real Season Zero games | `BOX_SCORE_ONLY` | `BOX_SCORE_ONLY` |
| A future game started through the scorer console, scorer only (no statistician) | `ULTRA_NATIVE_EVENTS` | `FULL_ULTRA` |
| A future game started through the scorer console, scorer + statistician both active | `ULTRA_NATIVE_EVENTS` | `FULL_ULTRA` (unchanged — the statistician's parallel ledger doesn't change the game's declared capability; it improves cross-check confidence, not the capability tier) |
| A future game whose result is later re-imported from an official PDF instead | `BOX_SCORE_ONLY` (import path never claims a higher tier — see `game-result-import.ts`) | `BOX_SCORE_ONLY` |

## The rule this enforces

A card/page never renders a 4PT or Ultra Time number by checking "is this field non-null" — it
checks the game's declared capability first (`hasUltraStatDerivation()`), because a
`BOX_SCORE_ONLY` row's Ultra-specific columns are `null` (NOT_CAPTURED) precisely *because* no
capability upgrade ever happened for it, and that must stay true even if a future bug or manual
edit somehow populated one of those columns. Capability is the gate, not field presence. Tested
structurally in `src/lib/analytics.test.ts` (no-4PT/no-Ultra-Time-field-leakage test, Track
G.14) and unaffected by this track.

## G.16: checkable qualification, without changing the write-time assignment

`src/lib/capability-qualification.ts` adds `qualifiesForEventLevel()`/`qualifiesForFullUltra()` —
deterministic, unit-tested predicates documenting exactly what "complete Ultra provenance" means
(every scoring event in the ledger has a non-null `basePointValue` and `multiplier`), so a future
verification/audit pass can *confirm* a game's stamped capability is actually earned rather than
trusting the write-time assignment on faith. `startGame()`'s existing eager assignment to
`ULTRA_NATIVE_EVENTS` was deliberately left unchanged — it was never actually speculative, since
every event that console writes always carries complete provenance — so this track only added the
checkable predicate, not a new reclassification code path, to avoid touching the already
production-proven scorer write path without a proven need to.
