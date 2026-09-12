import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createRehearsal } from "@/app/operations/actions";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function RehearsalsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/rehearsals");
  if (!hasPermission(session.user.roles, "operations:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const rehearsals = await withOrganizationContext(session.user.organizationId, (tx) => tx.rehearsal.findMany({ orderBy: { rehearsalDate: "desc" } }));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Rehearsal Engine</h1><form action={createRehearsal} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_160px_190px_120px_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="name" placeholder="Draft rehearsal" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="type" placeholder="Type" /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="rehearsalDate" type="datetime-local" /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="durationMinutes" placeholder="Minutes" type="number" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Log</button></form><section className="mt-8 grid gap-3">{rehearsals.map((r) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={r.id}><b>{r.name}</b><p className="text-sm text-zinc-400">{r.type} - {r.rehearsalDate.toLocaleString()} - {r.status}</p><p className="mt-2 text-xs text-zinc-500">Outstanding: {r.outstandingActions ?? "None recorded"}</p></article>)}</section></main></OperationsShell>;
}
