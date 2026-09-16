import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { formatLabel } from "@/lib/sports/format";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function CompetitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermissionOrRedirect("competition:manage", `/competitions/${id}`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const competition = await withOrganizationContext(organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id },
      include: {
        sport: true,
        divisions: { orderBy: { name: "asc" } },
        seasons: {
          orderBy: { startDate: "desc" },
          include: { _count: { select: { seasonClubs: true, fixtures: true, standings: true } } },
        },
      },
    }),
  );

  if (!competition) notFound();

  const definition = getSportDefinition(competition.sport.slug);
  const summary = definition ? describeSport(definition) : null;
  const totals = competition.seasons.reduce(
    (accumulator, season) => ({
      clubs: accumulator.clubs + season._count.seasonClubs,
      fixtures: accumulator.fixtures + season._count.fixtures,
    }),
    { clubs: 0, fixtures: 0 },
  );

  const readiness = [
    { label: "Sport format configured", ok: Boolean(summary) },
    { label: "At least one season", ok: competition.seasons.length > 0 },
    { label: "At least one division", ok: competition.divisions.length > 0 },
    { label: "At least two teams registered", ok: totals.clubs >= 2 },
    { label: "Fixtures scheduled", ok: totals.fixtures > 0 },
  ];
  const ready = readiness.every((step) => step.ok);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link href="/competitions" className="text-sm text-emerald-400">
          ← Competitions
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.24em] text-emerald-400">{competition.sport.name}</p>
            <h1 className="mt-2 text-3xl font-semibold">{competition.name}</h1>
            <p className="mt-1 text-sm text-zinc-400">{summary?.formatSummary ?? "Sport format not configured."}</p>
            <p className="mt-1 text-sm text-zinc-400">
              Format: {formatLabel(competition.format)}
              {competition.format === "GROUP_STAGE" ? ` · ${competition.groupCount} groups` : ""}
              {competition.divisions.some((division) => division.format || division.groupCount)
                ? " · some divisions override"
                : ""}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              ready ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"
            }`}
          >
            {ready ? "Ready" : "Setup in progress"}
          </span>
        </div>

        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Readiness</h2>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {readiness.map((step) => (
              <li key={step.label} className="flex items-center gap-3 text-sm">
                <span className={step.ok ? "text-emerald-400" : "text-zinc-600"}>{step.ok ? "✓" : "○"}</span>
                <span className={step.ok ? "text-zinc-200" : "text-zinc-400"}>{step.label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Seasons</h2>
          {competition.seasons.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No seasons yet.</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/[.03] text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-4 py-3">Season</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Teams</th>
                    <th className="px-4 py-3">Fixtures</th>
                    <th className="px-4 py-3">Standings</th>
                  </tr>
                </thead>
                <tbody>
                  {competition.seasons.map((season) => (
                    <tr key={season.id} className="border-t border-white/5">
                      <td className="px-4 py-3">{season.name}</td>
                      <td className="px-4 py-3 text-zinc-400">{season.status}</td>
                      <td className="px-4 py-3">{season._count.seasonClubs}</td>
                      <td className="px-4 py-3">{season._count.fixtures}</td>
                      <td className="px-4 py-3">{season._count.standings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Divisions</h2>
          {competition.divisions.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No divisions yet.</p>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {competition.divisions.map((division) => (
                <span key={division.id} className="rounded-full border border-white/10 px-3 py-1 text-sm text-zinc-200">
                  {division.name}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Next steps</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={`/competitions/${competition.id}/settings`} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Format
            </Link>
            <Link href={`/competitions/${competition.id}/sport-rules`} className="rounded-lg border border-emerald-400/40 px-4 py-2 text-sm text-emerald-200 hover:border-emerald-400">
              Sport rules
            </Link>
            <Link href={`/competitions/${competition.id}/teams`} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Teams
            </Link>
            <Link href={`/competitions/${competition.id}/teams/new`} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Add team
            </Link>
            <Link href={`/competitions/${competition.id}/schedule`} className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Generate schedule
            </Link>
            <Link href="/clubs" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Manage teams
            </Link>
            <Link href="/players" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Manage athletes
            </Link>
            <Link href="/fixtures" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              Schedule fixtures
            </Link>
            <Link href="/standings" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:border-white/25">
              View standings
            </Link>
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}
