import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  advanceNoveltyPeriod,
  finalizeNoveltyGame,
  pauseNoveltyGame,
  recordNoveltyScore,
  recordNoveltyStatEvent,
  resumeNoveltyGame,
  startNoveltyGame,
} from "../../actions";
import { GameClock } from "@/app/games/game-clock";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { remainingClockSeconds } from "@/lib/game-clock";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NoveltyLive({ params, searchParams }: { params: Promise<{ matchId: string }>; searchParams: Promise<{ error?: string }> }) {
  const { session, organizationId } = await requirePermissionWithOrganization("game:operate");
  const { matchId } = await params;
  const query = await searchParams;
  const [match, players] = await withOrganizationContext(organizationId, (tx) => Promise.all([tx.noveltyMatch.findUnique({
    where: { id: matchId },
    include: {
      homeTeam: true,
      awayTeam: true,
      game: {
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { team: true, player: { include: { athlete: true } }, fouledPlayer: { include: { athlete: true } } },
          },
        },
      },
    },
  }), tx.player.findMany({
    where: { organizationId, seasonClubId: { not: null } },
    include: { athlete: true, seasonClub: { include: { club: true } } },
    orderBy: { athlete: { firstName: "asc" } },
  })]));
  if (!match) notFound();
  const game = match.game;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex justify-between">
          <Link href="/novelty-matches" className="text-zinc-400">Back to exhibition matches</Link>
        </div>
        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          {query.error === "tied" ? <p className="mb-5 rounded-lg bg-rose-400/10 p-3 text-rose-300">A tied game cannot be finalized. Complete overtime or correct the score.</p> : null}
          <p className="text-center text-xs uppercase tracking-[.2em] text-emerald-400">{match.name}</p>
          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center text-center">
            <TeamScore name={match.homeTeam.name} score={match.homeScore} />
            <div>
              <p className="text-xs text-zinc-500">PERIOD {game?.currentPeriod ?? 1}</p>
              <p className="mt-2 font-mono text-4xl font-bold">
                {game ? <GameClock seconds={remainingClockSeconds(game)} status={game.status} startedAt={game.clockStartedAt?.toISOString() ?? null} /> : "10:00"}
              </p>
              <p className="mt-2 text-xs text-emerald-400">{game?.status ?? "NOT STARTED"}</p>
            </div>
            <TeamScore name={match.awayTeam.name} score={match.awayScore} />
          </div>
          <div className="mt-8 flex justify-center gap-2">
            {!game ? (
              <form action={startNoveltyGame.bind(null, matchId)}><button className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950">Start match</button></form>
            ) : (
              <>
                {game.status === "LIVE" ? <form action={pauseNoveltyGame.bind(null, game.id, matchId)}><button className="rounded-xl border border-white/10 px-4 py-2">Pause</button></form> : game.status !== "FINAL" ? <form action={resumeNoveltyGame.bind(null, game.id, matchId)}><button className="rounded-xl bg-emerald-400 px-4 py-2 text-zinc-950">Resume</button></form> : null}
                {game.status !== "FINAL" ? <div className="flex flex-col items-center gap-1"><form action={advanceNoveltyPeriod.bind(null, game.id, matchId)}><button className="rounded-xl border border-white/10 px-4 py-2">Next period</button></form>{game.currentPeriod === 1 ? <p className="text-[10px] uppercase tracking-wider text-zinc-500">Halftime break: 2 min</p> : null}</div> : null}
                {game.status !== "FINAL" ? <form action={finalizeNoveltyGame.bind(null, game.id, matchId)}><button className="rounded-xl border border-rose-400/20 px-4 py-2 text-rose-300">Confirm final</button></form> : null}
              </>
            )}
          </div>
        </section>
        {game && game.status !== "FINAL" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {[match.homeTeam, match.awayTeam].map((team) => (
              <section key={team.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                <h3 className="font-semibold">{team.name} scoring</h3>
                <form action={recordNoveltyScore.bind(null, game.id, matchId)} className="mt-4 grid grid-cols-2 gap-3">
                  <input type="hidden" name="teamId" value={team.id} />
                  <select name="playerId" className="col-span-2 rounded-lg bg-white/[.05] p-3">
                    <option value="">Team score / unknown player</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName} ({player.seasonClub?.club.shortName})</option>)}
                  </select>
                  <select name="points" className="rounded-lg bg-white/[.05] p-3">
                    {[1, 2, 3, -1, -2, -3].map((value) => <option key={value} value={value}>{value > 0 ? "+" : ""}{value}</option>)}
                  </select>
                  <input name="description" placeholder="Description" className="rounded-lg bg-white/[.05] p-3" />
                  <button className="col-span-2 rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Record score</button>
                </form>
                <form action={recordNoveltyStatEvent.bind(null, game.id, matchId)} className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[.06] pt-5">
                  <input type="hidden" name="teamId" value={team.id} />
                  <select name="playerId" className="col-span-2 rounded-lg bg-white/[.05] p-3" required>
                    <option value="">Select player</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName} ({player.seasonClub?.club.shortName})</option>)}
                  </select>
                  <select name="eventType" className="rounded-lg bg-white/[.05] p-3">
                    {["REBOUND", "ASSIST", "STEAL", "BLOCK", "TURNOVER", "FOUL"].map((event) => <option key={event}>{event}</option>)}
                  </select>
                  <input name="description" placeholder="Description" className="rounded-lg bg-white/[.05] p-3" />
                  <p className="col-span-2 -mb-1 text-xs text-zinc-500">If recording a foul (optional - leave blank when it isn&apos;t clearly one-sided):</p>
                  <select name="fouledPlayerId" className="rounded-lg bg-white/[.05] p-3">
                    <option value="">Fouled player (unknown/none)</option>
                    {players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName} ({player.seasonClub?.club.shortName})</option>)}
                  </select>
                  <select name="foulType" className="rounded-lg bg-white/[.05] p-3">
                    <option value="">Foul type (unspecified)</option>
                    {["PERSONAL", "TECHNICAL", "FLAGRANT", "OFFENSIVE"].map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                  <button className="col-span-2 rounded-lg border border-emerald-400/30 p-3 text-emerald-400">Record player event</button>
                </form>
              </section>
            ))}
          </div>
        ) : null}
        {game ? (
          <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
            <h3 className="font-semibold">Event feed</h3>
            <div className="mt-4 space-y-2">
              {game.events.map((event) => (
                <div key={event.id} className="flex justify-between border-b border-white/[.06] py-2 text-sm">
                  <span>{event.team.shortName ?? event.team.name} · {event.player ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}` : "Team"} · {event.description}{event.eventType === "FOUL" && (event.fouledPlayer || event.foulType) ? ` (${[event.foulType, event.fouledPlayer ? `on ${event.fouledPlayer.athlete.firstName} ${event.fouledPlayer.athlete.lastName}` : null].filter(Boolean).join(" · ")})` : ""}</span>
                  <span className="text-zinc-500">P{event.period} {Math.floor(event.clockSeconds / 60)}:{(event.clockSeconds % 60).toString().padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </OperationsShell>
  );
}

function TeamScore({ name, score }: { name: string; score: number }) {
  return <div><h2 className="text-2xl font-semibold">{name}</h2><p className="mt-4 text-6xl font-black">{score}</p></div>;
}
