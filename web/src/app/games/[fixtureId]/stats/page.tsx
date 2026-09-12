import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { SubmitButton } from "@/app/components/submit-button";
import {
  confirmStartingFive,
  correctStatisticianEventPostFinal,
  getGameLineup,
  getGameLiveBoxScore,
  getGameReconciliation,
  hasPostFinalCorrections,
  recordStatisticianShot,
  recordStatisticianStat,
  recordSubstitution,
  undoLastStatisticianEvent,
  verifyStatistics,
} from "../../stats-actions";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { remainingClockSeconds } from "@/lib/game-clock";
import { isUltraTime, periodLabel } from "@/lib/game-rules";
import { verifyTeamMinutes, formatMinutes, type SubstitutionWithClock } from "@/lib/lineup-stints";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const BIG_BTN = "min-h-[52px] min-w-[52px] rounded-xl text-sm font-bold active:scale-95 transition";
const FOUL_TYPES = ["PERSONAL", "TECHNICAL", "FLAGRANT", "OFFENSIVE"] as const;
const OTHER_STATS = ["OFFENSIVE_REBOUND", "DEFENSIVE_REBOUND", "ASSIST", "STEAL", "BLOCK", "TURNOVER", "FOUL"] as const;

type RosterPlayer = { id: string; athlete: { firstName: string; lastName: string } };
type TeamWithRoster = { id: string; club: { name: string; shortName: string }; players: RosterPlayer[] };

