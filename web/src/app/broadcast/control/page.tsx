import { requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { GRAPHIC_TYPES, graphicLabel, graphicRoute, type GraphicType } from "@/lib/broadcast-graphics";
import { getBroadcastPresentationState } from "@/lib/broadcast-presentation-state";
import { productionPresentationFixtureWhere } from "@/lib/presentation-scope";
import { buildLivePresentationModelForGame } from "@/lib/live-game-snapshot-v2";
import { buildGraphicSuggestions } from "@/lib/broadcast-suggestions";
import { setPreviewAction, clearPreviewAction, takeAction, clearProgramAction } from "./actions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.19 Part XXII-XXVI, XLIII. The operator presentation console: selects/TAKEs/CLEARs which
// graphic is on Program. Controls ONLY presentation state - it never writes score, clock, stats,
// records, or lineups (those consoles are /games/[fixtureId]/live and /stats, untouched).
//
// Discovery defaults to PRODUCTION live fixtures. Passing ?rehearsal=<fixtureId> explicitly
// targets one REHEARSAL-origin fixture instead (Part XLIII) - the UI makes this mode
// unmistakable (a solid fuchsia banner) so an operator can never mistake a rehearsal target for
// a real broadcast.
export default async function BroadcastControl({ searchParams }: { searchParams: Promise<{ rehearsal?: string }> }) {
  const { rehearsal: rehearsalFixtureId } = await searchParams;
  const session = await requirePermissionOrRedirect("broadcast:operate", "/broadcast/control");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;

  const { games, state } = await withOrganizationContext(organizationId, async (tx) => {
    const state = await getBroadcastPresentationState(organizationId, tx);
    const fixtures = rehearsalFixtureId
      ? await tx.fixture.findMany({
          where: { id: rehearsalFixtureId, recordOrigin: "REHEARSAL", game: { status: { in: ["LIVE", "PAUSED"] } } },
          include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
        })
      : await tx.fixture.findMany({
          where: { game: { status: { in: ["LIVE", "PAUSED"] } }, ...productionPresentationFixtureWhere() },
          include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
        });
    const games = await Promise.all(fixtures.map(async (f) => ({ fixture: f, model: await buildLivePresentationModelForGame(f.game!.id, tx) })));
    return { fixtures, games, state };
  });

  const rehearsalMode = Boolean(rehearsalFixtureId);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        {rehearsalMode ? (
          <div className="mb-6 rounded-xl border-2 border-fuchsia-400 bg-fuchsia-400/10 px-4 py-3">
            <p className="text-sm font-black uppercase tracking-widest text-fuchsia-300">⚠ Rehearsal mode — not a real broadcast</p>
          </div>
        ) : null}
        <p className="text-xs uppercase tracking-[.2em] text-cyan-400">Broadcast</p>
        <h1 className="mt-2 text-3xl font-bold">Broadcast Control</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          Selects what browser-source graphics show. Score, clock, and stats are controlled elsewhere and cannot be changed here.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <StateCard title="Preview" slot={state.preview} games={games} />
          <StateCard title="Program · ON AIR" slot={state.program} games={games} onAir />
        </div>

        <div className="mt-4 flex gap-3">
          <form action={takeAction}><button className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-black text-black hover:bg-emerald-400">TAKE →</button></form>
          <form action={clearProgramAction}><button className="rounded-lg border border-red-400/40 px-5 py-2 text-sm font-bold text-red-300 hover:bg-red-400/10">CLEAR PROGRAM</button></form>
          <form action={clearPreviewAction}><button className="rounded-lg border border-white/15 px-5 py-2 text-sm text-zinc-400 hover:bg-white/5">Clear preview</button></form>
        </div>

        {games.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">
            {rehearsalMode ? "No LIVE/PAUSED rehearsal fixture with that id." : "No live production game right now."}
          </p>
        ) : (
          games.map(({ fixture, model }) => (
            <section key={fixture.id} className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <p className="text-sm font-bold">{fixture.homeSeasonClub.club.shortName} {model.score.home} — {model.score.away} {fixture.awaySeasonClub.club.shortName}</p>

              <Suggestions gameId={fixture.game!.id} model={model} />

              <p className="mt-4 text-[10px] uppercase tracking-wide text-zinc-600">Select for preview</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {GRAPHIC_TYPES.filter((g) => !g.needsSubject).map((g) => (
                  <form key={g.type} action={setPreviewAction.bind(null, fixture.game!.id, g.type, null)}>
                    <button className="rounded-lg border border-cyan-400/30 bg-cyan-400/[.06] px-3 py-1.5 text-xs font-bold text-cyan-300 hover:border-cyan-400/60">{g.label}</button>
                  </form>
                ))}
              </div>

              {model.players.length > 0 ? (
                <>
                  <p className="mt-4 text-[10px] uppercase tracking-wide text-zinc-600">Player Spotlight</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {model.players.slice(0, 10).map((p) => (
                      <form key={p.playerId} action={setPreviewAction.bind(null, fixture.game!.id, "PLAYER_SPOTLIGHT" as GraphicType, p.playerId)}>
                        <button className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-zinc-300 hover:border-white/40">{p.points} PTS · {p.seasonClubId === model.teams.home.seasonClubId ? fixture.homeSeasonClub.club.shortName : fixture.awaySeasonClub.club.shortName}</button>
                      </form>
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          ))
        )}
      </main>
    </OperationsShell>
  );
}

function StateCard({ title, slot, games, onAir = false }: { title: string; slot: { graphicType: GraphicType; gameId: string; subjectId: string | null } | null; games: { fixture: { id: string; game: { id: string } | null }; model: unknown }[]; onAir?: boolean }) {
  const gameFixtureId = slot ? games.find((g) => g.fixture.game?.id === slot.gameId)?.fixture.id : null;
  return (
    <div className={`rounded-2xl border p-5 ${onAir ? "border-red-400/40 bg-red-400/[.04]" : "border-white/[.08] bg-[#0b100e]"}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wider ${onAir ? "text-red-400" : "text-zinc-500"}`}>{title}</p>
      {slot ? (
        <>
          <p className="mt-2 text-lg font-bold">{graphicLabel(slot.graphicType)}</p>
          {gameFixtureId ? <a href={graphicRoute(slot.graphicType, slot.gameId) + (slot.subjectId ? `?playerId=${slot.subjectId}` : "")} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-cyan-400 hover:underline">Open browser source →</a> : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-zinc-600">Empty</p>
      )}
    </div>
  );
}

function Suggestions({ gameId, model }: { gameId: string; model: import("@/lib/live-presentation-model").LivePresentationModel }) {
  const suggestions = buildGraphicSuggestions(model);
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-cyan-400/20 bg-cyan-400/[.04] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-300">Suggested</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {suggestions.map((s, i) => (
          <form key={i} action={setPreviewAction.bind(null, gameId, s.graphicType, s.subjectId)}>
            <button className="rounded-lg border border-cyan-400/30 px-2.5 py-1 text-[11px] text-cyan-200 hover:bg-cyan-400/10">{graphicLabel(s.graphicType)} — {s.reason}</button>
          </form>
        ))}
      </div>
    </div>
  );
}
