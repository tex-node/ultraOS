// Multi-sport fixture-side resolver (staged Entrant model — Stage B1).
//
// A fixture side is a SeasonClub (team sports) or an Entrant (individual/pair/relay sports). Today
// the SeasonClub columns are required and the entrant columns are optional; the schema flip (Stage
// B2) makes the SeasonClub columns nullable and adds a "SeasonClub or Entrant" check. This resolver
// is the single seam every read path should use, so that flip does not fan out across the codebase.

import type { SportDefinition } from "./types";

export type FixtureSide = "HOME" | "AWAY";

export type FixtureSideRefs = {
  homeSeasonClubId: string | null;
  awaySeasonClubId: string | null;
  homeEntrantId: string | null;
  awayEntrantId: string | null;
};

export function oppositeSide(side: FixtureSide): FixtureSide {
  return side === "HOME" ? "AWAY" : "HOME";
}

export function sideSeasonClubId(refs: FixtureSideRefs, side: FixtureSide): string | null {
  return side === "HOME" ? refs.homeSeasonClubId : refs.awaySeasonClubId;
}

export function sideEntrantId(refs: FixtureSideRefs, side: FixtureSide): string | null {
  return side === "HOME" ? refs.homeEntrantId : refs.awayEntrantId;
}

// Team-only paths call this when a SeasonClub is guaranteed (team sports; and any fixture side that
// has one). It throws a clear domain error instead of dereferencing null later.
export function requireSeasonClubId(refs: FixtureSideRefs, side: FixtureSide): string {
  const id = sideSeasonClubId(refs, side);
  if (!id) throw new Error(`FIXTURE_SIDE_MISSING_SEASON_CLUB:${side}`);
  return id;
}

// Display label for a resolved side: club short name, else club name, else entrant name.
export function sideLabel(input: {
  clubShortName?: string | null;
  clubName?: string | null;
  entrantName?: string | null;
  fallback?: string;
}): string {
  const short = input.clubShortName?.trim();
  const name = input.clubName?.trim();
  const entrant = input.entrantName?.trim();
  return short || name || entrant || input.fallback || "TBD";
}

// True when the sport has no TEAM entity (all participants are individuals/pairs/relays).
export function isIndividualSport(definition: SportDefinition | null | undefined): boolean {
  if (!definition) return false;
  return definition.entities.every((entity) => entity !== "TEAM");
}
