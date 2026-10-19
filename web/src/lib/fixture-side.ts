// One side of a fixture for UI components (streak v10, Prompt 1).
//
// The `club` bug class: a fixture side is a SeasonClub (team sports) or an Entrant (individual sports), and UI
// code that assumed `homeSeasonClub!.club` crashed with "Cannot read properties of null" the moment an
// individual-sport fixture reached it. The API has had `apiTeam()` since v9; this is the UI counterpart, for
// server components and their client children.
//
// Use it instead of `fixture.homeSeasonClub!` anywhere a fixture is rendered.

export type FixtureSideInput = {
  id?: string | null;
  name?: string | null;
  shortName?: string | null;
  logoUrl?: string | null;
};

export type UiFixtureSide = {
  /** SeasonClub id or Entrant id - whatever identifies the side. */
  id: string;
  name: string;
  shortName: string;
  logoUrl: string | null;
  isEntrant: boolean;
};

/**
 * @param seasonClub the fixture's `homeSeasonClub`/`awaySeasonClub` (may be null)
 * @param entrant the matching `homeEntrant`/`awayEntrant` (may be null)
 */
export function fixtureSide(
  seasonClub: { id: string; club: { name: string; shortName: string; logoUrl?: string | null } } | null | undefined,
  entrant: { id: string; name: string } | null | undefined,
): UiFixtureSide {
  if (seasonClub) {
    return {
      id: seasonClub.id,
      name: seasonClub.club.name,
      shortName: seasonClub.club.shortName,
      logoUrl: seasonClub.club.logoUrl ?? null,
      isEntrant: false,
    };
  }
  const name = entrant?.name ?? "TBD";
  return {
    id: entrant?.id ?? "tbd",
    name,
    // An entrant has no short name; five characters fits the scorebug and the hero card.
    shortName: name.length <= 5 ? name.toUpperCase() : name.split(/\s+/).map((part) => part[0]).join("").slice(0, 5).toUpperCase() || name.slice(0, 5).toUpperCase(),
    logoUrl: null,
    isEntrant: true,
  };
}
