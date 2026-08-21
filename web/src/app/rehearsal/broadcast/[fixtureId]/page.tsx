import { notFound } from "next/navigation";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { CommentatorCommandCenter } from "@/app/broadcast/commentator-command-center";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.19 Part IV: the Commentator Command Center's rehearsal counterpart - same gating and same
// "never linked from nav" rule as /rehearsal/live/[fixtureId]. Renders the exact
// CommentatorCommandCenter component the authenticated `/broadcast/stats` uses for a real live
// game, so a rehearsal genuinely exercises the real rendering path, not a stand-in.
export default async function RehearsalBroadcast({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("broadcast:operate", `/rehearsal/broadcast/${fixtureId}`);

  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
  });
  if (!fixture || fixture.recordOrigin !== "REHEARSAL" || !fixture.game || !["LIVE", "PAUSED"].includes(fixture.game.status)) notFound();

  const model = await buildLivePresentationModelForGame(fixture.game.id);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-fuchsia-400">Rehearsal · Commentator Preview</p>
        <h1 className="mt-2 text-3xl font-bold">Rehearsal broadcast view</h1>
        <CommentatorCommandCenter fixture={fixture} model={model} rehearsal />
      </main>
    </OperationsShell>
  );
}
