import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { resolveDraftCohortRow, reviewDraftCohortApplication } from "@/app/draft-cohort/actions";
import { OperationsShell } from "@/app/components/operations-shell";
import { ApplicationStatus } from "@/generated/prisma/enums";
import { cohortApplicationReviewActions, cohortRowResolutionActions, draftCohortAnalysis } from "@/lib/draft-cohort";
import { draftSquadCapacityConfig, targetSizeForGender } from "@/lib/draft-squad-capacity";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

const filters = ["All", "Safe", "Duplicate Blocked", "Ambiguous", "Unmatched", "Pending Approval", "Admin Intake Required", "Excluded", "Ready", "Provisioned"] as const;

export default async function DraftCohortPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter = "All" } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/draft-cohort");
  let authorizedSession;
  let organizationId: string;
  try {
    ({ session: authorizedSession, organizationId } = await requirePermissionWithOrganization("application:review"));
  } catch {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }

  const [applications, config, analysis] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.application.findMany({ select: { id: true, type: true, status: true } }),
    draftSquadCapacityConfig(tx),
    draftCohortAnalysis(tx, organizationId),
  ]));
  const rows = analysis.rows;
  const visibleRows = filterRows(rows, filter);
  const menTarget = targetSizeForGender(config, "men");
  const womenTarget = targetSizeForGender(config, "women");
  const groupRows = [
    ...[1, 2, 3, 4].map((sequence) => groupSummary(rows, "Male", sequence, menTarget)),
    ...[1, 2, 3, 4].map((sequence) => groupSummary(rows, "Female", sequence, womenTarget)),
  ];
  const readyForMetadata = rows.filter((row) => row.matchType === "READY" || row.matchType === "SAFE").length;
  const pendingApproval = rows.filter((row) => row.matchType === "PENDING_APPROVAL").length;
  const rejectedSelected = rows.filter((row) => row.applicationStatus === ApplicationStatus.REJECTED && row.matchType !== "EXCLUDED").length;
  const rejectedRows = rows.filter((row) => row.applicationStatus === ApplicationStatus.REJECTED && row.matchType !== "EXCLUDED");
  const rejectedApplications = rejectedRows.length
    ? await withOrganizationContext(organizationId, (tx) => tx.application.findMany({
      where: { id: { in: rejectedRows.map((row) => row.matchedApplicationId ?? row.applicationId).filter(Boolean) } },
      select: { id: true, notes: true, submittedData: true, createdAt: true, updatedAt: true },
    }))
    : [];
  const rejectedApplicationById = new Map(rejectedApplications.map((application) => [application.id, application]));
  const applicationStatusCounts = Object.values(ApplicationStatus).map((status) => ({
    status,
    count: applications.filter((application) => application.status === status).length,
  }));

  return (
    <OperationsShell user={authorizedSession.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">Season Zero</p>
            <h1 className="mt-2 text-3xl font-semibold">Draft Cohort Resolution</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">The workbook-selected cohort is reviewed separately from the permanent application registry. All applications remain preserved.</p>
          </div>
          <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm" href="/data-quality/duplicates?filter=draft-cohort">Review cohort duplicates</Link>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="All applications preserved" value={applications.length} />
          <Metric label="Total selected" value={rows.length} />
          <Metric label="Safe" value={rows.filter((row) => row.matchType === "SAFE").length} />
          <Metric label="Ready for metadata" value={readyForMetadata} />
          <Metric label="Duplicate blocked" value={`${analysis.selectedUnresolvedDuplicateGroups.length} groups`} />
          <Metric label="Pending approval" value={pendingApproval} />
          <Metric label="Rejected selected" value={rejectedSelected} />
          <Metric label="Provisioned" value={rows.filter((row) => row.matchType === "PROVISIONED").length} />
          <Metric label="Ambiguous" value={rows.filter((row) => row.matchType === "AMBIGUOUS").length} />
          <Metric label="Unmatched" value={rows.filter((row) => row.matchType === "UNMATCHED").length} />
          <Metric label="Female Group 4 capacity" value={groupRows.find((row) => row.gender === "Female" && row.sequence === 4)?.remaining ?? womenTarget} />
        </section>

        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Application pool</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-5">
            {applicationStatusCounts.map((item) => <Metric key={item.status} label={item.status.replaceAll("_", " ")} value={item.count} />)}
          </div>
          <p className="mt-4 text-xs text-zinc-500">Unrelated duplicate groups: {analysis.unrelatedDuplicateGroups}. These remain tracked but do not block this cohort.</p>
        </section>

        {rejectedRows.length ? (
          <section className="mt-8 rounded-2xl border border-amber-300/20 bg-[#120f08] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-amber-100">Rejected Selected Applications</h2>
                <p className="mt-1 text-sm text-amber-100/70">These players were selected in the workbook but remain behind a separate administrator decision gate.</p>
              </div>
              <Link className="rounded-xl border border-amber-300/30 px-4 py-2 text-sm text-amber-100" href="/draft-cohort?filter=Pending%20Approval">Open review queue</Link>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {rejectedRows.map((row) => {
                const application = rejectedApplicationById.get(row.matchedApplicationId ?? row.applicationId);
                return (
                  <article className="rounded-2xl border border-amber-300/20 bg-black/25 p-4" key={`${row.worksheet}-${row.rowNumber}-rejected`}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{row.worksheet} row {row.rowNumber}</p>
                    <h3 className="mt-2 text-lg font-semibold">{row.fullName}</h3>
                    <dl className="mt-3 grid gap-2 text-xs text-zinc-300">
                      <Info label="Application" value={row.matchedApplicationId ?? row.applicationId} />
                      <Info label="Status" value="REJECTED" />
                      <Info label="Draft selection" value={row.proposedSquadCode ?? row.draftSelectionGroup.replaceAll("_", " ")} />
                      <Info label="Identity" value={`${row.gender} | ${row.position || "Missing position"}`} />
                      <Info label="Contact" value={`${row.email || "-"} | ${row.phone || "-"}`} />
                      <Info label="Submitted" value={application?.createdAt.toISOString() ?? "-"} />
                      <Info label="Current duplicate state" value={row.matchType.replaceAll("_", " ")} />
                    </dl>
                    {application?.notes ? <p className="mt-3 rounded-xl border border-white/[.06] bg-black/30 p-3 text-xs text-zinc-400">Review notes: {application.notes}</p> : null}
                    <form action={reviewDraftCohortApplication} className="mt-4 grid gap-2 border-t border-white/[.06] pt-4">
                      <input name="worksheet" type="hidden" value={row.worksheet} />
                      <input name="rowNumber" type="hidden" value={row.rowNumber} />
                      <input name="applicationId" type="hidden" value={row.matchedApplicationId ?? row.applicationId} />
                      <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="applicationReviewAction" defaultValue="">
                        <option value="" disabled>Select review action</option>
                        {applicationReviewActionsFor(ApplicationStatus.REJECTED).map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}
                      </select>
                      <textarea className="min-h-20 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="reason" placeholder="Required written reason. Use approval override only after administrator review." />
                      <button className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-100" type="submit">Record rejected-player decision</button>
                    </form>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e]">
          <div className="border-b border-white/[.06] p-5">
            <h2 className="text-lg font-semibold">Main Draft squad planning</h2>
            <p className="mt-1 text-sm text-zinc-500">Incomplete groups are valid planning warnings. Over-capacity groups require review.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-white/[.04] text-zinc-400"><tr><th className="p-4">Division</th><th className="p-4">Group</th><th className="p-4">Current</th><th className="p-4">Target</th><th className="p-4">Status</th><th className="p-4">Remaining</th></tr></thead>
              <tbody>{groupRows.map((row) => <tr className="border-t border-white/[.06]" key={`${row.gender}-${row.sequence}`}><td className="p-4">{row.gender}</td><td className="p-4">Group {row.sequence}</td><td className="p-4">{row.current}</td><td className="p-4">{row.target}</td><td className={statusClass(row.status)}>{row.status}</td><td className="p-4">{row.remaining}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e]">
          <div className="border-b border-white/[.06] p-5">
            <h2 className="text-lg font-semibold">Resolution queue</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {filters.map((item) => <Link className={item === filter ? "rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950" : "rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300"} href={`/draft-cohort?filter=${encodeURIComponent(item)}`} key={item}>{item}</Link>)}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-left text-xs">
              <thead className="bg-white/[.04] text-zinc-400"><tr><th className="p-3">Source</th><th className="p-3">Player</th><th className="p-3">Contact</th><th className="p-3">Application</th><th className="p-3">Draft</th><th className="p-3">Identity</th><th className="p-3">Next action</th><th className="p-3">Resolve</th></tr></thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr className="border-t border-white/[.06] align-top" key={`${row.worksheet}-${row.rowNumber}`}>
                    <td className="p-3">{row.worksheet} #{row.rowNumber}</td>
                    <td className="p-3"><p className="font-medium text-white">{row.fullName}</p><p className="text-zinc-500">{row.gender} | {row.position || "Missing position"}</p></td>
                    <td className="p-3"><p>{row.email || "-"}</p><p className="text-zinc-500">{row.phone || "-"}</p></td>
                    <td className="p-3"><p>{row.matchedApplicationId ?? row.applicationId ?? "-"}</p><p className="text-zinc-500">{row.applicationStatus?.replaceAll("_", " ") ?? "No match"}</p></td>
                    <td className="p-3"><p>{row.draftSelectionGroup.replaceAll("_", " ")}</p><p className="text-zinc-500">{row.proposedSquadCode ?? "Secondary pool"}</p></td>
                    <td className={identityClass(row.matchType)}>{row.matchType.replaceAll("_", " ")}</td>
                    <td className="p-3 max-w-[220px] text-zinc-400">{row.nextAction}</td>
                    <td className="p-3 min-w-[360px]">
                      <form action={resolveDraftCohortRow} className="grid gap-2">
                        <input name="worksheet" type="hidden" value={row.worksheet} />
                        <input name="rowNumber" type="hidden" value={row.rowNumber} />
                        <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="applicationId" placeholder="Application ID" defaultValue={row.matchedApplicationId ?? ""} />
                        <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="action" defaultValue={row.resolutionAction ?? ""}>
                          <option value="" disabled>Select resolution</option>
                          {cohortRowResolutionActions.map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}
                        </select>
                        <textarea className="min-h-16 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="reason" placeholder="Written resolution reason" defaultValue={row.resolutionReason ?? ""} />
                        <button className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-semibold text-zinc-950" type="submit">Save resolution</button>
                      </form>
                      {row.matchedApplicationId && row.applicationStatus && row.applicationStatus !== ApplicationStatus.APPROVED ? (
                        <form action={reviewDraftCohortApplication} className="mt-4 grid gap-2 border-t border-white/[.06] pt-4">
                          <input name="worksheet" type="hidden" value={row.worksheet} />
                          <input name="rowNumber" type="hidden" value={row.rowNumber} />
                          <input name="applicationId" type="hidden" value={row.matchedApplicationId} />
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">Application review</p>
                          <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="applicationReviewAction" defaultValue="">
                            <option value="" disabled>Select review action</option>
                            {applicationReviewActionsFor(row.applicationStatus).map((action) => <option key={action} value={action}>{action.replaceAll("_", " ")}</option>)}
                          </select>
                          <textarea className="min-h-16 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs" name="reason" placeholder="Required written reason" />
                          <button className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200" type="submit">Save application review</button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleRows.length === 0 ? <p className="p-8 text-center text-zinc-500">No rows for this filter.</p> : null}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

function filterRows(rows: Awaited<ReturnType<typeof draftCohortAnalysis>>["rows"], filter: string) {
  const key = filter.toUpperCase().replaceAll(" ", "_");
  if (filter === "All") return rows;
  if (filter === "Safe") return rows.filter((row) => row.matchType === "SAFE");
  if (filter === "Ready") return rows.filter((row) => row.matchType === "READY" || row.matchType === "SAFE");
  return rows.filter((row) => row.matchType === key);
}

function groupSummary(rows: Awaited<ReturnType<typeof draftCohortAnalysis>>["rows"], gender: "Male" | "Female", sequence: number, target: number) {
  const current = rows.filter((row) => row.gender.toLowerCase().includes(gender.toLowerCase()) && row.proposedSquadSequence === sequence && row.matchType !== "EXCLUDED").length;
  return { gender, sequence, current, target, remaining: Math.max(target - current, 0), status: current > target ? "OVER_CAPACITY" : current === target ? "READY" : current === 0 ? "EMPTY" : "INCOMPLETE" };
}

function statusClass(status: string) {
  if (status === "READY") return "p-4 text-emerald-300";
  if (status === "OVER_CAPACITY") return "p-4 text-rose-300";
  return "p-4 text-amber-300";
}

function identityClass(status: string) {
  if (status === "READY" || status === "SAFE" || status === "PROVISIONED") return "p-3 text-emerald-300";
  if (status === "DUPLICATE_BLOCKED" || status === "AMBIGUOUS" || status === "UNMATCHED") return "p-3 text-rose-300";
  return "p-3 text-amber-300";
}

function applicationReviewActionsFor(status: ApplicationStatus) {
  const allowed = status === ApplicationStatus.REJECTED
    ? ["REOPEN_FOR_REVIEW", "APPROVE_OVERRIDE", "EXCLUDE_FROM_CURRENT_COHORT", "INVESTIGATE"]
    : ["APPROVE_FOR_SEASON_ZERO", "KEEP_PENDING", "EXCLUDE_FROM_CURRENT_COHORT", "INVESTIGATE"];
  return cohortApplicationReviewActions.filter((action) => allowed.includes(action));
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return <div className="rounded-xl border border-white/[.06] bg-black/20 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-zinc-500">{label}</dt><dd className="mt-0.5 break-words font-medium text-zinc-100">{value}</dd></div>;
}
