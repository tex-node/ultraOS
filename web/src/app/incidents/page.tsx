import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createIncident, updateIncidentStatus } from "@/app/operations/actions";
import { IncidentType, OpsItemStatus, OpsSeverity } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function IncidentsPage({ searchParams }: { searchParams: Promise<{ type?: string; severity?: string; title?: string; description?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/incidents");
  if (!hasPermission(session.user.roles, "incident:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const incidents = await withOrganizationContext(session.user.organizationId, (tx) => tx.incident.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }));
  // G.20 Part XIII: diagnostics links here with the category/context prefilled - the operator
  // still reviews and submits the form themselves, so this is prefill only, never an
  // auto-created incident.
  const prefill = await searchParams;
  const prefillType = prefill.type && Object.values(IncidentType).includes(prefill.type as IncidentType) ? (prefill.type as IncidentType) : IncidentType.TECHNICAL;
  const prefillSeverity = prefill.severity && Object.values(OpsSeverity).includes(prefill.severity as OpsSeverity) ? (prefill.severity as OpsSeverity) : OpsSeverity.MEDIUM;
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Incident Management</h1>
        <form action={createIncident} className="mt-6 grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_160px_160px_2fr_auto]">
          <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="title" placeholder="Incident title" defaultValue={prefill.title ?? ""} required />
          <select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="type" defaultValue={prefillType}>{Object.values(IncidentType).map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="severity" defaultValue={prefillSeverity}>{Object.values(OpsSeverity).map((x) => <option key={x} value={x}>{x}</option>)}</select>
          <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="description" placeholder="Description" defaultValue={prefill.description ?? ""} />
          <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Log</button>
        </form>
        <section className="mt-8 grid gap-4">
          {incidents.map((incident) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={incident.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold">{incident.title}</p><p className="mt-1 text-sm text-text-2">{incident.type} - {incident.severity} - {incident.status}</p><p className="mt-2 text-sm text-text-3">{incident.description}</p></div><form action={updateIncidentStatus.bind(null, incident.id)} className="flex gap-2"><select className="rounded-md border border-line bg-ink-900 px-3 py-2 text-sm" name="status" defaultValue={incident.status}>{Object.values(OpsItemStatus).map((x) => <option key={x} value={x}>{x}</option>)}</select><button className="rounded-md border border-line px-3 py-2 text-sm">Update</button></form></div></article>)}
        </section>
      </main>
    </OperationsShell>
  );
}
