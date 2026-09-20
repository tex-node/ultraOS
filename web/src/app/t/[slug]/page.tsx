import Link from "next/link";
import { notFound } from "next/navigation";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tournament sub-site overview (product roadmap F2.1): rules, venues, teams, seasons.
// Everything reads the accepted model — no new tables, no new endpoints.
export default async function TournamentOverview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const competition = await withOrganizationContext(organization.id, (tx) =>
    tx.competition.findFirst({
      where: { organizationId: organization.id, slug, isActive: true },
      include: {
        sport: true,
        divisions: true,
        seasons: {
          include: {
            seasonClubs: { include: { club: true } },
            entrants: { where: { status: "ACTIVE" } },
            fixtures: { include: { venue: true }, orderBy: { scheduledAt: "asc" } },
          },
        },
      },
    }),
  );
  if (!competition) notFound();

  const definition = getSportDefinition(competition.sport.slug);
  const formatSummary = definition ? describeSport(definition).formatSummary : null;
  const venues = [...new Map(competition.seasons.flatMap((s) => s.fixtures).map((f) => [f.venue.id, f.venue])).values()];
  const teams = competition.seasons.flatMap((s) =>
    s.seasonClubs.map((sc) => ({
      key: sc.id,
      name: sc.club.name,
      detail: `${s.name} · ${sc.club.shortName}`,
      color: sc.club.primaryColor,
    })),
  );
  const individuals = competition.seasons.flatMap((s) =>
    s.entrants
      .filter((e) => e.seasonClubId == null)
      .map((e) => ({ key: e.id, name: e.name, detail: `${s.name} · ${e.type}`, color: e.primaryColor })),
  );
  const participants = [...teams, ...individuals];

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-emerald-400">Sport & format</h2>
          <p className="mt-2 font-semibold">{competition.sport.name}</p>
          {formatSummary ? <p className="mt-1 text-sm text-zinc-400">{formatSummary}</p> : null}
          <p className="mt-1 text-sm text-zinc-400">{competition.format.replace(/_/g, " ").toLowerCase()}</p>
        </section>
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-emerald-400">Seasons & divisions</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Divisions: {competition.divisions.map((d) => d.name).join(", ") || "none yet"}
          </p>
          {competition.seasons.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No seasons yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {competition.seasons.map((s) => (
                <li key={s.id} className="text-zinc-300">
                  <span className="font-semibold text-white">{s.name}</span>
                  <span className="text-zinc-500"> · {s.status.replace(/_/g, " ").toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-emerald-400">Venues</h2>
          {venues.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">Venues announced with the schedule.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-zinc-300">
              {venues.map((v) => (
                <li key={v.id}>{v.name}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">
          {teams.length > 0 ? "Teams" : "Athletes"} <span className="text-sm font-normal text-zinc-500">({participants.length})</span>
        </h2>
        {participants.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Entries open soon — teams and athletes will appear here.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((p) => (
              <div key={p.key} className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black"
                  style={{
                    color: p.color ?? "#16F2B3",
                    background: `${p.color ?? "#16F2B3"}15`,
                    border: `1px solid ${p.color ?? "#16F2B3"}44`,
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-zinc-500">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-emerald-400/20 bg-emerald-400/[.04] p-5">
        <h2 className="font-semibold text-emerald-300">Follow the action</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Fixtures, live scores, standings, and full match pages update automatically as games are scored.
        </p>
        <Link
          href={`/t/${competition.slug}/fixtures`}
          className="mt-3 inline-block rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
        >
          View fixtures & standings
        </Link>
      </section>
    </main>
  );
}
