import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createNotification } from "@/app/operations/actions";
import { OpsSeverity } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/notifications");
  if (!hasPermission(session.user.roles, "notification:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const notifications = await prisma.opsNotification.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Notification Center</h1><form action={createNotification} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_160px_160px_2fr_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="title" placeholder="Notification" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="category" placeholder="Category" /><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="severity" defaultValue={OpsSeverity.MEDIUM}>{Object.values(OpsSeverity).map((x) => <option key={x} value={x}>{x}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="message" placeholder="Message" required /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Create</button></form><section className="mt-8 grid gap-3">{notifications.map((n) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={n.id}><b>{n.title}</b><p className="text-sm text-zinc-400">{n.category} - {n.severity} - {n.status}</p><p className="mt-2 text-sm text-zinc-500">{n.message}</p></article>)}</section></main></OperationsShell>;
}
