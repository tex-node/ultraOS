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
      include: { fixture: { include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, venue: true } } },
    }),
  );
  if (!g) notFound();
  const initial = {
    status: g.status,
    period: g.currentPeriod,
    clockSeconds: remainingClockSeconds(g),
    updatedAt: g.updatedAt.toISOString(),
    fixture: {
      status: g.fixture.status,
      homeScore: g.fixture.homeScore,
      awayScore: g.fixture.awayScore,
      venue: g.fixture.venue.name,
      home: {
        name: g.fixture.homeSeasonClub.club.name,
        shortName: g.fixture.homeSeasonClub.club.shortName,
        color: g.fixture.homeSeasonClub.club.primaryColor,
      },
      away: {
        name: g.fixture.awaySeasonClub.club.name,
        shortName: g.fixture.awaySeasonClub.club.shortName,
        color: g.fixture.awaySeasonClub.club.primaryColor,
      },
    },
  };
  return <Scoreboard gameId={gameId} initial={initial} />;
}
