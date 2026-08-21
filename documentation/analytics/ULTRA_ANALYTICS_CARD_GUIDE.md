# Ultra Analytics Card Guide

The reusable visual card system that powers web embeds, broadcast compositions, shareable card
routes, and PNG export from **one** calculation. Source:
[`web/src/lib/analytics/cards/`](../../web/src/lib/analytics/cards/) (view models) and
[`web/src/components/analytics/cards/`](../../web/src/components/analytics/cards/) (React
components).

## The core idea: one view model, four renderers

A card is built in two steps, never one:

1. **View model** (`src/lib/analytics/cards/*.ts`) — a pure function that takes an
   already-computed canonical analytics object (`SeasonPlayerTotals`, `PlayerDna`, `TeamDna`,
   `RankBadge`, `TopPerformer`, `TeamComparisonResult`, `PlayerComparisonResult`, `RecordEntry`,
   a milestone, a leaderboard entry, a best-game/best-performance row) and returns a plain,
   serializable object shaped like `CardBase`. **No view-model builder ever touches Prisma or
   recomputes a number a domain file already owns.**
2. **Renderer** — either a React server component (`src/components/analytics/cards/*.tsx`, for
   the web-embedded/HTML share views) or the PNG renderer (`png-card.tsx`, for bitmap export).
   Neither renderer fetches data or re-derives a value; their only job is layout.

The same view model, unchanged, drives the web-embedded card, the `/public/share/*` HTML route,
the Graphics Gallery preview, and the `/api/share/*` PNG export. If a number needs to change, it
changes in exactly one place.

## Card catalogue

Every card below is wired to at least one live UI surface — either a public page embed, a
`/public/share/*` route, or the operator-only Graphics Gallery (`/broadcast/graphics`) — as of
Track G.14. None are "built but only proven via a test."

| Card | Builder | Component | Consumes | Live surface |
|---|---|---|---|---|
| Player Spotlight | `buildPlayerSpotlightCard()` | `AnalyticsCard` | `SeasonPlayerTotals`, `RankBadge[]` | `/public/share/player/[id]`, Gallery |
| Game Star | `buildGameStarCard()` | `AnalyticsCard` | `TopPerformer` (the `GAME_STAR` entry from `selectTopPerformers()`) | `/public/fixtures/[id]` (Broadcast Cards section), Gallery |
| Player DNA | `buildPlayerDnaCard()` | `AnalyticsCard` | `PlayerDna`, `PlayerArchetype` | `/public/players/[id]`, Gallery |
| Player Best Game | `buildPlayerBestGameCard()` | `AnalyticsCard` | a `loadPlayerBestGame()` row (same effective-efficiency metric as Game Star) | Gallery |
| Team Profile | `buildTeamProfileCard()` | `AnalyticsCard` | `SeasonTeamTotals`, `TeamDna \| null`, `RankBadge[]` | `/public/share/team/[id]`, Gallery |
| Team DNA | `buildTeamDnaCard()` | `TeamDnaCardView` | `TeamDna` (top 3–5 dimensions as horizontal bars) | `/public/clubs/[id]`, Gallery |
| Team Best Performance | `buildTeamBestPerformanceCard()` | `AnalyticsCard` | a `selectBestTeamPerformance()` row | Gallery |
| Team Leader | `buildTeamLeaderCard()` | `AnalyticsCard` | `RankBadge`, `SeasonTeamTotals` | Gallery |
| Matchup (team) | `buildMatchupCard()` | `MatchupCardView` | `TeamComparisonResult` (its own `edges`, never re-derived) | `/public/stats/compare/teams`, Gallery |
| Matchup (player) | `buildPlayerMatchupCard()` | `MatchupCardView` | `PlayerComparisonResult` (same edge shape, same primitive) | `/public/stats/compare/players`, Gallery |
| Category Leader | `buildCategoryLeaderCard()` | `AnalyticsCard` | `LeaderboardEntry` | `/public/stats` (Category Leaders section), Gallery |
| Record | `buildRecordCard()` | `AnalyticsCard` | `RecordEntry` | `/public/share/record/[key]`, `/public/stats/records`, Gallery |
| Milestone | `buildPlayerMilestoneCard()` / `buildTeamMilestoneCard()` | `AnalyticsCard` | a `PlayerMilestone` / `TeamMilestone` | `/public/players/[id]`, `/public/clubs/[id]`, Gallery |
| Game Result | `buildGameResultCard()` | `GameResultCardView` | `GameCore`, `GameStoryTag[]`, one key stat | `/public/share/game/[id]`, Gallery |
| Why They Won | `buildWhyTheyWonCard()` | `AnalyticsCard` | `WhyTheyWonFactor[]` (from `rankWhyTheyWon()`, directional gate already enforced) | `/public/fixtures/[id]` (Broadcast Cards section), Gallery |

`AnalyticsCard` is the generic renderer used by every card whose layout is "eyebrow + subject +
photo + primary metric + supporting metrics + rank context." A card with a genuinely different
shape (a score display, DNA trait bars, a matchup edges grid) gets its own small view component
instead of growing `AnalyticsCard`'s branching logic — see `GameResultCardView`,
`TeamDnaCardView`, `MatchupCardView`.

`Player Best Game` and `Team Best Performance` accept a **structural type**, not an imported type,
from their source domain files (`PlayerBestGame` from `game-analytics.ts`, `TeamGameLogRow` from
`team-game-log.ts`) — importing those types directly would eagerly load Prisma into an otherwise
pure module, the exact class of bug that broke the test suite once before in this project (see
the comment at the top of `player-cards.ts`).

## Formats

