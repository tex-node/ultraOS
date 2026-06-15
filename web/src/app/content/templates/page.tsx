import { OperationsShell } from "@/app/components/operations-shell";
import { updateContentTemplate } from "../actions";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function ContentTemplatesPage() {
  const session = await requirePermission("content:manage");
  const templates = await prisma.contentTemplate.findMany({
    include: { competition: true },
    orderBy: [{ type: "asc" }, { version: "desc" }],
  });
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Versioned copy rules</p>
        <h1 className="mt-2 text-3xl font-semibold">Content templates</h1>
        <p className="mt-2 text-zinc-400">Variables use double braces, for example <code>{"{{club}}"}</code>. Generated assets retain their original rendered snapshot.</p>
        <div className="mt-8 space-y-5">
          {templates.map((template) => (
            <form key={template.id} action={updateContentTemplate.bind(null,template.id)} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
              <div className="flex justify-between"><p className="text-sm text-emerald-300">{template.type.replaceAll("_", " ")}</p><p className="text-xs text-zinc-500">{template.competition?.name ?? "Global"} | v{template.version}</p></div>
              <input name="name" defaultValue={template.name} className="mt-4 w-full rounded-lg bg-white/[.05] p-3 font-semibold" />
              <label className="mt-4 block text-sm text-zinc-400">Text template<textarea name="textTemplate" defaultValue={template.textTemplate} rows={8} className="mt-1 w-full rounded-lg bg-white/[.05] p-3 font-mono text-sm" /></label>
              <label className="mt-4 block text-sm text-zinc-400">HTML template<textarea name="htmlTemplate" defaultValue={template.htmlTemplate} rows={8} className="mt-1 w-full rounded-lg bg-white/[.05] p-3 font-mono text-sm" /></label>
              <button className="mt-4 rounded-lg bg-emerald-400 px-4 py-3 font-semibold text-zinc-950">Save template</button>
            </form>
          ))}
        </div>
      </main>
    </OperationsShell>
  );
}
