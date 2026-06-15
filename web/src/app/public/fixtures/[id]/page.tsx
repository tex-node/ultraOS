import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function Match({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fixture = await prisma.fixture.findUnique({
    where: { id },
    include: {
      homeSeasonClub: { include: { club: true } },
      awaySeasonClub: { include: { club: true } },
      venue: true,
      game: {
        include: {
          events: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: {
              player: { include: { athlete: true } },
              seasonClub: { include: { club: true } },
            },
          },
          playerStats: {
            orderBy: { points: "desc" },
            include: { player: { include: { athlete: true } } },
          },
        },
      },
    },
  });
  if (!fixture) notFound();
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <section className="rounded-3xl border border-white/[.08] bg-[#0b100e] p-8 text-center">
        <p className="text-emerald-400">{fixture.status}</p>
        <div className="mt-8 grid grid-cols-[1fr_auto_1fr] items-center">
          <MatchTeam name={fixture.homeSeasonClub.club.name} score={fixture.homeScore} />
          <span className="text-zinc-500">VS</span>
          <MatchTeam name={fixture.awaySeasonClub.club.name} score={fixture.awayScore} />
        </div>
        <p className="mt-8 text-zinc-400">
          {fixture.scheduledAt.toLocaleString()} · {fixture.venue.name}
        </p>
        {fixture.game && fixture.status === "LIVE" ? (
          <Link href={`/scoreboard/${fixture.game.id}`} className="mt-5 inline-block text-emerald-400">
            Full-screen scoreboard
          </Link>
        ) : null}
      </section>
      {fixture.game ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section>
            <h2 className="text-xl font-semibold">Top players</h2>
            {fixture.game.playerStats.map((stat) => (
              <p key={stat.id} className="mt-2 rounded-lg bg-white/[.04] p-3">
                {stat.player.athlete.firstName} {stat.player.athlete.lastName} · {stat.points} PTS
              </p>
            ))}
          </section>
          <section>
            <h2 className="text-xl font-semibold">Timeline</h2>
            {fixture.game.events.map((event) => (
              <p key={event.id} className="mt-2 rounded-lg bg-white/[.04] p-3">
                {event.seasonClub.club.shortName} · {event.description}
              </p>
            ))}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function MatchTeam({ name, score }: { name: string; score: number }) {
  return <div><h1 className="text-3xl font-bold">{name}</h1><p className="mt-4 text-7xl font-black">{score}</p></div>;
}
