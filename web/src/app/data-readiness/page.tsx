import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { ApplicationStatus } from "@/generated/prisma/enums";
import { auditRealData } from "@/lib/data-hygiene";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function DataReadinessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/data-readiness");
  if (!hasPermission(session.user.roles, "data:readiness")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const [audit, totalApplications, approvedApplications, internalizedApplications, athletes, missingAthleteIds, missingPhotos, playersInSquads, duplicateSquadMemberships, coaches, staffMissingIds] = await Promise.all([
    auditRealData(),
    prisma.application.count(),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED } }),
    prisma.application.count({ where: { status: ApplicationStatus.APPROVED, provisionedAt: { not: null } } }),
    prisma.athlete.count(),
    prisma.athlete.count({ where: { ultraAthleteId: null } }),
    prisma.athlete.count({ where: { photoUrl: null } }),
    prisma.draftSquadMember.count(),
    prisma.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) FROM (SELECT "playerId" FROM "DraftSquadMember" GROUP BY "playerId" HAVING COUNT(*) > 1) d`,
    prisma.staff.count({ where: { role: { in: ["HEAD_COACH", "ASSISTANT_COACH"] } } }),
    prisma.staff.count({ where: { ultraStaffId: null } }),
  ]);
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Real Data Readiness</h1>
            <p className="mt-2 text-sm text-zinc-400">Participant reconciliation and cleanup signals for production data transition.</p>
          </div>
          <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm" href="/data-readiness/export">Export CSV</Link>
        </div>
        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <Panel title="Applications" rows={[["Total", totalApplications], ["Approved", approvedApplications], ["Internalized", internalizedApplications], ["Missing profiles", approvedApplications - internalizedApplications]]} />
          <Panel title="Athletes" rows={[["Total", athletes], ["Missing Ultra ID", missingAthleteIds], ["Missing photo", missingPhotos], ["Players in squads", playersInSquads]]} />
          <Panel title="Coaches" rows={[["Approved coaches", approvedApplications], ["Coach staff profiles", coaches], ["Staff missing Ultra ID", staffMissingIds]]} />
          <Panel title="Draft" rows={[["Players in squads", playersInSquads], ["Duplicate memberships", Number(duplicateSquadMemberships[0]?.count ?? 0)]]} />
          <Panel title="Demo audit" rows={Object.entries(audit.demoRecords)} />
          <Panel title="Rehearsal audit" rows={Object.entries(audit.rehearsalRecords)} />
        </section>
      </main>
    </OperationsShell>
  );
}

function Panel({ title, rows }: { title: string; rows: [string, string | number][] }) {
  return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 grid gap-2">{rows.map(([label, value]) => <div className="flex justify-between rounded-xl border border-white/[.06] bg-black/20 px-4 py-3 text-sm" key={label}><span className="text-zinc-400">{label}</span><b>{value}</b></div>)}</div></section>;
}
