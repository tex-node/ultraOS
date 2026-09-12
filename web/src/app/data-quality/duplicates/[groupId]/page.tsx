import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { resolveDuplicateGroup } from "../actions";
import { duplicateGroup, duplicateResolutionActions } from "@/lib/data-quality";
import { draftCohortAnalysis } from "@/lib/draft-cohort";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DuplicateGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/data-quality/duplicates/${groupId}`);
  let authorizedSession;
  let organizationId: string;
  try {
    ({ session: authorizedSession, organizationId } = await requirePermissionWithOrganization("data:readiness"));
  } catch {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  const [group, cohortAnalysis] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    duplicateGroup(groupId, tx, organizationId),
    draftCohortAnalysis(tx, organizationId),
  ]));
  if (!group) notFound();
  const cohortRowsByApplicationId = new Map(cohortAnalysis.rows.map((row) => [row.matchedApplicationId ?? row.applicationId, row]));
  const selectedRows = group.applications.map((application) => cohortRowsByApplicationId.get(application.applicationId)).filter(isDefined);
  const availableActions = duplicateResolutionActions.filter((action) => action !== "EXCLUDE_FROM_INTERNALIZATION");
  return (
    <OperationsShell user={authorizedSession.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href="/data-quality/duplicates">Back to duplicate groups</Link>
        <h1 className="mt-4 text-3xl font-semibold">Duplicate Group</h1>
        <p className="mt-2 text-sm text-zinc-400">{group.matchReason}. Current resolution: <b>{group.currentResolution}</b>.</p>
        {selectedRows.length ? (
          <section className="mt-6 rounded-2xl border border-amber-300/20 bg-[#120f08] p-5">
            <h2 className="text-lg font-semibold text-amber-100">Selected Cohort Context</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {selectedRows.map((row) => (
                <div className="rounded-xl border border-amber-300/10 bg-black/20 p-4 text-sm" key={`${row.worksheet}-${row.rowNumber}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-300">{row.worksheet} row {row.rowNumber}</p>
                  <p className="mt-2 font-medium text-white">{row.fullName}</p>
                  <p className="mt-1 text-xs text-zinc-400">{row.gender} | {row.position || "Missing position"} | {row.proposedSquadCode ?? row.draftSelectionGroup.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-xs text-zinc-500">Application: {row.matchedApplicationId ?? row.applicationId}</p>
                  <p className="mt-1 text-xs text-zinc-500">Status: {row.applicationStatus ?? "No match"} | Identity: {row.matchType.replaceAll("_", " ")}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b100e]">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/[.04] uppercase tracking-[.14em] text-zinc-500">
              <tr><th className="p-3">Application</th><th className="p-3">Workbook</th><th className="p-3">User</th><th className="p-3">Email</th><th className="p-3">Phone</th><th className="p-3">Name</th><th className="p-3">DOB</th><th className="p-3">Gender</th><th className="p-3">Position</th><th className="p-3">Status</th><th className="p-3">Submitted</th><th className="p-3">Links</th></tr>
            </thead>
            <tbody>
              {group.applications.map((application) => {
                const cohortRow = cohortRowsByApplicationId.get(application.applicationId);
                return (
                <tr className="border-t border-white/[.06]" key={application.applicationId}>
                  <td className="p-3 font-mono">{application.applicationId}</td>
                  <td className="p-3">{cohortRow ? `${cohortRow.worksheet} #${cohortRow.rowNumber}` : "-"}</td>
                  <td className="p-3 font-mono">{application.userId ?? "-"}</td>
                  <td className="p-3">{application.maskedEmail ?? "-"}</td>
                  <td className="p-3">{application.maskedPhone ?? "-"}</td>
                  <td className={application.conflictingFields.includes("fullName") ? "p-3 text-amber-300" : "p-3"}>{application.fullName || "-"}</td>
                  <td className={application.conflictingFields.includes("dateOfBirth") ? "p-3 text-amber-300" : "p-3"}>{application.dateOfBirth ?? "-"}</td>
                  <td className={application.conflictingFields.includes("gender") ? "p-3 text-amber-300" : "p-3"}>{application.gender ?? "-"}</td>
                  <td className={application.conflictingFields.includes("position") ? "p-3 text-amber-300" : "p-3"}>{application.position ?? "-"}</td>
                  <td className="p-3">{application.applicationStatus}</td>
                  <td className="p-3">{application.applicationTimestamp.toISOString()}</td>
                  <td className="p-3">Athlete: {application.existingAthleteLink ?? "-"}<br />Player: {application.existingPlayerRegistration ?? "-"}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6">
          <h2 className="text-xl font-semibold">Record Resolution</h2>
          <form action={resolveDuplicateGroup.bind(null, group.id)} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm">Action<select className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" name="action" required>{availableActions.map((action) => <option key={action} value={action}>{action}</option>)}</select></label>
            <label className="grid gap-2 text-sm">Primary application<select className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" name="primaryApplicationId"><option value="">None selected</option>{group.applications.map((application) => <option key={application.applicationId} value={application.applicationId}>{application.applicationId}</option>)}</select></label>
            <fieldset className="grid gap-2 text-sm"><legend>Secondary records</legend>{group.applications.map((application) => <label className="flex gap-2" key={application.applicationId}><input name="secondaryApplicationIds" type="checkbox" value={application.applicationId} />{application.applicationId}</label>)}</fieldset>
            <label className="grid gap-2 text-sm">Written reason<textarea className="min-h-28 rounded-xl border border-white/10 bg-black/30 px-3 py-2" name="reason" required /></label>
            <button className="w-fit rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950">Save resolution</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
