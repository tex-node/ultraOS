import { NextResponse } from "next/server";
import { getBroadcastPresentationState } from "@/lib/broadcast-presentation-state";
import { graphicRoute } from "@/lib/broadcast-graphics";
import { isProductionPresentationFixture } from "@/lib/presentation-scope";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// G.19 Part XXXVIII-XXXIX. Read-only current-Program payload for external tooling (vMix/OBS
// macros, a custom overlay) - unauthenticated, matching /api/games/[id]/snapshot-v2's existing
// public exposure, since Program state is exactly what a spectator's screen would show anyway.
// Deliberately exposes only PROGRAM, never Preview (that's operator-only awareness), and never
// `updatedById` (Part XXXVIII: "do not expose private operator data"). If the on-air game
// somehow isn't a production fixture (e.g. a rehearsal accidentally left on Program), this
// reports empty rather than leaking it - the same allow-list isolation every other public
// surface uses.
export async function GET() {
  const state = await getBroadcastPresentationState();
  if (!state.program) {
    return NextResponse.json({ program: null, version: state.updatedAt });
  }

  const game = await prisma.game.findUnique({ where: { id: state.program.gameId }, include: { fixture: true } });
  if (!game || !isProductionPresentationFixture(game.fixture)) {
    return NextResponse.json({ program: null, version: state.updatedAt });
  }

  return NextResponse.json({
    program: {
      gameId: state.program.gameId,
      fixtureId: game.fixtureId,
      graphicType: state.program.graphicType,
      subjectId: state.program.subjectId,
      viewUrl: graphicRoute(state.program.graphicType, state.program.gameId) + (state.program.subjectId ? `?playerId=${state.program.subjectId}` : ""),
    },
    version: state.updatedAt,
  });
}
