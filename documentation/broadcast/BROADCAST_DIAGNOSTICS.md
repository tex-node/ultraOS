# Broadcast Diagnostics

G.20, Part IV-X, XLI-XLII. `/broadcast/diagnostics` (`broadcast:operate`).

## What it answers

"Is the live production system healthy right now?" One screen, no developer stack traces,
`HEALTHY` / `WARNING` / `CRITICAL` / `UNKNOWN` only.

## Architecture

`src/lib/system-health.ts` (pure judgement functions, fully unit-tested) +
`src/lib/system-health-loader.ts` (the one Prisma-touching composition point, mirroring
`live-game-snapshot-v2.ts`'s established convention). The page itself never writes anything —
reloading it **is** "RUN SYSTEM CHECK" (Part XLIII), since every value is freshly computed
server-side on every request.

## Sections

| Section | Judges |
|---|---|
| System | Application service (trivially "responding" if the page rendered), Database (`SELECT 1` round-trip) |
| Game Data | Whichever PRODUCTION game is LIVE/PAUSED right now (or `?gameId=` to inspect a specific one) — Snapshot V2 freshness |
| Scorer / Statistician | Score reconciliation: official vs statistical, MATCHED/MISMATCH/UNAVAILABLE |
| Presentation | Program state structural validity + age |
| Browser Sources | All ten graphics routes, structurally judged from the same model already in hand |
| Public / Commentator | `/live` and `/broadcast/stats`' underlying query health |

## Freshness, not just "did it 200"

See [`LIVE_DATA_STALENESS_RECOVERY.md`](../runbooks/LIVE_DATA_STALENESS_RECOVERY.md) for the
freshness model and its thresholds. A game with no live activity expected (PAUSED, FINAL,
NOT_STARTED) never falsely reports stale — Snapshot freshness is `NOT_APPLICABLE`, not a warning,
whenever nothing is actually supposed to be updating (Part VII's own instruction: "do not infer
outage solely because no scoring event occurred").

## Score reconciliation is never auto-corrected

If the official and statistical scores disagree, this page surfaces it — `WARNING` while the
game is live, `CRITICAL` once FINAL (an unresolved mismatch after the game has ended is more
severe). Nothing here ever writes a corrected score; that stays the statistician's own audited
correction flow (`/games/[fixtureId]/stats`, G.17).

## Incident integration

Reuses the existing incident system (`/incidents`) — this page never creates an incident
automatically. A "Report Incident" link appears only when there's something to report, prefilled
with type/severity/description via query parameters; the operator still reviews and submits it
themselves.

## Also visible on `/gameday`

A compact "Live system health" strip was added to the Game Day Control Center (Part XII),
computed from the exact same `buildSystemHealth()` call — never a second monitoring truth. It
links to this full diagnostics page for detail.
