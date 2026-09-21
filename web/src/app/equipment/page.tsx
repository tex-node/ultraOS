import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createEquipment } from "@/app/operations/actions";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function EquipmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/equipment");
  if (!hasPermission(session.user.roles, "equipment:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const equipment = await withOrganizationContext(session.user.organizationId, (tx) => tx.equipment.findMany({ orderBy: [{ status: "asc" }, { type: "asc" }, { name: "asc" }] }));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Equipment Registry</h1><form action={createEquipment} className="mt-6 grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_160px_160px_120px_auto]"><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="name" placeholder="Projector / microphone / router" required /><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="type" placeholder="Type" required /><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="serial" placeholder="Serial" /><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="batteryPercent" placeholder="Battery %" type="number" /><button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Add</button></form><section className="mt-8 grid gap-3 md:grid-cols-2">{equipment.map((item) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={item.id}><div className="flex justify-between gap-3"><b>{item.name}</b><span className="text-xs text-brand-300">{item.status}</span></div><p className="mt-1 text-sm text-text-2">{item.type} - {item.serial ?? "No serial"}</p><p className="mt-2 text-xs text-text-3">Battery: {item.batteryPercent ?? "n/a"}%</p></article>)}</section></main></OperationsShell>;
}
