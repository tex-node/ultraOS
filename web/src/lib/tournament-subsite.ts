// Tournament sub-site status derivation (product roadmap F2). Pure function so the rule
// is unit-tested and shared by every surface that renders a tournament status pill.
//
// Computed per-season, then combined, rather than flattening every fixture across every
// season into one bag - a competition with a COMPLETED Season Zero and a brand new Season
// One that has no fixtures yet (Ultra Basketball) must read UPCOMING (something new is
// coming), not ONGOING (nothing is currently in progress) and not COMPLETED (Season One
// isn't done - it hasn't started). A season with real FINAL fixtures and more rounds still
// to come (LBCL) must read ONGOING, never COMPLETED, until its own Season.status says so -
// an explicit operator decision, never inferred from "every fixture we currently know about
// happens to be FINAL". A season with zero fixtures at all (registration open, nothing
// scheduled yet, e.g. GIESM) reads UPCOMING, not DRAFT - DRAFT is reserved for a
// competition with no seasons at all yet.
export type TournamentSubSiteStatus = "LIVE" | "UPCOMING" | "ONGOING" | "COMPLETED" | "DRAFT";

export type SeasonFixtureSummary = { fixtureStatuses: readonly string[]; seasonStatus: string };

function seasonDisplayStatus({ fixtureStatuses, seasonStatus }: SeasonFixtureSummary): Exclude<TournamentSubSiteStatus, "DRAFT"> {
  if (fixtureStatuses.includes("LIVE")) return "LIVE";
  if (fixtureStatuses.includes("SCHEDULED")) return "UPCOMING";
  if (fixtureStatuses.includes("FINAL")) return seasonStatus === "COMPLETED" ? "COMPLETED" : "ONGOING";
  return "UPCOMING";
}

export function tournamentStatusFromSeasons(seasons: readonly SeasonFixtureSummary[]): TournamentSubSiteStatus {
  if (seasons.length === 0) return "DRAFT";
  const statuses = seasons.map(seasonDisplayStatus);
  if (statuses.includes("LIVE")) return "LIVE";
  if (statuses.includes("UPCOMING")) return "UPCOMING";
  if (statuses.includes("ONGOING")) return "ONGOING";
  return "COMPLETED";
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
