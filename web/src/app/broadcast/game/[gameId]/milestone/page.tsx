import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel, resolvePlayerDisplay } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XVIII: MILESTONE / player / metric / value - an in-game threshold (10 points, 10
// rebounds, a 4PT make), never labeled as historic (that language is reserved for the season-
// wide milestone engine over FINAL games, a different, unrelated system).
export default async function MilestoneGraphic({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ playerId?: string }> }) {
  const { gameId } = await params;
  const { playerId } = await searchParams;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded || loaded.model.liveMilestones.length === 0) notFound();
  const { model } = loaded;

  const milestone = (playerId ? model.liveMilestones.find((m) => m.playerId === playerId) : model.liveMilestones[model.liveMilestones.length - 1]) ?? model.liveMilestones[model.liveMilestones.length - 1];
  const display = await resolvePlayerDisplay(milestone.playerId);

  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-amber-400/40 bg-black/85 px-6 py-4 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.3em] text-warn">Milestone</p>
      <p className="text-lg font-black">{display?.name ?? "Player"}</p>
      <p className="text-2xl font-black text-warn">{milestone.label}</p>
    </div>
  );
}
