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
  homeSeasonClub: { club: { name: string; shortName: string } };
  awaySeasonClub: { club: { name: string; shortName: string } };
  game: { id: string } | null;
};

export async function loadPublicGame(fixturePublicId: string): Promise<{ fixture: PublicGameFixture; model: LivePresentationModel } | null> {
  const organization = await resolveDefaultPublicOrganization();
  return withOrganizationContext(organization.id, async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixturePublicId },
      include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
    });
    if (!fixture || !isProductionPresentationFixture(fixture) || !fixture.game) return null;
    const model = await buildLivePresentationModelForGame(fixture.game.id, tx);
    return { fixture, model };
  });
}
