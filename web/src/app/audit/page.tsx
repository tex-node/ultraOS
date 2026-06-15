import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermission } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";

export default async function AuditPage() {
  const session = await requirePermission("audit:view");
  const logs = await prisma.auditLog.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Append-only record</p>
        <h1 className="mt-2 text-3xl font-semibold">Audit ledger</h1>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-white/[.08]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[.04] text-zinc-400">
              <tr><th className="p-4">Timestamp</th><th className="p-4">User</th><th className="p-4">Action</th><th className="p-4">Entity</th><th className="p-4">Details</th></tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-t border-white/[.06] align-top">
                  <td className="p-4 whitespace-nowrap">{log.createdAt.toLocaleString()}</td>
                  <td className="p-4"><p>{log.user.name}</p><p className="text-xs text-zinc-500">{log.user.email}</p></td>
                  <td className="p-4 text-emerald-300">{log.action.replaceAll("_", " ")}</td>
                  <td className="p-4"><p>{log.entityType}</p><p className="font-mono text-xs text-zinc-500">{log.entityId}</p></td>
                  <td className="max-w-md p-4 font-mono text-xs text-zinc-400">{log.details ? JSON.stringify(log.details) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 ? <p className="p-8 text-center text-zinc-500">No critical actions recorded yet.</p> : null}
        </div>
      </main>
    </OperationsShell>
  );
}
