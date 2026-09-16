import { NextResponse } from "next/server";
import { withPublicApiV1 } from "@/lib/api-v1/respond";
import { apiError } from "@/lib/api-v1/errors";
import { loadPublicGame } from "@/lib/api-v1/game-loader";
import { resolvePlayerNames } from "@/lib/api-v1/identifiers";
import type { EventV1 } from "@/lib/api-v1/contracts";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/games/[publicId]/events (Part XIX). For BOX_SCORE_ONLY, `events` is null with
// `available: false` - a capability-aware response, never a fake empty history that would
// dishonestly imply "nothing happened" for a game that was never captured at event granularity.
// Built from `latestEvents` (raw, sequenced) rather than the display-formatted moment feed;
// that field's own query never selects operator identity or audit metadata (no createdById, no
// correction fields) - there is nothing private to accidentally leak here.
export async function GET(request: Request, { params }: { params: Promise<{ publicId: string }> }) {
  return withPublicApiV1(request, async () => {
    const { publicId } = await params;
    const loaded = await loadPublicGame(publicId);
    if (!loaded) return apiError("GAME_NOT_FOUND", "No game found for this id.");
    const { fixture, model } = loaded;
    const generatedAt = new Date().toISOString();

    if (model.dataCapability === "BOX_SCORE_ONLY") {
      return NextResponse.json({
        fixtureId: fixture.id, gameId: fixture.game!.id, capability: model.dataCapability,
        available: false, events: null,
        generatedAt, dataUpdatedAt: generatedAt,
      });
    }

    const clubFor = (seasonClubId: string | null) => {
      if (!seasonClubId) return null;
      return seasonClubId === model.teams.home.seasonClubId
        ? { publicId: fixture.homeSeasonClub!.club.shortName.toLowerCase(), name: fixture.homeSeasonClub!.club.name, shortName: fixture.homeSeasonClub!.club.shortName }
        : { publicId: fixture.awaySeasonClub!.club.shortName.toLowerCase(), name: fixture.awaySeasonClub!.club.name, shortName: fixture.awaySeasonClub!.club.shortName };
    };

    const activeEvents = model.latestEvents.filter((e) => e.status === "ACTIVE");
    const organization = await resolveDefaultPublicOrganization();
    const names = await withOrganizationContext(organization.id, (tx) => resolvePlayerNames([...new Set(activeEvents.map((e) => e.playerId).filter((id): id is string => id !== null))], tx));

    const events: EventV1[] = activeEvents
      .map((e) => ({
        sequence: e.sequenceNumber,
        period: e.period,
        clockSeconds: e.clockSeconds,
        club: clubFor(e.seasonClubId),
        player: e.playerId ? { publicId: names.get(e.playerId)?.publicId ?? null, name: e.playerName ?? names.get(e.playerId)?.name ?? "Player" } : null,
        eventType: e.eventType,
        basePointValue: e.basePointValue,
        multiplier: e.multiplier,
        points: e.points,
      }))
      .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

    return NextResponse.json({
      fixtureId: fixture.id, gameId: fixture.game!.id, capability: model.dataCapability,
      available: true, events,
      generatedAt, dataUpdatedAt: generatedAt,
    });
  });
}
