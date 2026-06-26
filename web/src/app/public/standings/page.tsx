import { prisma } from "@/lib/prisma";

type Row = Awaited<ReturnType<typeof prisma.standing.findMany>>[number] & {
  seasonClub: { club: { name: string }; division: { name: string } };
};

function groupByDivision(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const division = row.seasonClub.division.name;
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
      a.seasonClub.club.name.localeCompare(b.seasonClub.club.name),
  );
}

export default async function Standings() {
  const season = await prisma.season.findFirst({
    where: { status: "ACTIVE" },
    include: {
      standings: {
        include: { seasonClub: { include: { club: true, division: true } } },
      },
    },
  });
  const groups = groupByDivision(season?.standings ?? []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-emerald-400">{season?.name}</p>
      <h1 className="mt-2 text-4xl font-bold">Standings</h1>
      {[...groups.entries()].map(([division, raw]) => {
        const rows = sortRows(raw);
        return (
          <section className="mt-8" key={division}>
            <h2 className="mb-4 text-2xl font-semibold">{division}</h2>
            <div className="overflow-x-auto rounded-2xl border border-white/[.08]">
              <div className="min-w-[800px]">
                {rows.map((row, index) => (
                  <div
                    className="grid grid-cols-[50px_1fr_repeat(5,70px)] border-b border-white/[.06] bg-[#0b100e] p-4"
                    key={row.id}
                  >
                    <b>{index + 1}</b>
                    <span>{row.seasonClub.club.name}</span>
                    <span>{row.played} P</span>
                    <span>{row.won} W</span>
                    <span>{row.lost} L</span>
                    <span>{row.pointDifference} PD</span>
                    <b className="text-emerald-400">{row.leaguePoints}</b>
                  </div>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </main>
  );
}
