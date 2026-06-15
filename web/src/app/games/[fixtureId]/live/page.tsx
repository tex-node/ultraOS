import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import {
  advancePeriod,
  finalizeGame,
  pauseGame,
  recordScore,
  recordStatEvent,
  resumeGame,
  startGame,
} from "../../actions";
import { GameClock } from "../../game-clock";
import { requirePermission } from "@/lib/authorization";
import { remainingClockSeconds } from "@/lib/game-clock";
import { prisma } from "@/lib/prisma";

export default async function Live({ params, searchParams }: { params: Promise<{ fixtureId: string }>; searchParams: Promise<{error?:string}> }) {
  const session = await requirePermission("game:operate");
  const { fixtureId } = await params;
  const query = await searchParams;
  const fixture = await prisma.fixture.findUnique({
    where: { id: fixtureId },
    include: {
      homeSeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      awaySeasonClub: { include: { club: true, players: { include: { athlete: true } } } },
      game: {
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { seasonClub: { include: { club: true } }, player: { include: { athlete: true } } },
          },
        },
      },
      venue: true,
    },
  });
  if (!fixture) notFound();
  const game = fixture.game;
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="flex justify-between">
          <Link href={`/fixtures/${fixtureId}`} className="text-zinc-400">Back to fixture</Link>
          {game ? <Link href={`/scoreboard/${game.id}`} className="text-emerald-400">Open scoreboard</Link> : null}
        </div>
        <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          {query.error==="tied"?<p className="mb-5 rounded-lg bg-rose-400/10 p-3 text-rose-300">A tied game cannot be finalized. Complete overtime or correct the score.</p>:null}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center text-center">
            <TeamScore name={fixture.homeSeasonClub.club.name} score={fixture.homeScore} />
            <div>
              <p className="text-xs text-zinc-500">PERIOD {game?.currentPeriod ?? 1}</p>
              <p className="mt-2 font-mono text-4xl font-bold">
                {game ? <GameClock seconds={remainingClockSeconds(game)} status={game.status} startedAt={game.clockStartedAt?.toISOString() ?? null} /> : "10:00"}
              </p>
              <p className="mt-2 text-xs text-emerald-400">{game?.status ?? "NOT STARTED"}</p>
            </div>
            <TeamScore name={fixture.awaySeasonClub.club.name} score={fixture.awayScore} />
          </div>
          <div className="mt-8 flex justify-center gap-2">
            {!game ? (
              <form action={startGame.bind(null, fixtureId)}><button className="rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-zinc-950">Start game</button></form>
            ) : (
              <>
                {game.status === "LIVE" ? <form action={pauseGame.bind(null, game.id, fixtureId)}><button className="rounded-xl border border-white/10 px-4 py-2">Pause</button></form> : game.status !== "FINAL" ? <form action={resumeGame.bind(null, game.id, fixtureId)}><button className="rounded-xl bg-emerald-400 px-4 py-2 text-zinc-950">Resume</button></form> : null}
                {game.status !== "FINAL" ? <form action={advancePeriod.bind(null, game.id, fixtureId)}><button className="rounded-xl border border-white/10 px-4 py-2">Next period</button></form> : null}
                {game.status !== "FINAL" ? <form action={finalizeGame.bind(null, game.id, fixtureId)}><button className="rounded-xl border border-rose-400/20 px-4 py-2 text-rose-300">Confirm final</button></form> : null}
              </>
            )}
          </div>
        </section>
        {game && game.status !== "FINAL" ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {[fixture.homeSeasonClub, fixture.awaySeasonClub].map((team) => (
              <section key={team.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
                <h3 className="font-semibold">{team.club.name} scoring</h3>
                <form action={recordScore.bind(null, game.id, fixtureId)} className="mt-4 grid grid-cols-2 gap-3">
                  <input type="hidden" name="seasonClubId" value={team.id} />
                  <select name="playerId" className="col-span-2 rounded-lg bg-white/[.05] p-3">
                    <option value="">Team score / unknown player</option>
                    {team.players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}
                  </select>
                  <select name="points" className="rounded-lg bg-white/[.05] p-3">
                    {[1,2,3,-1,-2,-3].map((value) => <option key={value} value={value}>{value > 0 ? "+" : ""}{value}</option>)}
                  </select>
                  <input name="description" placeholder="Description" className="rounded-lg bg-white/[.05] p-3" />
                  <button className="col-span-2 rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950">Record score</button>
                </form>
                <form action={recordStatEvent.bind(null, game.id, fixtureId)} className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[.06] pt-5">
                  <input type="hidden" name="seasonClubId" value={team.id} />
                  <select name="playerId" className="col-span-2 rounded-lg bg-white/[.05] p-3" required>
                    <option value="">Select player</option>
                    {team.players.map((player) => <option key={player.id} value={player.id}>{player.athlete.firstName} {player.athlete.lastName}</option>)}
                  </select>
                  <select name="eventType" className="rounded-lg bg-white/[.05] p-3">
                    {["REBOUND","ASSIST","STEAL","BLOCK","TURNOVER","FOUL"].map((event) => <option key={event}>{event}</option>)}
                  </select>
                  <input name="description" placeholder="Description" className="rounded-lg bg-white/[.05] p-3" />
                  <button className="col-span-2 rounded-lg border border-emerald-400/30 p-3 text-emerald-400">Record player event</button>
                </form>
              </section>
            ))}
          </div>
        ) : null}
        {game ? <section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h3 className="font-semibold">Event feed</h3><div className="mt-4 space-y-2">{game.events.map((event) => <div key={event.id} className="flex justify-between border-b border-white/[.06] py-2 text-sm"><span>{event.seasonClub.club.shortName} · {event.player ? `${event.player.athlete.firstName} ${event.player.athlete.lastName}` : "Team"} · {event.description}</span><span className="text-zinc-500">P{event.period} {Math.floor(event.clockSeconds/60)}:{(event.clockSeconds%60).toString().padStart(2,"0")}</span></div>)}</div></section> : null}
      </main>
    </OperationsShell>
  );
}

function TeamScore({ name, score }: { name: string; score: number }) {
  return <div><h2 className="text-2xl font-semibold">{name}</h2><p className="mt-4 text-6xl font-black">{score}</p></div>;
}
