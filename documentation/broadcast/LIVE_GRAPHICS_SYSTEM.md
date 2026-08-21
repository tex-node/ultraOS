# Live Graphics System

G.19, Part X-XXI. Ten dedicated browser-source pages under `/broadcast/game/[gameId]/*`, plus
one pre-existing route (`scorebug`) migrated onto the same rules. Every route is unauthenticated
(an OBS/vMix Browser Source can't log in) but production-scope-gated: a direct hit on a
REHEARSAL (or any non-PRODUCTION) game id 404s (`loadProductionGraphicModel()` in
`src/lib/broadcast-graphic-loader.ts`).

## The rule: graphics never calculate their own statistics

Every route calls `loadProductionGraphicModel(gameId)`, which returns `{ fixture, model }` where
`model` is the exact same `LivePresentationModel` public `/live` and the Commentator Command
Center consume. A graphic page never touches Prisma, `event-derived-stats.ts`, or any analytics
function directly — display metadata only (a player's name/jersey number, via
`resolvePlayerDisplay()`) is fetched separately, since that's identity, not a statistic.

| Route | Shows | Subject |
|---|---|---|
| `scorebug` | Score, period, clock, shot clock, Ultra Time indicator | — |
| `player-spotlight` | Name, club, PTS/REB/AST, 4PM/Ultra Time PTS if `FULL_ULTRA` | `?playerId=` |
| `leader` | POINTS/REBOUNDS/ASSISTS leaders — "LIVE LEADER" while live, "Game Leader" once FINAL | — |
| `team-comparison` | FG%/REB/AST/TOV/PF, +4PT if `FULL_ULTRA` | — |
| `record-watch` | TIED / NEW SEASON ZERO RECORD (PROVISIONAL until verified) | — |
| `milestone` | Player, metric, value for an in-game threshold | `?playerId=` (optional) |
| `game-story` | The primary Game Story tag + lead fact | — |
| `ultra-time` | Dedicated Ultra Time overlay, score included | — |
| `four-point-moment` | "4PT MADE", ×2/8 POINTS during Ultra Time — never flattened to "8PT SHOT" | `?eventId=` (optional) |
| `final` | Final score; "STATISTICS PENDING VERIFICATION" replaces Game Star/records until verified | — |

## Browser-source hygiene

- No navigation chrome, no page scrollbars — every route renders a single inline-flex card.
- `TransparentBody` (`src/app/broadcast/game/transparent-body.tsx`) overrides the app's global
  opaque `body` background back to transparent, scoped to just these routes. **Found via QA**:
  the shared `bg-transparent` div wrapper alone wasn't enough — the surrounding `<body>`, set
  opaque dark by `globals.css` for the whole app, still filled whatever region an OBS Browser
  Source captured. Fixed and verified (`getComputedStyle(document.body).backgroundColor` reads
  `rgba(0,0,0,0)` on a graphics route, `rgb(5,8,7)` everywhere else).
- `GraphicRefresher` (`src/app/broadcast/game/graphic-refresher.tsx`) polls `router.refresh()`
  every 3-5s — see `BROWSER_SOURCE_SETUP.md` for why polling over WebSockets.

## Isolation, proven against real production

`isProductionPresentationFixture()` gates every route. The G.19 rehearsal confirmed live, over
real HTTP against the deployed server: a REHEARSAL game's `scorebug`/`clock`/broadcast-tooling-API
all 404, while a real PRODUCTION game's `scorebug` still renders 200 — the gate is selective, not
a blanket failure.