export default async function StatisticianConsole({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ homePlayer?: string; awayPlayer?: string }>;
}) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("game:record-stats", `/games/${fixtureId}/stats`);
  const query = await searchParams;

  if (!session.user.organizationId) notFound();
  const fixture = await withOrganizationContext(session.user.organizationId, (tx) => tx.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      game: true,
    },
  }));
  if (!fixture) notFound();
  const game = fixture.game;
  if (!game) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-4 py-8">
          <p className="text-zinc-400">This game hasn&apos;t started yet on the scorer console. Statistics capture opens once the scorer starts the game.</p>
          <Link href={`/games/${fixtureId}/live`} className="mt-3 inline-block text-sm text-emerald-400">Open scorer console</Link>
        </main>
      </OperationsShell>
    );
  }

  const remainingSeconds = remainingClockSeconds(game);
  const ultraTime = isUltraTime(game, remainingSeconds);
  const reconciliation = await getGameReconciliation(game.id);
  const liveBoxScore = await getGameLiveBoxScore(game.id);
  const lineup = await getGameLineup(game.id);
  const startersConfirmed = { home: (lineup.get(fixture.homeSeasonClubId)?.size ?? 0) > 0, away: (lineup.get(fixture.awaySeasonClubId)?.size ?? 0) > 0 };
  const bothStartersConfirmed = startersConfirmed.home && startersConfirmed.away;
  const events = await withOrganizationContext(session.user.organizationId, (tx) => tx.gameEvent.findMany({
    where: { gameId: game.id, source: "ULTRA_NATIVE_LIVE_STATISTICIAN" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { player: { include: { athlete: true } }, substitutedOutPlayer: { include: { athlete: true } } },
  }));
  const isMutable = game.status === "LIVE" || game.status === "PAUSED";
  const isFinal = game.status === "FINAL";
  const correctedAfterFinal = isFinal ? await hasPostFinalCorrections(game.id) : false;

  const [starterRows, substitutionRows] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([
    tx.gameStarter.findMany({ where: { gameId: game.id }, select: { seasonClubId: true, playerId: true } }),
    tx.gameEvent.findMany({
      where: { gameId: game.id, eventType: "SUBSTITUTION", status: "ACTIVE" },
      orderBy: { sequenceNumber: "asc" },
      select: { seasonClubId: true, playerId: true, substitutedOutPlayerId: true, sequenceNumber: true, period: true, clockSeconds: true },
    }),
  ]));
  const substitutionsWithClock: SubstitutionWithClock[] = substitutionRows
    .filter((s): s is typeof s & { seasonClubId: string; playerId: string; substitutedOutPlayerId: string; sequenceNumber: number } =>
      Boolean(s.seasonClubId && s.playerId && s.substitutedOutPlayerId && s.sequenceNumber !== null))
    .map((s) => ({ seasonClubId: s.seasonClubId, playerInId: s.playerId, playerOutId: s.substitutedOutPlayerId, sequenceNumber: s.sequenceNumber, period: s.period, clockSeconds: s.clockSeconds }));
  const gameEndPoint = { period: game.currentPeriod, clockSeconds: remainingSeconds };
  const minutesByTeam = bothStartersConfirmed
    ? {
        home: verifyTeamMinutes(fixture.homeSeasonClubId, starterRows, substitutionsWithClock, gameEndPoint),
        away: verifyTeamMinutes(fixture.awaySeasonClubId, starterRows, substitutionsWithClock, gameEndPoint),
      }
    : null;

  const reconciliationTone =
    reconciliation.overallStatus === "MATCHED"
      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
      : reconciliation.overallStatus === "MISMATCH"
        ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
        : "border-white/10 bg-white/[.03] text-zinc-400";

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-4 pb-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/fixtures/${fixtureId}`} className="text-sm text-zinc-400">Back to fixture</Link>
          <div className="flex gap-4">
            <Link href={`/games/${fixtureId}/stats/reconciliation`} className="text-sm text-violet-400">Native vs. official reconciliation</Link>
            <Link href={`/games/${fixtureId}/live`} className="text-sm text-emerald-400">Open scorer console</Link>
          </div>
        </div>

        {correctedAfterFinal ? (
          <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center text-sm font-black tracking-wide text-amber-300">
            STATISTICS CORRECTED AFTER FINAL
          </div>
        ) : null}

        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-4 sm:p-6">
          {ultraTime ? (
            <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-center text-sm font-black tracking-wide text-amber-300">
              ⚡ ULTRA TIME — 2× POINTS
            </div>
          ) : null}
          <h1 className="text-lg font-semibold">Statistician console</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {fixture.homeSeasonClub.club.shortName} vs {fixture.awaySeasonClub.club.shortName} · {periodLabel(game.currentPeriod, game.status)} · {game.status}
          </p>
          {game.status === "FINAL" ? (
            <p className="mt-2 text-xs text-amber-400">This game is FINAL. Statistician entry is closed; only verification remains available.</p>
          ) : null}
        </section>

        {isMutable && !bothStartersConfirmed ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <StartingFivePanel team={fixture.homeSeasonClub} gameId={game.id} fixtureId={fixtureId} confirmed={startersConfirmed.home} />
            <StartingFivePanel team={fixture.awaySeasonClub} gameId={game.id} fixtureId={fixtureId} confirmed={startersConfirmed.away} />
          </div>
        ) : null}

        <section className={`mt-6 rounded-2xl border p-5 ${reconciliationTone}`}>
          <h3 className="font-semibold">Score reconciliation</h3>
          <p className="mt-1 text-xs opacity-80">
            {reconciliation.overallStatus === "UNAVAILABLE"
              ? "No statistician events recorded yet — record at least one shot to begin reconciliation."
              : reconciliation.overallStatus === "MATCHED"
                ? "The statistician's independently-derived score matches the official scoreboard."
                : "⚠ SCORE RECONCILIATION REQUIRED — the statistician's derived score does not match the official scoreboard."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[{ team: fixture.homeSeasonClub, r: reconciliation.home }, { team: fixture.awaySeasonClub, r: reconciliation.away }].map(({ team, r }) => (
              <div key={team.id} className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
                <p className="font-semibold">{team.club.shortName}</p>
                <p className="mt-1 text-xs opacity-80">OFFICIAL {r.officialScore} · STATISTICAL {r.status === "UNAVAILABLE" ? "—" : r.statisticalScore}</p>
                {r.status === "MISMATCH" ? <p className="text-xs font-semibold">Difference: {r.difference > 0 ? "+" : ""}{r.difference}</p> : null}
              </div>
            ))}
          </div>
          <form action={verifyStatistics.bind(null, game.id, fixtureId)} className="mt-4 flex flex-col gap-2 sm:flex-row">
            {reconciliation.overallStatus === "MISMATCH" ? (
              <input name="overrideReason" required minLength={5} placeholder="Reason to verify despite mismatch (required)" className="min-h-[44px] flex-1 rounded-lg bg-black/30 p-3 text-sm text-zinc-100" />
            ) : null}
            <SubmitButton pendingLabel="Verifying…" className={`${BIG_BTN} border border-white/20 px-5`}>
              {game.statisticsVerifiedAt ? "Re-verify statistics" : "Verify statistics"}
            </SubmitButton>
          </form>
          {game.statisticsVerifiedAt ? (
            <p className="mt-2 text-xs opacity-70">Last verified {game.statisticsVerifiedAt.toLocaleString()} — PlayerStat/TeamStat materialized from this ledger.</p>
          ) : null}
        </section>

        {isMutable && bothStartersConfirmed ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <TeamStatPanel
              team={fixture.homeSeasonClub}
              gameId={game.id}
              fixtureId={fixtureId}
              ultraTime={ultraTime}
              onCourt={lineup.get(fixture.homeSeasonClubId) ?? new Set()}
              selectedPlayerId={query.homePlayer}
              selectParamName="homePlayer"
              otherPlayerId={query.awayPlayer}
              otherParamName="awayPlayer"
            />
            <TeamStatPanel
              team={fixture.awaySeasonClub}
              gameId={game.id}
              fixtureId={fixtureId}
              ultraTime={ultraTime}
              onCourt={lineup.get(fixture.awaySeasonClubId) ?? new Set()}
              selectedPlayerId={query.awayPlayer}
              selectParamName="awayPlayer"
              otherPlayerId={query.homePlayer}
              otherParamName="homePlayer"
            />
          </div>
        ) : null}

        {isMutable && events.length > 0 ? (
          <div className="mt-6 flex justify-center">
            <form action={undoLastStatisticianEvent.bind(null, game.id, fixtureId)}>
              <SubmitButton pendingLabel="Undoing…" className={`${BIG_BTN} border border-amber-400/30 px-5 text-amber-300`}>Undo last statistician entry</SubmitButton>
            </form>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h3 className="font-semibold">Live derived box score</h3>
          <p className="mt-1 text-xs text-zinc-500">Computed live from the statistician&apos;s own event ledger — a read model, not yet the canonical box score until verified.</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {[
              { team: fixture.homeSeasonClub, totals: liveBoxScore.teams.home, minutes: minutesByTeam?.home },
              { team: fixture.awaySeasonClub, totals: liveBoxScore.teams.away, minutes: minutesByTeam?.away },
            ].map(({ team, totals, minutes }) => (
              <div key={team.id} className="rounded-xl border border-white/10 p-3 text-sm">
                <div className="flex justify-between font-semibold"><span>{team.club.shortName}</span><span>{totals.points} PTS</span></div>
                <p className="mt-1 text-xs text-zinc-500">FG {totals.fieldGoalsMade}/{totals.fieldGoalsAttempted} · 4PT {totals.fourPointsMade}/{totals.fourPointsAttempted} · REB {totals.rebounds} · AST {totals.assists} · TOV {totals.turnovers} · PF {totals.fouls}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-zinc-600">
                  Minutes: {minutes ? minutes.confidence.replace("MINUTES_", "") : "UNAVAILABLE"}
                </p>
                <div className="mt-2 space-y-1">
                  {liveBoxScore.players.filter((p) => p.seasonClubId === team.id).map((p) => {
                    const roster = team.players.find((rp) => rp.id === p.playerId);
                    const seconds = minutes?.confidence === "MINUTES_VERIFIED" ? minutes.playerSeconds.get(p.playerId) : undefined;
                    return (
                      <div key={p.playerId} className="flex justify-between text-xs text-zinc-400">
                        <span>{roster ? `${roster.athlete.firstName} ${roster.athlete.lastName}` : p.playerId}{seconds !== undefined ? ` · ${formatMinutes(seconds)}` : ""}</span>
                        <span>{p.points} PTS · {p.rebounds} REB · {p.assists} AST</span>
                      </div>
                    );
                  })}
                  {liveBoxScore.players.filter((p) => p.seasonClubId === team.id).length === 0 ? <p className="text-xs text-zinc-600">No statistician events yet for this team.</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h3 className="font-semibold">Statistician event feed</h3>
          {isFinal ? <p className="mt-1 text-xs text-amber-400">This game is FINAL. Corrections here require a reason, void/supersede the original event, and clear statistics verification until re-verified.</p> : null}
          <div className="mt-4 space-y-2">
            {events.length === 0 ? <p className="text-sm text-zinc-500">No statistician events recorded yet.</p> : null}
            {events.map((event) => (
              <div key={event.id} className="border-b border-white/[.06] py-2 text-sm">
                <div className="flex justify-between">
                  <span>
                    {event.player ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}` : "—"} · {event.description}
                    {event.status !== "ACTIVE" ? <span className="ml-2 text-xs uppercase tracking-wider text-amber-400">{event.status}</span> : null}
                  </span>
                  <span className="text-zinc-500">P{event.period} {Math.floor(event.clockSeconds / 60)}:{(event.clockSeconds % 60).toString().padStart(2, "0")}</span>
                </div>
                {isFinal && event.status === "ACTIVE" ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-zinc-500">Correct or remove this entry (post-final)</summary>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <form action={correctStatisticianEventPostFinal.bind(null, game.id, fixtureId)} className="flex flex-1 flex-wrap items-center gap-2">
                        <input type="hidden" name="eventId" value={event.id} />
                        {(event.eventType === "SHOT_MADE" || event.eventType === "SHOT_MISSED" || event.eventType === "FREE_THROW_MADE" || event.eventType === "FREE_THROW_MISSED") ? (
                          <>
                            <select name="replacementShotValue" className="min-h-[36px] rounded bg-white/[.06] px-2 text-xs [color-scheme:dark]">
                              {[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}PT</option>)}
                            </select>
                            <select name="replacementMade" className="min-h-[36px] rounded bg-white/[.06] px-2 text-xs [color-scheme:dark]">
                              <option value="true">MADE</option>
                              <option value="false">MISS</option>
                            </select>
                          </>
                        ) : null}
                        <input name="reason" required minLength={5} placeholder="Reason (required)" className="min-h-[36px] flex-1 rounded bg-white/[.06] px-2 text-xs" />
                        <SubmitButton pendingLabel="…" className="min-h-[36px] rounded border border-amber-400/30 px-3 text-xs text-amber-300">Correct / remove</SubmitButton>
                      </form>
                    </div>
                  </details>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

