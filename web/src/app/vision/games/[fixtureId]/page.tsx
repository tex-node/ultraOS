import Link from "next/link";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { getFixtureVisionWorkspaceData } from "@/lib/vision/vision-loader";
import { evaluateTask } from "@/lib/vision/vision-evaluation";
import { prisma } from "@/lib/prisma";
import { createAnchorAction, acceptAnchorAction, reviewObservationAction, reviewEventMatchAction, queueAnalysisRunAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.21 Part LIX. The primary internal vision workspace for one fixture: video + alignment
// anchors + analysis runs + canonical event match coverage + review queue + evaluation summary.
// No production basketball control action exists on this page - it can only write to the
// VideoTimelineAnchor/VisionAnalysisRun/VisionObservation/VisionEventMatch domain.
export default async function FixtureVisionWorkspace({ params, searchParams }: { params: Promise<{ fixtureId: string }>; searchParams: Promise<{ video?: string }> }) {
  const { fixtureId } = await params;
  const { video: videoParam } = await searchParams;
  const session = await requirePermissionOrRedirect("vision:manage", `/vision/games/${fixtureId}`);

  const fixture = await prisma.fixture.findUniqueOrThrow({
    where: { id: fixtureId },
    include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } } },
  });
  const data = await getFixtureVisionWorkspaceData(fixtureId, videoParam ?? null);
  const { videos, selected, canonicalEvents, observations, eventMatches, reviewObservations, reviewMatches } = data;

  // Coverage + evaluation over the "matched to a confirmed event" definition (Part XXXI).
  const matchedEventIds = new Set(eventMatches.filter((m) => m.reviewStatus === "CONFIRMED").map((m) => m.gameEventId));
  const evaluation = canonicalEvents.length > 0
    ? evaluateTask({
        task: "CANONICAL_EVENT_MATCH",
        outcomes: canonicalEvents.map((e) => ({ groundTruthId: e.id, matchedObservationId: matchedEventIds.has(e.id) ? e.id : null })),
        unmatchedObservations: observations.filter((o) => o.status === "REJECTED").map((o) => ({ observationId: o.id })),
      })
    : null;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-violet-400">AI Vision · Fixture Workspace</p>
        <h1 className="mt-2 text-3xl font-bold">{fixture.homeSeasonClub.club.shortName} vs {fixture.awaySeasonClub.club.shortName}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          {videos.map((v) => (
            <Link key={v.id} href={`/vision/games/${fixtureId}?video=${v.id}`} className={`rounded-lg border px-3 py-1.5 text-xs ${selected?.id === v.id ? "border-violet-400/60 bg-violet-400/10 text-violet-300" : "border-white/10 text-zinc-400"}`}>
              {v.sourceType}{v.cameraLabel ? ` (${v.cameraLabel})` : ""}
            </Link>
          ))}
          <Link href={`/games/${fixtureId}/video`} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-cyan-400">+ Register video</Link>
          <Link href="/vision/videos" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-cyan-400">Court setup</Link>
        </div>

        {!selected ? (
          <p className="mt-8 text-sm text-zinc-500">No video registered for this fixture yet.</p>
        ) : (
          <>
            <a href={`/api/vision/games/${selected.id}/export`} className="mt-3 inline-block text-xs text-cyan-400 hover:underline">Download evaluation dataset (JSONL) →</a>

            <Section title="Timeline Anchors">
              <div className="space-y-1">
                {selected.anchors.length === 0 ? <p className="text-sm text-zinc-500">No anchors yet - manual synchronization required before any alignment is possible.</p> : null}
                {selected.anchors.map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/[.08] bg-[#0b100e] px-3 py-2 text-xs">
                    <span>Video {a.videoTimeMs}ms → Period {a.period}, clock {a.gameClockSeconds}s</span>
                    <span className="flex items-center gap-2">
                      <span className={a.accepted ? "text-emerald-400" : "text-amber-400"}>{a.source}{a.accepted ? "" : " · pending review"}</span>
                      {!a.accepted ? (
                        <form action={acceptAnchorAction.bind(null, fixtureId, a.id)}>
                          <button className="rounded border border-emerald-400/30 px-2 py-0.5 text-emerald-300">Accept</button>
                        </form>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
              <form action={createAnchorAction.bind(null, fixtureId, selected.id)} className="mt-3 grid grid-cols-4 gap-2">
                <input name="videoTimeMs" type="number" required placeholder="Video ms" className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1.5 text-xs" />
                <input name="period" type="number" required placeholder="Period" className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1.5 text-xs" />
                <input name="gameClockSeconds" type="number" required placeholder="Game clock (s)" className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1.5 text-xs" />
                <button className="rounded-lg bg-violet-500 px-2 py-1.5 text-xs font-semibold text-white">Add anchor</button>
              </form>
            </Section>

            <Section title="Analysis Runs">
              <div className="space-y-1">
                {selected.analysisRuns.length === 0 ? <p className="text-sm text-zinc-500">No analysis run yet.</p> : null}
                {selected.analysisRuns.map((r) => (
                  <div key={r.id} className="rounded-lg border border-white/[.08] bg-[#0b100e] px-3 py-2 text-xs">
                    {r.visionModel.key} v{r.visionModel.version} — <span className="font-bold">{r.status}</span> · {r.observationCount} observation(s){r.errorMessage ? ` · ${r.errorMessage}` : ""}
                  </div>
                ))}
              </div>
              <form action={queueAnalysisRunAction.bind(null, fixtureId, selected.id)} className="mt-3 flex gap-2">
                <input name="modelKey" defaultValue="PLAYER_DETECTOR_V1" className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1.5 text-xs" />
                <button className="rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white">Queue analysis run</button>
              </form>
              <p className="mt-1 text-[11px] text-zinc-600">
                Queuing only creates a QUEUED VisionAnalysisRun row - actual inference runs offline via <code>npm run vision:analyze</code>, never inside this web request.
              </p>
            </Section>

            <Section title={`Canonical Event Match Coverage (${matchedEventIds.size}/${canonicalEvents.length})`}>
              {canonicalEvents.length === 0 ? (
                <p className="text-sm text-zinc-500">This game has no event-level canonical ledger to align against (BOX_SCORE_ONLY, or no game linked).</p>
              ) : (
                <div className="space-y-1">
                  {canonicalEvents.slice(0, 20).map((e) => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-white/[.08] bg-[#0b100e] px-3 py-2 text-xs">
                      <span>P{e.period} {e.clockSeconds}s — {e.description}</span>
                      <span className={matchedEventIds.has(e.id) ? "text-emerald-400" : "text-zinc-600"}>{matchedEventIds.has(e.id) ? "MATCHED" : "no vision match"}</span>
                    </div>
                  ))}
                </div>
              )}
              {evaluation ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Precision: {evaluation.precision !== null ? evaluation.precision.toFixed(2) : "—"} · Recall: {evaluation.recall !== null ? evaluation.recall.toFixed(2) : "—"} · F1: {evaluation.f1 !== null ? evaluation.f1.toFixed(2) : "—"}
                </p>
              ) : null}
            </Section>

            <Section title={`Review Queue — Observations (${reviewObservations.length})`}>
              {reviewObservations.length === 0 ? <p className="text-sm text-zinc-500">Nothing pending review.</p> : null}
              <div className="space-y-2">
                {reviewObservations.slice(0, 20).map((o) => (
                  <div key={o.id} className="rounded-lg border border-white/[.08] bg-[#0b100e] p-3 text-xs">
                    <p>{o.observationType} @ {o.videoTimeMs}ms · confidence {o.confidence.toFixed(2)}{o.jerseyCandidateNumber ? ` · jersey #${o.jerseyCandidateNumber}` : ""}</p>
                    <form action={reviewObservationAction.bind(null, fixtureId, o.id)} className="mt-2 flex flex-wrap gap-2">
                      <button name="action" value="CONFIRMED" className="rounded border border-emerald-400/30 px-2 py-1 text-emerald-300">Confirm</button>
                      <button name="action" value="REJECTED" className="rounded border border-red-400/30 px-2 py-1 text-red-300">Reject</button>
                      <button name="action" value="AMBIGUOUS" className="rounded border border-amber-400/30 px-2 py-1 text-amber-300">Mark ambiguous</button>
                    </form>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`Review Queue — Event Matches (${reviewMatches.length})`}>
              {reviewMatches.length === 0 ? <p className="text-sm text-zinc-500">Nothing pending review.</p> : null}
              <div className="space-y-2">
                {reviewMatches.slice(0, 20).map((m) => (
                  <div key={m.id} className="rounded-lg border border-white/[.08] bg-[#0b100e] p-3 text-xs">
                    <p>Observation @ {m.observation.videoTimeMs}ms ↔ &quot;{m.gameEvent.description}&quot; — {m.matchBand} ({m.confidence.toFixed(2)})</p>
                    <form action={reviewEventMatchAction.bind(null, fixtureId, m.id)} className="mt-2 flex flex-wrap gap-2">
                      <button name="action" value="CONFIRMED" className="rounded border border-emerald-400/30 px-2 py-1 text-emerald-300">Confirm match</button>
                      <button name="action" value="REJECTED" className="rounded border border-red-400/30 px-2 py-1 text-red-300">Reject</button>
                      <button name="action" value="AMBIGUOUS" className="rounded border border-amber-400/30 px-2 py-1 text-amber-300">Ambiguous</button>
                    </form>
                  </div>
                ))}
              </div>
            </Section>
          </>
        )}
      </main>
    </OperationsShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-violet-400">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}
