import { requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { listFailureCases } from "@/lib/vision/vision-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.22 Part LII. The model-improvement backlog: every VisionObservation/VisionEventMatch a
// reviewer tagged with a structured failure category. Empty today - no real video has ever been
// analyzed in this environment, so no real failure has ever been reviewed (see
// VISION_FAILURE_CASES.md). This page is the real, functioning gallery the moment a reviewer
// starts tagging failures on real data.
export default async function VisionFailures() {
  const session = await requirePermissionOrRedirect("vision:manage", "/vision/failures");
  const { observations, matches } = await listFailureCases();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-violet-400">AI Vision</p>
        <h1 className="mt-2 text-3xl font-bold">Failure Case Gallery</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-400">
          Every tagged false positive, false negative, ID switch, calibration issue, jersey
          error, timeline error, occlusion, or ambiguous case - the real backlog for improving
          detection/tracking quality, not just a success-rate number.
        </p>

        {observations.length === 0 && matches.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">No failure cases tagged yet.</p>
        ) : null}

        {observations.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-400">Observations</h2>
            <div className="mt-3 space-y-2">
              {observations.map((o) => (
                <div key={o.id} className="rounded-xl border border-red-400/30 bg-red-400/[.04] p-3 text-xs">
                  <p className="font-bold text-red-300">{o.failureCategory}</p>
                  <p className="mt-1 text-zinc-400">{o.gameVideo.fixture.homeSeasonClub.club.shortName} vs {o.gameVideo.fixture.awaySeasonClub.club.shortName} · {o.observationType} @ {o.videoTimeMs}ms</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {matches.length > 0 ? (
          <section className="mt-8">
            <h2 className="text-sm font-bold uppercase tracking-wide text-violet-400">Event matches</h2>
            <div className="mt-3 space-y-2">
              {matches.map((m) => (
                <div key={m.id} className="rounded-xl border border-red-400/30 bg-red-400/[.04] p-3 text-xs">
                  <p className="font-bold text-red-300">{m.failureCategory}</p>
                  <p className="mt-1 text-zinc-400">{m.observation.gameVideo.fixture.homeSeasonClub.club.shortName} vs {m.observation.gameVideo.fixture.awaySeasonClub.club.shortName} — {m.gameEvent.description}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </OperationsShell>
  );
}
