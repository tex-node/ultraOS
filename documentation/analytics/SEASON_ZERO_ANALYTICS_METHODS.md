# Season Zero Analytics Methods

This is the authoritative explanation of what UltraLeagueOS's public analytics pages actually
calculate: `/public/fixtures/[id]`, `/public/clubs/[id]`, `/public/players/[id]`,
`/public/stats`, `/public/stats/players`, `/public/stats/compare/players`,
`/public/stats/compare/teams`, `/public/stats/records`, `/public/share/*`, `/broadcast/stats`, and
`/broadcast/graphics`.

Every method here is **deterministic** — no LLM, no hidden judgment call, no randomness. Given
the same source data, every formula on this page always produces the same output. Source code
lives under [`web/src/lib/analytics/`](../../web/src/lib/analytics/) and
[`web/src/lib/game-data-capability.ts`](../../web/src/lib/game-data-capability.ts); the tests in
[`web/src/lib/analytics.test.ts`](../../web/src/lib/analytics.test.ts) are the executable
specification — if this document and that file ever disagree, the tests are correct and this
document is stale.

## Data capability

**Inputs:** `Game.dataCapability` (persisted enum: `BOX_SCORE_ONLY`, `PLAY_BY_PLAY`,
`ULTRA_NATIVE_EVENTS`, `SHOT_LOCATION`, `VISION_ENRICHED`).

**Rule:** [`getGameAnalyticsCapability()`](../../web/src/lib/game-data-capability.ts) collapses
the 5-level enum to a 3-tier model the UI reasons about: `BOX_SCORE_ONLY`, `EVENT_LEVEL`,
`FULL_ULTRA`. `hasEventLedger()` and `hasUltraStatDerivation()` gate whether play-by-play and
4PT/Ultra Time fields are shown at all — never inferred from whether a field happens to be
non-null.

**Season Zero status:** all 11 real games are `BOX_SCORE_ONLY`. Zero `GameEvent` rows exist in
production for any completed game — the live scorer was never used for a real Season Zero game.
Every real game's 4PT/Ultra Time fields are `NULL` (not captured), never `0` (measured and
actually zero). The UI renders `NULL` as an em dash or an explicit "not captured" message, never
as a number.

**Limitation:** this is a data-collection boundary, not an analytics defect. It cannot be fixed
by better math — only by future games actually being scored through the live scorer.

**Historical boundary (Track G.15):** Track G.15 built the live capture side of this boundary —
a genuinely independent statistician console (`/games/[fixtureId]/stats`) with score
reconciliation against the scorer console, on top of the scoring/event engine Track H had
already built. This does **not** retroactively change Season Zero. All 11 real games remain
`BOX_SCORE_ONLY` and always will — G.15 never rewrites historical `GameEvent`/`PlayerStat`/
`TeamStat` rows, never infers 4PT or Ultra Time data for a game that didn't capture it, and
never migrates a past game's capability tier upward after the fact. The boundary going forward
is simple: any *future* Ultra Basketball game started through the live scorer console
automatically reaches `ULTRA_NATIVE_EVENTS` (`FULL_ULTRA`) capability the moment it starts,
whether or not a statistician console is also used for it; every game before this track's
production deployment is frozen at whatever capability it already had. See
[`ULTRA_LIVE_DATA_ARCHITECTURE.md`](./ULTRA_LIVE_DATA_ARCHITECTURE.md) and
[`ULTRA_DATA_CAPABILITY_MATRIX.md`](./ULTRA_DATA_CAPABILITY_MATRIX.md) for the full system.

**G.16 continuity:** Track G.16 converged the statistician ledger into canonical `PlayerStat`/
`TeamStat` via verified materialization (`EVENT_DERIVED` statSource) and fixed a real isolation
gap in every season-wide aggregator this document's numbers depend on (`loadSeasonGameCores`,
`loadSeasonPlayerTotals`, `loadPlayerBestGame`, `loadPlayerGameLog`, and `recalculateStandings`
all now filter on `competitiveFixtureScope()`). Season Zero's 11 games and every number derived
from them are unaffected — confirmed byte-identical before and after this track's deploy. See
[`CANONICAL_LIVE_STATISTICS.md`](./CANONICAL_LIVE_STATISTICS.md).

## Game Story

**Inputs:** final score, period-cumulative scores (`GamePeriodScore`), `TeamStat` advanced
fields (bench points, paint points, lead changes, biggest lead, etc.).

