import Link from "next/link";
import { redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { listScoresheetImports } from "@/server/scoresheet/imports";
import { uploadCsvScoresheet, uploadScoresheet } from "./actions";

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
          Bring a game&apos;s numbers in as a <strong>structured export</strong> (fastest, exact) or as a{" "}
          <strong>photograph</strong> (OCR reads the table). Either way a human reviews every cell before anything is
          ingested - nothing enters the league data without approval.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <section aria-labelledby="csv-upload" className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 id="csv-upload" className="text-sm font-semibold">
              1 Â· Upload CSV / Excel export
              <span className="ml-2 rounded bg-brand-400/20 px-1.5 py-0.5 text-[10px] font-bold text-brand-300">RECOMMENDED</span>
            </h2>
            <p className="mt-1 text-xs text-text-3">
              A Genius/FIBA box-score CSV: one row per player, a header row, optional <code>## TEAM</code> sections and{" "}
              <code># date:</code> lines. Columns are matched by name, so no layout setup is needed.
            </p>
            <form action={uploadCsvScoresheet} className="mt-3 space-y-3">
              <label className="block text-xs text-text-2">
                CSV file
                <input name="file" type="file" accept=".csv,text/csv" required className="mt-1 block w-full text-sm text-text-1" />
              </label>
              <label className="block text-xs text-text-2">
                Label (e.g. &quot;LBCL Game 12 - Ultra vs LXB&quot;)
                <input name="sourceLabel" required maxLength={180} className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
              </label>
              <button type="submit" className="min-h-[44px] w-full rounded-md bg-brand-400 px-4 text-sm font-bold text-ink-900">
                Read the CSV
              </button>
            </form>
          </section>

          <section aria-labelledby="image-upload" className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 id="image-upload" className="text-sm font-semibold">
              2 Â· Upload image (OCR)
            </h2>
            <p className="mt-1 text-xs text-text-3">
              A photo or scan of a printed sheet. OCR on phone screenshots of a digital export measures poorly, so prefer
              the CSV when the provider can give you one.
            </p>
            <form action={uploadScoresheet} className="mt-3 space-y-3">
              <label className="block text-xs text-text-2">
                Sheet image (JPG or PNG)
                <input name="file" type="file" accept="image/png,image/jpeg" required className="mt-1 block w-full text-sm text-text-1" />
              </label>
              <label className="block text-xs text-text-2">
                Label
                <input name="sourceLabel" required maxLength={180} className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm" />
              </label>
              <label className="block text-xs text-text-2">
                Sheet layout
                <select name="templateKey" defaultValue="lbcl" className="mt-1 min-h-[44px] w-full rounded-md border border-line bg-ink-700 px-3 text-sm">
                  <option value="lbcl">LBCL box score</option>
                  <option value="fiba">FIBA box score</option>
                </select>
              </label>
              <button type="submit" className="min-h-[44px] w-full rounded-md border border-line px-4 text-sm font-semibold text-text-1">
                Upload and read with OCR
              </button>
            </form>
          </section>
        </div>
        <section className="mt-4 rounded-lg border border-line bg-ink-800 p-4">
          <h2 className="text-sm font-semibold">CSV format</h2>
          <pre className="mt-2 overflow-x-auto rounded bg-ink-900 p-3 text-[11px] leading-5 text-text-2">{`# league: Lagos Basketball Community League
# date: 2026-09-20T16:46:00.000Z
# homeScore: 94
# awayScore: 16
# period: Q1,19,2
## LEO KAREEM FOUNDATION
No,Player,Min,PTS,FG,2P,3P,FT,OR,DR,REB,AST,TO,STL,BLK,PF
4,MUSA ALFA,13:51,0,0-0,0-0,0-0,0-0,0,0,0,1,0,1,0,0`}</pre>
          <p className="mt-2 text-xs text-text-3">
            A made-attempted pair (<code>5-8</code>) fills both columns. Columns we do not recognise are reported as
            warnings rather than guessed at.
          </p>
        </section>
        <section className="mt-6">
          <h2 className="text-sm font-semibold">Imports</h2>
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
                    <p className="truncate text-sm text-text-1">
                      <span className="mr-2 rounded bg-ink-600 px-1.5 py-0.5 text-[10px] font-bold text-text-2">{row.format}</span>
                      {row.sourceLabel}
                    </p>
                    <p className="mt-0.5 text-xs text-text-3">
                      {row.createdAt.toISOString().slice(0, 16).replace("T", " ")} Â·{" "}
                      <span className={STATUS_STYLE[row.status] ?? ""}>{row.status}</span>
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
