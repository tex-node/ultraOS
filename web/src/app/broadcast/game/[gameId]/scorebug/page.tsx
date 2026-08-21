import { notFound } from "next/navigation";
import { GameClock } from "@/app/games/game-clock";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Browser-source safe for OBS/vMix: transparent background, compact, auto-refreshing via the
// scorer's own writes (this page just re-renders server state on load/refresh).
//
// G.19 Part XI/XII: reads score/clock/Ultra Time from the same LivePresentationModel every other
// surface consumes, rather than recomputing them from Prisma directly - the pre-G.19 version of
// this page computed Ultra Time via the raw `isUltraTime()` helper against the stored
// `Game.isUltraTimeActive`-adjacent clock fields, the exact staleness pattern the G.18 rehearsal
// found and fixed everywhere else (live-game-snapshot-v2.ts now derives it fresh from
// `isUltraTimeUnderRules()` on every read). This page inherits that fix for free by going
// through the model instead of duplicating the computation a second time.
export default async function Scorebug({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } },
  });
  // G.19 Part III/VII: a browser-source URL could be a stale rehearsal link or a guessed id -
  // this unauthenticated route must refuse to render anything but a real production fixture.
  if (!game || !isProductionPresentationFixture(game.fixture)) notFound();

  const model = await buildLivePresentationModelForGame(gameId);
  const shotClockRunning = model.shotClock.running;

  return (
    <div className="inline-flex items-center gap-4 bg-transparent p-3 font-sans text-white">
      <GraphicRefresher intervalSeconds={3} />
      <TransparentBody />
      <div className="flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2">
        <span className="text-sm font-bold uppercase tracking-wider">{game.fixture.homeSeasonClub.club.shortName}</span>
        <span className="font-mono text-xl font-black">{model.score.home}</span>
      </div>
      <div className="flex flex-col items-center rounded-lg bg-black/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-zinc-400">{model.periodLabel}</span>
        <span className="font-mono text-lg font-bold">
          <GameClock seconds={model.clock.remainingSeconds} status={model.clock.running ? "LIVE" : "PAUSED"} startedAt={null} />
        </span>
        <span className="mt-0.5 font-mono text-[10px] text-amber-300">
          SHOT <GameClock seconds={model.shotClock.remainingSeconds} status={shotClockRunning ? "LIVE" : "PAUSED"} startedAt={null} />
        </span>
        {model.ultraTime.phase === "ACTIVE" ? <span className="mt-0.5 text-[10px] font-bold text-amber-400">⚡ ULTRA TIME</span> : null}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2">
        <span className="font-mono text-xl font-black">{model.score.away}</span>
        <span className="text-sm font-bold uppercase tracking-wider">{game.fixture.awaySeasonClub.club.shortName}</span>
      </div>
    </div>
  );
}
