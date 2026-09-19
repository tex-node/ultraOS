import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  MissingOrganizationContextError,
  canFixturePermission,
  requireFixturePermissionOrRedirect,
} from "@/lib/authorization";
import { remainingClockSeconds } from "@/lib/game-clock";
import { LEGACY_STRUCTURE, periodLabelFor } from "@/lib/sports/game-structure";
import { withOrganizationContext } from "@/lib/tenant-context";
import { getGameLineup, getGameReconciliation } from "../../../stats-actions";
import { StatLiveConsole, type LiveEvent, type LiveTeam } from "./stat-live-console";

export const dynamic = "force-dynamic";

// Statistician live console: the NCAA-style capture surface (court, roster strips, action log).
// Basketball team fixtures only - individual sports score through the scorer console.
export default async function StatLivePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const { session } = await requireFixturePermissionOrRedirect(
    "game:record-stats",
    fixtureId,
    `/games/${fixtureId}/stats/live`,
  );
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;
  const canOperate = await canFixturePermission("game:operate", fixtureId);

  const fixture = await withOrganizationContext(organizationId, (tx) =>
    tx.fixture.findUnique({
      where: { id: fixtureId },
      include: {
        homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
        awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
        division: { include: { competition: { include: { sport: true } } } },
        game: {
          include: {
            ruleSnapshot: true,
            events: {
              where: { source: "ULTRA_NATIVE_LIVE_STATISTICIAN" },
              orderBy: { sequenceNumber: "desc" },
              take: 40,
              include: { player: { include: { athlete: true } } },
            },
          },
        },
      },
    }),
  );
  if (!fixture) notFound();
  const homeSC = fixture.homeSeasonClub;
  const awaySC = fixture.awaySeasonClub;
  if (!homeSC || !awaySC) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-zinc-400">
            The live statistician console is for team fixtures. Individual matches are scored on the{" "}
            <Link href={`/games/${fixtureId}/live`} className="text-emerald-400">scorer console</Link>.
          </p>
        </main>
      </OperationsShell>
    );
  }

  const game = fixture.game;
  if (!game) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-10">
          <p className="text-zinc-400">
            This game has not started yet on the scorer console. Statistics capture opens once the scorer starts the game.
          </p>
          <Link href={`/games/${fixtureId}/live`} className="mt-3 inline-block text-sm text-emerald-400">Open scorer console</Link>
        </main>
      </OperationsShell>
    );
  }

  const homeId = homeSC.id;
  const awayId = awaySC.id;
  const snapshot = game.ruleSnapshot;
  const structure = snapshot
    ? {
        periodCount: snapshot.periodCount,
        periodSeconds: snapshot.periodDurationSeconds,
        overtimeSeconds: snapshot.overtimeDurationSeconds,
        shotClockSeconds: snapshot.shotClockSeconds,
        clockMode: snapshot.clockMode,
      }
    : LEGACY_STRUCTURE;

  const lineup = await getGameLineup(game.id);
  const reconciliation = await getGameReconciliation(game.id);
  const timeoutCounts = await withOrganizationContext(organizationId, (tx) =>
    tx.gameEvent.groupBy({
      by: ["seasonClubId"],
      where: { gameId: game.id, eventType: "TIMEOUT", status: "ACTIVE" },
      _count: { _all: true },
    }),
  );
  const startersConfirmed = {
    home: (lineup.get(homeId)?.size ?? 0) > 0,
    away: (lineup.get(awayId)?.size ?? 0) > 0,
  };

  const toTeam = (
    seasonClub: NonNullable<typeof fixture.homeSeasonClub>,
  ): LiveTeam => ({
    id: seasonClub.id,
    name: seasonClub.club.name,
    shortName: seasonClub.club.shortName,
    color: seasonClub.club.primaryColor,
    players: seasonClub.players
      .map((player) => ({ id: player.id, name: `${player.athlete.firstName} ${player.athlete.lastName}` }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    onCourt: [...(lineup.get(seasonClub.id) ?? [])],
  });

  const possessionEvent = game.events.find((event) => event.typeKey === "POSSESSION" || event.typeKey === "JUMP_BALL") ?? null;

  const timeouts = {
    home: timeoutCounts.find((row) => row.seasonClubId === homeId)?._count._all ?? 0,
    away: timeoutCounts.find((row) => row.seasonClubId === awayId)?._count._all ?? 0,
  };

  const lastVerificationEvent = game.events.find((event) => event.typeKey === "SCORE_VERIFIED") ?? null;
  const lastVerificationData = (lastVerificationEvent?.data ?? {}) as { comparison?: { allMatch?: boolean } };
  const lastVerification = lastVerificationEvent
    ? {
        allMatch: lastVerificationData.comparison?.allMatch ?? true,
        description: lastVerificationEvent.description,
        period: lastVerificationEvent.period,
        clockSeconds: lastVerificationEvent.clockSeconds,
      }
    : null;

  const events: LiveEvent[] = game.events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    typeKey: event.typeKey,
    description: event.description,
    period: event.period,
    clockSeconds: event.clockSeconds,
    status: event.status,
    made: event.made,
    x: event.x,
    y: event.y,
    courtZone: event.courtZone,
    playerName: event.player ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}` : null,
    teamId: event.seasonClubId,
  }));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/fixtures/${fixtureId}`} className="text-sm text-zinc-400">Back to fixture</Link>
          <div className="flex gap-4">
            <Link href={`/games/${fixtureId}/stats`} className="text-sm text-zinc-400">Statistician console</Link>
            <Link href={`/games/${fixtureId}/stats/reconciliation`} className="text-sm text-violet-400">Reconciliation</Link>
            <Link href={`/games/${fixtureId}/live`} className="text-sm text-emerald-400">Open scorer console</Link>
          </div>
        </div>
        <StatLiveConsole
          gameId={game.id}
          fixtureId={fixtureId}
          status={game.status}
          period={game.currentPeriod}
          periodLabel={periodLabelFor(game.currentPeriod, game.status, structure)}
          clockSeconds={remainingClockSeconds(game)}
          clockStartedAt={game.clockStartedAt?.toISOString() ?? null}
          homeScore={fixture.homeScore}
          awayScore={fixture.awayScore}
          fourPointEnabled={snapshot ? snapshot.fourPointEnabled : true}
          canOperate={canOperate}
          startersConfirmed={startersConfirmed}
          teams={[toTeam(homeSC), toTeam(awaySC)]}
          possessionTeamId={possessionEvent?.seasonClubId ?? null}
          timeouts={timeouts}
          official={{ home: reconciliation.home.officialScore, away: reconciliation.away.officialScore }}
          statScore={{ home: reconciliation.home.statisticalScore, away: reconciliation.away.statisticalScore }}
          lastVerification={lastVerification}
          events={events}
        />
      </main>
    </OperationsShell>
  );
}