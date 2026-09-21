import Link from "next/link";
import { PortalShell } from "@/app/components/portal-shell";
import { filterHubTournaments } from "@/lib/discovery-hub";
import { TOURNAMENT_STATUS_STYLE, tournamentStatusFromFixtureStatuses } from "@/lib/tournament-subsite";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = { sport?: string; city?: string; q?: string };

function sideName(seasonClub: { club: { name: string } } | null, entrant: { name: string } | null) {
  return seasonClub?.club.name ?? entrant?.name ?? "TBD";
}

// Fan discovery hub (product roadmap F3): live-now hero, tournament grid, sport/city/search
// filters, quick actions. Every link resolves to a real page — no dead ends.
export default async function DiscoveryHub({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams;
  const sport = query.sport ?? "all";
  const city = query.city ?? "all";
  const q = (query.q ?? "").trim();

  const organization = await resolveDefaultPublicOrganization();
  const [competitions, venues, clubHits] = await withOrganizationContext(organization.id, (tx) =>
    Promise.all([
      tx.competition.findMany({
        where: { organizationId: organization.id, isActive: true },
        include: {
          sport: true,
          seasons: {
            include: {
              fixtures: {
                include: {
                  venue: true,
                  game: { select: { id: true } },
                  homeSeasonClub: { include: { club: true } },
                  awaySeasonClub: { include: { club: true } },
                  homeEntrant: true,
                  awayEntrant: true,
                },
              },
            },
          },
        },
        orderBy: { name: "asc" },
      }),
      tx.venue.findMany({ orderBy: [{ city: "asc" }, { name: "asc" }], select: { id: true, name: true, city: true } }),
      q
        ? tx.club.findMany({
            where: { organizationId: organization.id, name: { contains: q, mode: "insensitive" } },
            take: 6,
            select: { id: true, name: true, shortName: true },
          })
        : Promise.resolve([]),
    ]),
  );

  // Club match-page links resolve through locators (publicKey = club id).
  const clubLocatorIds = new Set(
    clubHits.length > 0
      ? await withOrganizationContext(organization.id, (tx) =>
          tx.publicResourceLocator
            .findMany({
              where: { resourceType: "CLUB", resourceId: { in: clubHits.map((c) => c.id) }, status: "ACTIVE" },
              select: { resourceId: true },
            })
            .then((rows) => rows.map((r) => r.resourceId)),
        )
      : [],
  );

  const cities = [...new Set(venues.map((v) => v.city).filter(Boolean))].sort();
  const sports = new Map<string, { slug: string; name: string; count: number }>();
  for (const c of competitions) {
    const entry = sports.get(c.sport.slug) ?? { slug: c.sport.slug, name: c.sport.name, count: 0 };
    entry.count += 1;
    sports.set(c.sport.slug, entry);
  }

  const shaped = competitions.map((c) => {
    const fixtures = c.seasons.flatMap((s) => s.fixtures);
    const fixtureCities = [...new Set(fixtures.map((f) => f.venue.city).filter(Boolean))];
    const starts = c.seasons.map((s) => s.startDate.getTime());
    const ends = c.seasons.map((s) => s.endDate.getTime());
    return {
      slug: c.slug,
      name: c.name,
      sportSlug: c.sport.slug,
      sportName: c.sport.name,
      cities: fixtureCities,
      status: tournamentStatusFromFixtureStatuses(fixtures.map((f) => f.status)),
      dateRange: starts.length > 0 ? { from: new Date(Math.min(...starts)), to: new Date(Math.max(...ends)) } : null,
      live: fixtures.filter((f) => f.status === "LIVE"),
      next: fixtures.filter((f) => f.status === "SCHEDULED").sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0] ?? null,
    };
  });
  const tournaments = filterHubTournaments(shaped, { sport, city, q });

  const liveAcross = shaped
    .flatMap((t) => t.live.map((f) => ({ tournament: t, fixture: f })))
    .filter(({ tournament, fixture }) => {
      if (sport !== "all" && tournament.sportSlug.toLowerCase() !== sport.toLowerCase()) return false;
      if (city !== "all" && fixture.venue.city.toLowerCase() !== city.toLowerCase()) return false;
      return true;
    })
    .slice(0, 3);

  const upcomingAcross = shaped
    .flatMap((t) => t.live.length === 0 && t.next ? [{ tournament: t, fixture: t.next }] : [])
    .filter(({ tournament, fixture }) => {
      if (sport !== "all" && tournament.sportSlug.toLowerCase() !== sport.toLowerCase()) return false;
      if (city !== "all" && fixture.venue.city.toLowerCase() !== city.toLowerCase()) return false;
      return true;
    })
    .sort((a, b) => a.fixture.scheduledAt.getTime() - b.fixture.scheduledAt.getTime())
    .slice(0, 3);

  const venueHits = q ? venues.filter((v) => `${v.name} ${v.city}`.toLowerCase().includes(q.toLowerCase())).slice(0, 5) : [];
  const params = new URLSearchParams();
  if (sport !== "all") params.set("sport", sport);
  if (city !== "all") params.set("city", city);
  if (q) params.set("q", q);
  const withParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all" || value === "") next.delete(key);
    else next.set(key, value);
    const s = next.toString();
    return `/${s ? `?${s}` : ""}`;
  };

  return (
    <PortalShell>
      <main className="mx-auto max-w-6xl px-6 pb-16">
        <section id="live" className="pt-10">
          <p className="text-xs uppercase tracking-[.3em] text-brand-400">{liveAcross.length > 0 ? "Live now" : "Coming up"}</p>
          <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl">Find your game</h1>
          {liveAcross.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {liveAcross.map(({ tournament, fixture }) => (
                <article key={fixture.id} className="rounded-lg border border-danger/25 bg-danger/[.05] p-5">
                  <p className="text-xs font-bold text-danger">● LIVE · {tournament.name}</p>
                  <p className="mt-2 text-lg font-bold">
                    <span className="font-mono tabular-nums">
                      {fixture.homeScore} – {fixture.awayScore}
                    </span>{" "}
                    {sideName(fixture.homeSeasonClub, fixture.homeEntrant)} · {sideName(fixture.awaySeasonClub, fixture.awayEntrant)}
                  </p>
                  <p className="mt-1 text-xs text-text-3">{fixture.venue.name}</p>
                  <div className="mt-3 flex gap-2">
                    {fixture.game ? (
                      <Link
                        href={`/scoreboard/${fixture.game.id}`}
                        className="rounded-md bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
                      >
                        Watch live
                      </Link>
                    ) : null}
                    <Link
                      href={`/t/${tournament.slug}`}
                      className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                    >
                      Tournament
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : upcomingAcross.length > 0 ? (
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {upcomingAcross.map(({ tournament, fixture }) => (
                <article key={fixture.id} className="rounded-lg border border-line bg-ink-800 p-5">
                  <p className="text-xs font-bold text-info">UPCOMING · {tournament.name}</p>
                  <p className="mt-2 font-bold">
                    {sideName(fixture.homeSeasonClub, fixture.homeEntrant)} <span className="text-text-3">vs</span>{" "}
                    {sideName(fixture.awaySeasonClub, fixture.awayEntrant)}
                  </p>
                  <p className="mt-1 text-xs text-text-3">
                    {fixture.scheduledAt.toLocaleString()} · {fixture.venue.name}
                  </p>
                  <Link
                    href={`/t/${tournament.slug}`}
                    className="mt-3 inline-block rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                  >
                    View tournament
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-text-2">No live or scheduled games right now — check the tournaments below.</p>
          )}
        </section>

        <section className="mt-8 flex flex-wrap gap-2">
          <a href="#live" className="rounded-full border border-line px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white">
            Live matches
          </a>
          <a href="#tournaments" className="rounded-full border border-line px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white">
            Tournaments
          </a>
          <Link href="/public/standings" className="rounded-full border border-line px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white">
            Live standings
          </Link>
        </section>

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-5">
          <div className="flex flex-wrap gap-2">
            <Link
              href={withParam("sport", "all")}
              className={`rounded-full px-4 py-2 text-sm transition ${sport === "all" ? "bg-brand-400/15 font-semibold text-brand-300" : "text-text-2 hover:text-white"}`}
            >
              All sports
            </Link>
            {[...sports.values()].map((s) => (
              <Link
                key={s.slug}
                href={withParam("sport", s.slug)}
                className={`rounded-full px-4 py-2 text-sm transition ${
                  sport.toLowerCase() === s.slug.toLowerCase()
                    ? "bg-brand-400/15 font-semibold text-brand-300"
                    : "text-text-2 hover:text-white"
                }`}
              >
                {s.name} ({s.count})
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <form action="/" method="get" className="flex flex-1 gap-2">
              {sport !== "all" ? <input type="hidden" name="sport" value={sport} /> : null}
              {city !== "all" ? <input type="hidden" name="city" value={city} /> : null}
              <input
                name="q"
                defaultValue={q}
                placeholder="Search teams, tournaments, venues"
                className="min-h-[44px] flex-1 rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1 transition placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none"
              />
              <button type="submit" className="rounded-md bg-brand-400 px-4 text-sm font-semibold text-ink-900 transition hover:bg-brand-300">
                Search
              </button>
            </form>
            <form action="/" method="get" className="flex gap-2">
              {sport !== "all" ? <input type="hidden" name="sport" value={sport} /> : null}
              {q ? <input type="hidden" name="q" value={q} /> : null}
              <select name="city" defaultValue={city} className="min-h-[44px] rounded-md border border-line bg-ink-700 px-3 text-sm text-text-1 [color-scheme:dark]">
                <option value="all">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded-md border border-line-strong px-4 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white">
                Filter
              </button>
            </form>
          </div>
        </section>

        {q ? (
          <section className="mt-8">
            <h2 className="text-xl font-bold">Results for “{q}”</h2>
            {clubHits.length === 0 && venueHits.length === 0 ? (
              <p className="mt-2 text-sm text-text-3">No teams or venues match — tournaments above are still filtered by your search.</p>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {clubHits.map((club) => (
                  <div key={club.id} className="rounded-lg border border-line bg-ink-800 p-4">
                    <p className="font-semibold">
                      {club.name} <span className="text-xs font-normal text-text-3">· team · {club.shortName}</span>
                    </p>
                    {clubLocatorIds.has(club.id) ? (
                      <Link href={`/public/clubs/${club.id}`} className="mt-1 inline-block text-sm text-brand-400">
                        View team →
                      </Link>
                    ) : null}
                  </div>
                ))}
                {venueHits.map((venue) => (
                  <div key={venue.id} className="rounded-lg border border-line bg-ink-800 p-4">
                    <p className="font-semibold">
                      {venue.name} <span className="text-xs font-normal text-text-3">· venue · {venue.city}</span>
                    </p>
                    <Link href={withParam("city", venue.city)} className="mt-1 inline-block text-sm text-brand-400">
                      Events in {venue.city} →
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        <section id="tournaments" className="mt-10">
          <h2 className="text-2xl font-bold">
            Tournaments <span className="text-base font-normal text-text-3">({tournaments.length})</span>
          </h2>
          {tournaments.length === 0 ? (
            <p className="mt-3 text-text-2">
              No tournaments match these filters.{" "}
              <Link href="/" className="text-brand-400">
                Clear filters
              </Link>
            </p>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {tournaments.map((t) => (
                <article key={t.slug} className="rounded-lg border border-line bg-ink-800 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${TOURNAMENT_STATUS_STYLE[t.status]}`}>
                      {t.status === "LIVE" ? "● LIVE" : t.status}
                    </span>
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] uppercase tracking-wider text-text-2">
                      {t.sportName}
                    </span>
                  </div>
                  <h3 className="mt-2 font-display text-lg font-semibold">{t.name}</h3>
                  <p className="mt-1 text-xs text-text-3">
                    {t.dateRange ? `${t.dateRange.from.toLocaleDateString()} – ${t.dateRange.to.toLocaleDateString()}` : "Dates TBA"}
                    {t.cities.length > 0 ? ` · ${t.cities.join(", ")}` : ""}
                  </p>
                  {t.live.length > 0 ? (
                    <p className="mt-1 text-xs font-semibold text-danger">
                      {t.live.length} live now{t.live.length === 1 ? `: ${sideName(t.live[0].homeSeasonClub, t.live[0].homeEntrant)} ${t.live[0].homeScore}–${t.live[0].awayScore} ${sideName(t.live[0].awaySeasonClub, t.live[0].awayEntrant)}` : ""}
                    </p>
                  ) : null}
                  <Link
                    href={`/t/${t.slug}`}
                    className="mt-3 inline-block rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
                  >
                    View tournament
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </PortalShell>
  );
}
