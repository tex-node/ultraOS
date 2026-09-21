import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function CompetitionsPage() {
  const session = await requirePermissionOrRedirect("competition:manage", "/competitions");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const competitions = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.competition.findMany({
      include: {
        sport: true,
        divisions: { select: { id: true } },
        seasons: {
          orderBy: { startDate: "desc" },
          include: { _count: { select: { seasonClubs: true, fixtures: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
  );

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.24em] text-brand-400">League structure</p>
            <h1 className="mt-2 text-3xl font-semibold">Competitions</h1>
            <p className="mt-1 text-sm text-text-2">Each competition is one sport. Onboard a new tournament in a few guided steps.</p>
          </div>
          <Link href="/competitions/new" className="rounded-md bg-brand-400 px-4 py-3 font-semibold text-ink-900">
            Create tournament
          </Link>
        </div>

        {competitions.length === 0 ? (
          <div className="mt-10 rounded-lg border border-dashed border-white/15 bg-ink-800 p-8 text-center">
            <h2 className="text-lg font-semibold">No competitions yet</h2>
            <p className="mt-1 text-sm text-text-2">Create your first tournament to set up a sport, season, and divisions.</p>
            <Link href="/competitions/new" className="mt-4 inline-block rounded-lg bg-brand-400 px-4 py-2 font-semibold text-ink-900">
              Create tournament
            </Link>
          </div>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {competitions.map((competition) => {
              const definition = getSportDefinition(competition.sport.slug);
              const summary = definition ? describeSport(definition) : null;
              const clubs = competition.seasons.reduce((total, season) => total + season._count.seasonClubs, 0);
              const fixtures = competition.seasons.reduce((total, season) => total + season._count.fixtures, 0);
              return (
                <Link
                  key={competition.id}
                  href={`/competitions/${competition.id}`}
                  className="rounded-lg border border-line bg-ink-800 p-5 transition hover:border-white/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold">{competition.name}</h2>
                    <span className="rounded-full border border-brand-400/30 px-2 py-1 text-[11px] text-brand-300">
                      {competition.sport.name}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-text-2">{summary?.formatSummary ?? "Sport format not configured."}</p>
                  <p className="mt-4 text-xs text-text-3">
                    {competition.seasons.length} season{competition.seasons.length === 1 ? "" : "s"} · {competition.divisions.length} division
                    {competition.divisions.length === 1 ? "" : "s"} · {clubs} team{clubs === 1 ? "" : "s"} · {fixtures} fixture
                    {fixtures === 1 ? "" : "s"}
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </OperationsShell>
  );
}
