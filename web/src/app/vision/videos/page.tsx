import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { getVisionDashboardData, listCourtSpecifications } from "@/lib/vision/vision-loader";
import { withOrganizationContext } from "@/lib/tenant-context";
import { createDraftCourtSpecAction, updateDraftCourtSpecAction, markCourtSpecOfficialAction, setAttackingDirectionAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.22 Part XV. The video registration workflow + Part IV-V's court specification
// configuration - grouped on one page since both are "vision setup," neither production
// basketball control. Registering a video here never invents technical metadata (Part IX-X); a
// court specification here never invents geometry (Part IV) - every numeric field starts null
// and stays null until an operator who actually knows the real value enters it.
export default async function VisionVideos() {
  const session = await requirePermissionOrRedirect("vision:manage", "/vision/videos");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;
  const [{ videos }, courtSpecs, venues] = await Promise.all([
    getVisionDashboardData(organizationId),
    listCourtSpecifications(organizationId),
    withOrganizationContext(organizationId, (tx) => tx.venue.findMany({ orderBy: { name: "asc" } })),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.2em] text-accent-purple">AI Vision</p>
        <h1 className="mt-2 text-3xl font-bold">Video &amp; Court Setup</h1>

        <section className="mt-8">
          <h2 className="text-lg font-semibold">Registered videos</h2>
          <p className="mt-1 text-xs text-text-3">
            Register a video from a fixture&apos;s video page (<code>/games/[fixtureId]/video</code>).
            This page shows ingest status across every registered video.
          </p>
          {videos.length === 0 ? (
            <p className="mt-3 text-sm text-text-3">No video registered yet. See VIDEO_INGESTION_PIPELINE.md for the requirement to register a real Ultra Basketball clip before any empirical vision work can proceed.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {videos.map((v) => (
                <div key={v.id} className="rounded-md border border-line bg-ink-800 p-4 text-sm">
                  <p className="font-semibold">{v.fixture.homeSeasonClub!.club.shortName} vs {v.fixture.awaySeasonClub!.club.shortName} — {v.sourceType}</p>
                  <p className="mt-1 text-xs text-text-3">
                    Ingest: <span className="font-bold text-warn">{v.ingestStatus}</span>
                    {v.codec ? ` · ${v.codec}` : ""}{v.durationSeconds ? ` · ${Math.round(v.durationSeconds / 60)}min` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Court specifications</h2>
          <p className="mt-1 text-xs text-text-3">
            Physical court geometry, per venue. A DRAFT specification is never used for spatial
            evaluation (4PT qualification, zones) - only an explicit OFFICIAL one. No value here
            is ever pre-filled with a guess.
          </p>

          <form action={createDraftCourtSpecAction} className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-ink-800 p-4">
            <div>
              <label className="text-xs uppercase tracking-wide text-text-3">Venue</label>
              <select name="venueId" required className="mt-1 rounded-lg border border-line bg-ink-900 px-3 py-2 text-sm">
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <button className="rounded-lg bg-accent-purple px-3 py-2 text-xs font-semibold text-white">New draft specification</button>
          </form>

          <div className="mt-4 space-y-3">
            {courtSpecs.length === 0 ? <p className="text-sm text-text-3">No court specification created yet.</p> : null}
            {courtSpecs.map((spec) => (
              <div key={spec.id} className={`rounded-md border p-4 text-sm ${spec.status === "OFFICIAL" ? "border-brand-400/40 bg-brand-400/[.04]" : "border-warn/30 bg-amber-400/[.04]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{spec.venue.name} · v{spec.version} · <span className={spec.status === "OFFICIAL" ? "text-brand-300" : "text-warn"}>{spec.status}</span></p>
                  {spec.status === "DRAFT" ? (
                    <form action={markCourtSpecOfficialAction.bind(null, spec.id)}>
                      <button className="rounded border border-brand-400/30 px-2 py-1 text-xs text-brand-300">Mark OFFICIAL</button>
                    </form>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-text-3">
                  Length: {spec.courtLengthUnits ?? "unknown"} {spec.units} · Width: {spec.courtWidthUnits ?? "unknown"} {spec.units} · Half-court X: {spec.halfCourtX ?? "unknown"}
                </p>
                {spec.status === "DRAFT" ? (
                  <form action={updateDraftCourtSpecAction.bind(null, spec.id)} className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    <input name="courtLengthUnits" type="number" step="any" placeholder="Length" defaultValue={spec.courtLengthUnits ?? ""} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs" />
                    <input name="courtWidthUnits" type="number" step="any" placeholder="Width" defaultValue={spec.courtWidthUnits ?? ""} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs" />
                    <input name="halfCourtX" type="number" step="any" placeholder="Half-court X" defaultValue={spec.halfCourtX ?? ""} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs" />
                    <input name="basketACourtX" type="number" step="any" placeholder="Basket A X" defaultValue={spec.basketACourtX ?? ""} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs" />
                    <input name="basketBCourtX" type="number" step="any" placeholder="Basket B X" defaultValue={spec.basketBCourtX ?? ""} className="rounded border border-line bg-ink-900 px-2 py-1 text-xs" />
                    <button className="rounded bg-accent-purple px-2 py-1 text-xs font-semibold text-white">Save</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Attacking direction</h2>
          <p className="mt-1 text-xs text-text-3">
            Which basket the home team attacks in the first half - required for any spatial
            interpretation (4PT qualification, zone occupancy). Set per game from the video page;
            never guessed.
          </p>
          {videos.filter((v) => v.gameId).map((v) => (
            <form key={v.gameId} action={setAttackingDirectionAction.bind(null, v.gameId!)} className="mt-2 flex items-center gap-2 text-xs">
              <span>{v.fixture.homeSeasonClub!.club.shortName} vs {v.fixture.awaySeasonClub!.club.shortName}:</span>
              <select name="homeAttacksBasketFirstHalf" className="rounded border border-line bg-ink-900 px-2 py-1">
                <option value="A">Home attacks basket A first half</option>
                <option value="B">Home attacks basket B first half</option>
              </select>
              <button className="rounded border border-accent-purple/30 px-2 py-1 text-accent-purple">Set</button>
            </form>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}
