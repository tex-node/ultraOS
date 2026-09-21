import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { ApplicationStatus } from "@/generated/prisma/enums";
import { auditRealData } from "@/lib/data-hygiene";
import { AuthorizationError, MissingOrganizationContextError, requirePlatformPermission } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.2C: every count/aggregate below now runs inside the acting admin's own scoped
// transaction - previously entirely unscoped, so an Org B admin's readiness dashboard would have
// included every organization's applications/athletes/staff/draft-squad-membership counts.
// auditRealData() (the demo/rehearsal-data audit) is deliberately NOT converted here - it is the
// same already-named, platform-wide diagnostic tool Stage 5.2B-2 classified as a low-urgency
// exception, continued unchanged (it audits data ACROSS the whole platform for cleanup purposes
// by design, not per-tenant business reporting).
export default async function DataReadinessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/data-readiness");
  try {
    await requirePlatformPermission("data:readiness");
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
    }
    throw error;
  }
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const organizationId = session.user.organizationId;
  const [audit, counts] = await Promise.all([
    auditRealData(),
    withOrganizationContext(organizationId, (tx) => Promise.all([
      tx.application.count(),
      tx.application.count({ where: { status: ApplicationStatus.APPROVED } }),
      tx.application.count({ where: { status: ApplicationStatus.APPROVED, provisionedAt: { not: null } } }),
      tx.athlete.count(),
      tx.athlete.count({ where: { ultraAthleteId: null } }),
      tx.athlete.count({ where: { photoUrl: null } }),
      tx.draftSquadMember.count(),
      tx.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) FROM (SELECT "playerId" FROM "DraftSquadMember" GROUP BY "playerId" HAVING COUNT(*) > 1) d`,
      tx.staff.count({ where: { role: { in: ["HEAD_COACH", "ASSISTANT_COACH"] } } }),
      tx.staff.count({ where: { ultraStaffId: null } }),
    ])),
  ]);
  const [totalApplications, approvedApplications, internalizedApplications, athletes, missingAthleteIds, missingPhotos, playersInSquads, duplicateSquadMemberships, coaches, staffMissingIds] = counts;
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Real Data Readiness</h1>
            <p className="mt-2 text-sm text-text-2">Participant reconciliation and cleanup signals for production data transition.</p>
          </div>
          <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/data-readiness/export">Export CSV</Link>
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
  return <section className="rounded-lg border border-line bg-ink-800 p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 grid gap-2">{rows.map(([label, value]) => <div className="flex justify-between rounded-md border border-line bg-black/20 px-4 py-3 text-sm" key={label}><span className="text-text-2">{label}</span><b>{value}</b></div>)}</div></section>;
}
