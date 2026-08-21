import Link from "next/link";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { listGameVideosForFixture } from "@/lib/vision/vision-loader";
import { prisma } from "@/lib/prisma";
import { registerGameVideoAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.21 Part VI: video ingestion workflow for one fixture. Registers an EXISTING MediaAsset
// (already uploaded through some other means - see actions.ts's comment on why a new large-file
// upload path wasn't built this track) as a GameVideo. Never auto-runs analysis on registration
// (Part VI: "Do not automatically run AI analysis on upload unless explicitly requested") - that
// is a separate, explicit action on the fixture vision workspace (/vision/games/[fixtureId]).
export default async function GameVideoRegistry({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  const session = await requirePermissionOrRedirect("vision:manage", `/games/${fixtureId}/video`);

  const fixture = await prisma.fixture.findUniqueOrThrow({
    where: { id: fixtureId },
    include: { homeSeasonClub: { include: { club: true } }, awaySeasonClub: { include: { club: true } }, game: true },
  });
  const videos = await listGameVideosForFixture(fixtureId);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-violet-400">Vision · Video Registry</p>
        <h1 className="mt-2 text-3xl font-bold">
          {fixture.homeSeasonClub.club.shortName} vs {fixture.awaySeasonClub.club.shortName}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">Register game video for AI vision analysis. This never overwrites basketball truth.</p>

        <form action={registerGameVideoAction.bind(null, fixtureId)} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-wide text-zinc-500">Existing MediaAsset ID</label>
            <input name="mediaAssetId" required className="mt-1 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-2.5 text-sm" placeholder="cm..." />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-zinc-500">Source type</label>
            <select name="sourceType" className="mt-1 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-2.5 text-sm" defaultValue="FULL_GAME">
              {["FULL_GAME", "CAMERA_ISO", "BROADCAST_PROGRAM", "PHONE_RECORDING", "TRAINING_CLIP", "HIGHLIGHT_CLIP"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-zinc-500">Camera label (optional)</label>
            <input name="cameraLabel" className="mt-1 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-2.5 text-sm" placeholder="Baseline, sideline, ..." />
          </div>
          <input type="hidden" name="gameId" value={fixture.game?.id ?? ""} />
          <div className="flex items-end">
            <button className="rounded-xl bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white">Register video</button>
          </div>
        </form>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Registered videos</h2>
          {videos.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No video registered for this fixture yet.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {videos.map((v) => (
                <div key={v.id} className="rounded-xl border border-white/[.08] bg-[#0b100e] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{v.sourceType}{v.cameraLabel ? ` · ${v.cameraLabel}` : ""}</p>
                      <p className="text-xs text-zinc-500">
                        {v.anchors.length} timeline anchor(s) · {v._count.observations} observation(s) · vision: {v.visionCapability}
                      </p>
                    </div>
                    <Link href={`/vision/games/${fixtureId}?video=${v.id}`} className="rounded-lg border border-violet-400/30 px-3 py-1.5 text-xs font-bold text-violet-300 hover:bg-violet-400/10">
                      Open vision workspace →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
