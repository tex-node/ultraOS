import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { draftPersonnelReadinessReport } from "@/lib/draft-personnel-readiness";
import { withOrganizationContext } from "@/lib/tenant-context";

function badgeClass(status: string) {
  if (["READY", "PASS", "CONFIGURED"].includes(status)) return "text-brand-300";
  if (["BLOCKED", "FAIL"].includes(status)) return "text-danger";
  if (status.includes("WAITING") || status.includes("PENDING") || status.includes("NO_DRAFT_EVENT")) return "text-warn";
  return "text-text-1";
}

function Stat({ label, value, target }: { label: string; value: number | string; target?: number | string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-800 p-4">
      <p className="text-xs uppercase tracking-[.18em] text-text-3">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">
        {value}
        {target !== undefined ? <span className="text-text-3">/{target}</span> : null}
      </p>
    </div>
  );
}

export default async function DraftReadinessPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/draft-readiness");
  const { session, organizationId } = await requirePermissionWithOrganization("draft-event:read");
  const report = await withOrganizationContext(organizationId, (tx) => draftPersonnelReadinessReport(tx));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">Phase 9 Track D</p>
            <h1 className="mt-2 text-3xl font-semibold">Draft Personnel & Media Readiness</h1>
            <p className="mt-2 max-w-3xl text-sm text-text-2">
              Read-only gate for the Season Zero rehearsal layer. This page does not assign coaches, players, or clubs.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-4 text-right">
            <p className="text-xs uppercase tracking-[.18em] text-text-3">Full rehearsal gate</p>
            <p className={`mt-2 text-xl font-semibold ${badgeClass(report.gate.fullDraftRehearsal)}`}>
              {report.gate.fullDraftRehearsal.replaceAll("_", " ")}
            </p>
          </div>
        </div>

        {report.gate.blockers.length ? (
          <section className="mt-8 rounded-lg border border-rose-400/20 bg-danger/10 p-5">
            <h2 className="text-lg font-semibold text-danger">Human action or blocker required</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-rose-100">
              {report.gate.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </section>
        ) : null}

        {report.gate.warnings.length ? (
          <section className="mt-5 rounded-lg border border-warn/20 bg-warn/10 p-5">
            <h2 className="text-lg font-semibold text-warn">Warnings</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-100">
              {report.gate.warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </section>
        ) : null}

        <section className="mt-8 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Selected players" value={report.players.selected} target={58} />
          <Stat label="Main draft" value={report.players.mainDraft} target={45} />
          <Stat label="Secondary" value={report.players.secondaryDraft} target={13} />
          <Stat label="Player photos" value={report.players.photos} target={58} />
          <Stat label="Projector photos" value={report.players.projectorReadyPhotos} target={58} />
          <Stat label="SeasonClub assignments" value={report.players.seasonClubAssignments} target={0} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Player Groups</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Stat label="Men group 1" value={report.groups.men1} target={7} />
              <Stat label="Men group 2" value={report.groups.men2} target={7} />
              <Stat label="Men group 3" value={report.groups.men3} target={7} />
              <Stat label="Men group 4" value={report.groups.men4} target={7} />
              <Stat label="Women group 1" value={report.groups.women1} target={5} />
              <Stat label="Women group 2" value={report.groups.women2} target={5} />
              <Stat label="Women group 3" value={report.groups.women3} target={5} />
              <Stat label="Women group 4" value={report.groups.women4} target={5} />
            </div>
          </div>

          <div className="rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Clubs & Media</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Stat label="Permanent clubs" value={report.clubs.permanent} target={8} />
              <Stat label="SeasonClubs" value={report.clubs.seasonClubs} target={8} />
              <Stat label="Men clubs" value={report.clubs.men} target={4} />
              <Stat label="Women clubs" value={report.clubs.women} target={4} />
              <Stat label="Club logos" value={report.clubs.logosReady} target={8} />
              <Stat label="Colours pending" value={report.clubs.coloursPending} />
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Coach Selection</h2>
              <p className="mt-1 text-sm text-text-2">Approved coach applications require explicit Season Zero selection before Staff provisioning.</p>
            </div>
            <Link className="rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900" href="/coaches/season-zero-selection">
              Open selection review
            </Link>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Stat label="Approved" value={report.coaches.approvedApplications} />
            <Stat label="Selected" value={report.coaches.selected} />
            <Stat label="Pending" value={report.coaches.pending} />
            <Stat label="Provisioned Staff" value={report.coaches.provisionedStaff} />
            <Stat label="Men pool" value={report.coachPools.menAvailable} target={report.coachPools.menRequired} />
            <Stat label="Women pool" value={report.coachPools.womenAvailable} target={report.coachPools.womenRequired} />
            <Stat label="Coach photos" value={report.coaches.photosReady} target={report.coaches.selected} />
            <Stat label="Division unresolved" value={report.coaches.divisionUnresolved} />
          </div>
          <div className="mt-5 overflow-hidden rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-text-3">
                <tr><th className="p-3">Application</th><th className="p-3">Name</th><th className="p-3">Selection</th><th className="p-3">Staff</th><th className="p-3">Division preference</th></tr>
              </thead>
              <tbody>
                {report.coachApplications.map((coach) => (
                  <tr className="border-t border-line" key={coach.applicationId}>
                    <td className="p-3 text-xs text-text-3">{coach.applicationId}</td>
                    <td className="p-3 font-medium">{coach.name}</td>
                    <td className="p-3">{coach.selectionStatus.replaceAll("_", " ")}</td>
                    <td className="p-3">{coach.currentStaffLinkage}</td>
                    <td className="p-3 text-text-1">{coach.divisionPreference || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Presentation Payloads</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>Club payload: <span className={badgeClass(report.presentation.clubPayload)}>{report.presentation.clubPayload}</span></p>
              <p>Player payload: <span className={badgeClass(report.presentation.playerPayload)}>{report.presentation.playerPayload}</span></p>
              <p>Coach payload: <span className={badgeClass(report.presentation.coachPayload)}>{report.presentation.coachPayload.replaceAll("_", " ")}</span></p>
              <p>Fallbacks: <span className={badgeClass(report.presentation.fallbacks)}>{report.presentation.fallbacks}</span></p>
              <p>Public-safety review: <span className={badgeClass(report.presentation.publicSafety)}>{report.presentation.publicSafety}</span></p>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Draft System</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>Operating modes: {report.draftSystem.operatingModes}</p>
              <p>Control: <span className={badgeClass(report.draftSystem.control)}>{report.draftSystem.control.replaceAll("_", " ")}</span></p>
              <p>Display: <span className={badgeClass(report.draftSystem.display)}>{report.draftSystem.display.replaceAll("_", " ")}</span></p>
              <p>Recovery: <span className={badgeClass(report.draftSystem.recovery)}>{report.draftSystem.recovery.replaceAll("_", " ")}</span></p>
              <p>Reset: {report.draftSystem.reset.replaceAll("_", " ")}</p>
            </div>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Isolation</h2>
            <div className="mt-4 space-y-2 text-sm">
              <p>Rehearsal isolation: <span className={badgeClass(report.draftSystem.rehearsalIsolation)}>{report.draftSystem.rehearsalIsolation}</span></p>
              <p>Official allocations: 0 required</p>
              <p>Player SeasonClub assignments: 0 required</p>
              <p>Latest draft event: {report.draftSystem.latestDraftEventId ?? "None configured"}</p>
            </div>
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}
