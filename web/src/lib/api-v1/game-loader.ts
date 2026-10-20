// Shared production-scoped game loader for the public API v1 (G.20). Same isolation discipline
// as the broadcast graphics routes (G.19's broadcast-graphic-loader.ts): a REHEARSAL (or any
// non-PRODUCTION) fixture must be completely unreachable through the public API - not just
// hidden from discovery, but a direct GAME_NOT_FOUND for a guessed/stale id, same as the
// browser-source graphics gate.
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";
import type { LivePresentationModel } from "@/lib/live-presentation-model";

export type PublicGameFixture = {
  id: string;
  // Either a club (team sports) or an entrant (individual sports). Nullable on purpose: the API used to assume a
  // club and crashed with "Cannot read properties of null (reading club)" on a tennis fixture (streak v9).
  homeSeasonClub: { club: { name: string; shortName: string } } | null;
  awaySeasonClub: { club: { name: string; shortName: string } } | null;
  homeEntrant: { id: string; name: string } | null;
  awayEntrant: { id: string; name: string } | null;
  game: { id: string } | null;
  /** The sport, needed by the live feed to pick a win-probability model (streak v12). */
  division: { competition: { sport: { slug: string } } };
};

export async function loadPublicGame(fixturePublicId: string): Promise<{ fixture: PublicGameFixture; model: LivePresentationModel } | null> {
  const organization = await resolveDefaultPublicOrganization();
  return withOrganizationContext(organization.id, async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixturePublicId },
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
        homeEntrant: { select: { id: true, name: true } },
        awayEntrant: { select: { id: true, name: true } },
        game: true,
        // The live feed reports a win probability, which needs the sport (streak v12).
        division: { select: { competition: { select: { sport: { select: { slug: true } } } } } },
      },
    });
    if (!fixture || !isProductionPresentationFixture(fixture) || !fixture.game) return null;
    const model = await buildLivePresentationModelForGame(fixture.game.id, tx);
    return { fixture, model };
  });
}
