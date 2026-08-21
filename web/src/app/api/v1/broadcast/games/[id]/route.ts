import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/authorization";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { getBroadcastPresentationState } from "@/lib/broadcast-presentation-state";
import { buildGraphicSuggestions } from "@/lib/broadcast-suggestions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/v1/broadcast/games/[id] (Part XXVIII). Internal/authenticated formalization of the
// broadcast data contract - distinct from the public /api/v1/games/* routes, which deliberately
// hide reconciliation/verification detail and Program state. This one exposes the full
// LivePresentationModel plus Program state and current suggestions, for a trusted internal
// consumer (an operator's own tooling, not a public embed).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("broadcast:operate");
  } catch {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "broadcast:operate permission required." } }, { status: 401 });
  }

  const { id } = await params;
  let model;
  try {
    model = await buildLivePresentationModelForGame(id);
  } catch {
    return NextResponse.json({ error: { code: "GAME_NOT_FOUND", message: "No game found for this id." } }, { status: 404 });
  }

  const presentationState = await getBroadcastPresentationState();
  const suggestions = buildGraphicSuggestions(model);

  return NextResponse.json({
    model,
    presentationState,
    suggestions,
    generatedAt: new Date().toISOString(),
  });
}
