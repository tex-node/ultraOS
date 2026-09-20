import { NextResponse } from "next/server";
import { remainingClockSeconds } from "@/lib/game-clock";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export async function GET(_r: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const g = await withOrganizationContext(organization.id, (tx) =>
    tx.game.findUnique({
      where: { id },
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
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // A fixture side is a SeasonClub (team sports) or an Entrant (individual sports).
  const homeClub = g.fixture.homeSeasonClub?.club;
  const awayClub = g.fixture.awaySeasonClub?.club;
  return NextResponse.json({
    id: g.id,
    status: g.status,
    period: g.currentPeriod,
    clockSeconds: remainingClockSeconds(g),
    updatedAt: g.updatedAt,
    tournament: g.fixture.division.competition.name,
    sport: g.fixture.division.competition.sport.name,
    fixture: {
      id: g.fixture.id,
      status: g.fixture.status,
      homeScore: g.fixture.homeScore,
      awayScore: g.fixture.awayScore,
      scheduledAt: g.fixture.scheduledAt,
      venue: g.fixture.venue.name,
      home: {
        name: homeClub?.name ?? g.fixture.homeEntrant?.name ?? "TBD",
        shortName: homeClub?.shortName ?? g.fixture.homeEntrant?.shortName ?? g.fixture.homeEntrant?.name ?? "TBD",
        color: homeClub?.primaryColor ?? g.fixture.homeEntrant?.primaryColor ?? null,
        logoUrl: homeClub?.logoUrl ?? null,
      },
      away: {
        name: awayClub?.name ?? g.fixture.awayEntrant?.name ?? "TBD",
        shortName: awayClub?.shortName ?? g.fixture.awayEntrant?.shortName ?? g.fixture.awayEntrant?.name ?? "TBD",
        color: awayClub?.primaryColor ?? g.fixture.awayEntrant?.primaryColor ?? null,
        logoUrl: awayClub?.logoUrl ?? null,
      },
    },
  });
}
