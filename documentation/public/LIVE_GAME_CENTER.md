# Public Live Game Center

G.18, Part IV. `src/app/live/page.tsx` (route: `/live` — this codebase has no separate
`/public/live`; every prior track's public live surface has lived at the top-level `/live`
route, and this one continues that established convention rather than introducing a duplicate).

## Three states

**No live game** — never an empty scoreboard. Shows the next scheduled fixture, the most recent
result (linking to its full Game Story), and a standings table with links to league stats and
the record book.

**One live game** — the full hero (`live-game-hero.tsx`'s `LiveGameHero`, extracted in G.19 so
the authenticated rehearsal preview renders the identical component): score (the dominant visual
element), period, live-ticking game clock and shot clock, an Ultra Time banner when active or
approaching, game leaders, a Live Game Story line (G.19), a Game Pulse summary (G.19: lead
changes, largest lead, current run), a compact 4PT line, a compact team comparison line (G.19),
and the most recent moment. Refreshes automatically every 8 seconds via `LiveRefresher`
(`live-refresher.tsx`) calling `router.refresh()` — deliberately not a WebSocket or SSE
connection; a spectator scoreboard doesn't need sub-second latency, and `router.refresh()`
re-runs the server component against Postgres every time with zero new infrastructure
(Part XXXII: "Do not introduce WebSockets merely because this is live... measure actual need").

**Multiple live games** — every live game's hero renders stacked, each pulling from its own
`buildLivePresentationModelForGame()` call. No separate selector route was needed given the
league's real scheduling (sequential, effectively one live game at a time in practice), but the
page doesn't assume exactly one.

## Every number traces back to one adapter

The page never queries `GameEvent`/`PlayerStat`/`TeamStat` directly and never recomputes a score,
a leader, or an Ultra Time state itself — every field comes from
`buildLivePresentationModelForGame(gameId)` (`live-game-snapshot-v2.ts`), the same call the
broadcast Commentator Command Center makes. See
[`LIVE_PRESENTATION_MODEL.md`](../analytics/LIVE_PRESENTATION_MODEL.md).

## Historical honesty preserved

Nothing about this page changes how a *finished* Season Zero game is presented — `/public/fixtures/[id]`
(Game Story, Why They Won, records, DNA — G.9-G.14) is untouched. The live Game Center only ever
renders while `Game.status` is `LIVE`/`PAUSED`; once a game reaches `FINAL`, a visitor is directed
back to the existing, unchanged historical game page via the "View game story" link.

## G.19 update: production presentation scope, and an explicit rehearsal counterpart

**A real defect found by the G.18 rehearsal, fixed in G.19**: this page's fixture-discovery
query had no isolation from a non-PRODUCTION `Fixture.recordOrigin` at all — a REHEARSAL game
could briefly appear here just by being `LIVE`. Fixed by spreading
`productionPresentationFixtureWhere()` (`src/lib/presentation-scope.ts`) into the query. Re-run
against real production HTTP by the G.19 rehearsal: a REHEARSAL-origin `LIVE` game no longer
appears on `/live`, confirmed while the rehearsal game genuinely existed and was genuinely LIVE.

Rehearsing what this page will show, without touching `/live` at all, is now possible via
`/rehearsal/live/[fixtureId]` — authenticated, `REHEARSAL`-origin-only, never linked from any
navigation. See [`LIVE_PRESENTATION_REHEARSAL.md`](../runbooks/LIVE_PRESENTATION_REHEARSAL.md).
