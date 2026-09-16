import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { startGame } from "@/app/games/actions";
import { requirePermissionOrRedirect, MissingOrganizationContextError } from "@/lib/authorization";
import { getCheckInStatuses } from "@/lib/game-day-checkin";
import { remainingClockSeconds } from "@/lib/game-clock";
import { periodLabel } from "@/lib/game-rules";
import { formatLagosTime } from "@/lib/format-datetime";
import { buildSystemHealth } from "@/lib/system-health-loader";
import type { HealthStatus } from "@/lib/system-health";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const SLOT_MINUTES = 35;
const STARTS_SOON_MINUTES = 5;

export default async function GameDayControlCenter() {
  // G.20: was requirePermission() directly, which throws an uncaught AuthenticationError for an
  // anonymous request (rendered as a generic 500, discovered during the G.20 operations
  // baseline) instead of a clean login redirect - the exact G.15/G.16 pattern already fixed for
  // /games/[fixtureId]/live and /stats. Same fix, applied here now that it was found.
  const session = await requirePermissionOrRedirect("game:operate", "/gameday");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const now = new Date();

  const { fixtures, incidentEntries, event, seasonClubs } = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const season = await tx.season.findFirst({ where: { status: "ACTIVE" }, orderBy: { startDate: "desc" } });
    const fixtures = season
    ? await tx.fixture.findMany({
        where: { seasonId: season.id, status: { not: "CANCELLED" } },
        orderBy: { scheduledAt: "asc" },
        include: {
          homeSeasonClub: { include: { club: true } },
          awaySeasonClub: { include: { club: true } },
          game: true,
          venue: true,
        },
      })
    : [];
    const gameIds = fixtures.map((f) => f.game?.id).filter((id): id is string => Boolean(id));
    const incidentEntries = gameIds.length
      ? await tx.auditLog.findMany({ where: { entityType: "GameIncident", entityId: { in: gameIds } }, orderBy: { createdAt: "desc" } })
      : [];
    const event = await tx.event.findFirst({ where: { status: { in: ["PUBLISHED", "IN_PROGRESS"] } }, orderBy: { startTime: "asc" } });
    const seasonClubs = season
      ? await tx.seasonClub!.findMany({ where: { seasonId: season.id, status: "ACTIVE" }, include: { club: true, headCoach: true, players: true }, orderBy: { club: { name: "asc" } } })
      : [];
    return { season, fixtures, incidentEntries, event, seasonClubs };
  });

  const live = fixtures.filter((f) => f.game && (f.game.status === "LIVE" || f.game.status === "PAUSED"));
  const finalFixtures = fixtures.filter((f) => f.status === "FINAL");
  const notStarted = fixtures.filter((f) => !live.includes(f) && !finalFixtures.includes(f));
  const nextFixture = notStarted[0] ?? null;
  const upcoming = notStarted.slice(1);

  const warnings: string[] = [];
  if (nextFixture) {
    const minutesUntil = (nextFixture.scheduledAt.getTime() - now.getTime()) / 60000;
    if (minutesUntil > 0 && minutesUntil <= STARTS_SOON_MINUTES) {
      warnings.push(`${nextFixture.homeSeasonClub!.club.shortName} vs ${nextFixture.awaySeasonClub!.club.shortName} starts in ${Math.ceil(minutesUntil)} min`);
    }
    if (minutesUntil < 0 && live.length === 0) {
      warnings.push(`${nextFixture.homeSeasonClub!.club.shortName} vs ${nextFixture.awaySeasonClub!.club.shortName} was scheduled ${Math.ceil(-minutesUntil)} min ago and hasn't started — previous game may not be finalized`);
    }
  }
  for (const fixture of live) {
    const minutesRunning = (now.getTime() - fixture.scheduledAt.getTime()) / 60000;
    if (minutesRunning > SLOT_MINUTES) {
      warnings.push(`${fixture.homeSeasonClub!.club.shortName} vs ${fixture.awaySeasonClub!.club.shortName} is running ${Math.round(minutesRunning - SLOT_MINUTES)} min behind its slot`);
    }
  }

  const resolvedIncidentIds = new Set(
    incidentEntries
      .filter((e) => e.action === "GAME_INCIDENT_RESOLVED")
      .map((e) => (e.details as { resolvesIncidentId?: string } | null)?.resolvesIncidentId)
      .filter((id): id is string => Boolean(id)),
  );
  const openIncidents = incidentEntries
    .filter((e) => e.action === "GAME_INCIDENT_RECORDED" && !resolvedIncidentIds.has(e.id))
    .map((e) => {
      const details = e.details as { fixtureId: string; incidentType: string; reason: string };
      const fixture = fixtures.find((f) => f.id === details.fixtureId);
      return { id: e.id, details, fixture };
    });

  // G.20 Part XII: reuses buildSystemHealth() unchanged - never a second monitoring truth. The
  // live fixture (if any) is passed explicitly so this reflects the same game the "Live now"
  // panel below shows, not a separately-discovered one.
  const health = await buildSystemHealth(session.user.organizationId, live[0]?.game?.id);

  const checkInStatuses = event ? await getCheckInStatuses(session.user.organizationId, event.id) : {};
  const clubReadiness = seasonClubs.map((seasonClub) => {
    const present = seasonClub.players.filter((p) => checkInStatuses[p.id]?.status === "PRESENT").length;
    const late = seasonClub.players.filter((p) => checkInStatuses[p.id]?.status === "LATE").length;
    const unavailable = seasonClub.players.filter((p) => ["ABSENT", "UNAVAILABLE"].includes(checkInStatuses[p.id]?.status ?? "")).length;
    const firstFixture = fixtures.find((f) => f.homeSeasonClubId! === seasonClub.id || f.awaySeasonClubId! === seasonClub.id);
    let readiness: "READY" | "WARNING" | "BLOCKED" = "READY";
    if (!seasonClub.headCoach) readiness = "BLOCKED";
    else if (present + late < seasonClub.players.length) readiness = "WARNING";
    return { seasonClub, present, late, unavailable, firstFixture, readiness };
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Season Zero · Game Day</p>
            <h1 className="mt-1 text-3xl font-bold">Game Day Control Center</h1>
            <p className="mt-1 text-sm text-zinc-500">NIS Outdoor Court, Surulere · 15 Aug 2026</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Lagos time (WAT)</p>
            <p className="font-mono text-2xl">{formatLagosTime(now)}</p>
            <p className="mt-1 text-xs text-emerald-400">System operational</p>
            <Link href="/gameday/checkin" className="mt-2 inline-block rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">Player check-in</Link>
          </div>
        </div>

        {warnings.length > 0 ? (
          <div className="mt-5 space-y-2">
            {warnings.map((warning) => (
              <p key={warning} className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-300">{warning}</p>
            ))}
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-white/[.08] bg-[#0b100e] px-4 py-3">
          <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">Live system health</span>
          <HealthPill status={health.overallStatus} />
          {health.database.status !== "HEALTHY" ? <HealthChip label="DB" status={health.database.status} /> : null}
          {health.snapshot ? <HealthChip label="Snapshot" status={health.snapshot.status} /> : null}
          {health.reconciliation ? <HealthChip label="Reconciliation" status={health.reconciliation.status} /> : null}
          {health.presentation.status !== "HEALTHY" ? <HealthChip label="Program" status={health.presentation.status} /> : null}
          <Link href="/broadcast/diagnostics" className="ml-auto text-xs text-cyan-400 hover:underline">Full diagnostics →</Link>
        </div>

        {openIncidents.length > 0 ? (
          <div className="mt-5 space-y-2">
            {openIncidents.map((incident) => (
              <Link key={incident.id} href={incident.fixture ? `/games/${incident.fixture.id}/live` : "#"} className="block rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm text-rose-300">
                OPEN INCIDENT · {incident.details.incidentType.replace(/_/g, " ")} · {incident.fixture ? `${incident.fixture.homeSeasonClub!.club.shortName} vs ${incident.fixture.awaySeasonClub!.club.shortName}` : ""} · {incident.details.reason}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Live now</p>
            {live.length === 0 ? (
              <p className="mt-3 text-zinc-500">No game currently live.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {live.map((fixture) => (
                  <Link key={fixture.id} href={`/games/${fixture.id}/live`} className="block">
                    <p className="font-semibold">{fixture.homeSeasonClub!.club.shortName} {fixture.homeScore} — {fixture.awayScore} {fixture.awaySeasonClub!.club.shortName}</p>
                    <p className="text-xs text-emerald-400">
                      {periodLabel(fixture.game!.currentPeriod, fixture.game!.status)} · {Math.floor(remainingClockSeconds(fixture.game!) / 60)}:{(remainingClockSeconds(fixture.game!) % 60).toString().padStart(2, "0")} · {fixture.game!.status}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Next game</p>
            {nextFixture ? (
              <>
                <p className="mt-3 font-semibold">{nextFixture.homeSeasonClub!.club.shortName} vs {nextFixture.awaySeasonClub!.club.shortName}</p>
                <p className="text-xs text-zinc-500">{formatLagosTime(nextFixture.scheduledAt)}</p>
              </>
            ) : (
              <p className="mt-3 text-zinc-500">All competitive fixtures complete.</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Day progress</p>
            <p className="mt-3 font-mono text-2xl font-bold">GAME {finalFixtures.length + (live.length > 0 ? 1 : 0)} / {fixtures.length}</p>
            <p className="text-xs text-zinc-500">{finalFixtures.length} finalized · {live.length} live · {upcoming.length} upcoming</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Club readiness</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {clubReadiness.map(({ seasonClub, present, late, unavailable, firstFixture, readiness }) => {
              const pillClass =
                readiness === "READY" ? "bg-emerald-400/15 text-emerald-300" :
                readiness === "WARNING" ? "bg-amber-400/15 text-amber-300" :
                "bg-rose-400/15 text-rose-300";
              return (
                <div key={seasonClub.id} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{seasonClub.club.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${pillClass}`}>{readiness}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">
                    {present}/{seasonClub.players.length} present{late ? ` · ${late} late` : ""}{unavailable ? ` · ${unavailable} out` : ""}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Coach: {seasonClub.headCoach?.name ?? "Not assigned"}</p>
                  {firstFixture ? <p className="mt-1 text-xs text-zinc-600">First game {formatLagosTime(firstFixture.scheduledAt)}</p> : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Running order</h2>
          <div className="mt-4 space-y-2">
            {fixtures.map((fixture) => {
              const game = fixture.game;
              const status = fixture.status === "FINAL" ? "FINAL" : game?.status ?? "SCHEDULED";
              const badgeClass =
                status === "LIVE" ? "bg-emerald-400/15 text-emerald-300" :
                status === "PAUSED" ? "bg-amber-400/15 text-amber-300" :
                status === "FINAL" ? "bg-white/[.08] text-zinc-400" :
                "bg-white/[.05] text-zinc-500";
              return (
                <div key={fixture.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
                  <div className="flex items-center gap-4">
                    <span className="w-16 text-xs text-zinc-500">{formatLagosTime(fixture.scheduledAt)}</span>
                    <span className="text-sm font-medium">
                      {fixture.homeSeasonClub!.club.shortName} {fixture.status !== "SCHEDULED" ? fixture.homeScore : ""} <span className="text-zinc-600">vs</span> {fixture.status !== "SCHEDULED" ? fixture.awayScore : ""} {fixture.awaySeasonClub!.club.shortName}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}>{status}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!game ? (
                      <form action={startGame.bind(null, fixture.id)}>
                        <button className="rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950">Start game</button>
                      </form>
                    ) : (
                      <Link href={`/games/${fixture.id}/live`} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300">
                        Open scorer
                      </Link>
                    )}
                    <Link href={`/display/game/${game?.id ?? ""}/clock`} className={`rounded-lg border border-white/10 px-3 py-1.5 text-xs ${game ? "text-zinc-300" : "pointer-events-none text-zinc-700"}`}>
                      Open display
                    </Link>
                  </div>
                </div>
              );
            })}
            {fixtures.length === 0 ? <p className="text-zinc-500">No fixtures found for the active season.</p> : null}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

const HEALTH_STYLE: Record<HealthStatus, string> = {
  HEALTHY: "bg-emerald-400/15 text-emerald-300",
  WARNING: "bg-amber-400/15 text-amber-300",
  CRITICAL: "bg-rose-400/15 text-rose-300",
  UNKNOWN: "bg-zinc-500/15 text-zinc-400",
};

function HealthPill({ status }: { status: HealthStatus }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${HEALTH_STYLE[status]}`}>{status}</span>;
}

function HealthChip({ label, status }: { label: string; status: HealthStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${HEALTH_STYLE[status]}`}>{label}: {status}</span>;
}
