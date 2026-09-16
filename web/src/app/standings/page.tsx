import { OperationsShell } from "@/app/components/operations-shell";
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
    <p className="text-xs uppercase tracking-[.2em] text-emerald-400">{season?.name ?? "No active season"}</p>
    <h1 className="mt-2 text-3xl font-semibold">League tables</h1>
    {[...divisions.entries()].map(([division, unsorted]) => {
      const rows = sortRows(unsorted);
      return <section key={division} className="mt-8"><h2 className="mb-4 text-xl font-semibold">{division}</h2><Table rows={rows}/></section>;
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
function Table({rows}:{rows:Row[]}) { return <div className="overflow-x-auto rounded-2xl border border-white/[.08]"><div className="min-w-[850px]"><div className="grid grid-cols-[50px_1fr_repeat(7,70px)] bg-white/[.05] p-3 text-xs text-zinc-400"><span>#</span><span>SeasonClub</span>{["P","W","L","PF","PA","PD","PTS"].map(x=><span key={x}>{x}</span>)}</div>{rows.map((r,i)=><div key={r.id} className="grid grid-cols-[50px_1fr_repeat(7,70px)] border-t border-white/[.06] bg-[#0b100e] p-3 text-sm"><b>{i+1}</b><span>{r.seasonClub!.club.name}</span><span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{r.pointsFor}</span><span>{r.pointsAgainst}</span><span>{r.pointDifference}</span><b className="text-emerald-400">{r.leaguePoints}</b></div>)}</div></div>; }
