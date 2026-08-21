# Broadcast Graphics Data Contract

G.17, Part XXI. A stable, public, read-only JSON payload for any live-graphics consumer — OBS
browser source, vMix data source, an LED display controller, or a future mobile app.

```
GET /api/games/{gameId}/snapshot-v2
```

No authentication required (read-only, no PII, no internal fields beyond a user id already
public elsewhere). Returns `404 {"error":"NOT_FOUND"}` for an unknown game id. See
[`LIVE_SNAPSHOT_V2.md`](../analytics/LIVE_SNAPSHOT_V2.md) for how the payload is derived.

## Shape

```json
{
  "gameId": "string",
  "fixtureId": "string",
  "status": "NOT_STARTED | LIVE | PAUSED | FINAL",
  "period": 2,
  "periodLabel": "HALF 2 | FINAL | ...",
  "clock": { "remainingSeconds": 447, "running": false },
  "shotClock": { "remainingSeconds": 20, "running": false },
  "isUltraTimeActive": false,
  "dataCapability": "BOX_SCORE_ONLY | EVENT_LEVEL | FULL_ULTRA",
  "score": { "home": 22, "away": 10 },
  "teams": {
    "home": { "seasonClubId": "string", "shortName": "VORTEX", "name": "Vortex" },
    "away": { "seasonClubId": "string", "shortName": "APEX", "name": "Apex" }
  },
  "liveBoxScore": {
    "players": [ { "playerId": "...", "seasonClubId": "...", "points": 14, "fieldGoalsMade": 5, "...": "see DerivedPlayerStats" } ],
    "teams": { "home": { "...": "see DerivedTeamStats" }, "away": { "...": "..." } }
  },
  "leaders": [ { "category": "POINTS | REBOUNDS | ASSISTS | STEALS | BLOCKS | FOUR_POINTERS | EFFICIENCY", "playerId": "...", "seasonClubId": "...", "value": 14 } ],
  "startingFiveConfirmed": { "home": true, "away": true },
  "currentLineups": { "home": ["playerId", "..."], "away": ["playerId", "..."] },
  "minutes": {
    "home": { "confidence": "MINUTES_VERIFIED | MINUTES_INCOMPLETE | MINUTES_UNAVAILABLE", "playerSeconds": { "playerId": 620 }, "teamElapsedSeconds": 1150, "expectedTeamPlayerSeconds": 5750, "actualTeamPlayerSeconds": 5750 }
  },
  "latestEvents": [ { "id": "...", "eventType": "SHOT_MADE", "description": "...", "period": 2, "clockSeconds": 45, "sequenceNumber": 30, "source": "ULTRA_NATIVE_LIVE_STATISTICIAN", "status": "ACTIVE" } ],
  "reconciliation": { "home": { "officialScore": 22, "statisticalScore": 22, "difference": 0, "status": "MATCHED" }, "away": { "...": "..." }, "overallStatus": "MATCHED | MISMATCH | UNAVAILABLE" },
  "verification": { "verifiedAt": "ISO-8601 | null", "verifiedById": "string | null" },
  "provenance": { "statSource": "ULTRA_NATIVE_LIVE_SCORER | FIBA_LIVESTATS_PDF_IMPORT | ... | null", "dataCapability": "BOX_SCORE_ONLY | EVENT_LEVEL | FULL_ULTRA" }
}
```

## Capability gating for consumers

`dataCapability` (top-level and inside `provenance`) tells a graphics consumer what's safe to
render:

- **`BOX_SCORE_ONLY`** (every real Season Zero game): `liveBoxScore`/`minutes`/`currentLineups`
  will be empty/unavailable. Never build a 4PT or Ultra Time graphic from this game.
- **`EVENT_LEVEL`**: a real event chronology exists, but Ultra-specific provenance (4PT, Ultra
  Time) is not guaranteed complete.
- **`FULL_ULTRA`**: safe to show 4PT breakdowns and Ultra Time state.

`minutes.{home,away}.confidence` must be checked before displaying a MIN column —
`MINUTES_UNAVAILABLE`/`MINUTES_INCOMPLETE` means don't show a number for that team, not "show 0."

## G.19 update: now consumed

Built in G.19: ten dedicated browser-source graphics under `/broadcast/game/[gameId]/*` (score
bug, player spotlight, leader, team comparison, record watch, milestone, game story, Ultra Time,
4PT moment, final score). None of them call this endpoint directly, though — they go through
`buildLivePresentationModelForGame()` (the Live Presentation Model, one layer above this raw
Snapshot V2 contract), same as every other presentation surface. This endpoint remains the public
data contract for an *external* consumer (a future mobile app, a third-party overlay) that wants
the fuller Snapshot V2 shape directly rather than the presentation-ready model. See
[`LIVE_GRAPHICS_SYSTEM.md`](./LIVE_GRAPHICS_SYSTEM.md).
