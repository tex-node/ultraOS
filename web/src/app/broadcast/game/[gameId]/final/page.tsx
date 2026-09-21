import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XXI: FINAL SCORE + (Game Star only once verified) + one story line + record/milestone if
// applicable. "STATISTICS PENDING VERIFICATION" replaces Game Star/record language entirely
// while unverified - never shows an unverified record as official.
export default async function FinalScoreGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded || !loaded.model.isFinal) notFound();
  const { fixture, model } = loaded;
  const verified = model.isStatisticsVerified;

  return (
    <div className="inline-flex flex-col items-center gap-2 rounded-lg bg-black/90 px-8 py-6 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.3em] text-brand-400">Final Score</p>
      <p className="font-mono text-4xl font-black">{fixture.homeSeasonClub!.club.shortName} {model.score.home} — {model.score.away} {fixture.awaySeasonClub!.club.shortName}</p>
      {!verified ? (
        <p className="text-xs font-bold uppercase tracking-wide text-warn">Statistics pending verification</p>
      ) : (
        <>
          {model.gameStory ? <p className="text-sm text-text-1">{model.gameStory.tags[0].replaceAll("_", " ")}{model.gameStory.facts[0] ? ` — ${model.gameStory.facts[0]}` : ""}</p> : null}
          {model.recordWatches.length > 0 ? (
            <p className="text-xs text-accent-purple">{model.recordWatches[0].recordTitle}: {model.recordWatches[0].liveValue} ({model.recordWatches[0].status.replace("_", " ")})</p>
          ) : null}
        </>
      )}
    </div>
  );
}
