import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { upsertDisplayHeartbeat } from "@/app/operations/actions";
import { DisplaySurface, OpsHealthStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function DisplayMonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/display-monitoring");
  if (!hasPermission(session.user.roles, "operations:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const displays = await withOrganizationContext(session.user.organizationId, (tx) => tx.displayHeartbeat.findMany({ orderBy: [{ status: "desc" }, { updatedAt: "desc" }] }));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Display Monitoring</h1><form action={upsertDisplayHeartbeat} className="mt-6 grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_1fr_160px_auto]"><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="surface" defaultValue={DisplaySurface.PUBLIC_DISPLAY}>{Object.values(DisplaySurface).map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="label" placeholder="Display label" /><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="status" defaultValue={OpsHealthStatus.GREEN}>{Object.values(OpsHealthStatus).map((x) => <option key={x} value={x}>{x}</option>)}</select><button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Heartbeat</button></form><section className="mt-8 grid gap-3 md:grid-cols-2">{displays.map((d) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={d.id}><div className="flex justify-between"><b>{d.label}</b><span className={d.status === "GREEN" ? "text-brand-300" : d.status === "AMBER" ? "text-warn" : "text-danger"}>{d.status}</span></div><p className="text-sm text-text-2">{d.surface.replaceAll("_", " ")}</p><p className="mt-2 text-xs text-text-3">Last heartbeat: {d.lastSeenAt?.toLocaleString() ?? "Never"}</p></article>)}</section></main></OperationsShell>;
}
