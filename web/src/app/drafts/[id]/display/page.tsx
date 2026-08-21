import { notFound } from "next/navigation";
import { publicSecondaryDraftState } from "@/lib/draft-events";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FALLBACK_CLUB_COLOR = "#16F2B3";

export default async function SecondaryDraftDisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { id } = await params;
  const { token } = await searchParams;
  const state = await publicSecondaryDraftState(id, token);
  if (!state) notFound();
  const revealedPicks = state.picks.filter((pick) => pick.status === "REVEALED" || pick.status === "CONFIRMED");
  const latest = state.picks.at(-1);
  const latestRevealed = latest && (latest.status === "REVEALED" || latest.status === "CONFIRMED") ? latest : null;
  const latestClubColor = FALLBACK_CLUB_COLOR;

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#12382f,#050807_55%)] p-8 text-white">
      <AutoRefresh />
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl flex-col">
        <header>
          <p className="text-sm uppercase tracking-[.35em] text-emerald-300">Ultra Basketball — Secondary Draft</p>
          <h1 className="mt-4 text-6xl font-black tracking-tight md:text-8xl">{state.name}</h1>
          <p className="mt-3 text-xl text-zinc-300">{state.seasonName} - {state.status}</p>
        </header>

        <section className="mt-10 grid flex-1 gap-6 lg:grid-cols-[1fr_420px]">
          <div className="rounded-[2rem] border border-white/10 bg-black/30 p-8 shadow-2xl shadow-emerald-500/10">
            {!latest ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-2xl uppercase tracking-[.4em] text-emerald-300">Waiting for start</p>
                  <h2 className="mt-6 text-5xl font-black">Secondary Draft</h2>
                </div>
              </div>
            ) : !latestRevealed ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-xl uppercase tracking-[.35em] text-emerald-300">Pick #{latest.pickNumber}</p>
                  <h2 className="mt-6 animate-pulse text-5xl font-black">On the clock...</h2>
                  <p className="mt-4 text-zinc-400">Result pending reveal.</p>
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-xl uppercase tracking-[.35em] text-emerald-300">Pick #{latestRevealed.pickNumber}</p>
                  <h2 className="mt-6 text-6xl font-black">{latestRevealed.player!.name}</h2>
                  <p className="mt-8 text-3xl text-zinc-400">selected by</p>
                  <div className="mx-auto mt-8 max-w-2xl rounded-[2rem] border p-8" style={{ borderColor: latestClubColor, boxShadow: `0 0 60px ${latestClubColor}55` }}>
                    <div className="mx-auto grid h-24 w-24 place-items-center overflow-hidden rounded-3xl border text-3xl font-black" style={{ borderColor: latestClubColor, color: latestClubColor }}>
                      {latestRevealed.seasonClub!.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`${latestRevealed.seasonClub!.name} logo`} className="h-full w-full object-contain p-2" src={latestRevealed.seasonClub!.logoUrl} />
                      ) : (
                        latestRevealed.seasonClub!.shortName
                      )}
                    </div>
                    <h3 className="mt-6 text-7xl font-black">{latestRevealed.seasonClub!.name}</h3>
                    <p className="mt-3 text-xl text-zinc-400">{latestRevealed.status.replaceAll("_", " ")}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-[2rem] border border-white/10 bg-black/30 p-6">
            <h2 className="text-xl font-bold">Previous picks</h2>
            <div className="mt-5 space-y-3">
              {revealedPicks.slice(-8).map((pick) => (
                <div className="rounded-2xl border border-white/10 bg-white/[.04] p-4" key={pick.id}>
                  <p className="font-semibold">#{pick.pickNumber} {pick.player?.name}</p>
                  <p className="text-sm text-zinc-400">{pick.seasonClub?.name}</p>
                </div>
              ))}
              {revealedPicks.length === 0 ? <p className="text-sm text-zinc-500">No picks revealed yet.</p> : null}
            </div>
          </aside>
        </section>
      </section>
    </main>
  );
}
