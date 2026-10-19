import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { fixtureSide } from "@/lib/fixture-side";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// /operations/matchday (streak v10, Prompt 3)
//
// One venue can run a volleyball match, a tennis match and a football match at the same time. The existing
// /gameday board is basketball-shaped, so this page answers a different question: what is LIVE right now, across
// every sport, and what is about to start today?
//
// Deliberately no sport-specific logic here - a card is a card. The console link is the same route for every
// sport because the console dispatches by the sport definition; nothing on this page decides how to score.

const SPORT_ICON: Record<string, string> = {
  basketball: "🏀",
  football: "⚽",
  tennis: "🎾",
  "table-tennis": "🏓",
  volleyball: "🏐",
  cricket: "🏏",
  "american-football": "🏈",
};

function clockLabel(status: string, period: number, secondsRemaining: number | null): string {
  if (status === "PAUSED") return "PAUSED";
  if (secondsRemaining === null) return `Period ${period}`;
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")} · P${period}`;
}

export default async function MatchDayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/operations/matchday");
  if (!hasPermission(session.user.roles, "operations:view") && !hasPermission(session.user.roles, "game:operate")) notFound();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const { live, today } = await withOrganizationContext(organizationId, async (tx) => {
    const fixtureInclude = {
      homeSeasonClub: { include: { club: true } },
      awaySeasonClub: { include: { club: true } },
      homeEntrant: { select: { id: true, name: true } },
      awayEntrant: { select: { id: true, name: true } },
      game: true,
      division: { include: { competition: { include: { sport: { select: { slug: true, name: true } } } } } },
      venue: { select: { name: true } },
    } as const;

    return {
      live: await tx.fixture.findMany({
        where: { organizationId, game: { status: { in: ["LIVE", "PAUSED"] } } },
        orderBy: { scheduledAt: "asc" },
        include: fixtureInclude,
      }),
      today: await tx.fixture.findMany({
        where: { organizationId, status: "SCHEDULED", scheduledAt: { gte: startOfDay, lt: endOfDay } },
        orderBy: { scheduledAt: "asc" },
        include: fixtureInclude,
      }),
    };
  });

  const bySport = new Map<string, typeof today>();
  for (const fixture of today) {
    const slug = fixture.division.competition.sport.slug;
    bySport.set(slug, [...(bySport.get(slug) ?? []), fixture]);
  }

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">Match day</h1>
          <p className="text-xs text-text-3">
            Every LIVE fixture in this organization, whatever the sport · {live.length} live · {today.length} scheduled today
          </p>
        </div>

        <section aria-labelledby="live-heading" className="mt-6">
          <h2 id="live-heading" className="text-sm font-semibold uppercase tracking-wider text-text-3">
            Live now
          </h2>
          {live.length === 0 ? (
            <p className="mt-2 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">
              Nothing is live. Start a match from the list below.
            </p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((fixture) => {
                const home = fixtureSide(fixture.homeSeasonClub, fixture.homeEntrant);
                const away = fixtureSide(fixture.awaySeasonClub, fixture.awayEntrant);
                const sport = fixture.division.competition.sport;
                const game = fixture.game!;
                return (
                  <Link
                    key={fixture.id}
                    href={`/games/${fixture.id}/live`}
                    className="rounded-lg border border-brand-400/30 bg-ink-800 p-4 transition hover:border-brand-400/60"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-400">
                        {SPORT_ICON[sport.slug] ?? "•"} {sport.name}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wide ${game.status === "PAUSED" ? "text-warn" : "text-brand-300"}`}>
                        {game.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-text-1">
                      {home.shortName} <span className="font-mono font-bold">{fixture.homeScore}–{fixture.awayScore}</span> {away.shortName}
                    </p>
                    <p className="mt-1 text-xs text-text-3">
                      {clockLabel(game.status, game.currentPeriod, game.clockSecondsRemaining)}
                      {fixture.venue ? ` · ${fixture.venue.name}` : ""}
                    </p>
                    <p className="mt-2 text-xs text-info">Open capture console →</p>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section aria-labelledby="next-heading" className="mt-8">
          <h2 id="next-heading" className="text-sm font-semibold uppercase tracking-wider text-text-3">
            Start next match · scheduled today
          </h2>
          {bySport.size === 0 ? (
            <p className="mt-2 rounded-lg border border-line bg-ink-800 p-4 text-sm text-text-2">No fixtures scheduled for today.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {[...bySport.entries()].map(([slug, fixtures]) => (
                <div key={slug} className="rounded-lg border border-line bg-ink-800 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-text-2">
                    {SPORT_ICON[slug] ?? "•"} {fixtures[0].division.competition.sport.name} · {fixtures.length}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {fixtures.map((fixture) => {
                      const home = fixtureSide(fixture.homeSeasonClub, fixture.homeEntrant);
                      const away = fixtureSide(fixture.awaySeasonClub, fixture.awayEntrant);
                      return (
                        <li key={fixture.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-text-1">
                            {home.name} <span className="text-text-3">vs</span> {away.name}
                            <span className="ml-2 text-xs text-text-3">
                              {fixture.scheduledAt.toISOString().slice(11, 16)} · {fixture.venue?.name ?? "venue TBC"}
                            </span>
                          </span>
                          <Link href={`/games/${fixture.id}/live`} className="rounded border border-line px-2 py-1 text-xs text-info">
                            Open console
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
