import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { deleteAthlete, removePlayerRegistration } from "../actions";
import { requireSession } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function AthletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const query = await searchParams;
  const canManage = hasPermission(session.user.roles, "player:manage");
  const athlete = await prisma.athlete.findUnique({
    where: { id },
    include: {
      registrations: {
        orderBy: { season: { startDate: "desc" } },
        include: {
          season: { include: { competition: { select: { name: true } } } },
          seasonClub: { include: { club: true, division: true } },
          _count: { select: { draftPicks: true, gameEvents: true, playerStats: true } },
        },
      },
    },
  });
  if (!athlete) notFound();
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10">
    <Link href="/players" className="text-sm text-zinc-400">Back to athletes</Link>
    {query.error === "has-registrations" ? <p className="mt-5 rounded-xl bg-rose-400/10 p-4 text-rose-300">Remove all season registrations before deleting this athlete identity.</p> : null}
    <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div><p className="text-xs uppercase tracking-[.2em] text-emerald-400">Permanent athlete profile</p><h1 className="mt-2 text-3xl font-semibold">{athlete.firstName} {athlete.lastName}</h1><p className="mt-2 text-sm text-zinc-400">{athlete.nationality ?? "Nationality not set"} · {athlete.gender} · {athlete.dominantHand} hand</p></div>
        {canManage ? <div className="flex gap-2"><Link href={`/players/${id}/edit`} className="rounded-xl border border-white/10 px-4 py-2 text-sm">Edit athlete</Link><Link href={`/players/${id}/seasons/new`} className="rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">Register for season</Link>{athlete.registrations.length === 0 ? <form action={deleteAthlete.bind(null, id)}><button className="rounded-xl border border-rose-400/20 px-4 py-2 text-sm text-rose-300">Delete athlete</button></form> : null}</div> : null}
      </div>
    </section>
    <h2 className="mt-8 text-xl font-semibold">Player registrations</h2>
    <div className="mt-4 space-y-4">{athlete.registrations.map((player) => <article key={player.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <div className="flex justify-between gap-4"><div><p className="font-semibold">{player.season.name} · {player.position}</p><p className="text-xs text-zinc-500">{player.season.competition.name} · Player · {player.status}</p></div>{canManage ? <div className="flex gap-3"><Link href={`/player-registrations/${player.id}/edit`} className="text-sm text-emerald-400">Edit registration</Link><form action={removePlayerRegistration.bind(null, player.id, id)}><button className="text-sm text-rose-300">{player._count.draftPicks + player._count.gameEvents + player._count.playerStats > 0 ? "Deactivate" : "Delete"}</button></form></div> : null}</div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-4"><p>SeasonClub: <b>{player.seasonClub ? `${player.seasonClub.club.name} · ${player.seasonClub.division.name}` : "Unassigned"}</b></p><p>Jersey: <b>{player.jerseyNumber ?? "-"}</b></p><p>Measurements: <b>{player.heightCm}cm / {player.weightKg}kg</b></p><p>Records: <b>{player._count.gameEvents + player._count.playerStats + player._count.draftPicks}</b></p></div>
    </article>)}</div>
  </main></OperationsShell>;
}
