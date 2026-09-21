import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createLaunchReadinessCheck, updateLaunchReadinessCheckStatus } from "@/app/operations/actions";
import { LaunchBlockerPriority, OpsHealthStatus, OpsItemStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { seasonZeroReadinessReport } from "@/lib/season-zero-readiness";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function LaunchReadinessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/launch-readiness");
  if (!hasPermission(session.user.roles, "operations:view")) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  if (!session.user.organizationId) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  }
  const [report, checks] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([
    seasonZeroReadinessReport(tx),
    tx.launchReadinessCheck.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "desc" }], take: 50 }),
  ]));
  const seasonId = report.configuration.season?.id ?? "";
  const eventOps = report.eventReadiness && "seatZones" in report.eventReadiness ? report.eventReadiness : null;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-brand-400">Season Zero Launch</p>
            <h1 className="mt-2 text-3xl font-semibold">Launch Readiness</h1>
            <p className="mt-2 text-sm text-text-2">Generated {new Date(report.generatedAt).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })}. Sensitive applicant details are excluded.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/operations">Command Center</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/launch-readiness/report">JSON report</Link>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="Recommendation" value={report.recommendation} status={report.recommendation === "READY" ? OpsHealthStatus.GREEN : report.recommendation === "NOT READY" ? OpsHealthStatus.RED : OpsHealthStatus.AMBER} />
          <Metric label="Open P0" value={report.launchBlockers.p0} status={report.launchBlockers.p0 > 0 ? OpsHealthStatus.RED : OpsHealthStatus.GREEN} />
          <Metric label="Open P1" value={report.launchBlockers.p1} status={report.launchBlockers.p1 > 0 ? OpsHealthStatus.AMBER : OpsHealthStatus.GREEN} />
          <Metric label="GO_LIVE_READY" value={report.canMarkGoLiveReady ? "Allowed" : "Blocked"} status={report.canMarkGoLiveReady ? OpsHealthStatus.GREEN : OpsHealthStatus.RED} />
        </section>

        <section className="mt-8 grid gap-5 xl:grid-cols-2">
          <Panel title="Configuration">
            <ReadinessLine label="Missing production configuration" value={report.configuration.missing.length} bad={report.configuration.missing.length > 0} />
            <ReadinessLine label="Content templates" value={report.configuration.contentTemplateCount} />
            <p className="mt-3 text-xs text-text-3">{report.configuration.missing.length ? report.configuration.missing.join(", ") : "Competition, Season Zero, divisions, settings, and content templates are present."}</p>
          </Panel>
          <Panel title="Real Data Baseline">
            <ReadinessLine label="Clubs" value={report.realData.clubs} />
            <ReadinessLine label="SeasonClubs" value={report.realData.seasonClubs} />
            <ReadinessLine label="Athletes" value={report.realData.athletes} />
            <ReadinessLine label="Players" value={report.realData.players} />
            <ReadinessLine label="Demo records detected" value={Object.values(report.demoData).reduce((sum, count) => sum + count, 0)} bad={Object.values(report.demoData).some(Boolean)} />
          </Panel>
          <Panel title="Clubs and Rosters">
            <ReadinessLine label="Club identities ready" value={`${report.clubReadiness?.ready ?? 0}/${report.clubReadiness?.total ?? 0}`} bad={(report.clubReadiness?.incomplete ?? 0) > 0} />
            <ReadinessLine label="Missing player photos" value={report.playerReadiness?.missingPhotos ?? "n/a"} bad={(report.playerReadiness?.missingPhotos ?? 0) > 0} />
            <ReadinessLine label="Missing measurements" value={report.playerReadiness?.missingMeasurements ?? "n/a"} bad={(report.playerReadiness?.missingMeasurements ?? 0) > 0} />
            <ReadinessLine label="Duplicate squad memberships" value={report.playerReadiness?.duplicateSquadMemberships ?? "n/a"} bad={(report.playerReadiness?.duplicateSquadMemberships ?? 0) > 0} />
          </Panel>
          <Panel title="Draft, Event, Staff">
            <ReadinessLine label="DraftEvent configured" value={report.draftReadiness?.configured ? "Yes" : "No"} bad={!report.draftReadiness?.configured} />
            <ReadinessLine label="Draft squads" value={report.draftReadiness?.squads ?? 0} />
            <ReadinessLine label="Event configured" value={report.eventReadiness?.configured ? "Yes" : "No"} bad={!report.eventReadiness?.configured} />
            <ReadinessLine label="Staff assignments missing person" value={report.staffReadiness.missingPeople} bad={report.staffReadiness.missingPeople > 0} />
          </Panel>
          <Panel title="Event Operations">
            <ReadinessLine label="Seat zones" value={eventOps?.seatZones ?? "n/a"} />
            <ReadinessLine label="Vendor inventory items" value={eventOps?.inventoryItems ?? "n/a"} />
            <ReadinessLine label="Sponsor campaigns" value={eventOps?.sponsorCampaigns ?? "n/a"} />
            <ReadinessLine label="Equipment issues" value={report.equipmentStatus.issues} bad={report.equipmentStatus.issues > 0} />
          </Panel>
          <Panel title="Rehearsal, Backup, Performance">
            <ReadinessLine label="Rehearsals recorded" value={report.rehearsalStatus.completedOrRecorded} bad={report.rehearsalStatus.completedOrRecorded < 3} />
            <ReadinessLine label="Backup documents" value={report.backupRecoveryStatus.documents} bad={report.backupRecoveryStatus.documents === 0} />
            <ReadinessLine label="Performance documents" value={report.performanceStatus.documents} bad={report.performanceStatus.documents === 0} />
          </Panel>
        </section>

        {hasPermission(session.user.roles, "operations:manage") ? (
          <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
            <h2 className="text-xl font-semibold">Add Launch Blocker</h2>
            <form action={createLaunchReadinessCheck} className="mt-4 grid gap-3 md:grid-cols-[150px_140px_1fr_auto]">
              <input type="hidden" name="seasonId" value={seasonId} />
              <select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="priority" defaultValue={LaunchBlockerPriority.P2}>{Object.values(LaunchBlockerPriority).map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select>
              <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="category" placeholder="Category" required />
              <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="title" placeholder="Blocker title" required />
              <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Add</button>
              <textarea className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm md:col-span-4" name="details" placeholder="Decision notes, workaround, owner, evidence required" />
            </form>
          </section>
        ) : null}

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-xl font-semibold">Open and Recent Readiness Checks</h2>
          <div className="mt-4 grid gap-3">
            {checks.map((check) => (
              <article className="rounded-md border border-line bg-black/20 p-4" key={check.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[.18em] text-text-3">{check.priority} | {check.category} | {check.status}</p>
                    <h3 className="mt-1 font-semibold">{check.title}</h3>
                    {check.details ? <p className="mt-2 text-sm text-text-2">{check.details}</p> : null}
                  </div>
                  {hasPermission(session.user.roles, "operations:manage") ? (
                    <form action={updateLaunchReadinessCheckStatus.bind(null, check.id)} className="flex flex-wrap gap-2">
                      <select className="rounded-md border border-line bg-ink-900 px-3 py-2 text-sm" name="status" defaultValue={check.status}>{Object.values(OpsItemStatus).map((status) => <option key={status} value={status}>{status}</option>)}</select>
                      <button className="rounded-md border border-line px-3 py-2 text-sm">Update</button>
                    </form>
                  ) : null}
                </div>
              </article>
            ))}
            {checks.length === 0 ? <p className="text-sm text-text-3">No readiness checks recorded yet.</p> : null}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value, status }: { label: string; value: string | number; status: OpsHealthStatus }) {
  return <div className="rounded-lg border border-line bg-ink-800 p-5"><p className="text-sm text-text-2">{label}</p><p className={`mt-2 text-2xl font-semibold ${status === OpsHealthStatus.RED ? "text-danger" : status === OpsHealthStatus.AMBER ? "text-warn" : "text-brand-300"}`}>{value}</p></div>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-lg border border-line bg-ink-800 p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 grid gap-2">{children}</div></section>;
}

function ReadinessLine({ label, value, bad = false }: { label: string; value: string | number; bad?: boolean }) {
  return <div className="flex justify-between gap-4 rounded-md border border-line bg-black/20 px-4 py-3 text-sm"><span className="text-text-2">{label}</span><span className={bad ? "font-semibold text-danger" : "font-semibold text-brand-300"}>{value}</span></div>;
}
