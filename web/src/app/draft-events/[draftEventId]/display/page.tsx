import { notFound } from "next/navigation";
import { publicDraftEventState } from "@/lib/draft-events";
import { AutoRefresh } from "./auto-refresh";

// This page has no operator interaction and must always reflect the latest
// allocation state, so it can never be served from Next.js's route cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const FALLBACK_CLUB_COLOR = "#16F2B3";

export default async function DraftDisplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ draftEventId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { draftEventId } = await params;
  const { token } = await searchParams;
  const state = await publicDraftEventState(draftEventId, token);
  if (!state) notFound();
  const latest = state.allocations.at(-1);
  const latestRevealed = latest?.seasonClub ? latest : null;
  const latestClubColor = latestRevealed?.seasonClub?.primaryColor ?? FALLBACK_CLUB_COLOR;
  const previous = state.allocations.filter((allocation) => allocation.status === "CONFIRMED" || allocation.status === "REVEALED").slice(-10);
  return (
    // h-screen + overflow-hidden pins this to exactly one 16:9 frame — nothing
    // here may ever require vertical scrolling on the projector.
    <main className="h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#12382f,#050807_55%)] p-6 text-white">
      <AutoRefresh />
      <div className="mx-auto flex h-full max-w-[1920px] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[.3em] text-emerald-300">Ultra Basketball</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight md:text-5xl">{state.publicTitle}</h1>
            <p className="mt-1 text-base text-zinc-300">{state.seasonName} - {state.stage.replaceAll("_", " ")}</p>
          </div>
          <div className="rounded-xl border border-emerald-400/30 bg-black/30 px-4 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[.2em] text-zinc-500">Status</p>
            <p className="text-lg font-bold text-emerald-300">{state.status}</p>
            <p className="text-[10px] text-zinc-500">v{state.displaySequence}</p>
          </div>
        </header>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
          {/* min-h-0 on this flex-1 panel lets it actually shrink to fit instead of pushing the page taller */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-black/30 p-6 shadow-2xl shadow-emerald-500/10">
            {!latest ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-2xl uppercase tracking-[.4em] text-emerald-300">Waiting for start</p>
                  <h2 className="mt-6 text-5xl font-black">Draft Day</h2>
                  <p className="mt-4 text-zinc-400">{state.publicMessage ?? "Operator control room is preparing the next reveal."}</p>
                </div>
              </div>
            ) : !latestRevealed ? (
              <div className="grid h-full place-items-center text-center">
                <div>
                  <p className="text-xl uppercase tracking-[.35em] text-emerald-300">{latest.divisionName} {latest.subjectType}</p>
                  <h2 className="mt-6 animate-pulse text-5xl font-black">On the clock...</h2>
                  <p className="mt-4 text-zinc-400">{state.publicMessage ?? "Result pending reveal."}</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center gap-10">
                <div className="flex shrink-0 flex-col items-center text-center" style={{ width: latestRevealed.squad ? "360px" : "auto" }}>
                  <p className="text-sm uppercase tracking-[.3em] text-emerald-300">{latestRevealed.divisionName} {latestRevealed.subjectType}</p>
                  <h2 className="mt-2 text-3xl font-black">{latestRevealed.squad?.name ?? latestRevealed.coach?.name}</h2>
                  <p className="mt-3 text-lg text-zinc-400">allocated to</p>
                  <div className="mt-4 w-full rounded-[2rem] border p-6" style={{ borderColor: latestClubColor, boxShadow: `0 0 60px ${latestClubColor}55` }}>
                    <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-3xl border text-2xl font-black" style={{ borderColor: latestClubColor, color: latestClubColor }}>
                      {latestRevealed.seasonClub!.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img alt={`${latestRevealed.seasonClub!.name} logo`} className="h-full w-full object-contain p-2" src={latestRevealed.seasonClub!.logoUrl} />
                      ) : (
                        latestRevealed.seasonClub!.shortName
                      )}
                    </div>
                    <h3 className="mt-4 text-4xl font-black">{latestRevealed.seasonClub!.name}</h3>
                    <p className="mt-2 text-base text-zinc-400">{latestRevealed.status.replaceAll("_", " ")}</p>
                  </div>
                </div>

                {latestRevealed.squad ? (
                  <div className="grid h-full min-h-0 flex-1 auto-rows-min grid-cols-2 content-center gap-3 overflow-hidden lg:grid-cols-3">
                    {latestRevealed.squad.members.map((member) => (
                      <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3" key={member.name}>
                        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-white/10 bg-black/40 text-sm font-bold text-emerald-300">
                          {member.photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img alt={member.name} className="h-full w-full object-cover" src={member.photoUrl} />
                          ) : (
                            member.name.split(" ").map((part) => part[0]).slice(0, 2).join("")
                          )}
                        </div>
                        <div>
                          <p className="text-lg font-semibold leading-tight">{member.name}</p>
                          {member.position ? <p className="text-sm text-zinc-400">{member.position}</p> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* Previous allocations: a fixed-height horizontal strip beneath the
              main reveal, not a tall growing sidebar — keeps the whole page
              within one 16:9 frame regardless of how many reveals have run. */}
          <div className="h-32 shrink-0 overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-3">
            <div className="flex h-full items-stretch gap-3">
              {previous.length === 0 ? (
                <p className="flex items-center px-2 text-sm text-zinc-500">No allocations confirmed yet.</p>
              ) : (
                previous.map((allocation) => (
                  <div className="flex w-56 shrink-0 flex-col justify-center rounded-xl border border-white/10 bg-white/[.04] p-3" key={allocation.id}>
                    <p className="truncate font-semibold">{allocation.squad?.name ?? allocation.coach?.name}</p>
                    <p className="truncate text-sm text-zinc-400">{allocation.seasonClub?.name} - {allocation.divisionName}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
