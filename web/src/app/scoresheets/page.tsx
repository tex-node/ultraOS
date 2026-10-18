import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { listScoresheetImports } from "@/server/scoresheet/imports";
import { uploadScoresheet } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  UPLOADED: "text-text-2",
  EXTRACTED: "text-info",
  REVIEW_REQUIRED: "text-warn",
  APPROVED: "text-success",
  INGESTED: "text-success",
  REJECTED: "text-danger",
  FAILED: "text-danger",
};

export default async function ScoresheetsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/scoresheets");
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
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const rows = await withOrganizationContext(session.user.organizationId, (tx) => listScoresheetImports(tx, session.user.organizationId!));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Scoresheets</h1>
          <Link href="/imports" className="text-sm text-info underline">
            Data imports
          </Link>
        </div>
        <p className="mt-1 text-sm text-text-2">
          Photograph or scan a printed box score. OCR reads the table, then a human reviews every cell before it can be
          ingested - nothing enters the league data without approval.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 className="text-sm font-semibold">Upload a sheet</h2>
          <form action={uploadScoresheet} className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-text-2">
              Sheet image (JPG or PNG)
              <input name="file" type="file" accept="image/png,image/jpeg" required className="mt-1 block w-full text-sm text-text-1" />
            </label>
            <label className="block text-xs text-text-2">
              Label (e.g. &quot;LBCL Game 12 - Ultra vs LXB&quot;)
              <input name="sourceLabel" required maxLength={180} className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
            </label>
            <label className="block text-xs text-text-2">
              Sheet layout
              <select name="templateKey" defaultValue="lbcl" className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm">
                <option value="lbcl">LBCL box score</option>
                <option value="fiba">FIBA box score</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="submit" className="min-h-[44px] rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900">
                Upload and read
              </button>
            </div>
          </form>
          <p className="mt-2 text-xs text-text-3">OCR runs on upload and can take a few seconds per sheet.</p>
        </section>

        <section className="mt-6">
          <h2 className="text-sm font-semibold">Imports</h2>
          {rows.length === 0 ? (
            <p className="mt-2 text-sm text-text-2">No scoresheets yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text-1">{row.sourceLabel}</p>
                    <p className="mt-0.5 text-xs text-text-3">
                      {row.createdAt.toISOString().slice(0, 16).replace("T", " ")} Â· <span className={STATUS_STYLE[row.status] ?? ""}>{row.status}</span>
                      {row.failureReason ? <span className="text-danger"> Â· {row.failureReason}</span> : null}
                    </p>
                  </div>
                  <Link href={`/scoresheets/${row.id}/review`} className="shrink-0 text-sm text-info underline">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
