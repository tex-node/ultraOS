import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  MissingOrganizationContextError,
  requireFixturePermissionOrRedirect,
} from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { ShotChartClient } from "./shot-chart-client";

export const dynamic = "force-dynamic";

// Shot chart: every located shot plotted on the court. Free throws logged from the line carry no
// coordinates and are excluded - the chart shows field-goal geography, not a free-throw count.
export default async function ShotChartReport({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const { session } = await requireFixturePermissionOrRedirect(
    "game:record-stats",
    fixtureId,
    `/games/${fixtureId}/stats/reports/shot-chart`,
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
              where: {
                status: "ACTIVE",
                eventType: { in: ["SHOT_MADE", "SHOT_MISSED"] },
                x: { not: null },
                y: { not: null },
              },
              orderBy: { sequenceNumber: "asc" },
              select: { id: true, x: true, y: true, made: true, seasonClubId: true, description: true },
            },
          },
        },
      },
    }),
  );
  if (!fixture || !fixture.game) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-4 pb-8 sm:px-6">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/games/${fixtureId}/stats/live`} className="text-sm text-text-2">Back to live console</Link>
          <p className="text-sm text-text-3">
            {fixture.homeSeasonClub?.club.shortName} {fixture.homeScore} - {fixture.awayScore} {fixture.awaySeasonClub?.club.shortName}
          </p>
        </div>
        <h1 className="text-2xl font-semibold">Shot chart</h1>
        {fixture.game.events.length === 0 ? (
          <p className="mt-4 text-sm text-text-2">No located shots yet. Click the court on the live console to log one.</p>
        ) : (
          <ShotChartClient
            homeId={fixture.homeSeasonClubId ?? ""}
            homeName={fixture.homeSeasonClub?.club.shortName ?? "Home"}
            awayName={fixture.awaySeasonClub?.club.shortName ?? "Away"}
            shots={fixture.game.events.map((event) => ({
              id: event.id,
              x: event.x ?? 0,
              y: event.y ?? 0,
              made: event.made,
              teamId: event.seasonClubId,
              description: event.description,
            }))}
          />
        )}
      </main>
    </OperationsShell>
  );
}