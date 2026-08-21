import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { resolveSeasonByPublicId } from "@/lib/api-v1/identifiers";
import type { SeasonStandingsV1, StandingV1 } from "@/lib/api-v1/contracts";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/seasons/[publicId]/standings - `publicId` accepts "active" or a real Season.id.
// Reuses the existing Standing table directly (recalculateStandings() in standings.ts is the
// only writer) - never a second standings computation for the API.
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const season = await resolveSeasonByPublicId(publicId);
    if (!season) return apiError("SEASON_NOT_FOUND", "No season found for this id.");

    const rows = await prisma.standing.findMany({
      where: { seasonId: season.id },
      include: { seasonClub: { include: { club: true, division: true } } },
      orderBy: [{ leaguePoints: "desc" }, { won: "desc" }, { pointDifference: "desc" }],
    });

    const standings: StandingV1[] = rows.map((s) => ({
      club: { publicId: s.seasonClub.club.shortName.toLowerCase(), name: s.seasonClub.club.name, shortName: s.seasonClub.club.shortName },
      division: s.seasonClub.division.name,
      played: s.played, won: s.won, lost: s.lost,
      pointsFor: s.pointsFor, pointsAgainst: s.pointsAgainst, pointDifference: s.pointDifference, leaguePoints: s.leaguePoints,
    }));

    const response: SeasonStandingsV1 = { seasonPublicId: publicId, standings, generatedAt: new Date().toISOString() };
    return NextResponse.json(response);
  });
}
