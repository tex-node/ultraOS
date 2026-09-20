// Fan discovery hub filtering (product roadmap F3). Pure functions so the matching rules
// are unit-tested; the page itself only shapes rows and renders.
export type HubTournament = {
  slug: string;
  name: string;
  sportSlug: string;
  sportName: string;
  cities: string[];
};

export type HubFilter = {
  sport?: string;
  city?: string;
  q?: string;
};

function norm(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function filterHubTournaments<T extends HubTournament>(rows: T[], filter: HubFilter): T[] {
  const sport = norm(filter.sport);
  const city = norm(filter.city);
  const q = norm(filter.q);
  return rows.filter((row) => {
    if (sport && sport !== "all" && norm(row.sportSlug) !== sport) return false;
    if (city && city !== "all" && !row.cities.some((c) => norm(c) === city)) return false;
    if (q) {
      const haystack = `${row.name} ${row.sportName} ${row.cities.join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
