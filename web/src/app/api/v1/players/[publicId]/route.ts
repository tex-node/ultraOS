import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { resolvePlayerByPublicId } from "@/lib/api-v1/identifiers";
import type { PlayerSummaryV1 } from "@/lib/api-v1/contracts";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/players/[publicId] - publicId is the Athlete's stable ultraAthleteId (UBA-XXXXXX),
// never the internal Player/Athlete cuid (Part XV). Only public-safe fields: name, position,
// jersey number, current club - never email, phone, medical info, or any application/admin note.
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const resolved = await resolvePlayerByPublicId(publicId);
    if (!resolved) return apiError("PLAYER_NOT_FOUND", "No player found for this Ultra Athlete ID.");
    const { athlete, player } = resolved;

    const summary: PlayerSummaryV1 = {
      publicId: athlete.ultraAthleteId!,
      name: `${athlete.firstName} ${athlete.lastName}`,
      position: player.position,
      jerseyNumber: player.jerseyNumber,
      club: player.seasonClub
        ? { publicId: player.seasonClub.club.shortName.toLowerCase(), name: player.seasonClub.club.name, shortName: player.seasonClub.club.shortName }
        : null,
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json(summary);
  });
}
