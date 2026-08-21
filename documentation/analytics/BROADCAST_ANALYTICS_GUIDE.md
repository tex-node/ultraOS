# Broadcast Analytics Guide — Season Zero

A guide for anyone narrating, commentating on, or writing about Season Zero using
UltraLeagueOS's public analytics and its `/broadcast/stats` dashboard — what's safe to say on
air, where each fact traces back to, and what's still genuinely not built (so nobody assumes a
capability exists that doesn't).

## The one rule that matters most

**Never make Season Zero look more technologically instrumented than it actually was.** All 11
real games are `BOX_SCORE_ONLY` — final box-score totals and period scores, nothing finer. There
is no shot chart, no play-by-play feed, no possession log, and no 4PT/Ultra Time data for any real
Season Zero game. Every fact in this guide is real precisely because it stays within that
boundary. If a stat sounds like it needed a shot clock or a tracking camera to produce, it isn't
from Season Zero — don't say it.

## `/broadcast/stats` — the commentator dashboard

Session-authenticated (same login as every other internal operations page — this is production
tooling, not a public page). Sections, top to bottom:

- **Season Zero Snapshot** — league-wide pulse cards (games played, total points, highest-scoring
  game, closest game).
- **Commentator Quick Facts** — a handful of `CommentatorFact` entries (see below), each
  expandable to show its source/calculation/qualification.
- **Top Scorers / Top Rebounders / Top Playmakers** — the top 5 of each `buildPlayerLeaderboard()`
  category, `QUALIFIED` only.
- **Game Stars** — the `GAME_STAR` performer from each completed game, linked to that game.
- **Team Leaders** — every team's rank-1 categories, linked to the club page.
- **Records** — the first 10 entries from the Season Zero Record Book, linked to the full book.
- **Milestones** — the most recent player and team milestones.
- **Season Stories** — the same Season Story Cards shown on `/public/stats` (G.10), linked here
  for convenience during a broadcast.
- **Player & Team Comparison** — links out to the existing, already-verified
  `/public/stats/compare/players` and `/compare/teams` tools rather than duplicating that
  calculation inside the dashboard.
- **Commentator Story Packs** (new in G.14) — per finished game, a compact pre-game/in-game
  context block for both teams built entirely from already-computed season data: record, PPG,
  opponent PPG, rebounding/bench/paint DNA rates, team identity sentence, and the team's leading
  scorer with their season PPG rank. No predictions, no fabricated head-to-head history — if the
  database has no record of two teams having met before, the story pack simply doesn't claim one.

Every subject on the dashboard (a game, a team, a record) also links directly to
`/broadcast/graphics` to open its full production graphic — see
[`BROADCAST_GRAPHICS_OPERATOR_GUIDE.md`](./BROADCAST_GRAPHICS_OPERATOR_GUIDE.md).

## Commentator fact traceability

Every fact on the dashboard is a `CommentatorFact` object
(`web/src/lib/analytics/commentator-facts.ts`): `{ type, text, subject, sourceRoute, calculation,
provenance }`. Expanding a fact on `/broadcast/stats` shows exactly which function computed it
(`calculation`, e.g. `"computePlayerRanks() — PPG"`) and the qualification rule that applied
(`provenance`, e.g. `"Qualified population: 14 players"`), plus a link to the source page. A fact
is only ever built from one of three places: a genuine rank-1 result, a Season Zero Record Book
entry, or a milestone — never freeform text, never an LLM.

## Where the broadcast-safe facts live (map)

