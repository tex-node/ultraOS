import Link from "next/link";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { getVisionDashboardData } from "@/lib/vision/vision-loader";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.21 Part LVIII: internal AI Vision dashboard. No production basketball control actions live
// here (Part LVIII's own instruction) - registered videos, analysis status, and review queue
// counts only.
export default async function VisionDashboard() {
  const session = await requirePermissionOrRedirect("vision:manage", "/vision");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const { videos, reviewPending, matchesPending } = await getVisionDashboardData(session.user.organizationId);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-accent-purple">AI Vision</p>
        <h1 className="mt-2 text-3xl font-bold">Vision Analysis Dashboard</h1>
        <p className="mt-2 max-w-2xl text-sm text-text-2">
          AI observes. Humans and the canonical game system verify. Nothing on this page is basketball truth until a human reviewer confirms it, and even then it stays in a separate domain from official events/stats.
        </p>
        <div className="mt-3 flex gap-3 text-xs">
          <Link href="/vision/videos" className="text-accent-purple hover:underline">Video &amp; court setup →</Link>
          <Link href="/vision/failures" className="text-accent-purple hover:underline">Failure case gallery →</Link>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-warn/30 bg-warn/[.05] p-5">
            <p className="text-xs uppercase tracking-wide text-warn">Observations pending review</p>
            <p className="mt-1 text-3xl font-black">{reviewPending}</p>
          </div>
          <div className="rounded-lg border border-warn/30 bg-warn/[.05] p-5">
            <p className="text-xs uppercase tracking-wide text-warn">Event matches pending review</p>
            <p className="mt-1 text-3xl font-black">{matchesPending}</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Registered videos</h2>
          {videos.length === 0 ? (
            <p className="mt-3 text-sm text-text-3">No game video registered yet. Register one from a fixture&apos;s video page.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {videos.map((v) => {
                const latestRun = v.analysisRuns[0];
                return (
                  <Link key={v.id} href={`/vision/games/${v.fixtureId}?video=${v.id}`} className="block rounded-md border border-line bg-ink-800 p-4 transition hover:border-accent-purple/40">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">{v.fixture.homeSeasonClub!.club.shortName} vs {v.fixture.awaySeasonClub!.club.shortName}</p>
                        <p className="text-xs text-text-3">{v.sourceType} · {v._count.observations} observation(s) · capability: {v.visionCapability}</p>
                      </div>
                      <div className="text-right text-xs text-text-3">
                        {latestRun ? <p>Last run: {latestRun.visionModel.key} — {latestRun.status}</p> : <p>No analysis run yet</p>}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
