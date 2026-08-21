# Native vs. Official Reconciliation

G.17, Part VIII — the comparison engine that was explicitly deferred twice (G.16, then flagged
"must not be deferred again" in G.17). Built this track: `src/lib/native-vs-official-reconciliation.ts`
+ the operator page `/games/[fixtureId]/stats/reconciliation`.

See [`STAT_SOURCE_RECONCILIATION.md`](./STAT_SOURCE_RECONCILIATION.md) for the full
`StatDataSource` provenance model this builds on.

## What was actually missing

Stage 11's audit found that the real overwrite risk didn't exist: `importGameResult()`
(`game-result-import.ts`) already refuses to import over any fixture whose `status` (or its
`Game.status`) is already `FINAL` — "Fixture is already FINAL. Use the supersede workflow
instead of importing again." Since a natively-scored game only reaches `FINAL` via
`finalizeGame()`, this guard already prevents a PDF import from silently overwriting native
`PlayerStat`/`TeamStat`. What was genuinely missing was a way to **compare** the two sources side
by side once both exist for the same game — the actual gap this track closes.

## The engine

Pure, unit-tested (`native-vs-official-reconciliation.test.ts`, 12 tests). Per field:

| State | Meaning |
|---|---|
| `MATCH` | Both sources provide the field and agree. |
| `MISMATCH` | Both sources provide the field and disagree. |
| `NATIVE_ONLY` | Only the native (event-derived) side has a value. |
| `OFFICIAL_ONLY` | Only the official (import) side has a value. |
| `NOT_COMPARABLE` | Neither side provides the field. |

Rolled up per player/team line: `FULL_MATCH` (everything comparable agreed) /
`PARTIAL_MATCH` (some `NATIVE_ONLY`/`OFFICIAL_ONLY`, no real disagreement) / `MISMATCH` (any real
disagreement — dominates) / `INSUFFICIENT_DATA` (nothing was comparable at all). Game-level
`summarizeGameReconciliation()` takes the worst state across every player and team line.

**Ultra-specific fields never fabricate a mismatch.** A Season-Zero-style official PDF has no
concept of 4PT/Ultra Time at all — those fields naturally come back `NATIVE_ONLY` (present on the
native side, absent on the official side), never `MISMATCH`. Tested explicitly.

## The reconciliation page

`/games/[fixtureId]/stats/reconciliation` (session-authenticated, `result:confirm`). Shows this
game's native totals (from its materialized `PlayerStat`/`TeamStat`) next to editable fields for
official/PDF numbers. **Never writes anything** — every comparison is computed fresh from the
current form submission (a GET form; official values live only in the URL query string), exactly
matching Stage 15's "Do not automatically modify either source."

## Known limitation

No real Season Zero game currently has both a native ledger *and* an official import
simultaneously — all 11 historical games are import-only, and the one native game (Ember vs
Nova) has no player attribution. The engine and page are built and unit-tested, but haven't been
exercised against a real dual-source game yet, because none exists. This will be the first real
test the moment a natively-scored game later receives an official PDF for cross-check.
