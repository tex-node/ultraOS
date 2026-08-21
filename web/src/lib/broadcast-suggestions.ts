// Graphics Suggestions (G.19, Part XXVII-XXVIII). Pure, ephemeral, derived fresh from the
// current LivePresentationModel every call - nothing is persisted, so there is no suggestion
// database to keep in sync or clean up. SUGGEST ONLY: this module has no ability to write
// presentation state itself (it doesn't import broadcast-presentation-state.ts at all) - only
// the operator's own TAKE action (Part XXVII: "Operator remains responsible for Program output")
// can ever put a graphic on air.
import type { GraphicType } from "./broadcast-graphics";
import type { LivePresentationModel } from "./live-presentation-model";

export type GraphicSuggestion = { graphicType: GraphicType; subjectId: string | null; reason: string };

export function buildGraphicSuggestions(model: LivePresentationModel): GraphicSuggestion[] {
  const suggestions: GraphicSuggestion[] = [];

  if (model.isFinal) {
    suggestions.push({ graphicType: "FINAL_SCORE", subjectId: null, reason: "Game has reached FINAL." });
    return suggestions;
  }

  if (model.ultraTime.phase === "ACTIVE") {
    suggestions.push({ graphicType: "ULTRA_TIME", subjectId: null, reason: "Ultra Time is active." });
  } else if (model.ultraTime.phase === "APPROACHING") {
    suggestions.push({ graphicType: "ULTRA_TIME", subjectId: null, reason: `Ultra Time begins in ${model.ultraTime.secondsUntilStart}s.` });
  }

  const latestFourPoint = model.ultraScoringFeed.find((m) => m.basePointValue === 4);
  if (latestFourPoint) {
    suggestions.push({ graphicType: "FOUR_POINT_MOMENT", subjectId: null, reason: `${latestFourPoint.playerName} made a 4PT shot.` });
  }

  for (const watch of model.recordWatches) {
    if (watch.status === "NEW_PROVISIONAL" || watch.status === "TIED") {
      suggestions.push({ graphicType: "RECORD_WATCH", subjectId: null, reason: `${watch.recordTitle}: ${watch.status === "TIED" ? "tied" : "new provisional high"}.` });
    }
  }

  if (model.liveMilestones.length > 0) {
    const milestone = model.liveMilestones[model.liveMilestones.length - 1];
    suggestions.push({ graphicType: "MILESTONE", subjectId: milestone.playerId, reason: `Milestone reached: ${milestone.label}.` });
  }

  if (model.gameStory && !suggestions.some((s) => s.graphicType === "GAME_STORY")) {
    suggestions.push({ graphicType: "GAME_STORY", subjectId: null, reason: `Story: ${model.gameStory.tags[0]?.replaceAll("_", " ")}.` });
  }

  return suggestions;
}
