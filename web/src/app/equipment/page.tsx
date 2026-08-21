import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createEquipment } from "@/app/operations/actions";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function EquipmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/equipment");
  if (!hasPermission(session.user.roles, "equipment:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const equipment = await prisma.equipment.findMany({ orderBy: [{ status: "asc" }, { type: "asc" }, { name: "asc" }] });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Equipment Registry</h1><form action={createEquipment} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_160px_160px_120px_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="name" placeholder="Projector / microphone / router" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="type" placeholder="Type" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="serial" placeholder="Serial" /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="batteryPercent" placeholder="Battery %" type="number" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Add</button></form><section className="mt-8 grid gap-3 md:grid-cols-2">{equipment.map((item) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={item.id}><div className="flex justify-between gap-3"><b>{item.name}</b><span className="text-xs text-emerald-300">{item.status}</span></div><p className="mt-1 text-sm text-zinc-400">{item.type} - {item.serial ?? "No serial"}</p><p className="mt-2 text-xs text-zinc-500">Battery: {item.batteryPercent ?? "n/a"}%</p></article>)}</section></main></OperationsShell>;
}
