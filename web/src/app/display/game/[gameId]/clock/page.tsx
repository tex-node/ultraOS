import { notFound } from "next/navigation";
import { GameClock } from "@/app/games/game-clock";
import { GraphicRefresher } from "@/app/broadcast/game/graphic-refresher";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.19 Part III/XI: same isolation gate and same single source of truth (LivePresentationModel)
// as the scorebug graphic - see that file's comment for why Ultra Time is read from the model
// rather than recomputed here.
export default async function VenueClockDisplay({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } } } },
  });
  if (!game || !isProductionPresentationFixture(game.fixture)) notFound();

  const model = await buildLivePresentationModelForGame(gameId);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-black text-white">
      <GraphicRefresher intervalSeconds={3} />
      {model.ultraTime.phase === "ACTIVE" ? (
        <p className="mb-6 animate-pulse text-4xl font-black tracking-widest text-amber-400 md:text-6xl">⚡ ULTRA TIME</p>
      ) : null}
      <p className="text-2xl uppercase tracking-[.3em] text-zinc-500 md:text-3xl">{model.periodLabel}</p>
      <p className="mt-4 font-mono text-[18vw] font-black leading-none md:text-[14rem]">
        <GameClock seconds={model.clock.remainingSeconds} status={model.clock.running ? "LIVE" : "PAUSED"} startedAt={null} />
      </p>
      <div className="mt-10 flex items-center gap-3 rounded-2xl border border-white/10 px-8 py-4">
        <span className="text-lg uppercase tracking-widest text-zinc-500">Shot clock</span>
        <span className="font-mono text-5xl font-bold">
          <GameClock seconds={model.shotClock.remainingSeconds} status={model.shotClock.running ? "LIVE" : "PAUSED"} startedAt={null} />
        </span>
      </div>
      <div className="mt-10 grid grid-cols-3 items-center gap-6 text-center">
        <p className="text-2xl font-semibold md:text-4xl">{game.fixture.homeSeasonClub.club.shortName}</p>
        <p className="font-mono text-4xl font-black md:text-6xl">{model.score.home} — {model.score.away}</p>
        <p className="text-2xl font-semibold md:text-4xl">{game.fixture.awaySeasonClub.club.shortName}</p>
      </div>
    </main>
  );
}
