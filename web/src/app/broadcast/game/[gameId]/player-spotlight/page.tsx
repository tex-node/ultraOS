import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel, resolvePlayerDisplay } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XIV: name/club/photo-fallback + PTS/REB/AST, plus 4PM/Ultra Time points only when the
// game's capability actually supports them. Browser-source safe: transparent, no chrome.
export default async function PlayerSpotlight({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ playerId?: string }> }) {
  const { gameId } = await params;
  const { playerId } = await searchParams;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded || !playerId) notFound();
  const { fixture, model } = loaded;

  const stat = model.players.find((p) => p.playerId === playerId);
  const display = await resolvePlayerDisplay(playerId);
  if (!stat || !display) notFound();

  const clubShort = model.teams.home.seasonClubId === stat.seasonClubId ? fixture.homeSeasonClub.club.shortName : fixture.awaySeasonClub.club.shortName;

  return (
    <div className="inline-flex w-[420px] flex-col gap-2 rounded-2xl bg-black/85 p-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-xl font-black">
          {display.jerseyNumber ?? "—"}
        </div>
        <div>
          <p className="text-lg font-black leading-tight">{display.name}</p>
          <p className="text-xs uppercase tracking-widest text-zinc-400">{clubShort}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-white/5 py-2"><p className="text-2xl font-black">{stat.points}</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">PTS</p></div>
        <div className="rounded-lg bg-white/5 py-2"><p className="text-2xl font-black">{stat.rebounds}</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">REB</p></div>
        <div className="rounded-lg bg-white/5 py-2"><p className="text-2xl font-black">{stat.assists}</p><p className="text-[10px] uppercase tracking-wide text-zinc-500">AST</p></div>
      </div>
      {model.dataCapability === "FULL_ULTRA" ? (
        <div className="mt-1 flex justify-center gap-4 text-xs text-violet-300">
          <span>4PM {stat.fourPointsMade}</span>
          <span>Ultra Time PTS {stat.ultraTimePoints}</span>
        </div>
      ) : null}
    </div>
  );
}
