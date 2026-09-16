import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { SubmitButton } from "@/app/components/submit-button";
import {
  advancePeriod,
  confirmMandatorySubstitution,
  controlShotClock,
  correctScoreEventAction,
  finalizeGame,
  getGameIncidents,
  pauseGame,
  recordIncident,
  recordScore,
  recordStatEvent,
  reopenGame,
  resolveIncident,
  resumeGame,
  startGame,
  undoLastEvent,
  voidScoreEventAction,
} from "../../actions";
import { getGameReconciliation } from "../../stats-actions";
import { GameClock } from "../../game-clock";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { remainingClockSeconds } from "@/lib/game-clock";
import { FINAL_PERIOD, isUltraTime, periodLabel, remainingShotClockSeconds, ULTRA_RULES } from "@/lib/game-rules";
import { getSportDefinition } from "@/lib/sports/registry";
import { chaseTarget, inningsConfig, isDelivery, isLegalDelivery, oversDisplay } from "@/lib/sports/innings-scoring";
import { withOrganizationContext } from "@/lib/tenant-context";
import { ScoreCapturePanel } from "./score-capture-panel";
import { SportCapturePanel } from "./sport-capture-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Live({ params, searchParams }: { params: Promise<{ fixtureId: string }>; searchParams: Promise<{error?:string}> }) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("game:operate", `/games/${fixtureId}/live`);
  const query = await searchParams;
  if (!session.user.organizationId) notFound();
  const fixture = await withOrganizationContext(session.user.organizationId, (tx) => tx.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      homeEntrant: { select: { id: true, name: true } },
      awayEntrant: { select: { id: true, name: true } },
      game: {
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { seasonClub: { include: { club: true } }, player: { include: { athlete: true } }, fouledPlayer: { include: { athlete: true } } },
          },
          periodScores: { orderBy: { period: "asc" } },
        },
      },
      venue: true,
      division: { include: { competition: { include: { sport: true } } } },
    },
  }));
  if (!fixture) notFound();
  const game = fixture.game;
  const remainingSeconds = game ? remainingClockSeconds(game) : ULTRA_RULES.halfSeconds;
  const ultraTime = game ? isUltraTime(game, remainingSeconds) : false;
  const shotClockRunning = Boolean(game?.shotClockStartedAt);
  const shotClockRemaining = game ? remainingShotClockSeconds(game) : 20;
  const definition = getSportDefinition(fixture.division.competition.sport.slug);
  const capabilities = new Set(definition?.capabilities ?? []);
  const hasShotClock = capabilities.has("SHOT_CLOCK");
  const isBasketball = definition?.key === "BASKETBALL";
  // A fixture side is a SeasonClub (team sports) or an Entrant (individual sports).
  const homeSide = {
    id: fixture.homeSeasonClub?.id ?? fixture.homeEntrant?.id ?? "",
    name: fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "TBD",
    label: fixture.homeSeasonClub?.club.shortName ?? fixture.homeEntrant?.name ?? "TBD",
    players: fixture.homeSeasonClub?.players ?? [],
  };
  const awaySide = {
    id: fixture.awaySeasonClub?.id ?? fixture.awayEntrant?.id ?? "",
    name: fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "TBD",
    label: fixture.awaySeasonClub?.club.shortName ?? fixture.awayEntrant?.name ?? "TBD",
    players: fixture.awaySeasonClub?.players ?? [],
  };
  const battingTeamId = game && game.currentPeriod <= 1 ? homeSide.id : awaySide.id;

  // Cricket innings summary for the console (overs bowled, wickets lost, chase target).
  const inningsConfigForSport = definition ? inningsConfig(definition) : null;
  let cricketInnings: { period: number; overs: string; wickets: number; target: number | null } | null = null;
  if (inningsConfigForSport && game) {
    const deliveries = await withOrganizationContext(session.user.organizationId, (tx) =>
      tx.gameEvent.findMany({ where: { gameId: game.id, period: game.currentPeriod }, select: { typeKey: true } }),
    );
    const balls = deliveries.filter((event) => isDelivery(event.typeKey) && isLegalDelivery(event.typeKey)).length;
    const wickets = deliveries.filter((event) => event.typeKey === "WICKET").length;
    cricketInnings = {
      period: game.currentPeriod,
      overs: oversDisplay(balls),
      wickets,
      target: game.currentPeriod >= 2 ? chaseTarget(fixture.homeScore) : null,
    };
  }
  const substitutionCheckDue = Boolean(game && game.currentPeriod >= FINAL_PERIOD && game.status !== "FINAL");
  const confirmations = substitutionCheckDue
    ? await withOrganizationContext(session.user.organizationId, (tx) => tx.auditLog.findMany({
        where: { action: "MANDATORY_SUBSTITUTION_CONFIRMED", entityType: "Game", entityId: game!.id },
      }))
    : [];
  const incidents = game ? await getGameIncidents(game.id) : [];
  // Statistics verification (G.15) is a distinct signal from official game-result finality -
  // an Event Director can still finalize an unverified/mismatched game (Part XII), this is a
  // visible warning, not a hard block.
  const reconciliation = game ? await getGameReconciliation(game.id) : null;
  const showFinalizationWarning = Boolean(
    reconciliation && reconciliation.overallStatus === "MISMATCH" && !game?.statisticsVerifiedAt,
  );
  const confirmedClubIds = new Set(
    confirmations
      .map((entry) => (entry.details as { seasonClubId?: string } | null)?.seasonClubId)
      .filter((id): id is string => Boolean(id)),
  );

  const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-base font-bold active:scale-95 transition";

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="flex justify-between py-3">
          <Link href={`/fixtures/${fixtureId}`} className="text-sm text-zinc-400">Back to fixture</Link>
          <div className="flex gap-4">
            {game ? <Link href={`/games/${fixtureId}/stats`} className="text-sm text-sky-400">Open statistician console</Link> : null}
            {game ? <Link href={`/scoreboard/${game.id}`} className="text-sm text-emerald-400">Open scoreboard</Link> : null}
          </div>
        </div>

        {/* Sticky so score/clock/shot clock/Ultra Time stay visible while scrolling to the scoring panels below. */}
        <section className="sticky top-0 z-10 rounded-2xl border border-white/[.08] bg-[#0b100e]/98 p-4 shadow-xl backdrop-blur sm:p-6">
          {ultraTime ? (
            <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center text-lg font-black tracking-wide text-amber-300">
              ⚡ ULTRA TIME — 2× POINTS
            </div>
          ) : null}
          {query.error==="tied"?<p className="mb-4 rounded-lg bg-rose-400/10 p-3 text-rose-300">A tied game cannot be finalized. Complete overtime or correct the score.</p>:null}
          {showFinalizationWarning ? (
            <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-center text-sm font-semibold text-rose-300">
              ⚠ SCORE RECONCILIATION REQUIRED — the statistician console&apos;s derived score does not match the official scoreboard.{" "}
              <Link href={`/games/${fixtureId}/stats`} className="underline">Review in statistician console</Link>. The game can still be finalized, but statistics are unverified.
            </div>
          ) : null}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
            <TeamScore name={homeSide.label} score={fixture.homeScore} />
            <div>
              <p className="text-xs text-zinc-500">{game ? periodLabel(game.currentPeriod, game.status) : "HALF 1"}</p>
              <p className="mt-1 font-mono text-3xl font-bold sm:text-4xl">
                {game ? <GameClock seconds={remainingSeconds} status={game.status} startedAt={game.clockStartedAt?.toISOString() ?? null} /> : "10:00"}
              </p>
              <p className="mt-1 text-xs text-emerald-400">{game?.status ?? "NOT STARTED"}</p>
            </div>
            <TeamScore name={awaySide.label} score={fixture.awayScore} />
          </div>

          {hasShotClock && game && game.status !== "FINAL" ? (
            <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border border-white/10 p-3">
              <span className="text-xs uppercase tracking-wider text-zinc-500">Shot clock</span>
              <span className="font-mono text-2xl font-bold">
                <GameClock seconds={shotClockRemaining} status={shotClockRunning ? "LIVE" : "PAUSED"} startedAt={game.shotClockStartedAt?.toISOString() ?? null} />
              </span>
              <form action={controlShotClock.bind(null, game.id, fixtureId)}><input type="hidden" name="action" value="START" /><SubmitButton className={`${BIG_BTN} border border-white/10 px-3`} disabled={game.status !== "LIVE" || shotClockRunning}>Start</SubmitButton></form>
              <form action={controlShotClock.bind(null, game.id, fixtureId)}><input type="hidden" name="action" value="STOP" /><SubmitButton className={`${BIG_BTN} border border-white/10 px-3`} disabled={game.status !== "LIVE" || !shotClockRunning}>Stop</SubmitButton></form>
              <form action={controlShotClock.bind(null, game.id, fixtureId)}><input type="hidden" name="action" value="RESET" /><SubmitButton className={`${BIG_BTN} border border-white/10 px-3`} disabled={game.status !== "LIVE"}>Reset 20</SubmitButton></form>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {!game ? (
              <form action={startGame.bind(null, fixtureId)}><SubmitButton pendingLabel="Starting…" className={`${BIG_BTN} bg-emerald-400 px-6 text-zinc-950`}>Start game</SubmitButton></form>
            ) : (
              <>
                {game.status === "LIVE" ? <form action={pauseGame.bind(null, game.id, fixtureId)}><SubmitButton className={`${BIG_BTN} border border-white/10 px-5`}>Pause</SubmitButton></form> : game.status !== "FINAL" ? <form action={resumeGame.bind(null, game.id, fixtureId)}><SubmitButton className={`${BIG_BTN} bg-emerald-400 px-5 text-zinc-950`}>Resume</SubmitButton></form> : null}
                {game.status !== "FINAL" ? <div className="flex flex-col items-center gap-1"><form action={advancePeriod.bind(null, game.id, fixtureId)}><SubmitButton className={`${BIG_BTN} border border-white/10 px-5`}>Next period</SubmitButton></form>{game.currentPeriod === 1 ? <p className="text-[10px] uppercase tracking-wider text-zinc-500">Halftime break: 2 min</p> : null}</div> : null}
                {game.status !== "FINAL" && game.events.length > 0 ? <form action={undoLastEvent.bind(null, game.id, fixtureId)}><SubmitButton pendingLabel="Undoing…" className={`${BIG_BTN} border border-amber-400/30 px-5 text-amber-300`}>Undo last event</SubmitButton></form> : null}
                {game.status !== "FINAL" ? <form action={finalizeGame.bind(null, game.id, fixtureId)}><SubmitButton pendingLabel="Finalizing…" className={`${BIG_BTN} border border-rose-400/20 px-5 text-rose-300`}>Confirm final</SubmitButton></form> : null}
              </>
            )}
          </div>
          {game && game.status === "FINAL" ? (
            <form action={reopenGame.bind(null, game.id, fixtureId)} className="mt-5 border-t border-white/[.06] pt-4">
              <p className="text-xs text-zinc-500">Reopening requires result-confirm access and a written reason. The game returns to Paused for correction, then must be finalized again.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input name="reason" required minLength={5} placeholder="Reason for reopening (required)" className="min-h-[48px] flex-1 rounded-lg bg-white/[.05] p-3 text-sm" />
                <SubmitButton pendingLabel="Reopening…" className={`${BIG_BTN} border border-rose-400/30 px-5 text-sm text-rose-300`}>Reopen finalized game</SubmitButton>
              </div>
            </form>
          ) : null}
        </section>

        {isBasketball && substitutionCheckDue ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h3 className="font-semibold">Mandatory second-half substitution check</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {[homeSide, awaySide].map((team) => {
                const confirmed = confirmedClubIds.has(team.id);
                return (
                  <div key={team.id} className="flex items-center justify-between rounded-lg border border-white/10 p-3">
                    <span>{team.name}</span>
                    {confirmed ? (
                      <span className="text-xs font-semibold text-emerald-400">CONFIRMED</span>
                    ) : (
                      <form action={confirmMandatorySubstitution.bind(null, game!.id, fixtureId, team.id)}>
                        <SubmitButton className={`${BIG_BTN} border border-amber-400/30 px-4 text-xs text-amber-300`}>NOT CONFIRMED — confirm</SubmitButton>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {game && game.status !== "FINAL" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {[homeSide, awaySide].map((team) => (
              <section key={team.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                <h3 className="font-semibold">{team.name} scoring</h3>
                <form action={recordScore.bind(null, game.id, fixtureId)} className="mt-4">
                  <input type="hidden" name="seasonClubId" value={team.id} />
                  <select name="playerId" className="min-h-[48px] w-full rounded-lg bg-white/[.05] p-3">
                    <option value="">Team score / unknown player</option>
                    {team.players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}
                  </select>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[1, 2, 3].map((value) => (
                      <SubmitButton key={value} name="points" value={value} pendingLabel="…" className={`${BIG_BTN} bg-emerald-400 text-zinc-950`}>
                        +{value}{ultraTime ? <span className="block text-[10px] font-normal">→ {value * 2}</span> : null}
                      </SubmitButton>
                    ))}
                    {/* 4PT is visually distinct (violet, not emerald) - it's Ultra's own custom
                        shot type, not "just another number" next to the standard 1/2/3. */}
                    <SubmitButton name="points" value={4} pendingLabel="…" className={`${BIG_BTN} border-2 border-violet-300 bg-violet-500 text-white shadow-[0_0_12px_rgba(167,139,250,0.5)]`}>
                      4PT{ultraTime ? <span className="block text-[10px] font-normal">→ 8</span> : null}
                    </SubmitButton>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-zinc-500">Manual correction (prefer Undo last event above)</summary>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                      {[-1, -2, -3, -4].map((value) => (
                        <SubmitButton key={value} name="points" value={value} pendingLabel="…" className={`${BIG_BTN} border border-rose-400/20 text-rose-300`}>
                          {value}
                        </SubmitButton>
                      ))}
                    </div>
                    <input name="description" placeholder="Reason for manual correction" className="mt-2 min-h-[44px] w-full rounded-lg bg-white/[.05] p-3 text-sm" />
                  </details>
                </form>
                <form action={recordStatEvent.bind(null, game.id, fixtureId)} className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[.06] pt-5">
                  <input type="hidden" name="seasonClubId" value={team.id} />
                  <select name="playerId" className="col-span-2 min-h-[48px] rounded-lg bg-white/[.05] p-3" required>
                    <option value="">Select player</option>
                    {team.players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}
                  </select>
                  <div className="col-span-2 grid grid-cols-3 gap-2">
                    {["REBOUND","ASSIST","STEAL","BLOCK","TURNOVER","FOUL"].map((event) => (
                      <SubmitButton key={event} name="eventType" value={event} pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 text-xs text-emerald-400`}>{event}</SubmitButton>
                    ))}
                  </div>
                  <input name="description" placeholder="Description" className="col-span-2 min-h-[44px] rounded-lg bg-white/[.05] p-3" />
                  <p className="col-span-2 -mb-1 text-xs text-zinc-500">If recording a foul (optional - leave blank when it isn&apos;t clearly one-sided):</p>
                  <select name="fouledPlayerId" className="min-h-[48px] rounded-lg bg-white/[.05] p-3">
                    <option value="">Fouled player (unknown/none)</option>
                    {[...homeSide.players, ...awaySide.players].map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}
                  </select>
                  <select name="foulType" className="min-h-[48px] rounded-lg bg-white/[.05] p-3">
                    <option value="">Foul type (unspecified)</option>
                    {["PERSONAL","TECHNICAL","FLAGRANT","OFFENSIVE"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                </form>
              </section>
            ))}
          </div>
        ) : null}
        {definition && game && game.status !== "FINAL" ? (
          <SportCapturePanel
            gameId={game.id}
            fixtureId={fixtureId}
            definition={definition}
            teams={[
              {
                id: homeSide.id,
                name: homeSide.name,
                players: homeSide.players.map((player) => ({ id: player.id, name: `${player.athlete.firstName} ${player.athlete.lastName}` })),
              },
              {
                id: awaySide.id,
                name: awaySide.name,
                players: awaySide.players.map((player) => ({ id: player.id, name: `${player.athlete.firstName} ${player.athlete.lastName}` })),
              },
            ]}
          />
        ) : null}
        {definition && game && game.status !== "FINAL" ? (
          <ScoreCapturePanel
            gameId={game.id}
            fixtureId={fixtureId}
            definition={definition}
            battingTeamId={battingTeamId}
            innings={cricketInnings ?? undefined}
            knockout={fixture.division.competition.format === "KNOCKOUT"}
            scoresLevel={fixture.homeScore === fixture.awayScore}
            shootoutKicks={game.events
              .filter((event) => event.typeKey === "PENALTY_SHOOTOUT")
              .map((event) => {
                const data = (event.data ?? {}) as { side?: string; scored?: boolean };
                return { side: data.side === "AWAY" ? "AWAY" : "HOME", scored: Boolean(data.scored) };
              })}
            teams={[
              { id: homeSide.id, name: homeSide.name },
              { id: awaySide.id, name: awaySide.name },
            ]}
          />
        ) : null}
        {game && game.status !== "NOT_STARTED" ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h3 className="font-semibold">Incidents</h3>
            <form action={recordIncident.bind(null, game.id, fixtureId)} className="mt-4 grid gap-3 sm:grid-cols-2">
              <select name="type" className="min-h-[48px] rounded-lg bg-white/[.05] p-3">
                {["GAME_DELAY", "PLAYER_UNAVAILABLE", "CLOCK_CORRECTION", "GAME_INTERRUPTION", "GAME_ABANDONED"].map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
              </select>
              <input name="reason" required minLength={5} placeholder="Reason (required)" className="min-h-[48px] rounded-lg bg-white/[.05] p-3" />
              <div className="flex items-center gap-2 text-xs text-zinc-500 sm:col-span-2">
                <span>Clock correction only, game must be Paused:</span>
                <input name="clockMinutes" type="number" min="0" placeholder="mm" className="w-16 min-h-[40px] rounded-lg bg-white/[.05] p-2" />
                <span>:</span>
                <input name="clockSeconds" type="number" min="0" max="59" placeholder="ss" className="w-16 min-h-[40px] rounded-lg bg-white/[.05] p-2" />
              </div>
              <SubmitButton pendingLabel="Recording…" className={`${BIG_BTN} border border-amber-400/30 px-5 text-sm text-amber-300 sm:col-span-2`}>Report incident</SubmitButton>
            </form>
            <div className="mt-4 space-y-2">
              {incidents.length === 0 ? <p className="text-sm text-zinc-500">No incidents recorded.</p> : null}
              {incidents.map((incident) => (
                <div key={incident.id} className="rounded-lg border border-white/[.06] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{incident.details.incidentType.replace(/_/g, " ")}</span>
                    <span className={incident.resolved ? "text-xs text-emerald-400" : "text-xs text-amber-400"}>{incident.resolved ? "RESOLVED" : "OPEN"}</span>
                  </div>
                  <p className="mt-1 text-zinc-400">{incident.details.reason}</p>
                  <p className="mt-1 text-xs text-zinc-600">{incident.actor} · {incident.createdAt.toLocaleString()}</p>
                  {!incident.resolved ? (
                    <form action={resolveIncident.bind(null, game.id, fixtureId)} className="mt-2 flex gap-2">
                      <input type="hidden" name="incidentId" value={incident.id} />
                      <input name="resolution" required minLength={5} placeholder="How was this resolved?" className="min-h-[40px] flex-1 rounded-lg bg-white/[.05] p-2 text-xs" />
                      <SubmitButton className="min-h-[40px] rounded-lg border border-emerald-400/30 px-3 text-xs text-emerald-300">Resolve</SubmitButton>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {game ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h3 className="font-semibold">Event feed</h3>
            <div className="mt-4 space-y-2">
              {game.events.map((event) => {
                const isScoreEvent = event.eventType === "SCORE" || event.eventType === "SCORE_CORRECTION";
                const isCorrectable = isScoreEvent && event.status === "ACTIVE" && game.status !== "FINAL";
                return (
                  <div key={event.id} className="border-b border-white/[.06] py-2 text-sm">
                    <div className="flex justify-between">
                      <span>
                        {event.seasonClub! ? event.seasonClub!.club.shortName : "Game"} · {event.player ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}` : "Team"} · {event.description}
                        {event.eventType === "FOUL" && (event.fouledPlayer || event.foulType) ? ` (${[event.foulType, event.fouledPlayer ? `on ${event.fouledPlayer.athlete.firstName} ${event.fouledPlayer.athlete.lastName}` : null].filter(Boolean).join(" · ")})` : ""}
                        {event.status !== "ACTIVE" ? <span className="ml-2 text-xs uppercase tracking-wider text-amber-400">{event.status}</span> : null}
                      </span>
                      <span className="text-zinc-500">P{event.period} {Math.floor(event.clockSeconds / 60)}:{(event.clockSeconds % 60).toString().padStart(2, "0")}</span>
                    </div>
                    {isCorrectable ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-zinc-500">Void or correct this entry</summary>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <form action={voidScoreEventAction.bind(null, game.id, fixtureId)} className="flex flex-1 gap-2">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input name="reason" required minLength={1} placeholder="Reason to void" className="min-h-[40px] flex-1 rounded-lg bg-white/[.05] p-2 text-xs" />
                            <SubmitButton pendingLabel="…" className="min-h-[40px] rounded-lg border border-rose-400/30 px-3 text-xs text-rose-300">Void</SubmitButton>
                          </form>
                          <form action={correctScoreEventAction.bind(null, game.id, fixtureId)} className="flex flex-1 gap-2">
                            <input type="hidden" name="eventId" value={event.id} />
                            <select name="points" className="min-h-[40px] rounded-lg bg-white/[.05] p-2 text-xs [color-scheme:dark]">
                              {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}PT</option>)}
                            </select>
                            <input name="reason" required minLength={1} placeholder="Reason to correct" className="min-h-[40px] flex-1 rounded-lg bg-white/[.05] p-2 text-xs" />
                            <SubmitButton pendingLabel="…" className="min-h-[40px] rounded-lg border border-amber-400/30 px-3 text-xs text-amber-300">Correct</SubmitButton>
                          </form>
                        </div>
                      </details>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </OperationsShell>
  );
}

function TeamScore({ name, score }: { name: string; score: number }) {
  return <div><h2 className="text-lg font-semibold sm:text-2xl">{name}</h2><p className="mt-1 text-5xl font-black sm:text-6xl">{score}</p></div>;
}
