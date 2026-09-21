import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  MissingOrganizationContextError,
  requireFixturePermissionOrRedirect,
} from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

function mmss(totalSeconds: number) {
  const s = Math.max(0, Math.trunc(totalSeconds));
  return Math.floor(s / 60).toString().padStart(2, "0") + ":" + (s % 60).toString().padStart(2, "0");
}

// Chronological game story: every active ledger event in sequence order, both consoles, with the
// source tagged so a reader can tell scorer-official plays from statistician capture.
export default async function PlayByPlayReport({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const { session } = await requireFixturePermissionOrRedirect(
    "game:record-stats",
    fixtureId,
    `/games/${fixtureId}/stats/reports/play-by-play`,
  );
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const fixture = await withOrganizationContext(organizationId, (tx) =>
    tx.fixture.findUnique({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { include: { club: true } },
        awaySeasonClub: { include: { club: true } },
        game: {
          include: {
            events: {
              where: { status: "ACTIVE" },
              orderBy: { sequenceNumber: "asc" },
              include: { player: { include: { athlete: true } } },
            },
          },
        },
      },
    }),
  );
  if (!fixture || !fixture.game) notFound();

  const sideName = (seasonClubId: string | null) =>
    seasonClubId === fixture.homeSeasonClub?.id
      ? fixture.homeSeasonClub.club.shortName
      : seasonClubId === fixture.awaySeasonClub?.id
        ? fixture.awaySeasonClub.club.shortName
        : "";

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/games/${fixtureId}/stats/live`} className="text-sm text-text-2">Back to live console</Link>
          <p className="text-sm text-text-3">
            {fixture.homeScore} - {fixture.awayScore} · {fixture.game.events.length} plays
          </p>
        </div>
        <h1 className="text-2xl font-semibold">Play-by-play</h1>
        {fixture.game.events.length === 0 ? (
          <p className="mt-4 text-sm text-text-2">No plays recorded yet.</p>
        ) : (
          <ol className="mt-4 grid gap-2">
            {fixture.game.events.map((event, index) => (
              <li key={event.id} className="flex items-start gap-3 rounded-md border border-line bg-ink-800 p-3 text-sm">
                <span className="mt-0.5 w-8 shrink-0 font-mono text-xs text-text-3">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-text-1">{event.description}</p>
                  <p className="mt-0.5 text-xs text-text-3">
                    P{event.period} · {mmss(event.clockSeconds)}
                    {sideName(event.seasonClubId) ? ` · ${sideName(event.seasonClubId)}` : ""}
                    {event.courtZone ? ` · ${event.courtZone.replace(/_/g, " ")}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white/[.06] px-2 py-0.5 text-[10px] uppercase tracking-wider text-text-2">
                  {event.source === "ULTRA_NATIVE_LIVE_STATISTICIAN" ? "stats" : "official"}
                </span>
              </li>
            ))}
          </ol>
        )}
      </main>
    </OperationsShell>
  );
}