import { notFound } from "next/navigation";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { LiveGameHero } from "@/app/live/live-game-hero";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.19 Part IV: an explicit, authenticated presentation path for rehearsing what the public
// Game Center would show, WITHOUT going anywhere near `/live` (which only ever discovers
// PRODUCTION-origin fixtures - see presentation-scope.ts). Authenticated
// (broadcast:operate), REHEARSAL-origin-only (a production or any other-origin fixture id here
// 404s - this route is not a general-purpose preview of real games), and deliberately not linked
// from any nav - reachable only by an operator who already has the rehearsal fixture id.
export default async function RehearsalLive({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("broadcast:operate", `/rehearsal/live/${fixtureId}`);
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const data = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const fixture = await tx.fixture.findUnique({
      where: { id: fixtureId },
      include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
    });
    if (!fixture || fixture.recordOrigin !== "REHEARSAL" || !fixture.game || !["LIVE", "PAUSED"].includes(fixture.game.status)) return null;
    const model = await buildLivePresentationModelForGame(fixture.game.id, tx);
    return { fixture, model };
  });
  if (!data) notFound();
  const { fixture, model } = data;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-fuchsia-400">Rehearsal · Presentation Preview</p>
        <h1 className="mt-2 text-3xl font-bold">Rehearsal live view</h1>
        <p className="mt-2 text-sm text-zinc-500">This exact card is what a spectator will see once this fixture is real. Never linked from public navigation.</p>
        <div className="mt-8">
          <LiveGameHero fixture={fixture} model={model} href={`/rehearsal/live/${fixtureId}`} rehearsal />
        </div>
      </main>
    </OperationsShell>
  );
}
