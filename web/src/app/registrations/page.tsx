import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { requirePermissionWithOrganizationOrRedirect } from "@/lib/authorization";
import { listRegistrations } from "@/lib/registration/service";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  const { session, organizationId } = await requirePermissionWithOrganizationOrRedirect("event:manage", "/registrations");
  const rows = await listRegistrations(organizationId);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Event registration</p>
            <h1 className="mt-2 text-3xl font-semibold">Team registrations</h1>
            <p className="mt-2 text-sm text-zinc-400">Complete team submissions, reviewed and approved as one registration.</p>
          </div>
          <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm" href="/registrations/export">Export CSV</Link>
        </div>

        <section className="mt-8 overflow-x-auto rounded-2xl border border-white/[.08]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-zinc-500">
              <tr><th className="p-4">Reference</th><th className="p-4">Team</th><th className="p-4">Category</th><th className="p-4">Status</th><th className="p-4">Participants</th><th className="p-4">Submitted</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-white/[.06]">
                  <td className="p-4 font-mono text-xs"><Link className="text-emerald-300" href={`/registrations/${row.id}`}>{row.referenceNumber}</Link></td>
                  <td className="p-4"><p className="font-semibold">{row.teamName ?? "—"}</p><p className="text-xs text-zinc-500">{row.teamClubOrSchool ?? ""}</p></td>
                  <td className="p-4 text-zinc-300">{row.teamCategory ?? "—"}</td>
                  <td className="p-4 text-zinc-300">{row.status}</td>
                  <td className="p-4 text-zinc-300">{row._count.participants}</td>
                  <td className="p-4 text-zinc-400">{row.submittedAt ? row.submittedAt.toISOString().slice(0, 10) : "Draft"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="p-8 text-center text-zinc-500">No registrations yet.</p> : null}
        </section>
      </main>
    </OperationsShell>
  );
}
