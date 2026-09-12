import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { loadPublicGame } from "@/lib/api-v1/game-loader";
import { resolvePlayerNames } from "@/lib/api-v1/identifiers";
import { honestClock, type GameSnapshotV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/games/[publicId]/snapshot - public-safe derivative of Snapshot V2 (Part XVIII).
// Deliberately narrower than the internal broadcast contract: no reconciliation detail (official
// vs statistical scores are an internal integrity concern, not audience-facing), no provenance
// filenames, no lineup/minutes internals, no operator identity.
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const loaded = await loadPublicGame(publicId);
    if (!loaded) return apiError("GAME_NOT_FOUND", "No game found for this id.");
    const { fixture, model } = loaded;

    const playerIds = model.leaders.map((l) => l.playerId);
    const organization = await resolveDefaultPublicOrganization();
    const names = await withOrganizationContext(organization.id, (tx) => resolvePlayerNames(playerIds, tx));
    const clubFor = (seasonClubId: string) => seasonClubId === model.teams.home.seasonClubId
      ? { publicId: fixture.homeSeasonClub.club.shortName.toLowerCase(), name: fixture.homeSeasonClub.club.name, shortName: fixture.homeSeasonClub.club.shortName }
      : { publicId: fixture.awaySeasonClub.club.shortName.toLowerCase(), name: fixture.awaySeasonClub.club.name, shortName: fixture.awaySeasonClub.club.shortName };

    const generatedAt = new Date().toISOString();
    const snapshot: GameSnapshotV1 = {
      fixtureId: fixture.id, gameId: fixture.game!.id, status: model.status,
      home: clubFor(model.teams.home.seasonClubId), away: clubFor(model.teams.away.seasonClubId),
      score: model.score, period: model.period, periodLabel: model.periodLabel,
      clock: honestClock(model.status, model.clock), shotClock: honestClock(model.status, model.shotClock),
      ultraTime: {
        active: model.ultraTime.phase === "ACTIVE", approaching: model.ultraTime.phase === "APPROACHING",
        secondsUntilStart: model.ultraTime.phase === "APPROACHING" ? model.ultraTime.secondsUntilStart : null,
      },
      capability: model.dataCapability,
      leaders: model.leaders.map((l) => ({
        category: l.category,
        player: { publicId: names.get(l.playerId)?.publicId ?? null, name: names.get(l.playerId)?.name ?? "Player" },
        club: clubFor(l.seasonClubId),
        value: l.value,
      })),
      teamComparison: model.teamComparison,
      // Deliberately null here even for FULL_ULTRA - the sequenced event ledger has its own
      // dedicated, correctly-shaped route (/api/v1/games/[publicId]/events) rather than a second,
      // differently-shaped copy of the same data living inside the snapshot response too.
      recentEvents: null,
      verification: { verified: model.isStatisticsVerified },
      generatedAt, dataUpdatedAt: generatedAt,
    };
    return NextResponse.json(snapshot);
  });
}
