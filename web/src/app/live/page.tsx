import Link from "next/link";
import { LiveRefresher } from "./live-refresher";
import { LiveGameHero } from "./live-game-hero";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { formatLagosTime } from "@/lib/format-datetime";
import { productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { computeSnapshotHealth } from "@/lib/system-health";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMPTY_STANDING = { leaguePoints: 0, lost: 0, played: 0, pointDifference: 0, pointsFor: 0, won: 0 };

export default async function PublicLive() {
  const organization = await resolveDefaultPublicOrganization();
  const { season, fixtures } = await withOrganizationContext(organization.id, async (tx) => {
    const activeSeason = await tx.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
    const seasonFixtures = activeSeason
      ? await tx.fixture.findMany({
        // G.19 Part III: a REHEARSAL (or any non-PRODUCTION) fixture must never surface here,
        // in any of the three states below - the G.18 rehearsal found this query had no such
        // filter at all.
        where: { seasonId: activeSeason.id, status: { notIn: ["CANCELLED", "POSTPONED"] }, ...productionPresentationFixtureWhere() },
        orderBy: { scheduledAt: "asc" },
        include: {
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
          game: true,
        },
      })
      : [];
    return { season: activeSeason, fixtures: seasonFixtures };
  });

  const live = fixtures.filter((f) => f.game && (f.game.status === "LIVE" || f.game.status === "PAUSED"));
  const results = fixtures.filter((f) => f.status === "FINAL");
  const upcoming = fixtures.filter((f) => f.status === "SCHEDULED" && !f.game);

  // Part IV: "Never show an empty scoreboard." When nothing is live, the page leads with the
  // most useful real content instead - next fixture, latest result, standings entry point.
  if (live.length === 0) {
    const seasonClubs = season
      ? await withOrganizationContext(organization.id, (tx) => tx.seasonClub!.findMany({
          where: { seasonId: season.id, status: "ACTIVE" },
          include: { club: true, division: true, standing: true },
        }))
      : [];
    const standingRows = seasonClubs
      .map((sc) => ({ club: sc.club, division: sc.division.name, ...(sc.standing ?? EMPTY_STANDING) }))
      .sort((a, b) => b.leaguePoints - a.leaguePoints || b.pointDifference - a.pointDifference)
      .slice(0, 6);

    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Season Zero · Live</p>
        <h1 className="mt-2 text-3xl font-bold">Match centre</h1>
        <p className="mt-3 text-zinc-400">No game is live right now.</p>

        {upcoming[0] ? (
          <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Next game</h2>
            <p className="mt-3 text-lg">{upcoming[0].homeSeasonClub!.club.name} vs {upcoming[0].awaySeasonClub!.club.name}</p>
            <p className="mt-1 text-sm text-zinc-500">{formatLagosTime(upcoming[0].scheduledAt)}</p>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Latest result</h2>
          {results.length === 0 ? (
            <p className="mt-3 text-zinc-500">No results yet.</p>
          ) : (
            <Link href={`/public/fixtures/${results[results.length - 1].id}`} className="mt-3 block rounded-lg bg-white/[.04] p-4 text-sm hover:bg-white/[.07]">
              {results[results.length - 1].homeSeasonClub!.club.shortName} {results[results.length - 1].homeScore} — {results[results.length - 1].awayScore} {results[results.length - 1].awaySeasonClub!.club.shortName}
              <span className="ml-2 text-emerald-400">View game story →</span>
            </Link>
          )}
        </section>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Standings</h2>
            <Link href="/public/standings" className="text-xs text-emerald-400">Full standings</Link>
          </div>
          <div className="mt-3 overflow-x-auto rounded-xl border border-white/[.08]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="p-2">Club</th><th className="p-2">Div</th><th className="p-2 text-right">W</th><th className="p-2 text-right">L</th><th className="p-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {standingRows.map((row) => (
                  <tr key={row.club.id} className="border-t border-white/[.06]">
                    <td className="p-2">{row.club.name}</td>
                    <td className="p-2 text-zinc-500">{row.division}</td>
                    <td className="p-2 text-right">{row.won}</td>
                    <td className="p-2 text-right">{row.lost}</td>
                    <td className="p-2 text-right font-semibold">{row.leaguePoints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-4 text-xs">
            <Link href="/public/stats" className="text-emerald-400">League stats</Link>
            <Link href="/public/stats/records" className="text-emerald-400">Record book</Link>
          </div>
        </section>
      </main>
    );
  }

  // One or more live games (Part IV, "multiple live games: show a selector rather than
  // assuming exactly one"). Every model comes from the same buildLivePresentationModelForGame()
  // composition every other surface (broadcast, commentator) will also call - never a page-
  // local recalculation.
  const models = await withOrganizationContext(organization.id, (tx) => Promise.all(live.map((f) => buildLivePresentationModelForGame(f.game!.id, tx))));
  // G.21 Part III carryover: the freshness model from G.20's system-health.ts, reused verbatim
  // (never a second monitoring truth) to give the public page its own honest staleness signal -
  // the gap G.20 disclosed and deferred. Never replaces the last-known score; only adds a small
  // "LIVE DATA DELAYED" indicator alongside it when the event ledger hasn't advanced while the
  // clock is running.
  const nowMs = new Date().getTime();
  const freshness = await withOrganizationContext(organization.id, (tx) => Promise.all(live.map(async (f) => {
      const lastActiveEvent = await tx.gameEvent.findFirst({ where: { gameId: f.game!.id, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      const model = models[live.indexOf(f)];
      return computeSnapshotHealth({ gameStatus: model.status, clockRunning: model.clock.running, lastEventAt: lastActiveEvent?.createdAt ?? null, nowMs });
    })));

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Season Zero · Live</p>
      <h1 className="mt-2 text-3xl font-bold">Match centre</h1>
      <LiveRefresher />
      <div className="mt-8 space-y-8">
        {live.map((fixture, i) => (
          <LiveGameHero key={fixture.id} fixture={{ ...fixture, homeSeasonClub: fixture.homeSeasonClub!, awaySeasonClub: fixture.awaySeasonClub! }} model={models[i]} href={`/public/fixtures/${fixture.id}`} staleness={freshness[i]} />
        ))}
      </div>
    </main>
  );
}
