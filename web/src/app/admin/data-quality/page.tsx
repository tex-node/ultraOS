import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { withOrganizationContext } from "@/lib/tenant-context";
import { loadDataQuality } from "@/server/admin/data-quality";

export const dynamic = "force-dynamic";

// Data quality (streak v18, Prompt 4).
//
// What a sportsbook partner actually asks: how many finals, where did each result come from, how often was it
// independently verified, and does the arithmetic hold. Every number is queried at request time - a stale dashboard is
// worse than none, because it looks like evidence.
export default async function DataQualityPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin/data-quality");
  if (!session.user.roles.includes("SUPER_ADMIN")) redirect("/dashboard");
  if (!session.user.organizationId) redirect("/dashboard");

  const report = await withOrganizationContext(session.user.organizationId, () => loadDataQuality(session.user.organizationId!));
  const integrityTotal = report.integrity.playerPointsMismatches.length + report.integrity.periodSumMismatches.length;
  const percent = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(1)}%`);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">Platform administration</p>
        <h1 className="mt-2 text-2xl font-bold">Data quality</h1>
        <p className="mt-1 text-sm text-text-2">
          Every figure is read from this organization&apos;s own data at request time. The integrity checks are the same
          two sums the batch verifier runs, against the database instead of a JSON file.
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Final games", value: String(report.finals) },
            { label: "Verified box scores", value: `${report.verified} · ${percent(report.verifiedRate)}` },
            { label: "Highlight clips", value: String(report.highlights) },
            { label: "Integrity checks", value: integrityTotal === 0 ? "pass" : `${integrityTotal} failed` },
          ].map((card) => (
            <div key={card.label} className={`rounded-lg border p-4 ${card.label === "Integrity checks" && integrityTotal > 0 ? "border-danger/40" : "border-line"} bg-ink-800`}>
              <p className="text-[10px] uppercase tracking-wider text-text-3">{card.label}</p>
              <p className="mt-1 font-mono text-lg text-text-1">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Result source</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {report.byStatSource.length === 0 ? <li className="text-text-3">No final games.</li> : report.byStatSource.map((row) => (
                <li key={row.source} className="flex justify-between font-mono text-text-2">
                  <span>{row.source}</span>
                  <span>{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Record origin</h2>
            <ul className="mt-2 space-y-1 text-xs">
              {report.byOrigin.length === 0 ? <li className="text-text-3">No final games.</li> : report.byOrigin.map((row) => (
                <li key={row.origin} className="flex justify-between font-mono text-text-2">
                  <span>{row.origin}</span>
                  <span>{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">
            Integrity · {report.integrity.checkedGames} final games checked
          </h2>
          {integrityTotal === 0 ? (
            <p className="mt-2 text-xs text-brand-300">
              Every checked side&apos;s player points match its final score, and every period sum matches it too.
            </p>
          ) : (
            <div className="mt-2 space-y-2 text-xs">
              {report.integrity.playerPointsMismatches.map((row, index) => (
                <p key={`p${index}`} className="font-mono text-danger">
                  {row.gameId} · {row.side}: score {row.score} vs player points {row.statSum}
                </p>
              ))}
              {report.integrity.periodSumMismatches.map((row, index) => (
                <p key={`q${index}`} className="font-mono text-danger">
                  {row.gameId} · {row.side}: final {row.finalScore} vs period sum {row.periodSum}
                </p>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-text-3">
            A game with no box score at all is not counted as a mismatch - missing data and wrong data are different
            problems, and conflating them makes a report nobody trusts.
          </p>
        </section>
      </main>
    </OperationsShell>
  );
}
