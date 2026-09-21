import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XV: SCORING/REBOUNDING/ASSIST leader while LIVE, labeled "LIVE LEADER" - never "Game
// Star" (that's a FINAL-only historical concept computed by selectTopPerformers(), a different
// engine this graphic deliberately does not call).
export default async function LeaderGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded) notFound();
  const { fixture, model } = loaded;

  const categories = model.leaders.filter((l) => ["POINTS", "REBOUNDS", "ASSISTS"].includes(l.category));
  if (categories.length === 0) notFound();

  return (
    <div className="inline-flex flex-col gap-2 rounded-lg bg-black/85 p-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.25em] text-info">{model.isFinal ? "Game Leader" : "Live Leader"}</p>
      {categories.map((l) => {
        const player = model.players.find((p) => p.playerId === l.playerId);
        const clubShort = l.seasonClubId === model.teams.home.seasonClubId ? fixture.homeSeasonClub!.club.shortName : fixture.awaySeasonClub!.club.shortName;
        return (
          <div key={l.category} className="flex items-baseline gap-3">
            <span className="w-20 text-[10px] uppercase tracking-wide text-text-3">{l.category}</span>
            <span className="text-xl font-black">{l.value}</span>
            <span className="text-xs text-text-2">{clubShort}{player ? ` · ${player.rebounds} REB / ${player.assists} AST / ${player.points} PTS` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
