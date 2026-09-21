import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XXIX: "4PT MADE", and "4PT ×2 / 8 POINTS" during Ultra Time - never flattened to a bare
// "8PT SHOT" (Part XXIX's own explicit instruction), preserving base-value vs multiplier
// provenance exactly as UltraScoringMoment already carries it.
export default async function FourPointMomentGraphic({ params, searchParams }: { params: Promise<{ gameId: string }>; searchParams: Promise<{ eventId?: string }> }) {
  const { gameId } = await params;
  const { eventId } = await searchParams;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded) notFound();
  const { model } = loaded;

  const fourPointMakes = model.ultraScoringFeed.filter((m) => m.basePointValue === 4);
  const moment = (eventId ? fourPointMakes.find((m) => m.id === eventId) : fourPointMakes[fourPointMakes.length - 1]) ?? fourPointMakes[fourPointMakes.length - 1];
  if (!moment) notFound();

  return (
    <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-accent-purple/50 bg-black/90 px-8 py-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.3em] text-accent-purple">4PT MADE</p>
      <p className="text-xl font-black">{moment.playerName}</p>
      {moment.multiplier > 1 ? (
        <p className="text-lg font-bold text-warn">4PT ×{moment.multiplier} — {moment.points} POINTS</p>
      ) : (
        <p className="text-lg font-bold text-violet-200">{moment.points} POINTS</p>
      )}
    </div>
  );
}
