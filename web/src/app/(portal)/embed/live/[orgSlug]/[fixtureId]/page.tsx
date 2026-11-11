import { notFound } from "next/navigation";
import { fixtureSide } from "@/lib/fixture-side";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { getSportDefinition } from "@/lib/sports/registry";
import { winProbabilityForGame } from "@/lib/analytics/win-probability-context";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";
import { EmbedRefresher } from "./embed-refresher";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// A partner's scoreboard (streak v11, Prompt 4).
//
//   <iframe src="https://<host>/embed/live/<orgSlug>/<fixtureId>" height="128" width="420" ...>
//
// Public by design and deliberately tiny: no navigation, no header, no footer, nothing to click. It shows the two
// sides (club or entrant, through fixtureSide), the score, and the sport's own idea of where the game is - "H2 34:12"
// for football, "Set 2" for tennis, "Inn 7" for baseball. A sport without a clock never renders "0:00".
//
// Data comes from the same production-scoped read as the rest of the public surface: a rehearsal fixture is a 404
// here, exactly as it is everywhere else.
export default async function EmbedLivePage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; fixtureId: string }>;
  searchParams: Promise<{ wp?: string }>;
}) {
  const { orgSlug, fixtureId } = await params;
  // Opt-in, not default (streak v12, Prompt 2): a partner who wants the probability bar asks for it with ?wp=1, and
  // the bar is absent otherwise rather than showing a number some partners would rather not publish.
  const showProbability = (await searchParams).wp === "1";
  const organization = await resolveActiveOrganizationBySlug(orgSlug).catch(() => null);
  if (!organization) notFound();

  const loaded = await withOrganizationContext(organization.id, async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
        homeEntrant: { select: { id: true, name: true } },
        awayEntrant: { select: { id: true, name: true } },
        game: true,
        venue: { select: { name: true } },
        division: { include: { competition: { include: { sport: { select: { slug: true, name: true } } } } } },
      },
    });
    if (!fixture || fixture.organizationId !== organization.id || !isProductionPresentationFixture(fixture)) return null;
    if (!fixture.game) return null;
    return fixture;
  });
  if (!loaded) notFound();

  const definition = getSportDefinition(loaded.division.competition.sport.slug);
  const home = fixtureSide(loaded.homeSeasonClub, loaded.homeEntrant);
  const away = fixtureSide(loaded.awaySeasonClub, loaded.awayEntrant);
  const game = loaded.game!;
  const status = game.status;
  const clock =
    definition && definition.structure.clock !== "NONE" && game.clockSecondsRemaining !== null
      ? `${Math.floor(game.clockSecondsRemaining / 60)}:${String(game.clockSecondsRemaining % 60).padStart(2, "0")}`
      : "";
  const periodLabel = (() => {
    if (!definition) return "";
    switch (definition.structure.periodType) {
      case "QUARTER":
        return `Q${game.currentPeriod}`;
      case "HALF":
        return `H${game.currentPeriod}`;
      case "SET":
        return `Set ${game.currentPeriod}`;
      case "INNING":
        return `Inn ${game.currentPeriod}`;
      case "PERIOD":
        return `P${game.currentPeriod}`;
      default:
        return "";
    }
  })();

  const probability =
    showProbability && definition
      ? winProbabilityForGame({
          definition,
          status: game.status,
          homeScore: loaded.homeScore,
          awayScore: loaded.awayScore,
          period: game.currentPeriod,
          clockSecondsRemaining: game.clockSecondsRemaining,
        })
      : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-900 p-2 text-text-1">
      <EmbedRefresher intervalSeconds={15} />
      <div className="w-full max-w-md rounded-xl border border-line bg-ink-800 px-4 py-3">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-text-3">
          <span>{definition?.name ?? loaded.division.competition.sport.name}</span>
          <span className={status === "LIVE" ? "font-bold text-brand-300" : status === "PAUSED" ? "font-bold text-warn" : "font-bold"}>
            {status === "LIVE" ? "● LIVE" : status}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="truncate text-sm font-semibold">{home.shortName}</span>
          <span className="font-mono text-2xl font-black tabular-nums">
            {loaded.homeScore}–{loaded.awayScore}
          </span>
          <span className="truncate text-right text-sm font-semibold">{away.shortName}</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-2 text-xs text-text-2">
          {periodLabel ? <span>{periodLabel}</span> : null}
          {clock ? <span className="font-mono">{clock}</span> : null}
          {!periodLabel && !clock ? <span>{loaded.venue?.name ?? " "}</span> : null}
        </div>
        {probability ? (
          <div className="mt-2">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/10">
              <span className="bg-brand-400" style={{ width: `${Math.round(probability.home * 100)}%` }} />
              <span className="bg-warn" style={{ width: `${Math.round(probability.away * 100)}%` }} />
            </div>
            <p className="mt-1 flex justify-between text-[9px] text-text-3">
              <span>{Math.round(probability.home * 100)}%</span>
              <span>win probability · {probability.method.toLowerCase().replace(/_/g, " ")}</span>
              <span>{Math.round(probability.away * 100)}%</span>
            </p>
          </div>
        ) : null}
        <p className="mt-2 text-center text-[9px] text-text-3">{organization.name}</p>
      </div>
    </main>
  );
}
