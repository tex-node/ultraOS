import { notFound } from "next/navigation";
import { GraphicRefresher } from "../../graphic-refresher";
import { TransparentBody } from "../../transparent-body";
import { fixtureSide } from "@/lib/fixture-side";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { getSportDefinition } from "@/lib/sports/registry";
import type { SportDefinition } from "@/lib/sports/types";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// The sport-agnostic scorebug (streak v11, Prompt 3).
//
// The basketball scorebug renders Ultra Time, a shot clock and four-point moments; for anything else it 404s. This
// one renders only what every sport has: two sides, a score, and a position in the game. It reads the period
// vocabulary from the sport definition instead of assuming quarters, and it shows a clock only when the sport has one
// - a cricket or baseball scorebug showing "0:00" would be a lie about how the game is timed.
//
// Sides come from fixtureSide(), so an individual-sport fixture (tennis, flag race) renders its entrants rather than
// dereferencing a null club.

const PERIOD_LABEL: Record<SportDefinition["structure"]["periodType"], string> = {
  QUARTER: "Q",
  HALF: "Half",
  SET: "Set",
  INNING: "Inn",
  PERIOD: "P",
  NONE: "",
};

function periodLabel(definition: SportDefinition, currentPeriod: number): string {
  const label = PERIOD_LABEL[definition.structure.periodType];
  if (!label) return definition.structure.periodType === "NONE" ? "" : `Period ${currentPeriod}`;
  return `${label} ${currentPeriod}`;
}

function clockText(secondsRemaining: number | null): string {
  if (secondsRemaining === null || secondsRemaining < 0) return "";
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  // Under a minute, the seconds are the thing an operator reads.
  return minutes >= 1 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}

export default async function GenericScorebug({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const loaded = await withOrganizationContext(organization.id, async (tx) => {
    const game = await tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
            homeEntrant: { select: { id: true, name: true } },
            awayEntrant: { select: { id: true, name: true } },
            division: { include: { competition: { include: { sport: { select: { slug: true, name: true } } } } } },
          },
        },
      },
    });
    if (!game || !isProductionPresentationFixture(game.fixture)) return null;
    return game;
  });
  if (!loaded) notFound();

  const definition = getSportDefinition(loaded.fixture.division.competition.sport.slug);
  if (!definition) notFound();
  const home = fixtureSide(loaded.fixture.homeSeasonClub, loaded.fixture.homeEntrant);
  const away = fixtureSide(loaded.fixture.awaySeasonClub, loaded.fixture.awayEntrant);
  const clock = definition.structure.clock === "NONE" ? "" : clockText(loaded.clockSecondsRemaining);
  const period = periodLabel(definition, loaded.currentPeriod);
  const statusText = loaded.status === "LIVE" ? "LIVE" : loaded.status === "PAUSED" ? "PAUSED" : loaded.status === "FINAL" ? "FINAL" : "";

  return (
    <div className="inline-flex items-center gap-3 bg-transparent p-3 font-sans text-white">
      <GraphicRefresher intervalSeconds={3} />
      <TransparentBody />
      <div className="flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2">
        <span className="text-sm font-bold uppercase tracking-wider">{home.shortName}</span>
        <span className="font-mono text-xl font-black">{loaded.fixture.homeScore}</span>
      </div>
      <div className="flex flex-col items-center rounded-lg bg-black/80 px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-brand-300">{definition.name}</span>
        {/* The score already sits on both sides; the middle carries where the game is, not a third copy of it. */}
        <span className="font-mono text-lg font-bold">{[statusText, clock].filter(Boolean).join(" · ") || "–"}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-text-2">{period}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2">
        <span className="font-mono text-xl font-black">{loaded.fixture.awayScore}</span>
        <span className="text-sm font-bold uppercase tracking-wider">{away.shortName}</span>
      </div>
    </div>
  );
}
