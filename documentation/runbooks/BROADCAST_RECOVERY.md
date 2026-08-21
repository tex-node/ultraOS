# Runbook: Broadcast Recovery

G.19, Part XLI, LIV. What to do when a browser-source graphic, the control panel, or the whole
service needs to recover mid-broadcast.

**G.20 update**: check [`/broadcast/diagnostics`](../broadcast/BROADCAST_DIAGNOSTICS.md) first — before
guessing, it will tell you which component is actually unhealthy (database, snapshot freshness,
reconciliation, Program, or a specific browser source) rather than needing to check each by hand.
For consumer-side (browser source / API poller) recovery specifically, see
[`BROADCAST_CONSUMER_RECOVERY.md`](./BROADCAST_CONSUMER_RECOVERY.md).

## A single browser source looks stuck or wrong

Reload it. Every graphic re-derives its content fresh from Postgres/SystemSetting on each render
(`export const dynamic = "force-dynamic"`, `revalidate = 0` on every route) — there is no
client-side cache to clear. If it's still wrong after a reload, the underlying data is wrong, not
the graphic; check the scorer/statistician console for that game.

## The `ultraos-web` service restarts mid-broadcast

Nothing to do. Broadcast Presentation State lives in the `SystemSetting` table, not in memory —
the next poll from any browser source (within its 3-5s interval) or the next `/broadcast/control`
page load returns exactly the Program state that was set before the restart. Proven directly by
the G.19 rehearsal's restart-recovery check. Do not manually reselect the on-air graphic; if you
do, you've only re-confirmed what was already there.

## Program is on the wrong game/graphic

Go to `/broadcast/control`, select the correct graphic in Preview, click **TAKE**. There is no
"undo" for a bad TAKE other than taking the correct thing next — Program state has no history,
by design (Part XXV explicitly didn't ask for one, and adding it would be scope creep against a
system whose entire job is "what is on air right now").

## A rehearsal fixture is left behind (a rehearsal script failed partway through)

```bash
npx tsx -e '
import { prisma } from "./src/lib/prisma";
import { recalculateStandings } from "./src/lib/standings";
async function main() {
  const fixtures = await prisma.fixture.findMany({ where: { recordOrigin: "REHEARSAL" }, include: { game: true } });
  for (const f of fixtures) {
    if (f.game) {
      await prisma.playerStat.deleteMany({ where: { gameId: f.game.id } });
      await prisma.teamStat.deleteMany({ where: { gameId: f.game.id } });
      await prisma.gameEvent.deleteMany({ where: { gameId: f.game.id } });
      await prisma.gameStarter.deleteMany({ where: { gameId: f.game.id } });
      await prisma.game.delete({ where: { id: f.game.id } });
    }
    await prisma.fixture.delete({ where: { id: f.id } });
  }
  await prisma.$transaction((tx) => recalculateStandings(tx, "<seasonId>"));
  console.log("Cleaned up", fixtures.length, "leftover rehearsal fixture(s)");
}
main().finally(() => prisma.$disconnect());
'
```

Confirm afterward: `prisma.fixture.count({ where: { recordOrigin: "REHEARSAL" } })` is `0`, and
`/live` shows the genuine no-live-game state (or the real live game, if one is genuinely live).

## `/api/broadcast/program` or a graphic route is returning unexpected data

Check the fixture's `recordOrigin` first — every one of these routes refuses to serve a
non-PRODUCTION fixture (`isProductionPresentationFixture()`). A 404 or a `program: null` response
where you expected real data most likely means the game id belongs to a REHEARSAL (or other
non-PRODUCTION) fixture, which is the isolation gate working as intended, not a bug.
