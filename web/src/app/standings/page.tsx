import { OperationsShell } from "@/app/components/operations-shell";
import { DataTable } from "@/app/components/ui/table";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { Prisma } from "@/generated/prisma/client";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function Standings() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/standings");
  }
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const season = await withOrganizationContext(session.user.organizationId, (tx) => tx.season.findFirst({
    where: { status: "ACTIVE" },
    include: { standings: { include: { seasonClub: { include: { club: true, division: true } } } } },
  }));
  const divisions = groupByDivision(season?.standings ?? []);
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10">
    <p className="text-xs uppercase tracking-[.2em] text-brand-400">{season?.name ?? "No active season"}</p>
    <h1 className="mt-2 font-display text-3xl font-bold">League tables</h1>
    {[...divisions.entries()].map(([division, unsorted]) => {
      const rows = sortRows(unsorted);
      return <section key={division} className="mt-8"><h2 className="mb-4 text-xl font-semibold">{division}</h2>
        <DataTable<Row>
          rows={rows}
          rowKey={(r) => r.id}
          minWidth="850px"
          columns={[
            { key: "pos", label: "#", render: (_r, i) => i + 1 },
            { key: "team", label: "SeasonClub", render: (r) => r.seasonClub!.club.name },
            { key: "played", label: "P", align: "right", render: (r) => r.played },
            { key: "won", label: "W", align: "right", render: (r) => r.won },
            { key: "lost", label: "L", align: "right", render: (r) => r.lost },
            { key: "pf", label: "PF", align: "right", render: (r) => r.pointsFor },
            { key: "pa", label: "PA", align: "right", render: (r) => r.pointsAgainst },
            { key: "pd", label: "PD", align: "right", render: (r) => r.pointDifference },
            { key: "pts", label: "PTS", align: "right", render: (r) => <b className="text-brand-400">{r.leaguePoints}</b> },
          ]}
        />
      </section>;
    })}
  </main></OperationsShell>;
}

type Row = Prisma.StandingGetPayload<{ include: { seasonClub: { include: { club: true; division: true } } } }>;
function groupByDivision(rows: Row[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const division = row.seasonClub!.division.name;
    groups.set(division, [...(groups.get(division) ?? []), row]);
  }
  return groups;
}
function sortRows(rows: Row[]) { return [...rows].sort((a,b)=>b.leaguePoints-a.leaguePoints||b.won-a.won||b.pointDifference-a.pointDifference||b.pointsFor-a.pointsFor||a.seasonClub!.club.name.localeCompare(b.seasonClub!.club.name)); }
