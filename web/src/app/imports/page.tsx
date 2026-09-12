import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function ImportsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/imports");
  if (!hasPermission(session.user.roles, "data:import")) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold">Access required</h1>
          <p className="mt-3 text-sm text-zinc-400">Your account cannot access data imports.</p>
        </main>
      </OperationsShell>
    );
  }
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }

  const jobs = await withOrganizationContext(session.user.organizationId, (tx) => tx.importJob.findMany({
    include: { uploadedBy: { select: { email: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  }));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-emerald-400">Data operations</p>
            <h1 className="mt-2 text-3xl font-semibold">Import history</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950" href="/players/import">Players</Link>
            <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200" href="/coaches/import">Coaches</Link>
            <Link className="rounded-xl border border-white/10 px-4 py-3 text-sm text-zinc-200" href="/clubs/import">Clubs</Link>
          </div>
        </div>
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/[.08]">
          <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-3 bg-white/[.04] p-4 text-xs uppercase tracking-wider text-zinc-500">
            <span>Import</span>
            <span>Uploaded by</span>
            <span>Date</span>
            <span>Rows</span>
            <span>Status</span>
            <span>Report</span>
          </div>
          {jobs.map((job) => (
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-t border-white/[.06] bg-[#0b100e] p-4 text-sm" key={job.id}>
              <Link className="font-semibold text-emerald-300" href={`/imports/${job.id}`}>
                {job.type} - {job.fileName}
              </Link>
              <span className="text-zinc-400">{job.uploadedBy.name} ({job.uploadedBy.email})</span>
              <span className="text-zinc-400">{job.createdAt.toLocaleString()}</span>
              <span className="text-zinc-400">
                {job.totalRows} total / {job.importedRows} imported / {job.skippedRows} skipped / {job.failedRows} failed
              </span>
              <span className="text-zinc-300">{job.status.replaceAll("_", " ")}</span>
              <Link className="text-emerald-400" href={`/imports/${job.id}/report`}>Download</Link>
            </div>
          ))}
          {jobs.length === 0 ? (
            <p className="bg-[#0b100e] p-8 text-center text-zinc-400">No imports yet.</p>
          ) : null}
        </div>
      </main>
    </OperationsShell>
  );
}