**Rule:** [`classifyGameStory()`](../../web/src/lib/analytics/game-story.ts) emits zero or more
tags from a fixed set (`CLOSE_GAME`, `OVERTIME`, `COMEBACK`, `WIRE_TO_WIRE`, `DOMINANT`,
`SECOND_HALF_TAKEOVER`, `SHOOTOUT`, `DEFENSIVE_BATTLE`, `BENCH_IMPACT`, `PAINT_DOMINANCE`,
`TURNOVER_PRESSURE`, `REBOUNDING_EDGE`). A tag never fires from a null field — see
[`config.ts`](../../web/src/lib/analytics/config.ts) for every threshold.

**Thresholds** (calibrated to Ultra Basketball's short 2×10-minute format, not full-length
basketball norms — see the comment in `config.ts`): close game ≤5pt margin; dominant ≥20pt
margin; comeback = winner trailed by ≥8 at an earlier period checkpoint; second-half takeover =
≥10pt swing in the final regulation period vs. the checkpoint before it (excludes overtime);
shootout ≥65 combined points; defensive battle ≤28 combined points; wire-to-wire = the loser's
own `biggestLead` was 0.

**Limitation:** only period-level (half/OT) resolution exists for Season Zero, so "second-half
takeover" is computed from period-cumulative deltas, not a live scoring feed.

## Why They Won

**Inputs:** `TeamStat`/summed-`PlayerStat` fields for both sides of a completed game.

**Rule:** [`rankWhyTheyWon()`](../../web/src/lib/analytics/why-they-won.ts) proposes a factor
only when `winner_metric` is strictly better than `loser_metric` for that metric's direction —
higher for shooting/rebounding/playmaking/paint/bench/second-half scoring, **lower** for
turnovers. A factor where the loser's number is actually better is never shown, even if the
numeric gap is large — this was a real defect found in production (see Defects, below) and is
now enforced by a directional gate on every candidate, not just a magnitude check.

Candidates are ranked by **normalized separation**: `abs(winner - loser) / ceiling`, where each
metric has its own reasonable ceiling (documented in the file) so a 60-percentage-point shooting
gap and a 5-assist gap are compared on a common scale instead of the shooting gap automatically
"winning" just because 60 > 5. The top 3 factors are shown.

**Limitation:** all inputs are aggregate box-score numbers; no play-by-play attribution exists
for Season Zero, so a factor is a season-report-level advantage, not an event-derived one.

## Top Performers / Game Star / Badges

**Inputs:** `PlayerStat` rows for the game.

**Game Star rule:** the single active (non-DNP) player with the highest **effective
efficiency** — the real `efficiency` field when present, otherwise a proxy:
`PTS + REB + AST + STL + BLK − missed FG − missed FT − TO` (see `effectiveEfficiency()` in
[`player-analytics.ts`](../../web/src/lib/analytics/player-analytics.ts)). Game Star is a
spotlight, not an exclusive claim — the same player can also independently lead Top Scorer, Top
Rebounder, etc. if their raw numbers genuinely lead those categories too.

**Other categories:** Top Scorer (points), Top Rebounder (rebounds), Top Playmaker (assists),
Top Defender (steals+blocks), Most Efficient (effective efficiency). Each of these five is a
single, non-reused slot — a player already claiming one can't also claim another (Game Star is
the sole exception).

**Badges:** [`badges.ts`](../../web/src/lib/analytics/badges.ts) — Sniper (≥45% 3PT on ≥3
makes), Perfect Shooting (100% FG on ≥4 attempts), Glass Cleaner (≥10 REB), Playmaker (≥6 AST),
Lockdown (≥3 STL), High Efficiency (≥20 effective efficiency).

