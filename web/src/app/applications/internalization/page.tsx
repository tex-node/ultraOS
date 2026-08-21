import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { ApplicationProvisioningStatus, ApplicationStatus } from "@/generated/prisma/enums";
import { internalizeApprovedApplications } from "@/lib/participant-internalization";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ApplicationInternalizationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/applications/internalization");
  if (!hasPermission(session.user.roles, "application:review")) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  const [total, approved, provisioned, missingUser, playerMissingAthlete, playerMissingPlayer, coachMissingStaff, dryRun] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, provisioningStatus: { not: ApplicationProvisioningStatus.APPROVED_ONLY } } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, applicantUserId: null } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, type: "PLAYER", provisionedAthleteId: null } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, type: "PLAYER", provisionedPlayerId: null } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, type: "COACH", provisionedStaffId: null } }),
    internalizeApprovedApplications({ apply: false }),
  ]);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Application Internalization</h1>
        <p className="mt-2 text-sm text-zinc-400">Dry-run planning for converting approved applications into permanent participant profiles.</p>
        <section className="mt-8 grid gap-4 md:grid-cols-4">
          <Metric label="Total applications" value={total} />
          <Metric label="Approved" value={approved} />
          <Metric label="Provisioned" value={provisioned} />
          <Metric label="Ready planned" value={dryRun.items.filter((item) => item.status === "WOULD_APPLY").length} />
          <Metric label="Approved missing User" value={missingUser} />
          <Metric label="Players missing Athlete" value={playerMissingAthlete} />
          <Metric label="Players missing Player" value={playerMissingPlayer} />
          <Metric label="Coaches missing Staff" value={coachMissingStaff} />
        </section>
        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-xl font-semibold">Dry-run sample</h2>
          <div className="mt-4 grid gap-3">
            {dryRun.items.slice(0, 30).map((item) => (
              <article className="rounded-xl border border-white/[.06] bg-black/20 p-4" key={item.applicationId}>
                <p className="text-xs uppercase tracking-[.18em] text-zinc-500">{item.type} | {item.status}</p>
                <p className="mt-1 font-mono text-xs text-zinc-400">{item.applicationId}</p>
                <p className="mt-2 text-sm text-zinc-300">{item.actions.join(" ") || item.warnings.join(" ")}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-2xl font-semibold text-emerald-300">{value}</p></div>;
}
