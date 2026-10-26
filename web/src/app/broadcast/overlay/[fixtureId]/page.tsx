import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../game/graphic-refresher";
import { TransparentBody } from "../../game/transparent-body";
import { fixtureSide } from "@/lib/fixture-side";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { getSportDefinition } from "@/lib/sports/registry";
import { winProbabilityForGame } from "@/lib/analytics/win-probability-context";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The OBS overlay (streak v16, Prompt 4).
//
// A Browser Source is a transparent rectangle composited over a stream, so this page renders NOTHING but the bug and
// the probability bar: no shell, no navigation, no background. `TransparentBody` sets the body transparent (the root
// layout injects an opaque background), which is the difference between an overlay and a black box.
//
// It reuses the sport-agnostic scorebug vocabulary (period labels from the definition, a clock only when the sport has
// one) and adds the win-probability bar when one can be computed. The refresher re-renders server state every 3s, which
// is what OBS needs - no websocket, no auth, no client JS beyond the refresh tick.

const PERIOD_LABEL: Record<string, string> = { QUARTER: "Q", HALF: "Half", SET: "Set", INNING: "Inn", PERIOD: "P" };

export default async function ObsOverlay({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const loaded = await withOrganizationContext(organization.id, async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
        homeEntrant: { select: { id: true, name: true } },
        awayEntrant: { select: { id: true, name: true } },
        game: true,
        division: { include: { competition: { include: { sport: { select: { slug: true, name: true } } } } } },
      },
    });
    if (!fixture || !isProductionPresentationFixture(fixture)) return null;
    return fixture;
  });
  if (!loaded) notFound();

  const definition = getSportDefinition(loaded.division.competition.sport.slug);
  const home = fixtureSide(loaded.homeSeasonClub, loaded.homeEntrant);
  const away = fixtureSide(loaded.awaySeasonClub, loaded.awayEntrant);
  const game = loaded.game;
  const period = definition ? PERIOD_LABEL[definition.structure.periodType] ?? "" : "";
  const clock = game && definition && definition.structure.clock !== "NONE" && game.clockSecondsRemaining !== null
    ? `${Math.floor(game.clockSecondsRemaining / 60)}:${String(game.clockSecondsRemaining % 60).padStart(2, "0")}`
    : "";
  const probability = game && definition
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
    <div className="inline-flex flex-col items-center gap-2 bg-transparent p-2 font-sans text-white">
      <GraphicRefresher intervalSeconds={3} />
      <TransparentBody />
      <div className="inline-flex items-center gap-3 rounded-xl bg-black/80 px-4 py-2 shadow-lg">
        <span className="text-sm font-black uppercase tracking-wider">{home.shortName}</span>
        <span className="font-mono text-2xl font-black tabular-nums">{loaded.homeScore}–{loaded.awayScore}</span>
        <span className="text-sm font-black uppercase tracking-wider">{away.shortName}</span>
        <span className="ml-1 text-[10px] uppercase tracking-widest text-white/70">
          {[game?.status === "LIVE" ? "LIVE" : game?.status ?? loaded.status, period ? `${period} ${game?.currentPeriod ?? ""}`.trim() : "", clock]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {probability ? (
        <div className="w-[320px]">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-white/15">
            <span className="bg-emerald-400" style={{ width: `${Math.round(probability.home * 100)}%` }} />
            <span className="bg-amber-400" style={{ width: `${Math.round(probability.away * 100)}%` }} />
          </div>
          <p className="mt-0.5 flex justify-between text-[9px] text-white/60">
            <span>{Math.round(probability.home * 100)}%</span>
            <span>win probability</span>
            <span>{Math.round(probability.away * 100)}%</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
