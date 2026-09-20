import { notFound } from "next/navigation";
import { remainingClockSeconds } from "@/lib/game-clock";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";
import { Scoreboard } from "./scoreboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Page({ params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const g = await withOrganizationContext(organization.id, (tx) =>
    tx.game.findUnique({
      where: { id: gameId },
      include: {
        fixture: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
            homeEntrant: true,
            awayEntrant: true,
            venue: true,
            division: { include: { competition: { include: { sport: true } } } },
          },
        },
      },
    }),
  );
  if (!g) notFound();
  // A fixture side is a SeasonClub (team sports) or an Entrant (individual sports).
  const side = (seasonClub: { club: { name: string; shortName: string; primaryColor: string | null } } | null, entrant: { name: string; shortName: string | null; primaryColor: string | null } | null) => ({
    name: seasonClub?.club.name ?? entrant?.name ?? "TBD",
    shortName: seasonClub?.club.shortName ?? entrant?.shortName ?? entrant?.name ?? "TBD",
    color: seasonClub?.club.primaryColor ?? entrant?.primaryColor ?? null,
  });
  const initial = {
    status: g.status,
    period: g.currentPeriod,
    clockSeconds: remainingClockSeconds(g),
    updatedAt: g.updatedAt.toISOString(),
    tournament: g.fixture.division.competition.name,
    sport: g.fixture.division.competition.sport.name,
    fixture: {
      status: g.fixture.status,
      homeScore: g.fixture.homeScore,
      awayScore: g.fixture.awayScore,
      venue: g.fixture.venue.name,
      home: side(g.fixture.homeSeasonClub, g.fixture.homeEntrant),
      away: side(g.fixture.awaySeasonClub, g.fixture.awayEntrant),
    },
  };
  return <Scoreboard gameId={gameId} initial={initial} />;
}
