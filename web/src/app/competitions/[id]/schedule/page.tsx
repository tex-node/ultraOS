import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { withOrganizationContext } from "@/lib/tenant-context";
import { GenerateScheduleForm } from "./generate-form";

export const dynamic = "force-dynamic";

export default async function CompetitionSchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("fixture:manage", `/competitions/${id}/schedule`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const data = await withOrganizationContext(organizationId, async (tx) => {
    const competition = await tx.competition.findUnique({
      where: { id },
      include: { sport: true, divisions: { orderBy: { name: "asc" } }, seasons: { orderBy: { startDate: "desc" } } },
    });
    if (!competition) return null;
    const [venues, fixtures] = await Promise.all([
      tx.venue.findMany({ where: { organizationId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.fixture.findMany({
        where: { season: { competitionId: id } },
        include: {
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
          venue: true,
        },
        orderBy: { scheduledAt: "asc" },
        take: 200,
      }),
    ]);
    return { competition, venues, fixtures };
  });

  if (!data) notFound();
  const { competition, venues, fixtures } = data;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link href={`/competitions/${id}`} className="text-sm text-emerald-400">← {competition.name}</Link>
        <h1 className="mt-4 text-2xl font-semibold">Schedule · {competition.name}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Generate a round-robin schedule from the active teams in a division. Slots that clash with an
          existing venue booking or a team already playing are skipped, never overwritten.
        </p>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Generate schedule</h2>
          {competition.seasons.length === 0 || competition.divisions.length === 0 ? (
            <p className="mt-2 text-sm text-amber-300">Add at least one season and division to this competition first.</p>
          ) : (
            <GenerateScheduleForm
              competitionId={id}
              seasons={competition.seasons.map((season) => ({ id: season.id, name: season.name }))}
              divisions={competition.divisions.map((division) => ({ id: division.id, name: division.name }))}
              venues={venues.map((venue) => ({ id: venue.id, name: venue.name }))}
            />
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Scheduled fixtures</h2>
          {fixtures.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No fixtures scheduled for this competition yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Home</th>
                    <th className="py-2 pr-4">Away</th>
                    <th className="py-2 pr-4">Venue</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {fixtures.map((fixture) => (
                    <tr key={fixture.id} className="border-t border-white/5">
                      <td className="py-2 pr-4 text-zinc-400">{formatLagosDateTime(fixture.scheduledAt)}</td>
                      <td className="py-2 pr-4">
                        <Link href={`/fixtures/${fixture.id}`} className="text-emerald-300">{fixture.homeSeasonClub!.club.shortName}</Link>
                      </td>
                      <td className="py-2 pr-4">{fixture.awaySeasonClub!.club.shortName}</td>
                      <td className="py-2 pr-4 text-zinc-400">{fixture.venue.name}</td>
                      <td className="py-2 pr-4 text-zinc-400">{fixture.status}</td>
                      <td className="py-2 pr-4">{fixture.homeScore}–{fixture.awayScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