**Explicitly not awarded per-player:** a "Bench Spark" badge. `PlayerStat` has no starter/bench
flag for imported Season Zero games, so there is no real signal for which individual player came
off the bench — only the *team*-level `benchPoints` total is real (see `BENCH_IMPACT` in Game
Story and Team DNA's `BENCH_PRODUCTION` dimension). An earlier version inferred bench status from
whether a high-scoring player's team also had good bench production, which mislabeled starters —
this was a real, found-in-production defect, now fixed by removing the inference entirely.

## Team DNA

**Inputs:** every `GameCore` (home/away `TeamSideStats`) for a season, aggregated per
`seasonClubId` across however many games that team has played.

**Dimensions** (9, all in
[`team-dna.ts`](../../web/src/lib/analytics/team-dna.ts)): Scoring, Shooting, Playmaking,
Rebounding, Defense, Transition, Paint Attack, Bench Production, Ball Security.

**Formula:** for each dimension, `index = team_rate_per_game / league_average_rate_per_game`
(league average is the **mean of each team's own per-game rate**, not a points-weighted total).
Defense and Ball Security are inverted — `league_average / team_rate` — since allowing fewer
points and committing fewer turnovers are both "higher is better" in index terms even though the
raw rate is "lower is better." `1.00` is exactly league average. Division by zero is impossible:
a dimension resolves to `null` (rendered "—") whenever the team or the league has no usable data
for it, rather than crashing or fabricating a number.

**Tags:** a dimension earns a descriptive tag (`HIGH_PACE_SCORING`, `PAINT_HEAVY`,
`BALL_MOVEMENT`, `REBOUNDING_TEAM`, `TRANSITION_THREAT`, `BENCH_DEPTH`, `LOW_TURNOVER`) only when
its index is ≥1.15 (15% above league average). At most 3 tags are shown, chosen by highest index.
A weak team is allowed to show weak dimensions with no tag at all — nothing here inflates a
below-average number into a flattering label.

**Sample control:** a team needs ≥2 games played to be `QUALIFIED`; 1 game is
`DEVELOPING_PROFILE` and shown with an explicit sample-size badge; the UI never hides this state.

## Player DNA

**Inputs:** season-wide per-player totals (`loadSeasonPlayerTotals`), aggregated the same way as
leaderboards.

**Dimensions** (6, in
[`player-dna.ts`](../../web/src/lib/analytics/player-dna.ts)): Scoring, Shooting, Playmaking,
Rebounding, Defensive Activity (steals+blocks), Ball Security. Deliberately **excludes** 4PT,
Ultra Time, clutch scoring, and shot-location tendencies for historical players — the imported
box-score source never captured any of them, so there is nothing honest to normalize against.

**Formula:** same `player_rate / league_average_rate` pattern as Team DNA, with Ball Security
inverted (fewer turnovers = higher index).

**Small-sample protection:** the Shooting dimension requires the player's own field-goal
attempts to clear `qualificationConfig.shootingMinimumAttempts` (5) — below that, Shooting shows
"—", not a raw percentage, regardless of how many games the player has played overall. This
closes a real defect found in production: a player with exactly 1 shot attempt (0 makes) was
rendering "Shooting 0.0%" as if it were a measured shooting profile. The league Shooting average
itself is also computed only from players who clear the same floor, so a 1-shot player can't drag
the baseline in either direction. Every other dimension still uses the general games-played
qualification tier (`INSUFFICIENT_SAMPLE` / `DEVELOPING_PROFILE` / `QUALIFIED`, surfaced in the
UI as "Limited sample" / "Developing sample" / "Established sample").

## Leaderboard qualification

**Inputs:** `qualificationConfig` in
[`config.ts`](../../web/src/lib/analytics/config.ts).

**Rules:** counting-stat leaderboards (PPG, RPG, APG, SPG, BPG) require ≥2 games played to
appear at all (`playerMinimumGamesForLeaderboard`) — a 1-game outlier is excluded outright, not
just flagged, because ranking on a single data point is not meaningfully different from ranking
on noise. Shooting-percentage leaderboards (FG%, 3PT%, FT%) additionally require ≥5 attempts of
that shot type (`shootingMinimumAttempts`), independent of games played. These thresholds are
calibrated to Season Zero's short season (2–3 games per team), not imported from NBA-scale
qualification rules that would exclude almost the entire roster.

## Season Story Cards

**Inputs:** the full season's `GameCore[]`.

**Rule:** [`buildSeasonStoryCards()`](../../web/src/lib/analytics/season-story-cards.ts) computes
ten cards, each a direct min/max reduction over real numbers (closest finish, biggest win,
highest-scoring game, overtime classic, top individual scoring game, best team shooting
performance, biggest rebounding edge, biggest assist edge, strongest bench performance,
strongest paint performance). Every card links to the exact `fixtureId` it came from. A card is
omitted entirely if its underlying field isn't available for any game that season (e.g. no
rebounding-edge card if no game has rebound data) — never filled with a fabricated value.

## Metric registry

**Inputs:** none — this is a static definition table.

**Rule:** [`analytics-metrics.ts`](../../web/src/lib/analytics/analytics-metrics.ts) is the single
source of truth for every comparable metric's label, direction (`HIGHER_IS_BETTER` /
`LOWER_IS_BETTER`), formatter, and qualification rule, for both players (`PLAYER_METRICS`) and
teams (`TEAM_METRICS`). Player Comparison, Team Comparison, Category Leaders, and Player
Discovery's sort control all read from this registry rather than each re-declaring "is turnovers
higher-or-lower-is-better" independently. It also declares (but never populates for Season Zero)
future-only entries — `FOUR_PT_MADE`, `FOUR_PT_ATTEMPTED`, `FOUR_PT_PCT`, `ULTRA_TIME_POINTS`,
`ULTRA_TIME_FG_PCT`, `ULTRA_TIME_POINT_DIFFERENTIAL` — each `sourceRequirement: "FULL_ULTRA"` and
`getValue: () => null`, so the shape exists for a future Ultra-native game without any Season
Zero code path being able to accidentally surface it.

