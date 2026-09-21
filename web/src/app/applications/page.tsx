import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { applicationReviewRoutes } from "@/app/applications/application-routes";
import { BulkEmailForm } from "@/app/applications/bulk-email-form";
import { exportableApplicationTypes, exportableTypeLabels } from "@/app/applications/application-data";
import {
  emptyApplicationSummary,
  summarizeApplicationsByType,
} from "@/app/applications/application-summary";
import { toggleApplicationIntakeAction } from "@/app/applications/intake-actions";
import { ApplicationType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getClosedApplicationTypes } from "@/lib/application-intake";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecentApplication = Prisma.ApplicationGetPayload<{
  include: {
    applicantUser: { select: { name: true; email: true } };
    reviewedBy: { select: { name: true } };
  };
}>;

export default async function ApplicationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/applications");
  }
  let authorizedSession;
  let organizationId: string;
  try {
    ({ session: authorizedSession, organizationId } = await requirePermissionWithOrganization("application:review"));
  } catch (error) {
    if (error instanceof MissingOrganizationContextError) throw error;
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">Admin review</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Access required</h1><p className="mt-3 text-sm leading-6 text-text-2">Your account is signed in, but it does not have application review permission.</p></main>
      </OperationsShell>
    );
  }

  if (!authorizedSession.user.organizationId) throw new MissingOrganizationContextError();

  if (!authorizedSession.user.roles.length) {
    return (
      <OperationsShell user={authorizedSession.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">
            Admin review
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Access required</h1>
          <p className="mt-3 text-sm leading-6 text-text-2">
            Your account is signed in, but it does not have application review
            permission. Ask a super admin to grant you `SUPER_ADMIN` or
            `LEAGUE_OPERATOR` access.
          </p>
        </main>
      </OperationsShell>
    );
  }

  const [summaryApplications, recentApplications] = await withOrganizationContext(organizationId, (tx) => Promise.all([
    tx.application.findMany({
      select: {
        type: true,
        status: true,
        submittedData: true,
      },
    }),
    tx.application.findMany({
      include: {
        applicantUser: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]));

  const summaries = summarizeApplicationsByType(summaryApplications);
  const closedTypes = await getClosedApplicationTypes(organizationId);

  return (
    <OperationsShell user={authorizedSession.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">
          Admin review
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-2 max-w-3xl text-sm text-text-2">
          Participant applications are reviewed here before any sensitive role, staff
          profile, vendor profile, accreditation, or player registration is created.
        </p>

        <section className="mt-8 rounded-lg border border-white/[0.08] bg-ink-800 p-5">
          <h2 className="text-lg font-semibold">Application intake</h2>
          <p className="mt-2 text-sm leading-6 text-text-2">
            Temporarily close public submissions for a role so no new names come in unexpectedly.
            Existing applications and drafting are unaffected.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {([ApplicationType.PLAYER, ApplicationType.COACH] as const).map((type) => {
              const isClosed = closedTypes.includes(type);
              return (
                <form action={toggleApplicationIntakeAction.bind(null, type, !isClosed)} key={type}>
                  <input name="reason" type="hidden" value={isClosed ? "Reopened by administrator." : "Closed by administrator ahead of draft/tournament to prevent new names being added."} />
                  <button
                    className={
                      isClosed
                        ? "rounded-md border border-brand-400/40 px-4 py-2 text-sm font-semibold text-brand-300 hover:bg-brand-400/10"
                        : "rounded-md border border-amber-400/40 px-4 py-2 text-sm font-semibold text-warn hover:bg-warn/10"
                    }
                  >
                    {type}: {isClosed ? "Closed — reopen" : "Open — close now"}
                  </button>
                </form>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="rounded-lg border border-white/[0.08] bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Export application data</h2>
            <p className="mt-2 text-sm leading-6 text-text-2">
              Download player, coach, scout, and vendor application data as Excel
              workbooks for offline review.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
                href="/applications/export?types=ALL"
              >
                Export all Excel
              </Link>
              {exportableApplicationTypes.map((type) => (
                <Link
                  className="rounded-md border border-line px-4 py-3 text-sm text-text-1 transition hover:border-emerald-400/50 hover:text-emerald-200"
                  href={`/applications/export?types=${type}`}
                  key={type}
                >
                  Export {exportableTypeLabels[type]}
                </Link>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-white/[0.08] bg-ink-800 p-5">
            <h2 className="text-lg font-semibold">Email applicants</h2>
            <p className="mt-2 text-sm leading-6 text-text-2">
              Send one message to player, coach, scout, and vendor applicants.
            </p>
            <BulkEmailForm />
          </div>
        </section>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {applicationReviewRoutes.map((route) => {
            const summary = summaries.get(route.type) ?? emptyApplicationSummary();
            return (
              <Link
                className="rounded-lg border border-white/[0.08] bg-ink-800 p-5 transition hover:border-brand-400/40 hover:bg-brand-400/[0.04]"
                href={route.href}
                key={route.type}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-text-3">
                      {route.type}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">{route.label}</h2>
                  </div>
                  <span className="rounded-full border border-line px-3 py-1 text-sm text-text-1">
                    {summary.total}
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3 text-xs sm:grid-cols-5">
                  <SummaryMetric label="Submitted" value={summary.submitted} />
                  <SummaryMetric label="Review" value={summary.underReview} />
                  <SummaryMetric label="Approved" value={summary.approved} />
                  <SummaryMetric label="Rejected" value={summary.rejected} />
                  <SummaryMetric label="Withdrawn" value={summary.withdrawn} />
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 rounded-md border border-white/[0.06] bg-white/[0.025] p-3 text-xs">
                  <SummaryMetric label="Male" value={summary.male} />
                  <SummaryMetric label="Female" value={summary.female} />
                  <SummaryMetric label="Unspecified" value={summary.unspecifiedGender} />
                </div>
              </Link>
            );
          })}
        </section>

        <section className="mt-10 rounded-lg border border-white/[0.08] bg-ink-800">
          <div className="border-b border-white/[0.06] p-5">
            <h2 className="text-lg font-semibold">Recent submissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-white/[0.04] text-text-2">
                <tr>
                  <th className="p-4">Submitted</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Application Status</th>
                  <th className="p-4">Profile</th>
                  <th className="p-4">Draft Cohort</th>
                  <th className="p-4">Applicant</th>
                  <th className="p-4">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.map((application) => (
                  <ApplicationRow application={application} key={application.id} />
                ))}
              </tbody>
            </table>
            {recentApplications.length === 0 ? (
              <p className="p-8 text-center text-text-3">No applications submitted yet.</p>
            ) : null}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-text-3">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function applicationData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ApplicationRow({ application }: { application: RecentApplication }) {
  const data = applicationData(application.submittedData);
  const draftCohort = typeof data.draftCohort === "string" ? data.draftCohort : "NOT_SELECTED";
  const draftSelectionGroup = typeof data.draftSelectionGroup === "string" ? data.draftSelectionGroup : "-";
  const squad = typeof data.proposedSquadCode === "string" ? data.proposedSquadCode : "-";
  return (
    <tr className="border-t border-white/[0.06]">
      <td className="p-4 whitespace-nowrap">{application.createdAt.toLocaleString()}</td>
      <td className="p-4 text-brand-300">{application.type}</td>
      <td className="p-4">{application.status.replaceAll("_", " ")}</td>
      <td className="p-4">{application.provisioningStatus.replaceAll("_", " ")}</td>
      <td className="p-4">
        <p>{draftCohort === "SEASON_ZERO_DRAFT_COHORT" ? draftSelectionGroup.replaceAll("_", " ") : "NOT SELECTED"}</p>
        <p className="text-xs text-text-3">Squad: {squad}</p>
      </td>
      <td className="p-4">
        {application.applicantUser ? (
          <>
            <p>{application.applicantUser.name}</p>
            <p className="text-xs text-text-3">{application.applicantUser.email}</p>
          </>
        ) : (
          <span className="text-text-3">Public form applicant</span>
        )}
      </td>
      <td className="p-4 text-text-2">{application.reviewedBy?.name ?? "Unreviewed"}</td>
    </tr>
  );
}
