import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { updateApplicationStatus } from "@/app/applications/actions";
import {
  applicationCategoryToType,
  applicationReviewRoutes,
} from "@/app/applications/application-routes";
import { ApplicationStatus } from "@/generated/prisma/enums";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

type ApplicationCategoryPageProps = {
  params: Promise<{ category: string }>;
};

const statusOptions = [
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.APPROVED,
  ApplicationStatus.REJECTED,
  ApplicationStatus.WITHDRAWN,
];

function formatSubmittedData(data: unknown) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  return Object.entries(data).filter(([, value]) => value !== "");
}

export default async function ApplicationCategoryPage({ params }: ApplicationCategoryPageProps) {
  const { category } = await params;
  const type = applicationCategoryToType[category];
  if (!type) {
    notFound();
  }

  const currentSession = await auth();
  if (!currentSession?.user) {
    redirect(`/login?callbackUrl=/applications/${category}`);
  }

  const session = await requirePermission("application:review");
  const route = applicationReviewRoutes.find((item) => item.type === type);
  const applications = await prisma.application.findMany({
    where: { type },
    include: {
      applicantUser: { select: { name: true, email: true } },
      reviewedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-emerald-400 hover:text-emerald-300" href="/applications">
          Back to applications
        </Link>
        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
          {type} review queue
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {route?.label ?? type} applications
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          Review submissions, add notes, and change status. Approval records operator
          approval only; account roles and operational records remain controlled actions.
        </p>

        <section className="mt-8 grid gap-5">
          {applications.map((application) => {
            const submittedData = formatSubmittedData(application.submittedData);
            return (
              <article
                className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5"
                key={application.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="rounded-full border border-white/10 px-3 py-1 text-xs uppercase tracking-wider text-zinc-300">
                        {application.status.replaceAll("_", " ")}
                      </span>
                      <span className="font-mono text-xs text-zinc-500">{application.id}</span>
                    </div>
                    <p className="mt-3 text-sm text-zinc-400">
                      Submitted {application.createdAt.toLocaleString()}
                    </p>
                    {application.applicantUser ? (
                      <p className="mt-1 text-sm text-zinc-400">
                        Linked user: {application.applicantUser.name} ({application.applicantUser.email})
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-zinc-500">No login account linked.</p>
                    )}
                    {application.reviewedBy ? (
                      <p className="mt-1 text-sm text-zinc-500">
                        Last reviewed by {application.reviewedBy.name}
                        {application.reviewedAt ? ` on ${application.reviewedAt.toLocaleString()}` : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {submittedData?.map(([key, value]) => (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3" key={key}>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                        {key.replaceAll(/([A-Z])/g, " $1")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-200">
                        {typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)}
                      </p>
                    </div>
                  ))}
                </div>

                <form action={updateApplicationStatus} className="mt-5 grid gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-4 md:grid-cols-[1fr_2fr_auto]">
                  <input name="applicationId" type="hidden" value={application.id} />
                  <select
                    className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm outline-none focus:border-emerald-400"
                    defaultValue={application.status}
                    name="status"
                  >
                    <option value={application.status}>{application.status.replaceAll("_", " ")}</option>
                    {statusOptions
                      .filter((status) => status !== application.status)
                      .map((status) => (
                        <option key={status} value={status}>
                          {status.replaceAll("_", " ")}
                        </option>
                      ))}
                  </select>
                  <input
                    className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm outline-none focus:border-emerald-400"
                    defaultValue={application.notes ?? ""}
                    name="notes"
                    placeholder="Review notes"
                  />
                  <button
                    className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
                    type="submit"
                  >
                    Update
                  </button>
                </form>
              </article>
            );
          })}
        </section>

        {applications.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-white/10 p-10 text-center text-zinc-400">
            No {route?.label.toLowerCase() ?? type.toLowerCase()} applications submitted yet.
          </div>
        ) : null}
      </main>
    </OperationsShell>
  );
}
