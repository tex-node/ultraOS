import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { markSeasonZeroCoachSelection } from "@/app/coaches/actions";
import { ApplicationStatus, ApplicationType, CoachSeasonZeroDivision, CoachSeasonZeroSelectionStatus } from "@/generated/prisma/enums";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

function textValue(data: unknown, keys: string[]) {
  if (!data || typeof data !== "object") return "";
  const record = data as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Phase 1 Stage 5.5B: previously read every organization's approved coach applications and
// provisioned staff via the bare, unscoped client - an Org B "staff:manage" holder could see
// (and, via the also-fixed markSeasonZeroCoachSelection, act on) every organization's coach
// applications. Scoped to the acting admin's own organization.
export default async function SeasonZeroCoachSelectionPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/coaches/season-zero-selection");
  const { session, organizationId } = await requirePermissionWithOrganization("staff:manage");
  const { applications, staffById } = await withOrganizationContext(organizationId, async (tx) => {
    const applications = await tx.application.findMany({
      where: { type: ApplicationType.COACH, status: ApplicationStatus.APPROVED },
      include: { applicantUser: { select: { email: true, name: true } } },
      orderBy: [{ coachSeasonZeroSelectionStatus: "asc" }, { createdAt: "asc" }],
    });
    const staffIds = applications.map((application) => application.provisionedStaffId).filter((id): id is string => Boolean(id));
    const staffById = new Map(
      (staffIds.length > 0
        ? await tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, photoUrl: true, ultraStaffId: true } })
        : []
      ).map((staff) => [staff.id, staff]),
    );
    return { applications, staffById };
  });
  const counts = applications.reduce<Record<string, number>>((acc, application) => {
    acc[application.coachSeasonZeroSelectionStatus] = (acc[application.coachSeasonZeroSelectionStatus] ?? 0) + 1;
    return acc;
  }, {});
  const unresolvedDivisionCount = applications.filter(
    (application) => application.coachSeasonZeroSelectionStatus === CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED && !application.coachSeasonZeroDivision,
  ).length;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-text-2" href="/coaches/assignments">Back to coach operations</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">Season Zero</p>
            <h1 className="mt-2 text-3xl font-semibold">Coach selection review</h1>
            <p className="mt-2 text-sm text-text-2">Approved coach applications are the source. Mark only coaches explicitly selected by league operations. Selecting a coach requires an explicit MEN or WOMEN draft division — it is never inferred.</p>
            <Link className="mt-3 inline-block text-sm text-brand-400" href="/coaches/photos/import">Bulk coach photo import →</Link>
          </div>
          <div className="grid gap-2 text-sm md:grid-cols-3">
            {Object.values(CoachSeasonZeroSelectionStatus).map((status) => (
              <div className="rounded-md border border-line bg-ink-800 p-3" key={status}>
                <p className="text-xs text-text-3">{status.replaceAll("_", " ")}</p>
                <p className="text-2xl font-semibold text-brand-300">{counts[status] ?? 0}</p>
              </div>
            ))}
            {unresolvedDivisionCount > 0 ? (
              <div className="rounded-md border border-warn/30 bg-warn/10 p-3">
                <p className="text-xs text-warn">DIVISION UNRESOLVED</p>
                <p className="text-2xl font-semibold text-warn">{unresolvedDivisionCount}</p>
              </div>
            ) : null}
          </div>
        </div>

        <section className="mt-8 overflow-hidden rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-text-3">
              <tr>
                <th className="p-4">Applicant</th>
                <th className="p-4">Experience</th>
                <th className="p-4">Status</th>
                <th className="p-4">Division</th>
                <th className="p-4">Staff</th>
                <th className="p-4">Photo</th>
                <th className="p-4">Decision</th>
              </tr>
            </thead>
            <tbody>
              {applications.map((application) => {
                const data = application.submittedData;
                const name = textValue(data, ["fullName", "name"]) || application.applicantUser?.name || "Unnamed coach";
                const email = textValue(data, ["email"]) || application.applicantUser?.email || "-";
                const staff = application.provisionedStaffId ? staffById.get(application.provisionedStaffId) : null;
                const isSelected = application.coachSeasonZeroSelectionStatus === CoachSeasonZeroSelectionStatus.SEASON_ZERO_SELECTED;
                const divisionUnresolved = isSelected && !application.coachSeasonZeroDivision;
                return (
                  <tr className="border-t border-line" key={application.id}>
                    <td className="p-4"><p className="font-semibold">{name}</p><p className="text-xs text-text-3">Application {application.id}</p><p className="text-xs text-text-3">{email}</p></td>
                    <td className="p-4 text-text-1">{textValue(data, ["experience", "coachingExperience"]) || "-"}</td>
                    <td className="p-4">{application.coachSeasonZeroSelectionStatus.replaceAll("_", " ")}</td>
                    <td className="p-4">
                      {application.coachSeasonZeroDivision ?? (divisionUnresolved ? <span className="text-warn">REQUIRED</span> : "-")}
                    </td>
                    <td className="p-4 text-text-1">
                      {staff ? <>{staff.ultraStaffId ?? "ID pending"}</> : "Not provisioned"}
                    </td>
                    <td className="p-4 text-text-1">{staff?.photoUrl ? "Ready" : "Missing"}</td>
                    <td className="p-4">
                      <form action={markSeasonZeroCoachSelection.bind(null, application.id)} className="grid gap-2">
                        <select className="rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs" name="status" defaultValue={application.coachSeasonZeroSelectionStatus}>
                          {Object.values(CoachSeasonZeroSelectionStatus).map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}
                        </select>
                        <select className="rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs" name="division" defaultValue={application.coachSeasonZeroDivision ?? ""}>
                          <option value="">No division</option>
                          {Object.values(CoachSeasonZeroDivision).map((division) => <option key={division} value={division}>{division}</option>)}
                        </select>
                        <input className="rounded-lg border border-line bg-ink-900 px-3 py-2 text-xs" name="reason" placeholder="Reason or decision note" />
                        <button className="rounded-lg bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-900">Save</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {applications.length === 0 ? <p className="p-6 text-center text-sm text-text-2">No approved coach applications found.</p> : null}
        </section>
      </main>
    </OperationsShell>
  );
}
