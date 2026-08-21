import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XX: a dedicated Ultra Time overlay. Score is included even in overlay use (Part XX: "do
// not hide critical scoreboard information if used as overlay").
export default async function UltraTimeGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded) notFound();
  const { fixture, model } = loaded;
  if (model.ultraTime.phase === "INACTIVE") notFound();

  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-2xl border border-amber-400/50 bg-black/90 px-8 py-5 font-sans text-white">
      <GraphicRefresher intervalSeconds={3} />
      <TransparentBody />
      {model.ultraTime.phase === "ACTIVE" ? (
        <p className="animate-pulse text-3xl font-black tracking-widest text-amber-400">⚡ ULTRA TIME</p>
      ) : (
        <p className="text-xl font-bold text-amber-300">ULTRA TIME IN {model.ultraTime.secondsUntilStart}s</p>
      )}
      <p className="text-sm text-zinc-400">ALL POINTS ×2</p>
      <p className="font-mono text-2xl font-black">{fixture.homeSeasonClub.club.shortName} {model.score.home} — {model.score.away} {fixture.awaySeasonClub.club.shortName}</p>
      {model.dataCapability === "FULL_ULTRA" ? (
        <p className="text-xs text-amber-200">
          Ultra Time pts — {fixture.homeSeasonClub.club.shortName} {model.players.filter((p) => p.seasonClubId === model.teams.home.seasonClubId).reduce((s, p) => s + p.ultraTimePoints, 0)}
          {" · "}
          {fixture.awaySeasonClub.club.shortName} {model.players.filter((p) => p.seasonClubId === model.teams.away.seasonClubId).reduce((s, p) => s + p.ultraTimePoints, 0)}
        </p>
      ) : null}
    </div>
  );
}
