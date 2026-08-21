import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createOpsTask, updateOpsTaskStatus } from "@/app/operations/actions";
import { OpsItemStatus, OpsSeverity } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { isOverdue } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

export default async function TasksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/tasks");
  if (!hasPermission(session.user.roles, "operations:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const tasks = await prisma.opsTask.findMany({ orderBy: [{ dueAt: "asc" }, { priority: "desc" }] });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Event Task Engine</h1><form action={createOpsTask} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_160px_200px_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="title" placeholder="Task" required /><select className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="priority" defaultValue={OpsSeverity.MEDIUM}>{Object.values(OpsSeverity).map((x) => <option key={x} value={x}>{x}</option>)}</select><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="dueAt" type="datetime-local" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Add</button></form><section className="mt-8 grid gap-3">{tasks.map((task) => <form action={updateOpsTaskStatus.bind(null, task.id)} className="grid gap-3 rounded-xl border border-white/[.08] bg-[#0b100e] p-4 md:grid-cols-[1fr_130px_160px_auto]" key={task.id}><span><b>{task.title}</b><p className={isOverdue(task.dueAt, task.status) ? "text-xs text-rose-300" : "text-xs text-zinc-500"}>{task.dueAt?.toLocaleString() ?? "No due time"} - {task.priority}</p></span><select className="rounded-xl bg-[#050807] px-3 py-2 text-sm" name="status" defaultValue={task.status}>{Object.values(OpsItemStatus).map((x) => <option key={x} value={x}>{x}</option>)}</select><input className="rounded-xl bg-[#050807] px-3 py-2 text-sm" name="notes" placeholder="Notes" /><button className="rounded-xl border border-white/10 px-3 py-2 text-sm">Save</button></form>)}</section></main></OperationsShell>;
}
