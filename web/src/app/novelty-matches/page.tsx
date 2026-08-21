import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { CreateNoveltyMatchForm } from "@/app/novelty-matches/create-form";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NoveltyMatchesPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/novelty-matches");
  const session = await requirePermission("fixture:manage");

  const [matches, teams, events, venues] = await Promise.all([
    prisma.noveltyMatch.findMany({ include: { homeTeam: true, awayTeam: true, game: true }, orderBy: { scheduledAt: "asc" } }),
    prisma.noveltyTeam.findMany({ orderBy: { name: "asc" } }),
    prisma.event.findMany({ orderBy: { date: "desc" }, select: { id: true, name: true } }),
    prisma.venue.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Exhibition / novelty</p>
        <h1 className="mt-2 text-3xl font-semibold">Exhibition matches</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Matches between novelty teams (like the All-Star exhibition) - separate from the real league&apos;s
          fixtures, so they never touch Club standings, but scored through the same live dashboard.
        </p>

        <div className="mt-8">
          <CreateNoveltyMatchForm events={events} teams={teams} venues={venues} />
        </div>

        <section className="mt-10 overflow-hidden rounded-2xl border border-white/[.08]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="p-4">Match</th>
                <th className="p-4">Scheduled</th>
                <th className="p-4">Status</th>
                <th className="p-4">Score</th>
                <th className="p-4">Operate</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr className="border-t border-white/[.06]" key={m.id}>
                  <td className="p-4">
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-xs text-zinc-500">{m.homeTeam.name} vs {m.awayTeam.name}</p>
                  </td>
                  <td className="p-4 text-zinc-300">{m.scheduledAt.toLocaleString()}</td>
                  <td className="p-4">{m.status}</td>
                  <td className="p-4 text-zinc-300">{m.homeScore} - {m.awayScore}</td>
                  <td className="p-4">
                    <Link className="rounded-lg border border-emerald-400/40 px-3 py-1.5 text-xs text-emerald-300" href={`/novelty-matches/${m.id}/live`}>
                      {m.game ? "Open live" : "Start"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {matches.length === 0 ? <p className="p-6 text-center text-sm text-zinc-400">No exhibition matches yet.</p> : null}
        </section>
      </main>
    </OperationsShell>
  );
}
