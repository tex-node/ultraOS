import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XVII: TIED / NEW SEASON ZERO RECORD (PROVISIONAL) while live; canPromoteToOfficialRecord
// (already applied inside the presentation model's provisional-records pipeline) is the only
// gate that ever removes the PROVISIONAL label - this graphic never promotes anything itself.
export default async function RecordWatchGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded) notFound();
  const { model } = loaded;
  if (model.recordWatches.length === 0) notFound();

  const official = model.isFinal && model.isStatisticsVerified;

  return (
    <div className="inline-flex flex-col gap-2 rounded-lg border border-accent-purple/40 bg-black/85 p-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.25em] text-accent-purple">Record Watch</p>
      {model.recordWatches.map((w) => (
        <div key={w.recordKey}>
          <p className="text-sm font-bold text-white">
            {w.status === "NEW_PROVISIONAL" ? (official ? "NEW SEASON ZERO RECORD" : "NEW SEASON ZERO RECORD · PROVISIONAL") : "TIED SEASON ZERO RECORD"}
          </p>
          <p className="text-xs text-violet-200">{w.recordTitle}: {w.liveValue}</p>
        </div>
      ))}
    </div>
  );
}