Every card supports four presentation formats via the `CardFormat` type:

| Format | Aspect | Intended use |
|---|---|---|
| `WEB` | responsive, no locked ratio | embedded in a normal page flow |
| `SOCIAL_SQUARE` | 1:1 (≈1080×1080) | Instagram/general social |
| `SOCIAL_PORTRAIT` | 4:5 (≈1080×1350) | Instagram/Twitter portrait |
| `BROADCAST_16_9` | 16:9 (≈1920×1080-safe) | broadcast composition |

Formats are declared on `InsightCardShell` (`src/components/analytics/cards/InsightCardShell.tsx`)
via a Tailwind `aspect-*` class — the same card content reflows to fit whichever ratio is
requested. Share routes accept the format as a query parameter: `?format=square` (default),
`?format=portrait`, `?format=broadcast`.

## Safe areas

`InsightCardShell` applies **6% padding on every side** as its safe-area margin — proportional at
every format, so nothing ever renders flush against the edge. At `BROADCAST_16_9` this leaves
clear space below the card for a scorebug or lower-third to coexist without overlapping card
content; the card itself never assumes it owns the full frame.

## Typography hierarchy

Every card follows the same three-tier hierarchy, top to bottom:

1. **Eyebrow** (10px, bold, uppercase, cyan) — the category or context ("Season Zero", a stat
   category, a record title).
2. **Subject** (18px, black weight, white) — the player or team name, with club/short-name as a
   12px muted subtitle directly beneath.
3. **Primary metric** (30px, black weight) with its label (10px, uppercase, muted) above it —
   the one number the card exists to communicate. Supporting metrics render smaller and inline
   below it; rank context (if any) renders as a bold cyan line beneath that.

This ordering is deliberate: the spec's "communicate in under 3 seconds" requirement means the
single most important number must be visually dominant, not competing with five equal-weight
stats.

## Provenance & capability

Every card carries a `provenance: { source, qualification }` field (which function computed it,
and what qualification/sample rule applied) and a `capability: GameAnalyticsCapability`
(`BOX_SCORE_ONLY` / `EVENT_LEVEL` / `FULL_ULTRA`), rendered as a small badge via
`GAME_ANALYTICS_CAPABILITY_PROVENANCE_LABEL`. **No card reads a 4PT or Ultra Time field** — the
view-model builders simply never touch `fourPointsMade`/`ultraTimePoints`/etc., so a
`BOX_SCORE_ONLY` card structurally cannot leak them. A future `FULL_ULTRA` game only needs the
capability tag passed through as `"FULL_ULTRA"`; the card renders correctly today (it just has
nothing Ultra-specific to show yet, since no dimension currently reads those fields) and the type
system already accepts it without any card-layer change.

## Sponsor slot

`InsightCardShell` accepts an optional `sponsorSlot?: { label: string; logoUrl: string }`,
rendered as a small logo in the card's bottom-right safe area. **Default is `undefined` — no
sponsor ever appears unless one is explicitly supplied by the caller.** Nothing in this track
hardcodes a sponsor.

## Accessibility

- Every card's text is real semantic HTML (`h3`, `dl`/`dt`/`dd`, `p`) — never information encoded
  only as a color or icon. Screen readers get the same content sighted users do.
- Every `<img>` (subject photo, sponsor logo) carries descriptive `alt` text.
- No card animates, so `prefers-reduced-motion` has nothing to override — if a future card adds
  motion, it must respect that media query per the same accessibility rule.

## PNG export

`/api/share/player/[id]`, `/api/share/team/[id]`, `/api/share/game/[id]`, `/api/share/record/[key]`
— same `?format=square|portrait|broadcast` parameter as the HTML share routes, returning
`image/png`. Rendered by [`png-card.tsx`](../../web/src/lib/analytics/cards/png-card.tsx) via
Next.js's built-in `next/og` (`ImageResponse` — Satori + resvg), which ships with Next.js 16
already, so **no new dependency was added**. Playwright/Puppeteer-style browser-screenshot
automation was deliberately avoided per the "smallest reliable, no heavyweight browser runtime"
requirement.

The PNG renderer reads the same `CardBase` fields as the HTML renderer (`eyebrow`, `subject`,
`club`, `primaryMetric`, `supportingMetrics`, `rankContext`, `provenance`, `capability`) through a
purpose-built, Satori-compatible JSX tree — Satori only supports a flexbox CSS subset, so the
Tailwind-classed `AnalyticsCard` component couldn't be reused directly, but the *data* it reads is
identical. Dimensions: `SOCIAL_SQUARE` 1080×1080, `SOCIAL_PORTRAIT` 1080×1350, `BROADCAST_16_9`
1920×1080, `WEB` 1200×630 (used as the default OpenGraph image). Every HTML share route's
`generateMetadata()` points its `openGraph`/`twitter` image at the matching PNG endpoint, so a
link pasted into WhatsApp/X/Facebook/LinkedIn unfurls with the real card image.

No internal database ID, filename, email, or phone number is ever printed on a PNG — the renderer
only has access to the same public-safe `CardBase` fields the HTML cards already expose.

## Future Ultra metrics

The card system does not need to change shape when a `FULL_ULTRA` game exists — it needs new
**upstream** dimensions (a 4PT/Ultra Time entry in Player DNA or the metric registry) that a
card's existing `primaryMetric`/`supportingMetrics` slots can already display. Adding a card for
an Ultra-specific stat (e.g. an "Ultra Time Impact Card") should follow the exact same two-step
pattern — a pure view-model builder consuming a canonical Ultra-aware calculation, then a thin
render component — never a card that queries Prisma or computes a 4PT number itself.
