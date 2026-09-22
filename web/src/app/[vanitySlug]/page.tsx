import Link from "next/link";
import { notFound } from "next/navigation";
import { describeSport, getSportDefinition } from "@/lib/sports/registry";
import { resolveVanityCompetitionId } from "@/lib/vanity-tournament";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Vanity tournament overview - the short-URL sibling of /t/[slug]/page.tsx for any other
// organization's tournament. See layout.tsx for the resolution/routing-safety note.
export default async function VanityTournamentOverview({ params }: { params: Promise<{ vanitySlug: string }> }) {
  const { vanitySlug } = await params;
  const resolved = await resolveVanityCompetitionId(vanitySlug);
  if (!resolved) notFound();

  const competition = await withOrganizationContext(resolved.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id: resolved.competitionId },
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
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Sport & format</h2>
          <p className="mt-2 font-semibold">{competition.sport.name}</p>
          {formatSummary ? <p className="mt-1 text-sm text-text-2">{formatSummary}</p> : null}
          <p className="mt-1 text-sm text-text-2">{competition.format.replace(/_/g, " ").toLowerCase()}</p>
        </section>
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Seasons & divisions</h2>
          <p className="mt-2 text-sm text-text-1">
            Divisions: {competition.divisions.map((d) => d.name).join(", ") || "none yet"}
          </p>
          {competition.seasons.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">No seasons yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {competition.seasons.map((s) => (
                <li key={s.id} className="text-text-1">
                  <span className="font-semibold text-white">{s.name}</span>
                  <span className="text-text-3"> · {s.status.replace(/_/g, " ").toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Venues</h2>
          {venues.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">Venues announced with the schedule.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-text-1">
              {venues.map((v) => (
                <li key={v.id}>{v.name}</li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="text-xl font-bold">
          {teams.length > 0 ? "Teams" : "Athletes"} <span className="text-sm font-normal text-text-3">({participants.length})</span>
        </h2>
        {participants.length === 0 ? (
          <p className="mt-3 text-sm text-text-3">Entries open soon — teams and athletes will appear here.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {participants.map((p) => (
              <div key={p.key} className="flex items-center gap-3 rounded-lg border border-line bg-ink-800 p-4">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-md text-sm font-bold"
                  style={{
                    color: p.color ?? "#00F076",
                    background: `${p.color ?? "#00F076"}15`,
                    border: `1px solid ${p.color ?? "#00F076"}44`,
                  }}
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="truncate text-xs text-text-3">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8 rounded-lg border border-brand-400/20 bg-brand-400/[.04] p-5">
        <h2 className="font-semibold text-brand-300">Follow the action</h2>
        <p className="mt-1 text-sm text-text-2">
          Fixtures, results, and standings update automatically as games are transcribed.
        </p>
        <Link
          href={`/${vanitySlug}/fixtures`}
          className="mt-3 inline-block rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
        >
          View fixtures & standings
        </Link>
      </section>
    </main>
  );
}
