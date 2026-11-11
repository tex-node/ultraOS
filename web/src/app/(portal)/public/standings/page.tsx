import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";
import { DataTable } from "@/app/components/ui/table";

type Row = {
  id: string;
  played: number;
  won: number;
  lost: number;
  pointsFor: number;
  pointDifference: number;
  leaguePoints: number;
  seasonClub: { club: { name: string }; division: { name: string } };
};

const EMPTY_STANDING = { leaguePoints: 0, lost: 0, played: 0, pointDifference: 0, pointsFor: 0, won: 0 };

function groupByDivision(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const division = row.seasonClub!.division.name;
    groups.set(division, [...(groups.get(division) ?? []), row]);
  }
  return groups;
}

function sortRows(rows: Row[]) {
  return [...rows].sort(
    (a, b) =>
      b.leaguePoints - a.leaguePoints ||
      b.won - a.won ||
      b.pointDifference - a.pointDifference ||
      b.pointsFor - a.pointsFor ||
      a.seasonClub!.club.name.localeCompare(b.seasonClub!.club.name),
  );
}

export default async function Standings() {
  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) =>
    tx.season.findFirst({
      where: { status: "ACTIVE" },
      include: {
        seasonClubs: {
          where: { status: "ACTIVE" },
          include: { club: true, division: true, standing: true },
        },
      },
    }),
  );

  // Every ACTIVE club shows up here even before its Standing row exists (no games played yet),
  // defaulting to 0s instead of the club silently disappearing from the table.
  const rows: Row[] = (season?.seasonClubs ?? []).map((sc) => ({
    id: sc.standing?.id ?? sc.id,
    seasonClub: { club: { name: sc.club.name }, division: { name: sc.division.name } },
    ...(sc.standing ?? EMPTY_STANDING),
  }));
  const groups = groupByDivision(rows);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-brand-400">{season?.name}</p>
      <h1 className="mt-2 font-display text-4xl font-bold">Standings</h1>
      {!season ? (
        <p className="mt-6 text-text-2">No active season right now — standings will appear once a season is underway.</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-text-2">No clubs are set up for {season.name} yet.</p>
      ) : null}
      {[...groups.entries()].map(([division, raw]) => {
        const rows = sortRows(raw);
        return (
          <section className="mt-8" key={division}>
            <h2 className="mb-4 text-2xl font-semibold">{division}</h2>
            <DataTable<Row>
              rows={rows}
              rowKey={(row) => row.id}
              minWidth="640px"
              stackOnMobile
              empty="No entries yet."
              columns={[
                { key: "pos", label: "#", render: (_row, i) => i + 1 },
                { key: "team", label: "Team", render: (row) => row.seasonClub!.club.name },
                { key: "played", label: "P", align: "right", render: (row) => row.played },
                { key: "won", label: "W", align: "right", render: (row) => row.won },
                { key: "lost", label: "L", align: "right", render: (row) => row.lost },
                { key: "pd", label: "PD", align: "right", render: (row) => row.pointDifference },
                { key: "pts", label: "PTS", align: "right", render: (row) => <b className="text-brand-400">{row.leaguePoints}</b> },
              ]}
            />
          </section>
        );
      })}
    </main>
  );
}
