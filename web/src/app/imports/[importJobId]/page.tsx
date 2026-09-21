import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { cancelImport, confirmImport, updateImportRowResolution } from "@/app/imports/actions";
import {
  ImportResolutionAction,
  ImportRowStatus,
  ImportStatus,
} from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function ImportJobPage({ params }: { params: Promise<{ importJobId: string }> }) {
  const session = await auth();
  const { importJobId } = await params;
  if (!session?.user) redirect(`/login?callbackUrl=/imports/${importJobId}`);
  if (!hasPermission(session.user.roles, "data:import")) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <h1 className="text-3xl font-semibold">Access required</h1>
          <p className="mt-3 text-sm text-text-2">Your account cannot access data imports.</p>
        </main>
      </OperationsShell>
    );
  }
  if (!session.user.organizationId) {
    throw new MissingOrganizationContextError();
  }

  const job = await withOrganizationContext(session.user.organizationId, (tx) => tx.importJob.findUnique({
    include: {
      rows: { orderBy: { rowNumber: "asc" } },
      uploadedBy: { select: { email: true, name: true } },
    },
    where: { id: importJobId },
  }));
  if (!job) notFound();

  const unresolvedErrors = job.rows.filter(
    (row) =>
      row.status === ImportRowStatus.ERROR &&
      row.resolutionAction !== ImportResolutionAction.SKIP &&
      row.resolutionAction !== ImportResolutionAction.REJECT,
  ).length;
  const terminalStatuses: ImportStatus[] = [
    ImportStatus.COMPLETED,
    ImportStatus.PARTIALLY_COMPLETED,
    ImportStatus.FAILED,
    ImportStatus.CANCELLED,
    ImportStatus.PROCESSING,
  ];
  const canConfirm =
    unresolvedErrors === 0 &&
    !terminalStatuses.includes(job.status);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-brand-400 hover:text-brand-300" href="/imports">
          Back to imports
        </Link>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-brand-400">{job.type} import</p>
            <h1 className="mt-2 text-3xl font-semibold">{job.fileName}</h1>
            <p className="mt-2 text-sm text-text-2">
              Uploaded by {job.uploadedBy.name} ({job.uploadedBy.email}) on {job.createdAt.toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-line px-4 py-3 text-sm text-text-1" href={`/imports/${job.id}/report`}>
              Download report
            </Link>
            <form action={cancelImport}>
              <input name="importJobId" type="hidden" value={job.id} />
              <button className="rounded-md border border-line px-4 py-3 text-sm text-text-1">Cancel</button>
            </form>
            <form action={confirmImport}>
              <input name="importJobId" type="hidden" value={job.id} />
              <button
                className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canConfirm}
              >
                Confirm import
              </button>
            </form>
          </div>
        </div>

        <section className="mt-8 grid gap-4 md:grid-cols-6">
          <Metric label="Total" value={job.totalRows} />
          <Metric label="Valid" value={job.validRows} />
          <Metric label="Warnings" value={job.warningRows} />
          <Metric label="Errors" value={job.errorRows} />
          <Metric label="Imported" value={job.importedRows} />
          <Metric label="Failed" value={job.failedRows} />
        </section>
        {unresolvedErrors > 0 ? (
          <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
            {unresolvedErrors} error row{unresolvedErrors === 1 ? "" : "s"} must be skipped,
            rejected, or resolved before confirmation.
          </p>
        ) : null}

        <section className="mt-8 grid gap-4">
          {job.rows.map((row) => (
            <article className="rounded-lg border border-line bg-ink-800 p-5" key={row.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full border border-line px-3 py-1 text-xs uppercase tracking-wider text-text-1">
                      Row {row.rowNumber}
                    </span>
                    <span className={statusClass(row.status)}>{row.status.replaceAll("_", " ")}</span>
                    {row.resolutionAction ? (
                      <span className="text-xs text-text-3">Action: {row.resolutionAction}</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-text-2">
                    Match: {row.matchedEntityType ?? "none"} {row.matchedEntityId ?? ""}
                  </p>
                  {row.importedEntityId ? (
                    <p className="mt-1 text-sm text-brand-300">
                      Imported {row.importedEntityType}: {row.importedEntityId}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <JsonCard title="Normalized data" value={row.normalizedData} />
                <JsonCard title="Warnings" value={row.warnings} />
                <JsonCard title="Errors" value={row.errors} />
              </div>
              <form action={updateImportRowResolution} className="mt-4 grid gap-3 rounded-md border border-line bg-black/20 p-4 md:grid-cols-[1fr_1fr_2fr_auto]">
                <input name="rowId" type="hidden" value={row.id} />
                <select
                  className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
                  defaultValue={row.resolutionAction ?? ""}
                  name="resolutionAction"
                  required
                >
                  <option value="">Select action</option>
                  {Object.values(ImportResolutionAction).map((action) => (
                    <option key={action} value={action}>{action.replaceAll("_", " ")}</option>
                  ))}
                </select>
                <input
                  className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
                  defaultValue={row.matchedEntityId ?? ""}
                  name="matchedEntityId"
                  placeholder="Matched entity ID when linking"
                />
                <input
                  className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm"
                  name="resolutionNote"
                  placeholder="Resolution note"
                />
                <button className="rounded-md border border-line px-4 py-3 text-sm font-semibold text-text-1 hover:border-emerald-400">
                  Save resolution
                </button>
              </form>
            </article>
          ))}
        </section>
      </main>
    </OperationsShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-line bg-ink-800 p-5">
      <p className="text-xs uppercase tracking-[.18em] text-text-3">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-line bg-black/20 p-3">
      <p className="text-xs uppercase tracking-[.18em] text-text-3">{title}</p>
      <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs text-text-1">
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}

function statusClass(status: ImportRowStatus) {
  if (status === ImportRowStatus.ERROR || status === ImportRowStatus.FAILED) {
    return "text-xs text-danger";
  }
  if (status === ImportRowStatus.WARNING) return "text-xs text-warn";
  if (status === ImportRowStatus.IMPORTED) return "text-xs text-brand-300";
  return "text-xs text-text-2";
}
