import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function QrOperationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/qr-operations");
  if (!hasPermission(session.user.roles, "check-in:operate")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const [checkIns, tickets, accreditations] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([
    tx.checkIn.count(),
    tx.ticket.count({ where: { status: "ACTIVE" } }),
    tx.accreditation.count({ where: { status: "APPROVED" } }),
  ]));
  const actions = ["Lost Ticket", "Manual Entry", "Duplicate Scan", "Override Entry", "VIP Entry", "Media Entry", "Coach Entry", "Player Entry"];
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><div className="flex justify-between gap-4"><div><h1 className="text-3xl font-semibold">QR Operations</h1><p className="mt-2 text-sm text-text-2">Operator dashboard for venue entry and exceptions.</p></div><Link className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900" href="/check-in">Open scanner</Link></div><section className="mt-8 grid gap-4 md:grid-cols-3"><Metric label="Check-ins" value={checkIns} /><Metric label="Active tickets" value={tickets} /><Metric label="Approved accreditations" value={accreditations} /></section><section className="mt-8 grid gap-3 md:grid-cols-4">{actions.map((action) => <div className="rounded-lg border border-line bg-ink-800 p-5" key={action}><b>{action}</b><p className="mt-2 text-xs text-text-3">Use operator policy and audit notes.</p></div>)}</section></main></OperationsShell>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-lg border border-line bg-ink-800 p-5"><p className="text-sm text-text-2">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>;
}