## Directional comparison (shared primitive)

**Rule:** [`compareByDirection()`](../../web/src/lib/analytics/directional-comparison.ts) is the
one place "is A actually better than B" logic lives for every G.11 comparison feature. It never
compares raw magnitude alone — a metric's registered `direction` decides which side wins, `null`
on either side returns `INSUFFICIENT_SAMPLE` (never treated as a loss or a zero), and equal
values return `EVEN`. Player Comparison, Team Comparison, and Matchup Intelligence all call this
function directly rather than re-implementing `>`/`<` per metric — this exists specifically
because G.9 found a real production bug in Why They Won where a factor's *magnitude* was
compared without first checking *direction*, silently crediting a team for a stat where they
were actually worse. `matchup-intelligence.ts`'s regression tests reproduce that exact class of
bug (winner REB 10, loser REB 20 → the edge must never go to the side with fewer rebounds) to
make sure it can't reappear in a different file.

## Player Comparison

**Route:** `/public/stats/compare/players`.

**Inputs:** two players' `SeasonPlayerTotals` and `PlayerDna` for the season.

**Rule:** [`comparePlayers()`](../../web/src/lib/analytics/player-comparison.ts) runs every
`BOX_SCORE_ONLY` metric in the registry through `compareByDirection()`, respecting each metric's
own qualification rule (a shooting percentage is `INSUFFICIENT_SAMPLE`, never a fabricated
winner, if either player is below the attempts floor). The deterministic summary sentence picks
each player's single largest real DNA-index advantage over the other (the dimension with the
biggest positive `indexA − indexB` gap, or the reverse) and renders a fixed template naming it —
never freeform text, never an LLM call. If either player lacks a DNA profile (fewer than the
Player DNA qualification floor), the summary falls back to a plain "not enough games yet"
sentence instead of guessing.

## Team Comparison

**Route:** `/public/stats/compare/teams`.

Same method as Player Comparison, applied to `SeasonTeamTotals` (see
[`season-team-totals.ts`](../../web/src/lib/analytics/season-team-totals.ts), a fresh per-team
aggregation over `GameCore[]` kept independent of Team DNA's own aggregation so a bug in one
can't silently propagate into the other) and `TeamDna`. See
[`team-comparison.ts`](../../web/src/lib/analytics/team-comparison.ts).

## Matchup Intelligence

**Route:** every completed game page (`/public/fixtures/[id]`), "Matchup Intelligence" section.

**Inputs:** one game's home/away `TeamSideStats` and period scores.

**Rule:** [`buildMatchupIntelligence()`](../../web/src/lib/analytics/matchup-intelligence.ts)
checks rebounds, assists, turnovers, FG%, paint points, bench points, fast-break points, and
second-half scoring. A factor is only surfaced when its normalized separation
(`abs(home − away) / ceiling`, same ceiling-based normalization as Why They Won) is at least
`0.15`; below that, the two sides are treated as not meaningfully different and the factor is
omitted rather than forced. Every surfaced factor carries a `homeShare` (0–1) for the compact bar
visualization — inverted for "lower is better" metrics so the bar always visually favors whoever
actually holds the edge. This is explicitly a **game profile**, not a prediction: it describes
what already happened in this box score, never a probability of anything.

## Player Similarity

**Inputs:** two players' `PlayerDna` (6 dimensions each: Scoring, Shooting, Playmaking,
Rebounding, Defensive Activity, Ball Security).

**Method — normalized Euclidean distance:**
`distance = sqrt( sum( (indexA_i − indexB_i)^2 ) / n )` over the `n` dimensions **both** players
have a real (non-null) index for; a dimension missing for either player (e.g. Shooting below the
attempts floor) is excluded from the sum entirely, never treated as a `0` difference. Euclidean
distance was chosen over cosine similarity because every DNA index already shares a meaningful
common origin — `1.00 = league average` in every dimension — so the interesting question is how
far apart two players' actual rates are, which is exactly what Euclidean distance over a shared
coordinate space answers. Cosine similarity measures the *angle* between vectors from the
origin `(0,0,...)`, which isn't the relevant geometry here.

**Bands** ([`player-similarity.ts`](../../web/src/lib/analytics/player-similarity.ts)):
`VERY_SIMILAR` (distance ≤ 0.15), `SIMILAR` (≤ 0.35), `SOME_OVERLAP` (≤ 0.6),
`DIFFERENT_PROFILE` (above 0.6) — calibrated to the spread actually observed across Season
Zero's real Player DNA indices, not a universal statistical standard. Only `QUALIFIED` players
(≥2 games) are eligible as either the target or a candidate match — comparing against a 1-game
outlier's DNA isn't a statistically meaningful similarity claim. A player never matches
themselves. Up to 3 closest matches are shown on each player's profile page, each explained by
naming its most-similar and most-different shared dimension.

