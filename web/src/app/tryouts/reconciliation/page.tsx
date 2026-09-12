import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { ApplicationStatus, ApplicationType } from "@/generated/prisma/enums";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function TryoutReconciliationPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/tryouts/reconciliation");
  if (!hasPermission(session.user.roles, "draft:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }
  const applications = await withOrganizationContext(session.user.organizationId, (tx) => tx.application.findMany({
    where: { type: ApplicationType.PLAYER, status: ApplicationStatus.APPROVED },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { applicantUser: { include: { athleteProfile: { include: { registrations: { orderBy: { createdAt: "desc" }, take: 1 } } } } } },
  }));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-emerald-400" href="/tryouts">Back to tryouts</Link>
        <h1 className="mt-4 text-3xl font-semibold">Tryout Reconciliation</h1>
        <p className="mt-2 text-sm text-zinc-400">Approved player applications checked against permanent Athlete IDs, season registrations, draft group, and squad readiness.</p>
        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[.08] bg-[#0b100e]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-[.16em] text-zinc-500"><tr><th className="p-3">Application</th><th className="p-3">Athlete</th><th className="p-3">Ultra ID</th><th className="p-3">Player registration</th><th className="p-3">Draft group</th><th className="p-3">Eligibility</th></tr></thead>
            <tbody>{applications.map((application) => {
              const athlete = application.applicantUser?.athleteProfile;
              const player = athlete?.registrations[0];
              const blockers = [!athlete ? "Missing athlete" : null, !athlete?.ultraAthleteId ? "Missing Ultra ID" : null, !player ? "Missing Player" : null].filter(Boolean);
              return <tr className="border-t border-white/[.06]" key={application.id}><td className="p-3 font-mono text-xs">{application.id}</td><td className="p-3">{athlete ? `${athlete.firstName} ${athlete.lastName}` : "Missing"}</td><td className="p-3">{athlete?.ultraAthleteId ?? "-"}</td><td className="p-3">{player ? "Created" : "Missing"}</td><td className="p-3">{player?.draftSelectionGroup ?? "-"}</td><td className={blockers.length ? "p-3 text-rose-300" : "p-3 text-emerald-300"}>{blockers.length ? blockers.join(", ") : "Ready"}</td></tr>;
            })}</tbody>
          </table>
        </section>
      </main>
    </OperationsShell>
  );
}
