import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { addChecklistItem, addRunbookTask, createChecklist, createRunbook, updateChecklistItemStatus } from "@/app/operations/actions";
import { OpsItemStatus } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function RunbooksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/runbooks");
  if (!hasPermission(session.user.roles, "runbook:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const [checklists, runbooks] = await Promise.all([
    prisma.operationalChecklist.findMany({ include: { items: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "desc" } }),
    prisma.runbook.findMany({ include: { tasks: { orderBy: { dueAt: "asc" } } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Operational Checklists and Runbooks</h1>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <form action={createChecklist} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="font-semibold">Create checklist</h2><input className="mt-4 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="name" placeholder="Draft Day checklist" required /><input className="mt-3 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="category" placeholder="Draft Day" /><button className="mt-3 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Create</button></form>
          <form action={createRunbook} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="font-semibold">Create runbook</h2><input className="mt-4 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="name" placeholder="Match Day runbook" required /><input className="mt-3 w-full rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="category" placeholder="Match Day" /><button className="mt-3 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Create</button></form>
        </div>
        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          {checklists.map((checklist) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={checklist.id}><h2 className="font-semibold">{checklist.name}</h2><p className="text-sm text-zinc-500">{checklist.category}</p><form action={addChecklistItem.bind(null, checklist.id)} className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-2 text-sm" name="label" placeholder="Checklist item" required /><button className="rounded-xl border border-white/10 px-3 py-2 text-sm">Add</button></form><div className="mt-4 space-y-2">{checklist.items.map((item) => <form action={updateChecklistItemStatus.bind(null, item.id)} className="flex items-center justify-between gap-3 rounded-xl bg-black/20 p-3" key={item.id}><span className="text-sm">{item.label}</span><select className="rounded-lg bg-[#050807] px-2 py-1 text-xs" name="status" defaultValue={item.status}>{Object.values(OpsItemStatus).map((x) => <option key={x} value={x}>{x}</option>)}</select><button className="text-xs text-emerald-300">Save</button></form>)}</div></article>)}
          {runbooks.map((runbook) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={runbook.id}><h2 className="font-semibold">{runbook.name}</h2><p className="text-sm text-zinc-500">{runbook.category}</p><form action={addRunbookTask.bind(null, runbook.id)} className="mt-4 grid gap-2 md:grid-cols-[1fr_150px_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-2 text-sm" name="title" placeholder="Timeline task" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-2 text-sm" name="responsible" placeholder="Owner" /><button className="rounded-xl border border-white/10 px-3 py-2 text-sm">Add</button></form><div className="mt-4 space-y-2">{runbook.tasks.map((task) => <div className="rounded-xl bg-black/20 p-3 text-sm" key={task.id}>{task.title} <span className="text-zinc-500">- {task.status}</span></div>)}</div></article>)}
        </section>
      </main>
    </OperationsShell>
  );
}