**Team Similarity** ([`team-similarity.ts`](../../web/src/lib/analytics/team-similarity.ts)) is
the identical method applied to Team DNA's 9 dimensions instead of 6, showing up to 2 matches per
club (there are only 8 clubs total).

## Player Archetypes

**Inputs:** one player's `PlayerDna`.

**Rule** ([`player-archetype.ts`](../../web/src/lib/analytics/player-archetype.ts)): a player
below the Player DNA qualification floor (`DEVELOPING_PROFILE` or `INSUFFICIENT_SAMPLE`) never
receives an archetype — the UI shows their sample-confidence label instead. For qualified
players:

1. If any dimension's index is **≥ 1.3** ("dominant"), the highest such dimension maps directly
   to a single-category archetype: Scoring → `PRIMARY_SCORER`, Rebounding → `REBOUNDING_FORCE`,
   Playmaking → `PLAYMAKING_GUARD`, Defensive Activity → `DEFENSIVE_DISRUPTOR`, Shooting →
   `EFFICIENT_FINISHER`. Ball Security alone never drives an archetype.
2. Otherwise, if at least one offensive dimension (Scoring/Playmaking/Rebounding/Shooting) **and**
   Defensive Activity are both **≥ 1.15** ("notable") without either being dominant, the player
   is `TWO_WAY_CONTRIBUTOR`.
3. Otherwise, if at least 3 of the 6 dimensions are **strictly above 1.0** (not merely equal to
   league average), the player is `ALL_ROUND_CONTRIBUTOR`.
4. Otherwise, no archetype is assigned — a player sitting at or below league average across the
   board gets no label at all, rather than a manufactured one.

A secondary trait (the next-highest dimension at or above 1.15 that isn't the one driving the
primary archetype) is shown alongside the primary when one exists.

## Emerging Performers

**Route:** `/public/stats`, "Emerging Performers" section.

**Rule** ([`emerging-performers.ts`](../../web/src/lib/analytics/emerging-performers.ts)): this
is a deliberately separate concept from Category Leaders. Eligibility is restricted to exactly
the `DEVELOPING_PROFILE` tier (players with precisely 1 game played) — the same players Category
Leaders and the leaderboards correctly exclude for having too small a sample to rank. A player
qualifies only if at least one Player DNA dimension reaches the same **1.3 "dominant"** threshold
used for archetypes; a merely-average 1-game showing is not surfaced. Every card displays the
sample size (`in 1 game`) and the league average alongside the standout number, so nothing here
can be mistaken for an established record. Per the product terminology rule, these players are
never called "prospects," "stars," "elite," or "future" anything — only what they actually
produced, in how many games.

## Player Game Log & Best Game

**Route:** `/public/players/[id]`, "Game Log" section.

**Inputs:** every `PlayerStat` row for the player across `FINAL` games
(`loadPlayerGameLog()` in [`game-analytics.ts`](../../web/src/lib/analytics/game-analytics.ts)),
sorted chronologically ascending.

**Rule:** [`selectBestGameByCategory()`](../../web/src/lib/analytics/player-game-log.ts) picks the
player's best game in three categories — Highest Scoring (points), Best Rebounding (rebounds),
Best Playmaking (assists) — as a direct max reduction over active (non-DNP) games only. Ties break
first on `efficiency` (or the same effective-efficiency proxy used everywhere else), then on the
chronologically **earliest** game — never "most recent," which would silently reshuffle a
best-game card every time a new game is added at an identical tied value. A category is omitted
entirely if the player never played (all rows `didNotPlay`).

## Team Game Log & Best Team Performance

**Route:** `/public/clubs/[id]`, "Game Log" section.

**Inputs:** `GameCore[]` for the season, reduced to one row per game the team actually played
([`buildTeamGameLog()`](../../web/src/lib/analytics/team-game-log.ts)), symmetric for home and
away appearances.

**Best Team Performance is a documented composite, not "biggest margin":**
[`selectBestTeamPerformance()`](../../web/src/lib/analytics/team-game-log.ts) scores each win
(or, if the team has no wins yet, each game played) as

```
score = max(0, margin) / 30 + (rebounds / 15) * 0.5 + (benchPoints / 15) * 0.5
```

— margin capped at a 30-point ceiling, rebounds and bench points each capped at a 15-unit ceiling
and weighted at half value, so a lopsided blowout margin alone cannot automatically outrank a
closer, more complete game with strong rebounding and bench support. The highest score wins; ties
break to the chronologically earliest game. This is explicitly a **season-results** presentation
labeled "season results, not a form prediction" in the UI — it never projects a future outcome.

