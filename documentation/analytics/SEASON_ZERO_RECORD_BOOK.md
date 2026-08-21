# Season Zero Record Book

The record book at `/public/stats/records` is the canonical list of statistical records set
during Season Zero. Source: [`records.ts`](../../web/src/lib/analytics/records.ts), rendered by
[`records/page.tsx`](../../web/src/app/public/stats/records/page.tsx). Tests:
[`analytics.test.ts`](../../web/src/lib/analytics.test.ts).

Every record here is a **direct min/max reduction over real, already-persisted data** — a record
is never estimated, interpolated, or reconstructed from a finer-grained signal than Season Zero
actually captured. See [`SEASON_ZERO_ANALYTICS_METHODS.md`](./SEASON_ZERO_ANALYTICS_METHODS.md)
for the analytics platform's data-capability rules this book inherits (all 11 real games are
`BOX_SCORE_ONLY`; nothing here uses a 4PT, Ultra Time, or shot-location field).

## Tie-breaking rule (applies to every category)

When two or more holders are exactly tied on a record's value, the holder from the
**chronologically earliest game** wins the tie (`tieBreakEarliest()`). This is a fixed,
documented convention — not "most recent," which would silently swap the named record-holder
every time a new game happened to match the existing value. A tie never produces two named
holders; the book always names exactly one.

## Player Single-Game Records

Computed from every non-DNP `PlayerLine` across every completed game (`allPlayerGameRows()`):

- Most Points / Rebounds / Assists / Steals / Blocks — Game: a direct max over that stat, with the
  tie-break rule above. A DNP player is excluded before the max is taken, so a $0 stat can never
  spuriously "win" a category no one who actually played reached.
- Best Qualified FG% — Game: restricted to rows whose field-goal attempts clear
  `isShootingQualified()`'s attempts floor before comparing percentage — a 1-of-1 (100%) game is
  never shown ahead of a real high-volume shooting performance.

## Player Season Records

Computed from `SeasonPlayerRecordInput[]` (season totals per player):

- Most Total Points / Rebounds / Assists / Steals / Blocks: a raw-total max, **not** gated by any
  games-played qualification floor — if a 1-game player's total genuinely is the season's highest
  raw total, they legitimately hold that record. Rate-based fairness doesn't apply to a raw sum.
- Highest Qualified PPG / RPG: rate records, gated by the games-played floor
  (`minGamesForRate`, default 2) — a single big game inflating a per-game rate over a tiny sample
  is excluded from the *rate* record, even though the same game could still legitimately hold the
  raw-total record above.
- Best Qualified FG% / 3PT% / FT%: gated by `isShootingQualified()`'s attempts floor per shot
  type, independently for each of the three percentages.

## Team Records

Computed once per team-side of every game (`{side, opponent, game}` for both home and away), so
every team's performance is compared on equal footing regardless of whether they were home or
away that game:

- Highest Team Score — Game
- Lowest Points Allowed — Game
- Biggest Win — Game (positive margin only; a loss never appears here)
- Most Team Rebounds — Game (offensive + defensive; omitted if either field is missing for a game)
- Most Team Assists — Game
- Most Bench Points — Game
- Most Paint Points — Game

Any field that's `null` for a given game (not captured) is excluded from that comparison entirely
rather than treated as zero — a team's paint-points record can never be won by a team whose real
paint-points figure was simply never recorded.

## Game Records

Computed once per game:

- Highest-Scoring Game / Lowest-Scoring Game: combined score of both teams.
- Closest Game / Biggest Margin: restricted to **decided** games (a tie, if one ever occurs, is
  excluded from both — a 0-point margin isn't meaningfully "closest" or "biggest").
- Overtime Games: a count, shown with a link to the season's first overtime game — entirely
  **absent** from the book (not a zero-valued entry) if no Season Zero game went to overtime, so
  its presence or absence is itself informative.
- Biggest Comeback: the largest deficit the eventual winner faced at any earlier **period**
  checkpoint (half/quarter, whichever the imported data captured), reusing the identical
  period-cumulative deficit calculation already validated in Game Story's `COMEBACK` tag. This is
  a period-resolution reconstruction, not a possession-by-possession one — Season Zero has no
  finer-grained scoring timeline to reconstruct from, and this book never pretends otherwise.

## What this book deliberately does not do

- No milestone engine (e.g. "first player to reach 50 season points") — a separate, not-yet-built
  concept from a fixed record list; see the G.12 track report for scope status.
- No predictive or projected records ("on pace for") — every entry describes what has already
  happened, in the past tense, sourced from a completed game.
- No record synthesized from a field a game's `dataCapability` doesn't actually support for that
  game — a `null` field is skipped for that comparison, never defaulted to `0`.
