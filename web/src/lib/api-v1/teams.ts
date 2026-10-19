// One side of a fixture for the public API (streak v9).
//
// Every /api/v1 game route formatted its teams as `fixture.homeSeasonClub!.club.shortName`. That is only true for
// team sports: a tennis or volleyball fixture can have an ENTRANT side, where `homeSeasonClub` is null and the
// route threw `Cannot read properties of null (reading 'club')` - a 500 on a documented public endpoint.
//
// This is the single place that formats a side, so the next such route cannot reintroduce the crash.

export type ApiFixtureSide = {
  seasonClub: { club: { name: string; shortName: string; primaryColor?: string | null } } | null;
  entrant: { id: string; name: string } | null;
};

export type ApiTeam = { publicId: string; name: string; shortName: string };

/** A club side keeps its short name as the public id; an entrant gets a stable id and a five-character label. */
export function apiTeam(side: ApiFixtureSide | null | undefined): ApiTeam {
  if (side?.seasonClub) {
    return {
      publicId: side.seasonClub.club.shortName.toLowerCase(),
      name: side.seasonClub.club.name,
      shortName: side.seasonClub.club.shortName,
    };
  }
  const name = side?.entrant?.name ?? "TBD";
  return {
    publicId: (side?.entrant?.id ?? "tbd").toLowerCase(),
    name,
    shortName: name.slice(0, 5).toUpperCase(),
  };
}