## League Rank Context

**Route:** `/public/players/[id]` and `/public/clubs/[id]`, rank badges (e.g. "#2 PPG · 8 of 14
qualified").

**Rule:** [`computePlayerRanks()` / `computeTeamRanks()`](../../web/src/lib/analytics/rank-context.ts)
rank a player or team against every other `BOX_SCORE_ONLY` registry metric's own qualified
population — the identical qualification rules Category Leaders and the leaderboards already
enforce, so a small-sample outlier can never claim a rank in a category it wouldn't actually
qualify to lead. Ranking uses **competition-style** numbering: `rank = 1 + count(strictly better
values)`, so two players genuinely tied at the top both show rank `1` (never `1` and `2` for an
identical value — a real bug caught by a dedicated regression test before this shipped). Only the
3 categories with the best (lowest) rank number are surfaced as badges per player/team
(`topRankBadges()`), stable-sorted so a tie in rank doesn't reshuffle on every render.

## Player & Team Statistical Identity

**Route:** `/public/players/[id]` and `/public/clubs/[id]`, identity sentence + "Strengths" /
"Developing Areas" (player) or "Below Season Zero Average" (team) badges.

**Rule:** [`playerStatisticalIdentity()`](../../web/src/lib/analytics/player-statistical-identity.ts)
and [`teamStatisticalIdentity()`](../../web/src/lib/analytics/team-statistical-identity.ts) build
a fixed-template sentence directly from the same DNA dimensions and (for players) the same
archetype computation already shown elsewhere on the page — never a second, independently-tuned
rule set that could quietly drift out of sync with the archetype badge. An unqualified sample
(`DEVELOPING_PROFILE` / `INSUFFICIENT_SAMPLE`) always renders a plain "more games required"
sentence instead of guessing an identity from too little data.

Strengths are DNA dimensions at or above the same `1.15` "notable" threshold used for archetype
tags (`playerStrengths()` / `teamStrengths()`), sorted by index, capped at 3. The complementary
"Developing Areas" (player, capped at 2) and "Below Season Zero Average" (team, capped at 2) list
dimensions strictly below `1.00` (below league average), in deliberately neutral language — never
"weaknesses," and never shown for an unqualified sample. A single dimension can never appear in
both lists for the same player/team, since the two filters (`≥1.15` and `<1.00`) are disjoint by
construction.

## Head-to-Head Edges (Player & Team Comparison)

**Route:** `/public/stats/compare/players` and `/public/stats/compare/teams`, "Head-to-Head
Edges" section.

**Rule:** since every Player DNA and Team DNA dimension index is already direction-normalized
(inverted metrics like Ball Security and Defense already flip so a higher index is always
"better," regardless of whether the underlying raw rate is higher-is-better or lower-is-better),
computing an edge is just `compareByDirection(dimA.index, dimB.index, "HIGHER_IS_BETTER")` for
every dimension — the same centralized primitive used everywhere else in G.11/G.12, reusing its
`INSUFFICIENT_SAMPLE`/`EVEN` handling rather than a new comparison path. This closes the exact
class of bug Matchup Intelligence's regression tests already guard against (e.g. rebounding
10/game vs 20/game must never credit the 10/game side), reproduced here with dedicated tests for
both the player and team comparison pages.