| Need | Page | What's there |
|---|---|---|
| Commentator quick facts with traceability | `/broadcast/stats` | Quick Facts panel |
| Player's season identity, one line | `/public/players/[id]` | Statistical Identity sentence, Strengths/Developing Areas badges |
| Player's league rank in a stat | `/public/players/[id]` | Rank badges, e.g. "#2 PPG · 8 of 14 qualified" |
| Player's best game this season | `/public/players/[id]` | Game Log's Best Game strip |
| Player's earned milestones | `/public/players/[id]` | Milestones section |
| Team's identity, one line | `/public/clubs/[id]` | Team Statistical Identity sentence |
| Team's best performance this season | `/public/clubs/[id]` | Best Team Performance card (composite formula, not just biggest margin) |
| Team's earned milestones | `/public/clubs/[id]` | Milestones strip on the game log card |
| Why a completed game went the way it did | `/public/fixtures/[id]` | Game Story tags, "Why They Won" factors, Matchup Intelligence |
| Head-to-head edge before a rematch talking point | `/public/stats/compare/*` | Head-to-Head Edges grid + 3-sentence descriptive summary |
| "Is this a record?" | `/public/stats/records` | Season Zero Record Book |
| A shareable/on-screen card for any of the above | `/public/share/player\|team\|game\|record/[id]` | See [`ULTRA_ANALYTICS_CARD_GUIDE.md`](./ULTRA_ANALYTICS_CARD_GUIDE.md) |

## Traceability — every fact has a source

Every number above resolves to one of:
1. A field directly on `Fixture` / `Game` / `TeamStat` / `PlayerStat` (a box-score total), or
2. A documented deterministic formula over those fields (Team DNA, Player DNA, rank context,
   the record book, the milestone engine — all specified in
   [`SEASON_ZERO_ANALYTICS_METHODS.md`](./SEASON_ZERO_ANALYTICS_METHODS.md) and
   [`SEASON_ZERO_RECORD_BOOK.md`](./SEASON_ZERO_RECORD_BOOK.md)).

Nothing on any of these pages is written by an LLM, guessed, or manually curated — the same page,
loaded twice, always shows the same number for the same completed game. If a fact needs
verifying live, the methods doc is the executable specification; the underlying test file
(`analytics.test.ts`) is the ground truth if the doc and the code ever disagree.

## What's safe to say vs. what isn't

**Safe (descriptive, past tense, sourced from a completed game):**
- "[Player] led all scorers this season at [X] PPG, [Nth] in the league among qualified players."
- "[Team]'s best performance this season came in their [margin]-point win over [opponent] — [X]
  rebounds and [X] bench points to go with it." (naming the composite reasoning, not just margin)
- "This is the [Nth] time these two teams have met — [Team]'s rebounding numbers have the edge in
  the head-to-head series so far."
- "That's a new Season Zero record for [category]." / "[Player] recorded a [milestone] against
  [opponent]."

**Never safe (predictive, or beyond what the data supports):**
- Anything phrased as a prediction, expectation, or probability ("expected to win," "on pace
  for," "will likely") — every page's own summary text and every commentator fact is
  tested to never contain that language (`SAFE_LANGUAGE_BANNED_TERMS`).
- Any 4PT, Ultra Time, shot-location, or possession-level claim for a real Season Zero game —
  none of that was captured.
- An "AI score," "talent grade," "draft grade," "best player," "most talented," "future star," or
  similar synthesized/superlative rating — see the "What none of this does" section of
  `SEASON_ZERO_ANALYTICS_METHODS.md`.

## Bitmap image export (resolved in G.14)

`/api/share/player/[id]`, `/api/share/team/[id]`, `/api/share/game/[id]`, and
`/api/share/record/[key]` return real `image/png` bytes, generated by Next.js's built-in
`next/og` — no new dependency, no Playwright/browser-screenshot automation. Every HTML share
page's OpenGraph/Twitter metadata already points at its PNG counterpart, so pasting a share link
into WhatsApp/X/Facebook/LinkedIn unfurls the real card image. Full detail:
[`ULTRA_ANALYTICS_CARD_GUIDE.md`](./ULTRA_ANALYTICS_CARD_GUIDE.md#png-export).

## Scope note — what's still genuinely not built

- **Social API integration.** Social copy is structured data (`{ headline, subject, stat }`
  shape), never auto-posted anywhere.

Everything else described in this guide (the dashboard, the graphics gallery, the card system,
commentator facts, milestones, development context, PNG export) is real and live — not a
future-work placeholder.
