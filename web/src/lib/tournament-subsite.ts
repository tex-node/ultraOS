// Tournament sub-site status derivation (product roadmap F2). Pure function so the rule
// is unit-tested and shared by every surface that renders a tournament status pill.
export type TournamentSubSiteStatus = "LIVE" | "UPCOMING" | "COMPLETED" | "DRAFT";

export function tournamentStatusFromFixtureStatuses(statuses: readonly string[]): TournamentSubSiteStatus {
  if (statuses.includes("LIVE")) return "LIVE";
  if (statuses.includes("SCHEDULED")) return "UPCOMING";
  if (statuses.includes("FINAL")) return "COMPLETED";
  return "DRAFT";
}

// Status pill styles follow the design system (§13): Live is RED, Upcoming blue,
// Completed slate, Draft purple. Status is always text as well as color.
export const TOURNAMENT_STATUS_STYLE: Record<TournamentSubSiteStatus, string> = {
  LIVE: "border-danger/40 bg-danger/10 text-danger",
  UPCOMING: "border-info/40 bg-info/10 text-info",
  COMPLETED: "border-line bg-white/[.04] text-text-2",
  DRAFT: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
};