The comparison summary is extended to three fixed-template sentences: the biggest DNA-index
advantage (unchanged from G.11), a new supporting concrete-stat sentence (`pickSupportingMetric()`
prefers PPG when it's decisive, otherwise the first decisive registry metric), and a closing
sentence explicitly stating the comparison "reflects each player's/team's Season Zero statistical
record, not a prediction of future performance" — tested to never contain predictive language
("will win", "expected to", "probability").

## Season Zero Record Book

**Route:** `/public/stats/records`. Full method detail:
[`SEASON_ZERO_RECORD_BOOK.md`](./SEASON_ZERO_RECORD_BOOK.md).

**Rule:** [`records.ts`](../../web/src/lib/analytics/records.ts) computes four independent record
sets — player single-game, player season, team, and game — each a direct min/max/qualified-best
reduction over real `GameCore`/`PlayerLine`/season-totals data, never estimated or reconstructed
beyond what the data actually supports. Every tie breaks to the chronologically earliest game, so
the book never silently reshuffles a title as more games are added at an identical value. Season
totals (e.g. "Most Total Points") are **not** gated by the games-played qualification floor — a
1-game outlier genuinely holds a raw-total record if their total is the highest — while rate and
percentage records (Highest Qualified PPG, Best Qualified FG%) apply the same qualification floors
used everywhere else (games-played for rates, attempts for percentages). "Biggest Comeback" reuses
the exact period-cumulative deficit calculation already validated in Game Story's `COMEBACK` tag,
rather than a new, riskier scoring-timeline reconstruction.

## Data confidence labels

**Rule:** [`SAMPLE_CONFIDENCE_LABEL`](../../web/src/lib/analytics/qualification.ts) maps the
existing `QualificationState` enum to plain language: `INSUFFICIENT_SAMPLE` → "Limited sample",
`DEVELOPING_PROFILE` → "Developing sample", `QUALIFIED` → "Established sample". This is a
deterministic games-count label, never a fabricated AI confidence score.

## Milestone Engine

**Route:** `/public/players/[id]` and `/public/clubs/[id]`, "Milestones" section.

**Rule:** [`milestones.ts`](../../web/src/lib/analytics/milestones.ts) computes single-game
player and team milestones from a fixed set of thresholds — calibrated against Season Zero's
**actual** stat distribution (11 real games, 2×10-minute format), not copied from NBA-scale
numbers. Concretely: the real single-game assist max this season is 4, so the milestone is
`ASSISTS_3` ("3+ Assist Game"), not a 5+ threshold that could never fire. Points and rebounds get
two tiers each (10+/15+ points, 5+/8+ rebounds) since the real distribution supports a
"notable" and a "rare" tier; steals gets 2+/5+; there is deliberately **no** blocks milestone —
the real single-game block max is 1, which doesn't support a meaningful "X+" threshold.

A player can earn several different milestones in the same game (a 17-point, 8-rebound, 5-steal
game legitimately earns `POINTS_10`, `POINTS_15`, `REBOUNDS_5`, `REBOUNDS_8`, and `STEALS_5` all
at once — these are distinct real achievements, not duplicates). Team milestones (`TEAM_POINTS_30`,
`TEAM_REBOUNDS_20`, `TEAM_BENCH_10`, `TEAM_PAINT_ADVANTAGE_10`) are computed per team-side of every
game; paint advantage is a genuine per-game margin (`home.pointsInPaint − away.pointsInPaint`),
never a raw team total mislabeled as an "advantage." Milestones require no games-played
qualification — like a season-total record, a single real game legitimately earns the milestone
it earns, regardless of how many other games that player has played.

## Player Development Context

**Route:** `/public/players/[id]`, "Statistical Development Context" section — never labeled
"Weaknesses."

**Rule:** [`player-development-context.ts`](../../web/src/lib/analytics/player-development-context.ts)
is a thin sentence-formatting layer over G.12's `playerDevelopingAreas()` — it introduces **no new
calculation**, only a neutral, plain-language sentence per already-identified below-average
dimension (e.g. "Qualified shooting percentage (31.2%) currently sits below the Season Zero
benchmark (38.1%)."). Ball Security is described in its natural raw-stat direction — "Turnover
rate currently sits above the Season Zero average" — since the underlying DNA index is inverted
(fewer turnovers = higher index), and describing an inverted index directly as "below average"
would read backwards to anyone not tracking the inversion. A limited/developing sample renders
"More games required for development context" instead of a fabricated assessment. Never gives
prescriptive coaching advice — only describes the number, never what to do about it.

## Card view models & the Insight Card system

**Routes:** every page listed at the top of this document embeds at least one card; the
canonical, standalone renderings live at `/public/share/player/[id]`, `/team/[id]`, `/game/[id]`,
and `/record/[key]`; every card type (including the ones not tied to a public share route) is
also reachable through the operator-only Graphics Gallery at `/broadcast/graphics`.

**Rule:** [`src/lib/analytics/cards/`](../../web/src/lib/analytics/cards/) is a pure
view-model layer — every `build*Card()` function takes an already-computed canonical analytics
object (`SeasonPlayerTotals`, `PlayerDna`, `TeamDna`, `RankBadge`, `TopPerformer`,
`TeamComparisonResult`, `PlayerComparisonResult`, `RecordEntry`, a milestone, a leaderboard entry,
a best-game/best-performance row) and returns a plain, serializable `CardBase`-shaped object.
**No card builder touches Prisma, and no card builder recomputes a number a domain file already
owns** — `buildMatchupCard()`/`buildPlayerMatchupCard()`, for instance, only reformat
`compareTeams()`/`comparePlayers()`'s own `edges` arrays, which were already routed through the
shared `compareByDirection()` primitive; the card never re-derives which side "won" a stat. This
is the one calculation that powers the web embed, the broadcast composition, the share route, and
the PNG export — never four independent implementations of the same fact.

As of Track G.14, **every** card type is wired to a live UI surface, not just built: Game Star,
Player DNA, Team DNA, Matchup (both player and team), Category Leader, Milestone, and Why They
Won are all embedded directly on the relevant public page (player page, club page, game page,
comparison pages, stats page) in addition to being reachable via the Graphics Gallery. Two new
card types were added this track — `buildPlayerBestGameCard()` (wraps the existing
`loadPlayerBestGame()`) and `buildTeamBestPerformanceCard()` (wraps the existing
`selectBestTeamPerformance()`) — following the identical "structural type, not an import from the
Prisma-touching file" pattern the rest of the layer already uses.

Full catalogue, formats, and safe-area rules:
[`ULTRA_ANALYTICS_CARD_GUIDE.md`](./ULTRA_ANALYTICS_CARD_GUIDE.md). Operator workflow for
producing graphics: [`BROADCAST_GRAPHICS_OPERATOR_GUIDE.md`](./BROADCAST_GRAPHICS_OPERATOR_GUIDE.md).

## Shareable card routes & PNG export

**HTML routes:** `/public/share/player/[id]`, `/public/share/team/[id]`, `/public/share/game/[id]`,
`/public/share/record/[key]`, each accepting `?format=square|portrait|broadcast` (defaults to
`square`), now with `generateMetadata()` (title/description/OpenGraph/Twitter card) so links
shared on WhatsApp/X/Facebook/LinkedIn unfurl correctly.

**PNG routes (new in G.14):** `/api/share/player/[id]`, `/api/share/team/[id]`,
`/api/share/game/[id]`, `/api/share/record/[key]`, same `?format=` parameter, returning
`image/png`. Each HTML share route's OpenGraph `images` field points at its PNG counterpart, so
the social-preview image is generated from the same card view model as the page itself.

**Rule:** [`png-card.tsx`](../../web/src/lib/analytics/cards/png-card.tsx) renders any
`CardBase`-shaped view model to a PNG via Next.js's built-in `next/og` (`ImageResponse`) —
Satori (JSX→SVG) + resvg (SVG→PNG) under the hood, **already bundled with Next.js 16, no new
dependency added**. This directly satisfies the "smallest reliable server-compatible
image-rendering solution" requirement — Playwright/Puppeteer were deliberately not introduced.
The renderer consumes a purpose-built, Satori-compatible JSX tree (Satori supports only a flexbox
CSS subset, not the app's Tailwind classes), but reads from the exact same `CardBase` fields the
Tailwind-rendered HTML cards use — no card-specific PNG calculation exists. Dimensions:
`SOCIAL_SQUARE` 1080×1080, `SOCIAL_PORTRAIT` 1080×1350, `BROADCAST_16_9` 1920×1080, `WEB` 1200×630
(the last used as the default OpenGraph image size). Verified against real Season Zero data and
covered by a regression test that checks the actual PNG magic-number bytes, not just "did the
function not throw."

## Commentator facts

**Route:** `/broadcast/stats`, "Commentator Quick Facts" section (session-authenticated —
consistent with every other internal operations page, not `/public/*`).

**Rule:** [`commentator-facts.ts`](../../web/src/lib/analytics/commentator-facts.ts) builds
`CommentatorFact` objects — `{ type, text, subject, sourceRoute, calculation, provenance }` —
from exactly three sources: a genuine rank-1 result from `computePlayerRanks()`/
`computeTeamRanks()`, an entry from the Season Zero Record Book, or a milestone. Every fact
carries its `calculation` (which function + which metric id produced it) and `provenance`
(the qualified population size, or the record category) so a broadcaster can click through and
verify it. Language is restricted to a fixed vocabulary — "led," "recorded," "averaged,"
"finished with" — and a test (`SAFE_LANGUAGE_BANNED_TERMS`) asserts no fact ever contains "best
player," "most talented," "future star," "unstoppable," "elite," or any predictive phrasing
("will win," "expected to," "probability").

## What none of this does

- Never computes or displays a 4PT/Ultra Time statistic for a `BOX_SCORE_ONLY` game.
- Never uses an LLM to write Game Story, Why They Won, Game Star, Team DNA, Player DNA, or
  leaderboard text — every sentence on these pages is generated from a fixed template plus real
  numbers.
- Never edits `PlayerStat`/`TeamStat`/`Fixture`/`Standing` to make an analytic look better; a
  surprising number in the official report is reported as a surprising number, not "corrected."
- Never implements match-winner prediction, player-potential prediction, an "AI scouting score,"
  transfer valuation, injury prediction, betting odds, expected score, or simulated games — 11
  games is not sufficient evidence for any of those, and Track G.11 explicitly scoped them out.
  Terminology is deliberately restrained to match: "Season Zero Average," "Statistical Profile,"
  "Team/Player Identity," "Similarity," "Game Profile," "Statistical Edge," "Performance" — never
  "AI Score," "Talent Score," "Potential Score," "Draft Grade," "Player Value," "Win
  Probability," or "Expected Winner."
