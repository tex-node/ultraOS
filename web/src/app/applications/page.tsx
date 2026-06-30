import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { applicationReviewRoutes } from "@/app/applications/application-routes";
import {
  emptyApplicationSummary,
  summarizeApplicationsByType,
} from "@/app/applications/application-summary";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ApplicationsPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/applications");
  }

  if (!hasPermission(session.user.roles, "application:review")) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
            Admin review
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Access required</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-400">
            Your account is signed in, but it does not have application review
            permission. Ask a super admin to grant you `SUPER_ADMIN` or
            `LEAGUE_OPERATOR` access.
          </p>
        </main>
      </OperationsShell>
    );
  }

  const [summaryApplications, recentApplications] = await Promise.all([
    prisma.application.findMany({
      select: {
        type: true,
        status: true,
        submittedData: true,
      },
    }),
    prisma.application.findMany({
      include: {
        applicantUser: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const summaries = summarizeApplicationsByType(summaryApplications);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
          Admin review
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Participant applications are reviewed here before any sensitive role, staff
          profile, vendor profile, accreditation, or player registration is created.
        </p>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {applicationReviewRoutes.map((route) => {
            const summary = summaries.get(route.type) ?? emptyApplicationSummary();
            return (
              <Link
                className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.04]"
                href={route.href}
                key={route.type}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      {route.type}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">{route.label}</h2>
                  </div>
                  <span className="rounded-full border border-white/10 px-3 py-1 text-sm text-zinc-300">
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
                <div className="mt-5 grid grid-cols-3 gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3 text-xs">
                  <SummaryMetric label="Male" value={summary.male} />
                  <SummaryMetric label="Female" value={summary.female} />
                  <SummaryMetric label="Unspecified" value={summary.unspecifiedGender} />
                </div>
              </Link>
            );
          })}
        </section>

        <section className="mt-10 rounded-2xl border border-white/[0.08] bg-[#0b100e]">
          <div className="border-b border-white/[0.06] p-5">
            <h2 className="text-lg font-semibold">Recent submissions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-white/[0.04] text-zinc-400">
                <tr>
                  <th className="p-4">Submitted</th>
                  <th className="p-4">Type</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Applicant</th>
                  <th className="p-4">Reviewer</th>
                </tr>
              </thead>
              <tbody>
                {recentApplications.map((application) => (
                  <tr className="border-t border-white/[0.06]" key={application.id}>
                    <td className="p-4 whitespace-nowrap">{application.createdAt.toLocaleString()}</td>
                    <td className="p-4 text-emerald-300">{application.type}</td>
                    <td className="p-4">{application.status.replaceAll("_", " ")}</td>
                    <td className="p-4">
                      {application.applicantUser ? (
                        <>
                          <p>{application.applicantUser.name}</p>
                          <p className="text-xs text-zinc-500">{application.applicantUser.email}</p>
                        </>
                      ) : (
                        <span className="text-zinc-500">Public form applicant</span>
                      )}
                    </td>
                    <td className="p-4 text-zinc-400">{application.reviewedBy?.name ?? "Unreviewed"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentApplications.length === 0 ? (
              <p className="p-8 text-center text-zinc-500">No applications submitted yet.</p>
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
      <p className="text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}
