// Tournament sub-site status derivation (product roadmap F2). Pure function so the rule
// is unit-tested and shared by every surface that renders a tournament status pill.
export type TournamentSubSiteStatus = "LIVE" | "UPCOMING" | "COMPLETED" | "DRAFT";

export function tournamentStatusFromFixtureStatuses(statuses: readonly string[]): TournamentSubSiteStatus {
  if (statuses.includes("LIVE")) return "LIVE";
  if (statuses.includes("SCHEDULED")) return "UPCOMING";
  if (statuses.includes("FINAL")) return "COMPLETED";
  return "DRAFT";
}

export const TOURNAMENT_STATUS_STYLE: Record<TournamentSubSiteStatus, string> = {
  LIVE: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  UPCOMING: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  COMPLETED: "border-white/10 bg-white/[.05] text-zinc-300",
  DRAFT: "border-white/10 bg-white/[.05] text-zinc-500",
};