function StartingFivePanel({ team, gameId, fixtureId, confirmed }: { team: TeamWithRoster; gameId: string; fixtureId: string; confirmed: boolean }) {
  return (
    <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h3 className="font-semibold">{team.club.name} — starting five</h3>
      {confirmed ? (
        <p className="mt-3 text-sm text-emerald-400">✓ Starting five confirmed.</p>
      ) : (
        <form action={confirmStartingFive.bind(null, gameId, fixtureId)} className="mt-3">
          <input type="hidden" name="seasonClubId" value={team.id} />
          <p className="text-xs text-zinc-500">Select exactly 5 players.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {team.players.map((p) => (
              <label key={p.id} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-white/10 px-2 text-xs text-zinc-300">
                <input type="checkbox" name="playerIds" value={p.id} className="h-4 w-4" />
                {p.athlete.firstName} {p.athlete.lastName}
              </label>
            ))}
          </div>
          <SubmitButton pendingLabel="Confirming…" className={`${BIG_BTN} mt-3 border border-emerald-400/30 px-5 text-emerald-300`}>Confirm starting five</SubmitButton>
        </form>
      )}
    </section>
  );
}

function TeamStatPanel({
  team,
  gameId,
  fixtureId,
  ultraTime,
  onCourt,
  selectedPlayerId,
  selectParamName,
  otherPlayerId,
  otherParamName,
}: {
  team: TeamWithRoster;
  gameId: string;
  fixtureId: string;
  ultraTime: boolean;
  onCourt: Set<string>;
  selectedPlayerId: string | undefined;
  selectParamName: "homePlayer" | "awayPlayer";
  otherPlayerId: string | undefined;
  otherParamName: "homePlayer" | "awayPlayer";
}) {
  const player = team.players.find((p) => p.id === selectedPlayerId) ?? null;
  const otherQuery = otherPlayerId ? `&${otherParamName}=${otherPlayerId}` : "";
  const onCourtPlayers = team.players.filter((p) => onCourt.has(p.id));
  const benchPlayers = team.players.filter((p) => !onCourt.has(p.id));
  const playerIsOnCourt = player ? onCourt.has(player.id) : false;

  return (
    <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
      <h3 className="font-semibold">{team.club.name}</h3>

      <p className="mt-3 text-[10px] uppercase tracking-wider text-sky-400">On court</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {onCourtPlayers.map((p) => (
          <Link key={p.id} href={`/games/${fixtureId}/stats?${selectParamName}=${p.id}${otherQuery}`}
            className={`min-h-[48px] rounded-lg border px-2 py-2 text-center text-xs font-medium ${p.id === selectedPlayerId ? "border-emerald-400 bg-emerald-400/10 text-emerald-300" : "border-sky-400/20 text-zinc-300"}`}>
            {p.athlete.firstName} {p.athlete.lastName}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-[10px] uppercase tracking-wider text-zinc-500">Bench</p>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {benchPlayers.map((p) => (
          <Link key={p.id} href={`/games/${fixtureId}/stats?${selectParamName}=${p.id}${otherQuery}`}
            className={`min-h-[48px] rounded-lg border px-2 py-2 text-center text-xs font-medium opacity-80 ${p.id === selectedPlayerId ? "border-emerald-400 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-zinc-400"}`}>
            {p.athlete.firstName} {p.athlete.lastName}
          </Link>
        ))}
      </div>

      {player ? (
        <div className="mt-4 border-t border-white/[.06] pt-4">
          <p className="text-xs text-zinc-500">Selected: <span className="font-semibold text-zinc-200">{player.athlete.firstName} {player.athlete.lastName}</span> ({playerIsOnCourt ? "on court" : "bench"})</p>

          {playerIsOnCourt ? (
            <>
              <p className="mt-3 text-[10px] uppercase tracking-wider text-zinc-500">Shooting</p>
              <div className="mt-2 grid grid-cols-4 gap-2">
                {([1, 2, 3, 4] as const).map((value) => (
                  <div key={value} className="grid gap-1">
                    <ShotButton gameId={gameId} fixtureId={fixtureId} seasonClubId={team.id} playerId={player.id} shotValue={value} made className={value === 4 ? "border-2 border-violet-300 bg-violet-500 text-white" : "bg-emerald-400 text-zinc-950"}>
                      {value === 1 ? "FT+" : `${value}PT+`}{ultraTime ? <span className="block text-[9px] font-normal">→{value * 2}</span> : null}
                    </ShotButton>
                    <ShotButton gameId={gameId} fixtureId={fixtureId} seasonClubId={team.id} playerId={player.id} shotValue={value} made={false} className="border border-rose-400/30 text-rose-300">
                      {value === 1 ? "FT miss" : `${value}PT miss`}
                    </ShotButton>
                  </div>
                ))}
              </div>

              <p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-500">Other</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {OTHER_STATS.map((stat) => (
                  <form key={stat} action={recordStatisticianStat.bind(null, gameId, fixtureId)}>
                    <input type="hidden" name="seasonClubId" value={team.id} />
                    <input type="hidden" name="playerId" value={player.id} />
                    <input type="hidden" name="eventType" value={stat} />
                    <SubmitButton pendingLabel="…" className={`${BIG_BTN} w-full border border-emerald-400/30 px-1 text-[11px] text-emerald-400`}>
                      {stat.replaceAll("_", " ")}
                    </SubmitButton>
                  </form>
                ))}
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-zinc-500">Foul detail (optional)</summary>
                <form action={recordStatisticianStat.bind(null, gameId, fixtureId)} className="mt-2 grid gap-2">
                  <input type="hidden" name="seasonClubId" value={team.id} />
                  <input type="hidden" name="playerId" value={player.id} />
                  <input type="hidden" name="eventType" value="FOUL" />
                  <select name="fouledPlayerId" className="min-h-[44px] rounded-lg bg-white/[.05] p-2 text-xs [color-scheme:dark]">
                    <option value="">Fouled player (unknown/none)</option>
                    {team.players.filter((p) => p.id !== player.id).map((p) => <option key={p.id} value={p.id}>{p.athlete.firstName} {p.athlete.lastName}</option>)}
                  </select>
                  <select name="foulType" className="min-h-[44px] rounded-lg bg-white/[.05] p-2 text-xs [color-scheme:dark]">
                    <option value="">Foul type (unspecified)</option>
                    {FOUL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-emerald-400/30 text-xs text-emerald-400`}>Record foul with detail</SubmitButton>
                </form>
              </details>

              <p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-500">Substitute out</p>
              <form action={recordSubstitution.bind(null, gameId, fixtureId)} className="mt-2 flex gap-2">
                <input type="hidden" name="seasonClubId" value={team.id} />
                <input type="hidden" name="playerOutId" value={player.id} />
                <select name="playerInId" required className="min-h-[44px] flex-1 rounded-lg bg-white/[.05] p-2 text-xs [color-scheme:dark]">
                  <option value="">Replacing with…</option>
                  {benchPlayers.map((p) => <option key={p.id} value={p.id}>{p.athlete.firstName} {p.athlete.lastName}</option>)}
                </select>
                <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-zinc-400/30 px-3 text-xs text-zinc-300`}>SUB OUT</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <p className="mt-4 text-[10px] uppercase tracking-wider text-zinc-500">Substitute in</p>
              <form action={recordSubstitution.bind(null, gameId, fixtureId)} className="mt-2 flex gap-2">
                <input type="hidden" name="seasonClubId" value={team.id} />
                <input type="hidden" name="playerInId" value={player.id} />
                <select name="playerOutId" required className="min-h-[44px] flex-1 rounded-lg bg-white/[.05] p-2 text-xs [color-scheme:dark]">
                  <option value="">Replacing…</option>
                  {onCourtPlayers.map((p) => <option key={p.id} value={p.id}>{p.athlete.firstName} {p.athlete.lastName}</option>)}
                </select>
                <SubmitButton pendingLabel="…" className={`${BIG_BTN} border border-sky-400/30 px-3 text-xs text-sky-300`}>SUB IN</SubmitButton>
              </form>
            </>
          )}
        </div>
      ) : (
        <p className="mt-4 text-xs text-zinc-500">Tap a player above to record a stat for them or substitute them.</p>
      )}
    </section>
  );
}

function ShotButton({
  gameId,
  fixtureId,
  seasonClubId,
  playerId,
  shotValue,
  made,
  className,
  children,
}: {
  gameId: string;
  fixtureId: string;
  seasonClubId: string;
  playerId: string;
  shotValue: number;
  made: boolean;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <form action={recordStatisticianShot.bind(null, gameId, fixtureId)}>
      <input type="hidden" name="seasonClubId" value={seasonClubId} />
      <input type="hidden" name="playerId" value={playerId} />
      <input type="hidden" name="shotValue" value={shotValue} />
      <input type="hidden" name="made" value={made ? "true" : "false"} />
      <SubmitButton pendingLabel="…" className={`${BIG_BTN} w-full px-1 ${className}`}>{children}</SubmitButton>
    </form>
  );
}
