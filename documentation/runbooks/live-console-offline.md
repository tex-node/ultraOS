# Live scoring console - offline taps (A5)

Operator runbook for the offline behaviour of the basketball scoring console
(`/games/<fixtureId>/live`). Written 2026-10-17 with A5 Step 8. Everything here describes what the
console actually does today, including what it deliberately does not do.

## What the console does when the network drops

| Situation | What happens |
|---|---|
| Online, `NEXT_PUBLIC_OFFLINE_SCORING_ENABLED` unset/false (current production default) | Unchanged: every tap submits the `recordScore` server action. If the network is down the tap fails, as it always has. |
| Online, flag `true` | Same as above. The flag only changes the offline path. |
| Offline, flag `true` | The tap is resolved **on the device** and written to IndexedDB, then acknowledged in amber: `Captured offline: +2x2 = 4 (Ultra Time) - queued for sync · N pending`. Nothing reaches the server until connectivity returns. |
| Offline, flag `true`, capture fails | A red line appears: `Not captured: <reason> - the tap did NOT reach the queue.` That point is **lost** - record it on paper and re-enter it after reconnecting (see "Recovering a lost tap"). |

The score/clock block at the top of the console still shows the **server's** score, so while offline
it does not move. The amber acknowledgment and the pending count are the only local evidence a tap
landed. Do not treat the scoreboard as authoritative until the queue has drained.

## Why a tap can be captured offline at all

Ultra Time (the 2x scoring window) is derived from the wall clock, which the server cannot
reconstruct for a record that arrives an hour later. So the device resolves the shot itself at tap
time using the same pure functions the server uses live (`resolveClientShot`), attaches
`clientObservedAt`, and the server **validates** rather than re-resolves it on replay
(`src/lib/scoring/validate-client-shot.ts`). A resolution the server considers impossible
(implausible timestamp, bad arithmetic, a multiplier these rules cannot produce) fails that record
rather than corrupting the game.

## What happens when the connection returns

1. The console's sync trigger fires on the next `online` event or when the tab becomes visible
   (Background Sync on Chromium; the event fallback on Safari/iPad).
2. The outbox drains to `POST /api/sync/outbox`, in `clientUpdatedAt` order, one transaction per
   record, idempotent per record.
3. Each replayed SCORE applies the **same effects** a live tap does: fixture score, PlayerStat,
   TeamStat, and the opponent's Ultra Time tally (A5 Step 7). The event keeps the id the device
   generated, and its before/after score fields are filled from the **server's** fixture row - not
   from the device's stale snapshot.

The sync badge (top of every operations page) shows `N pending sync` while records are queued,
`Offline` when the network is down, and `N failed · Retry` when something has dead-lettered.

## When something dead-letters

A record fails 5 times and then stops being retried automatically. The badge turns red:
`N failed · Retry`.

1. Click the badge. It resets the dead-lettered records and drains again.
2. If it stays red, the record's failure is permanent. Read the reason on the sync badge's tooltip /
   the `SyncIdempotency`/outbox `failureReason` for that device, then:
   - `FIXTURE_ALREADY_HAS_GAME` - the device queued a `Game:CREATE` for a game the server already
     had. This cannot happen through the console any more (`attachServerGame` never queues a
     CREATE), but an old queued record from a pre-A5 build would show it. Drop that record; the
     game already exists.
   - `IMPLAUSIBLE_CLIENT_OBSERVATION` - the device's clock is wrong (more than 5 minutes ahead or
     24 hours behind the server). Fix the device clock, re-enter the tap manually.
   - `INVALID_TEAM` / `INVALID_PLAYER` / `POINTS_MISMATCH` - the queued event's own fields are
     inconsistent (wrong team, a player from the other roster, arithmetic that does not add up).
     This is a client bug, not a scoring decision: record the shot manually and report it.
3. **Do not delete the IndexedDB database** to clear a stuck queue - that is the unsynced ledger.
   Dropping individual records is the supported repair.

## Recovering a lost tap

There is no local record of a tap the device failed to capture. If the acknowledgment is red:

1. Write the shot on the paper score sheet (period, clock, team, player, value).
2. After reconnecting, confirm the scoreboard, then re-enter the shot through the console normally
   (or via Undo/Manual correction if the score has since moved).
3. If the game was finalized in the meantime, use the statistician console / reopen flow rather than
   scoring into a final game.

## Known limitations (by design, this increment)

- **The on-screen score does not update locally.** There is no client-side score projection yet;
  replay computes the authoritative before/after values server-side.
- **Only scoring taps queue offline.** Stat events (rebound/assist/foul...), clock, period, undo,
  void and correction still require the network.
- **A single device's queue is not reconciled with another device's offline writes.** Two tablets
  scoring the same game offline will both queue; the server applies them in arrival order. Do not
  run two offline scorekeepers on the same game.
- **The local clock anchor** is refreshed on every server render of the console. A pause/resume
  performed on a device that never reached the server will not be reflected - the device keeps
  resolving against its last known anchor.

## Turning it on

The flag is a build-time public env var (`NEXT_PUBLIC_OFFLINE_SCORING_ENABLED=true`) - it is inlined
into the client bundle, so it requires a **rebuild/redeploy**, not just a restart. It is off
everywhere today; production should only be turned on after a logged-in rehearsal on staging that
includes an actual network drop (see `LIVE_STATISTICS_REHEARSAL.md` for the pattern).

## Verifying it during a rehearsal

1. Open the console online. Select a player, tap +2. Score moves, event appears in the play-by-play.
2. Turn the device's network off (airplane mode, not just a closed tab).
3. Tap +2 twice. Each tap must show an amber `Captured offline ... · N pending`.
4. Reload the page while still offline. The console must still load (service worker shell) and new
   taps must continue to queue.
5. Restore the network. Within a few seconds the badge shows `N pending sync`, then `Synced`.
6. Verify on the scoreboard: the score advanced by exactly the queued points, and the play-by-play
   shows the events with their original period/clock, `resolvedBy = CLIENT`.
7. Check the box score: the player's points/categories and the team totals match the taps, and Ultra
   Time points appear in `ultraTimePointsFor` / the opponent's `ultraTimePointsAgainst`.
