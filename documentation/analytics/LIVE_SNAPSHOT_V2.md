# Live Snapshot V2

G.17, Part X. `src/lib/live-game-snapshot-v2.ts` (`buildLiveGameSnapshotV2(gameId)`), exposed
publicly and read-only at `GET /api/games/[id]/snapshot-v2`.

## Why a V2, not a rewrite of V1

`live-game-snapshot.ts` (G.15, "V1") stays a pure function — the caller fetches, it composes.
That doesn't scale cleanly to V2's dozen-plus independent data sources (box score, leaders,
lineups, minutes, starting five, reconciliation, verification, provenance) without an unwieldy
parameter list, so V2 is intentionally the one file allowed to touch Prisma for this concern —
the same "one Prisma-touching composition point" convention `game-analytics.ts` already
established for historical analytics. V1 is untouched and still used where it already was.

## What it composes (never recomputes)

| Field | Source primitive |
|---|---|
| `liveBoxScore` | `derivePlayerStats()` / `deriveTeamStats()` (`event-derived-stats.ts`) |
| `leaders` | The same `efficiencyProxy()` formula historical Game Star already uses (`player-analytics.ts`) — never a second "live efficiency" definition |
| `currentLineups` | `deriveLineup()` (`lineup.ts`) |
| `minutes` | `verifyTeamMinutes()` (`lineup-stints.ts`) |
| `reconciliation` | `reconcileGameScore()` (`reconciliation.ts`), fed by the same event-derived score as the statistician console |
| `dataCapability` | `getGameAnalyticsCapability()` (`game-data-capability.ts`) |
| `clock`/`shotClock`/`period` | `remainingClockSeconds()`/`remainingShotClockSeconds()`/`periodLabel()` (unchanged from V1) |

## Deliberately excluded fields

`scoringTimeline`, `provisionalRecords`, and `provisionalMilestones` (all sketched in the G.17
brief) are **not** in V2. Building them against a live game that essentially never runs in
production yet — one native game exists, with zero player attribution and zero statistician
events — would be presentation logic validated against nothing real, the same judgment call
G.16 made deferring public/broadcast live surfaces. Every field that *is* in V2 is backed by a
primitive already proven against real production data and the G.17 rehearsal.

## Verified via a real restart

The strongest proof of this endpoint's correctness isn't a unit test — it's the G.17 rehearsal's
restart test: the same rehearsal game's `/api/games/[id]/snapshot-v2` response was captured via a
real `curl` immediately before an actual `systemctl restart ultraos-web.service`, and again
immediately after. **The two HTTP responses were byte-identical.** No in-memory state, no cache —
every field is read fresh from Postgres on every request.

## The data contract

Public, unauthenticated, read-only (no PII, no internal correction reasons — `statisticsVerifiedById`
is the only "operator" field exposed, and it's already a user id visible elsewhere in the app).
See [`BROADCAST_GRAPHICS_DATA_CONTRACT.md`](../broadcast/BROADCAST_GRAPHICS_DATA_CONTRACT.md) for
the field-by-field payload reference intended for OBS/vMix/browser-source consumers.
