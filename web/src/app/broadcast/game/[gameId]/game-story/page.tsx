import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { loadProductionGraphicModel } from "@/lib/broadcast-graphic-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Part XIX: one primary story, short text - the first tag from LivePresentationModel.gameStory
// (classifyGameStory()'s own tag order, already deterministic) plus its lead deterministic fact.
export default async function GameStoryGraphic({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const loaded = await loadProductionGraphicModel(gameId);
  if (!loaded || !loaded.model.gameStory) notFound();
  const { model } = loaded;
  const story = model.gameStory!;

  return (
    <div className="inline-flex max-w-[440px] flex-col gap-2 rounded-2xl bg-black/85 p-5 font-sans text-white">
      <GraphicRefresher />
      <TransparentBody />
      <p className="text-[10px] font-bold uppercase tracking-[.25em] text-emerald-400">
        {story.provisional ? "Live Game Story · Provisional" : "Game Story"}
      </p>
      <p className="text-xl font-black">{story.tags[0].replaceAll("_", " ")}</p>
      {story.facts[0] ? <p className="text-sm text-zinc-300">{story.facts[0]}</p> : null}
    </div>
  );
}
