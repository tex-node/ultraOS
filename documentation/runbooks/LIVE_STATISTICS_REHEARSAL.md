# Live Statistics Rehearsal

How to run a full isolated rehearsal of the live-statistics stack (G.15-G.17), including a real
mid-game service restart and a real concurrent-substitution race. Scripts:
`web/scripts/g17-rehearsal-part1.ts` / `g17-rehearsal-part2.ts`.

## Why a script, not the real UI

Driving the actual authenticated UI would require logging into the admin console, which means
entering a password into a login form — prohibited regardless of authorization, in every session
this applies to. The rehearsal scripts instead call the identical underlying Prisma
transactions/domain functions the real server actions use, with an explicit actor id instead of
a session-derived one. This is a disclosed methodology gap, not a shortcut around the logic being
tested — see each script's header comment.

## Isolation, proven before anything else matters

Every rehearsal fixture uses `recordOrigin: "REHEARSAL"` and a far-future `scheduledAt` with
`status: "SCHEDULED"` (not `"LIVE"`) so it doesn't sort to the top of `/public/fixtures` or read
as an actual live game during its brief existence in production. `competitiveFixtureScope()`
(`src/lib/competitive-scope.ts`, the G.16 P0 fix) is what makes it safe to actually **finalize**
a rehearsal fixture and call `recalculateStandings()` — every season-wide aggregator excludes
non-`PRODUCTION`-origin fixtures by construction, proven each rehearsal by finalizing the
rehearsal game and confirming real standings/leaderboards stay byte-identical.

## Two-part structure, for the real restart test

Part 1 builds up a full game (starting five, shots and stats on both consoles, substitutions
including a genuine concurrent race, Ultra Time) up to a nontrivial mid-game state, then prints
the fixture/game ids and the pre-restart score/sequence/event-count as `KEY=value` lines.

Between Part 1 and Part 2, **actually restart the service**:

```bash
curl -s http://127.0.0.1:4110/api/games/$GAME_ID/snapshot-v2 -o /tmp/pre-restart.json
sudo systemctl restart ultraos-web.service
curl -s http://127.0.0.1:4110/api/games/$GAME_ID/snapshot-v2 -o /tmp/post-restart.json
diff /tmp/pre-restart.json /tmp/post-restart.json   # must be empty
```

Part 2 (run with the ids/values from Part 1 as env vars) verifies the DB-level state survived,
continues the game (minutes verification, materialization, idempotency check, hand-verification),
finalizes it, exercises a post-final statistical correction and re-verification, then cleans up
every rehearsal row and confirms production standings/leaderboards match the pre-rehearsal
baseline exactly.

## The concurrent-substitution race technique

`substituteAtomic()` in Part 1 mirrors `recordSubstitution()`'s real transaction shape exactly:
lock the `Fixture` row, re-derive the lineup from currently-persisted state, validate, write — all
inside one `$transaction`. Firing two identical conflicting requests via `Promise.all` and
asserting "exactly one succeeded, one failed with a real validation error" tests the actual
atomicity guarantee, not an approximation of it — the row lock forces the second transaction to
re-read the first's already-applied substitution before validating, so the conflict is caught
correctly rather than racing.

## Cleanup

Delete order matters (children before parents): `PlayerStat` → `TeamStat` → `GameEvent` →
`GameStarter` → `Game` → `Fixture`, then re-run `recalculateStandings()` for the real season only.
Never delete a real production row — every delete in these scripts is scoped to the rehearsal
`gameId`/`fixtureId` captured at creation time.
