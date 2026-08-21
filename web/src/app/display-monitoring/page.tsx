import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { upsertDisplayHeartbeat } from "@/app/operations/actions";
import { DisplaySurface, OpsHealthStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function DisplayMonitoringPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/display-monitoring");
  if (!hasPermission(session.user.roles, "operations:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const displays = await prisma.displayHeartbeat.findMany({ orderBy: [{ status: "desc" }, { updatedAt: "desc" }] });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Display Monitoring</h1><form action={upsertDisplayHeartbeat} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_1fr_160px_auto]"><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="surface" defaultValue={DisplaySurface.PUBLIC_DISPLAY}>{Object.values(DisplaySurface).map((x) => <option key={x} value={x}>{x.replaceAll("_", " ")}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="label" placeholder="Display label" /><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="status" defaultValue={OpsHealthStatus.GREEN}>{Object.values(OpsHealthStatus).map((x) => <option key={x} value={x}>{x}</option>)}</select><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Heartbeat</button></form><section className="mt-8 grid gap-3 md:grid-cols-2">{displays.map((d) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={d.id}><div className="flex justify-between"><b>{d.label}</b><span className={d.status === "GREEN" ? "text-emerald-300" : d.status === "AMBER" ? "text-amber-300" : "text-rose-300"}>{d.status}</span></div><p className="text-sm text-zinc-400">{d.surface.replaceAll("_", " ")}</p><p className="mt-2 text-xs text-zinc-500">Last heartbeat: {d.lastSeenAt?.toLocaleString() ?? "Never"}</p></article>)}</section></main></OperationsShell>;
}
