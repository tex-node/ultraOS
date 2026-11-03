import Link from "next/link";
import { notFound } from "next/navigation";
import {
  pauseGame,
  recordScore,
  resumeGame,
  startGame,
  undoLastEvent,
} from "@/app/games/actions";
import { requireFixturePermissionOrRedirect } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tablet-first capture viewport (spec §1, §2): 56px touch targets, two team columns, the score, and the three actions a
// courtside scorer actually needs - score, undo, clock. Everything else lives in /games/[fixtureId]/live, one deliberate tap
// away, so this screen cannot be lost in tabs.
//
// Scoring here is TEAM-level (no player attribution): the pad must work when the roster is unknown or the scorer is keeping
// up with a fast break. Player attribution happens on the full console, which is where a scorer has time to pick a name.
const POINTS = [1, 2, 3];
const REASONS: Record<number, string> = { 1: "Free throw", 2: "Two pointer", 3: "Three pointer" };

export default async function CaptureConsolePage({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  // Signature is (permission, fixtureId, loginRedirectTo) - the fixture id is the second argument, not folded into the path.
  const { organizationId } = await requireFixturePermissionOrRedirect("game:operate", fixtureId, `/gameday/console/${fixtureId}`);

  const fixture = await withOrganizationContext(organizationId, (tx) =>
    tx.fixture.findFirst({
      where: { id: fixtureId },
      include: {
        venue: { select: { name: true } },
        homeSeasonClub: { select: { id: true, club: { select: { name: true, shortName: true } } } },
        awaySeasonClub: { select: { id: true, club: { select: { name: true, shortName: true } } } },
        game: { select: { id: true, status: true, currentPeriod: true } },
      },
    }),
  );
  if (!fixture || !fixture.game) notFound();

  const game = fixture.game;
  const live = game.status === "LIVE";
  const teams = [
    { side: "home" as const, club: fixture.homeSeasonClub, score: fixture.homeScore },
    { side: "away" as const, club: fixture.awaySeasonClub, score: fixture.awayScore },
  ];
  const recordScoreBound = recordScore.bind(null, game.id, fixtureId);

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-brand-400">Capture · {game.status}</p>
          <h1 className="truncate font-display text-lg font-semibold">
            {fixture.homeSeasonClub?.club.shortName} v {fixture.awaySeasonClub?.club.shortName}
          </h1>
          <p className="truncate text-xs text-text-3">
            {fixture.venue?.name} · Period {game.currentPeriod}
          </p>
        </div>
        <Link
          href={`/games/${fixtureId}/live`}
          className="shrink-0 rounded-md border border-line px-3 py-2 text-xs text-text-2"
        >
          Full console
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-3" aria-label="Score">
        {teams.map(({ side, club, score }) => (
          <div key={side} className="rounded-xl border border-line bg-ink-800 p-4 text-center">
            <p className="truncate text-xs uppercase tracking-[0.18em] text-text-3">{club?.club.name ?? side}</p>
            <p className="mt-1 font-display text-5xl font-bold tabular-nums">{score ?? 0}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3" aria-label="Score a basket">
        {teams.map(({ side, club }) => (
          <div key={side} className="rounded-xl border border-line bg-ink-800 p-3">
            <p className="mb-2 text-center text-xs uppercase tracking-[0.18em] text-text-3">{club?.club.shortName ?? side}</p>
            <div className="grid grid-cols-3 gap-2">
              {POINTS.map((points) => (
                <form key={points} action={recordScoreBound} className="m-0">
                  <input type="hidden" name="seasonClubId" value={club?.id ?? ""} />
                  <input type="hidden" name="playerId" value="" />
                  <input type="hidden" name="points" value={points} />
                  <input type="hidden" name="description" value={REASONS[points]} />
                  <button
                    type="submit"
                    disabled={!live}
                    aria-label={`${points} ${points === 1 ? "point" : "points"} for ${club?.club.name ?? side}`}
                    className="h-16 w-full rounded-lg bg-brand-400 text-xl font-bold text-ink-900 transition hover:bg-brand-300 disabled:opacity-40"
                  >
                    +{points}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <form action={undoLastEvent.bind(null, game.id, fixtureId)} className="m-0">
          <button
            type="submit"
            disabled={!live}
            className="h-14 w-full rounded-lg border border-warn/40 bg-warn/10 text-sm font-semibold text-warn disabled:opacity-40"
          >
            Undo last event
          </button>
        </form>
        {live ? (
          <form action={pauseGame.bind(null, game.id, fixtureId)} className="m-0">
            <button type="submit" className="h-14 w-full rounded-lg border border-line text-sm font-semibold text-text-2">
              Pause clock
            </button>
          </form>
        ) : game.status === "NOT_STARTED" ? (
          <form action={startGame.bind(null, fixtureId)} className="m-0">
            <button type="submit" className="h-14 w-full rounded-lg bg-info/20 text-sm font-semibold text-info">
              Start game
            </button>
          </form>
        ) : (
          <form action={resumeGame.bind(null, game.id, fixtureId)} className="m-0">
            <button type="submit" className="h-14 w-full rounded-lg bg-brand-400/20 text-sm font-semibold text-brand-300">
              Resume clock
            </button>
          </form>
        )}
      </section>

      <p className="mt-auto text-center text-[11px] text-text-3">
        Team-level capture. Player attribution and shot charts are on the full console.
      </p>
    </main>
  );
}
