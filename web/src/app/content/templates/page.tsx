import { OperationsShell } from "@/app/components/operations-shell";
import { updateContentTemplate } from "../actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function ContentTemplatesPage() {
  const { session, organizationId } = await requirePermissionWithOrganization("content:manage");
  const templates = await withOrganizationContext(organizationId, (tx) =>
    tx.contentTemplate.findMany({
      include: { competition: true },
      orderBy: [{ type: "asc" }, { version: "desc" }],
    }),
  );
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-brand-400">Versioned copy rules</p>
        <h1 className="mt-2 text-3xl font-semibold">Content templates</h1>
        <p className="mt-2 text-text-2">Variables use double braces, for example <code>{"{{club}}"}</code>. Generated assets retain their original rendered snapshot.</p>
        <div className="mt-8 space-y-5">
          {templates.map((template) => (
            <form key={template.id} action={updateContentTemplate.bind(null,template.id)} className="rounded-lg border border-line bg-ink-800 p-5">
              <div className="flex justify-between"><p className="text-sm text-brand-300">{template.type.replaceAll("_", " ")}</p><p className="text-xs text-text-3">{template.competition?.name ?? "Global"} | v{template.version}</p></div>
              <input name="name" defaultValue={template.name} className="mt-4 w-full rounded-lg bg-white/[.05] p-3 font-semibold" />
              <label className="mt-4 block text-sm text-text-2">Text template<textarea name="textTemplate" defaultValue={template.textTemplate} rows={8} className="mt-1 w-full rounded-lg bg-white/[.05] p-3 font-mono text-sm" /></label>
              <label className="mt-4 block text-sm text-text-2">HTML template<textarea name="htmlTemplate" defaultValue={template.htmlTemplate} rows={8} className="mt-1 w-full rounded-lg bg-white/[.05] p-3 font-mono text-sm" /></label>
              <button className="mt-4 rounded-lg bg-brand-400 px-4 py-3 font-semibold text-ink-900">Save template</button>
            </form>
          ))}
        </div>
      </main>
    </OperationsShell>
  );
}
