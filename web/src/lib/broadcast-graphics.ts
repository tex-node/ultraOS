// Shared vocabulary for the broadcast graphics system (G.19, Part X/XXII/XXVI). One list, one
// set of route paths, imported by the control panel, the suggestions engine, and every graphics
// route itself - so "what graphics exist" is never defined twice.
export type GraphicType =
  | "SCORE_BUG"
  | "PLAYER_SPOTLIGHT"
  | "LEADER"
  | "TEAM_COMPARISON"
  | "RECORD_WATCH"
  | "MILESTONE"
  | "GAME_STORY"
  | "ULTRA_TIME"
  | "FOUR_POINT_MOMENT"
  | "FINAL_SCORE";

export const GRAPHIC_TYPES: { type: GraphicType; label: string; route: (gameId: string) => string; needsSubject: boolean }[] = [
  { type: "SCORE_BUG", label: "Score Bug", route: (id) => `/broadcast/game/${id}/scorebug`, needsSubject: false },
  { type: "PLAYER_SPOTLIGHT", label: "Player Spotlight", route: (id) => `/broadcast/game/${id}/player-spotlight`, needsSubject: true },
  { type: "LEADER", label: "Game Leader", route: (id) => `/broadcast/game/${id}/leader`, needsSubject: false },
  { type: "TEAM_COMPARISON", label: "Team Comparison", route: (id) => `/broadcast/game/${id}/team-comparison`, needsSubject: false },
  { type: "RECORD_WATCH", label: "Record Watch", route: (id) => `/broadcast/game/${id}/record-watch`, needsSubject: false },
  { type: "MILESTONE", label: "Milestone", route: (id) => `/broadcast/game/${id}/milestone`, needsSubject: false },
  { type: "GAME_STORY", label: "Game Story", route: (id) => `/broadcast/game/${id}/game-story`, needsSubject: false },
  { type: "ULTRA_TIME", label: "Ultra Time", route: (id) => `/broadcast/game/${id}/ultra-time`, needsSubject: false },
  { type: "FOUR_POINT_MOMENT", label: "4PT Moment", route: (id) => `/broadcast/game/${id}/four-point-moment`, needsSubject: true },
  { type: "FINAL_SCORE", label: "Final Score", route: (id) => `/broadcast/game/${id}/final`, needsSubject: false },
];

export function graphicRoute(type: GraphicType, gameId: string): string {
  return GRAPHIC_TYPES.find((g) => g.type === type)!.route(gameId);
}

export function graphicLabel(type: GraphicType): string {
  return GRAPHIC_TYPES.find((g) => g.type === type)!.label;
}

// A slot is null (nothing selected) or a specific graphic for a specific game, optionally scoped
// to a subject (a playerId, for Player Spotlight / 4PT Moment).
export type PresentationSlot = { graphicType: GraphicType; gameId: string; subjectId: string | null } | null;

export type BroadcastPresentationState = {
  preview: PresentationSlot;
  program: PresentationSlot;
  updatedAt: string;
  updatedById: string | null;
};

export const EMPTY_PRESENTATION_STATE: BroadcastPresentationState = {
  preview: null,
  program: null,
  updatedAt: new Date(0).toISOString(),
  updatedById: null,
};
