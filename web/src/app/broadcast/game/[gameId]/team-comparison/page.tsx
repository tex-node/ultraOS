import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XVI: the same categories the public/commentator surfaces already show (FG%/REB/AST/TOV/
// PF, plus 4PT when the game supports it) - buildTeamComparison() in live-presentation-model.ts
// is the single source, never recalculated here.
export default async function TeamComparisonGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded) notFound();
  const { fixture, model } = loaded;

  return (
    <div className="inline-flex w-[380px] flex-col gap-2 rounded-2xl bg-black/85 p-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.25em] text-cyan-400">Team Comparison</p>
      <div className="flex justify-between text-sm font-bold">
        <span>{fixture.homeSeasonClub.club.shortName}</span>
        <span>{fixture.awaySeasonClub.club.shortName}</span>
      </div>
      <table className="mt-1 w-full text-sm">
        <tbody>
          {model.teamComparison.map((row) => (
            <tr key={row.label} className="border-t border-white/10">
              <td className="py-1.5 text-left font-mono">{row.home}</td>
              <td className="py-1.5 text-center text-[10px] uppercase tracking-wide text-zinc-500">{row.label}</td>
              <td className="py-1.5 text-right font-mono">{row.away}</td>
            </tr>
          ))}
          {model.dataCapability === "FULL_ULTRA" && (model.fourPoint.home || model.fourPoint.away) ? (
            <tr className="border-t border-white/10 text-violet-300">
              <td className="py-1.5 text-left font-mono">{model.fourPoint.home?.made ?? 0}</td>
              <td className="py-1.5 text-center text-[10px] uppercase tracking-wide text-violet-400">4PT</td>
              <td className="py-1.5 text-right font-mono">{model.fourPoint.away?.made ?? 0}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
