import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requireSession } from "@/lib/authorization";
import { calculateStandings } from "@/lib/standings";
import { prisma } from "@/lib/prisma";

const MINIMUM_ROSTER_SIZE = 5;
const FIXTURE_WINDOW_MS = 2 * 60 * 60 * 1000;

export default async function DashboardPage() {
  const session = await requireSession();
  const activeSeason = await prisma.season.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { startDate: "desc" },
  });

  const [
    liveGames,
    awaitingFinalization,
    activeTeams,
    upcomingFixtures,
    recentAudits,
  ] = await Promise.all([
    prisma.game.findMany({
      where: { status: "LIVE" },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.game.findMany({
      where: { status: "PAUSED", fixture: { status: "LIVE" } },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
          },
        },
      },
    }),
    prisma.seasonClub.findMany({
      where: {
        status: "ACTIVE",
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      include: {
        club: true,
        division: true,
        _count: { select: { players: true } },
      },
      orderBy: { club: { name: "asc" } },
    }),
    prisma.fixture.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { gte: new Date() },
        ...(activeSeason ? { seasonId: activeSeason.id } : {}),
      },
      include: {
        venue: true,
        officials: true,
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 100,
    }),
    prisma.auditLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const missingRosters = activeTeams.filter(
    (team) => team._count.players < MINIMUM_ROSTER_SIZE,
  );
  const missingOfficials = upcomingFixtures.filter(
    (fixture) => fixture.officials.length === 0,
  );
  const conflictIds = new Set<string>();
  for (let index = 0; index < upcomingFixtures.length; index += 1) {
    for (let other = index + 1; other < upcomingFixtures.length; other += 1) {
      const first = upcomingFixtures[index];
      const second = upcomingFixtures[other];
      if (
        first.venueId === second.venueId &&
        Math.abs(first.scheduledAt.getTime() - second.scheduledAt.getTime()) <
          FIXTURE_WINDOW_MS
      ) {
        conflictIds.add(first.id);
        conflictIds.add(second.id);
      }
    }
  }
  const fixtureConflicts = upcomingFixtures.filter((fixture) =>
    conflictIds.has(fixture.id),
  );

  let standingFailures = 0;
  if (activeSeason) {
    const [teams, finalFixtures, storedRows] = await Promise.all([
      prisma.seasonClub.findMany({
        where: { seasonId: activeSeason.id },
        select: { id: true },
      }),
      prisma.fixture.findMany({
        where: { seasonId: activeSeason.id, status: "FINAL" },
        select: {
          homeSeasonClubId: true,
          awaySeasonClubId: true,
          homeScore: true,
          awayScore: true,
          winnerSeasonClubId: true,
        },
      }),
      prisma.standing.findMany({ where: { seasonId: activeSeason.id } }),
    ]);
    const expected = calculateStandings(
      teams.map((team) => team.id),
      finalFixtures,
    );
    const stored = new Map(storedRows.map((row) => [row.seasonClubId, row]));
    standingFailures = [...expected].filter(([teamId, row]) => {
      const actual = stored.get(teamId);
      return (
        !actual ||
        actual.played !== row.played ||
        actual.won !== row.won ||
        actual.lost !== row.lost ||
        actual.pointsFor !== row.pointsFor ||
        actual.pointsAgainst !== row.pointsAgainst ||
        actual.pointDifference !== row.pointDifference ||
        actual.leaguePoints !== row.leaguePoints
      );
    }).length;
  }

  const cards = [
    ["Live games", liveGames.length, "text-emerald-300"],
    ["Awaiting finalization", awaitingFinalization.length, "text-amber-300"],
    ["Missing rosters", missingRosters.length, "text-rose-300"],
    ["Missing officials", missingOfficials.length, "text-rose-300"],
    ["Fixture conflicts", fixtureConflicts.length, "text-amber-300"],
    ["Standing failures", standingFailures, "text-rose-300"],
  ] as const;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">
          {activeSeason?.name ?? "No active season"}
        </p>
        <h1 className="mt-2 text-4xl font-semibold">Operations mission control</h1>
        <p className="mt-2 text-zinc-400">
          Live activity, readiness gaps, scheduling risks, and data integrity.
        </p>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {cards.map(([label, value, color]) => (
            <article key={label} className="rounded-2xl border border-white/10 bg-[#0b100e] p-5">
              <p className="text-sm text-zinc-400">{label}</p>
              <p className={`mt-3 text-3xl font-semibold ${color}`}>{value}</p>
            </article>
          ))}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <AlertPanel title="Live and paused games">
            {[...liveGames, ...awaitingFinalization].map((game) => (
              <Link key={game.id} href={`/games/${game.fixtureId}/live`} className="block border-b border-white/[.06] py-3 last:border-0">
                {game.fixture.homeSeasonClub.club.name} vs {game.fixture.awaySeasonClub.club.name}
                <span className="ml-2 text-xs text-zinc-500">{game.status}</span>
              </Link>
            ))}
            {liveGames.length + awaitingFinalization.length === 0 ? <Empty /> : null}
          </AlertPanel>
          <AlertPanel title="Roster readiness">
            {missingRosters.map((team) => (
              <Link key={team.id} href={`/clubs/${team.clubId}`} className="flex justify-between border-b border-white/[.06] py-3 last:border-0">
                <span>{team.club.name} · {team.division.name}</span>
                <span className="text-rose-300">{team._count.players}/{MINIMUM_ROSTER_SIZE}</span>
              </Link>
            ))}
            {missingRosters.length === 0 ? <Empty /> : null}
          </AlertPanel>
          <AlertPanel title="Fixture readiness">
            {[...new Map([...missingOfficials, ...fixtureConflicts].map((fixture) => [fixture.id, fixture])).values()].map((fixture) => (
              <Link key={fixture.id} href={`/fixtures/${fixture.id}`} className="block border-b border-white/[.06] py-3 last:border-0">
                <p>{fixture.homeSeasonClub.club.name} vs {fixture.awaySeasonClub.club.name}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {fixture.scheduledAt.toLocaleString()} · {fixture.venue.name}
                  {fixture.officials.length === 0 ? " · No officials" : ""}
                  {conflictIds.has(fixture.id) ? " · Venue conflict" : ""}
                </p>
              </Link>
            ))}
            {missingOfficials.length + fixtureConflicts.length === 0 ? <Empty /> : null}
          </AlertPanel>
          <AlertPanel title="Recent critical actions">
            {recentAudits.map((audit) => (
              <div key={audit.id} className="border-b border-white/[.06] py-3 text-sm last:border-0">
                <p>{audit.action.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-zinc-500">{audit.user.name} · {audit.createdAt.toLocaleString()}</p>
              </div>
            ))}
            {recentAudits.length === 0 ? <Empty /> : null}
            <Link href="/audit" className="mt-4 inline-block text-sm text-emerald-400">Open audit ledger</Link>
          </AlertPanel>
        </div>
      </main>
    </OperationsShell>
  );
}

function AlertPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="font-semibold">{title}</h2><div className="mt-3">{children}</div></section>;
}

function Empty() {
  return <p className="py-4 text-sm text-zinc-500">No issues detected.</p>;
}
