import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requireSession } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

// Cross-tournament leaders, derived live from the event ledger: every scoring play carries its
// points, and every card its type, so top scorers and discipline leaders need no precomputed
// tables and automatically respect voids and corrections.
export default async function LeadersPage() {
  const session = await requireSession();
  if (!session.user.organizationId) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold">No league yet</h1>
          <p className="mt-2 text-sm text-zinc-400">Join a league to see its leaders.</p>
        </main>
      </OperationsShell>
    );
  }
  const organizationId = session.user.organizationId;

  const { scorers, cards, players } = await withOrganizationContext(organizationId, async (tx) => {
    const [scorerRows, cardRows] = await Promise.all([
      tx.gameEvent.groupBy({
        by: ["playerId"],
        where: { status: "ACTIVE", playerId: { not: null }, points: { gt: 0 } },
        _sum: { points: true },
        _count: { _all: true },
      }),
      tx.gameEvent.groupBy({
        by: ["playerId"],
        where: { status: "ACTIVE", playerId: { not: null }, typeKey: { in: ["YELLOW_CARD", "RED_CARD"] } },
        _count: { _all: true },
      }),
    ]);
    const scorers = scorerRows.sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0)).slice(0, 20);
    const cards = cardRows.sort((a, b) => b._count._all - a._count._all).slice(0, 20);

    const playerIds = [...new Set([...scorers, ...cards].map((row) => row.playerId).filter((id): id is string => Boolean(id)))];
    const players = await tx.player.findMany({
      where: { id: { in: playerIds } },
      select: {
        id: true,
        athlete: { select: { firstName: true, lastName: true } },
        seasonClub: { select: { club: { select: { shortName: true } } } },
      },
    });
    return { scorers, cards, players };
  });

  const playerName = (id: string | null) => {
    const player = players.find((p) => p.id === id);
    if (!player) return "Unknown";
    return `${player.athlete.firstName} ${player.athlete.lastName}${player.seasonClub ? ` (${player.seasonClub.club.shortName})` : ""}`;
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Leaders</h1>
        <p className="mt-1 text-sm text-zinc-400">Across every tournament, derived live from recorded events.</p>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h2 className="text-lg font-semibold">Top scorers</h2>
            {scorers.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No scoring plays recorded yet.</p>
            ) : (
              <ol className="mt-3 grid gap-2">
                {scorers.map((row, index) => (
                  <li key={row.playerId} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] px-4 py-2 text-sm">
                    <span className="text-zinc-500">{index + 1}</span>
                    <span className="flex-1 font-medium">{playerName(row.playerId)}</span>
                    <span className="font-mono font-bold">{row._sum.points ?? 0} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h2 className="text-lg font-semibold">Discipline</h2>
            {cards.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-500">No cards recorded yet.</p>
            ) : (
              <ol className="mt-3 grid gap-2">
                {cards.map((row, index) => (
                  <li key={row.playerId} className="flex items-center justify-between gap-3 rounded-xl border border-white/[.06] px-4 py-2 text-sm">
                    <span className="text-zinc-500">{index + 1}</span>
                    <span className="flex-1 font-medium">{playerName(row.playerId)}</span>
                    <span className="font-mono font-bold">{row._count._all} cards</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <p className="mt-6 text-xs text-zinc-500">
          Voided and corrected events are excluded automatically. Want per-tournament tables? Open a{" "}
          <Link href="/competitions" className="text-emerald-300 underline">competition</Link>.
        </p>
      </main>
    </OperationsShell>
  );
}