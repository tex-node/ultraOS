// Tournament sub-site status derivation (product roadmap F2). Pure function so the rule
// is unit-tested and shared by every surface that renders a tournament status pill.
//
// "COMPLETED" is an explicit operator decision (Season.status), never inferred from "every
// fixture we currently know about happens to be FINAL" - a real multi-round tournament (e.g.
// LBCL, playing more rounds over several weeks) is FINAL-only between rounds, before its next
// games are even scheduled yet, and is not remotely "completed". Without an explicit
// seasonStatuses signal (the 1-arg call some existing sites still make) this fails safe to
// ONGOING rather than the stronger, harder-to-walk-back claim that a tournament is finished.
export type TournamentSubSiteStatus = "LIVE" | "UPCOMING" | "ONGOING" | "COMPLETED" | "DRAFT";

export function tournamentStatusFromFixtureStatuses(
  statuses: readonly string[],
  seasonStatuses: readonly string[] = [],
): TournamentSubSiteStatus {
  if (statuses.includes("LIVE")) return "LIVE";
  if (statuses.includes("SCHEDULED")) return "UPCOMING";
  if (statuses.includes("FINAL")) {
    const allSeasonsCompleted = seasonStatuses.length > 0 && seasonStatuses.every((s) => s === "COMPLETED");
    return allSeasonsCompleted ? "COMPLETED" : "ONGOING";
  }
  return "DRAFT";
}

// Status pill styles follow the design system (§13): Live is RED, Upcoming blue,
// Completed slate, Draft purple, Ongoing green. Status is always text as well as color.
export const TOURNAMENT_STATUS_STYLE: Record<TournamentSubSiteStatus, string> = {
  LIVE: "border-danger/40 bg-danger/10 text-danger",
  UPCOMING: "border-info/40 bg-info/10 text-info",
  ONGOING: "border-success/40 bg-success/10 text-success",
  COMPLETED: "border-line bg-white/[.04] text-text-2",
  DRAFT: "border-accent-purple/30 bg-accent-purple/10 text-accent-purple",
};
