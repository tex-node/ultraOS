import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { recordSeasonZeroPlayerResolutionAction } from "@/app/data-quality/season-zero-production/actions";
import { seasonZeroPlayerResolutionActions, seasonZeroProductionReconciliation } from "@/lib/season-zero-production-reconciliation";
import { hasPermission } from "@/lib/permissions";

const DUPLICATE_APPLICATION_IDS = new Set([
  "cmroxtfm800a8fekk9cb94x3n", // Ifoghale Justine
  "cmrotfxv2009qfekk9lz8e0ww", // Oluwatobiloba Ekundayo
  "cmrnffavp0065fekk1cxact63", // Samuel Kalejaiye
  "cmro4am1h007ufekkgrjohfcv", // Biola Moses
]);

export default async function SeasonZeroProductionReviewPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/data-quality/season-zero-production");
  if (!hasPermission(session.user.roles, "data:readiness")) {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }

  const rows = await seasonZeroProductionReconciliation();
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.resolutionStatus] = (acc[row.resolutionStatus] ?? 0) + 1;
    return acc;
  }, {});
  const visible = status ? rows.filter((r) => r.resolutionStatus === status) : rows;

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <Link className="text-sm text-zinc-400" href="/data-quality/duplicates">Back to data quality</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-emerald-400">Production reconciliation</p>
        <h1 className="mt-2 text-3xl font-semibold">Season Zero production player review</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          The 58 selected Season Zero players, matched by the authoritative <code>Application ID</code> from{" "}
          TryOutsPlayers.xlsx directly against the live Application table — never inferred from email or phone.
          This page only records a decision (SystemSetting + AuditLog); it never writes Application.status by
          itself. Applying a recorded decision is a separate, explicitly-authorized action.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 text-sm md:grid-cols-5">
          {["READY", "SUBMITTED_REQUIRES_APPROVAL", "REJECTED_REQUIRES_OVERRIDE", "MISSING", "RESOLVED"].map((s) => (
            <Link
              className={status === s ? "rounded-xl bg-emerald-400 px-3 py-3 text-center font-semibold text-zinc-950" : "rounded-xl border border-white/10 px-3 py-3 text-center text-zinc-300"}
              href={`/data-quality/season-zero-production?status=${s}`}
              key={s}
            >
              <p className="text-xs uppercase tracking-wide">{s.replaceAll("_", " ")}</p>
              <p className="text-xl font-bold">{counts[s] ?? 0}</p>
            </Link>
          ))}
        </div>
        <Link className="mt-3 inline-block text-sm text-emerald-400" href="/data-quality/season-zero-production">Clear filter (show all 58)</Link>

        <section className="mt-8 overflow-hidden rounded-2xl border border-white/[.08]">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/[.04] text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="p-4">Player</th>
                <th className="p-4">Division / Group</th>
                <th className="p-4">Application status</th>
                <th className="p-4">Duplicate?</th>
                <th className="p-4">Decision</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr className="border-t border-white/[.06]" key={row.applicationId}>
                  <td className="p-4">
                    <p className="font-semibold">{row.name}</p>
                    <p className="text-xs text-zinc-500">{row.applicationId}</p>
                  </td>
                  <td className="p-4 text-zinc-300">
                    {row.division} · {row.draftSelectionGroup.replaceAll("_", " ")}{row.mainDraftGroupNumber ? ` (Group ${row.mainDraftGroupNumber})` : ""}
                  </td>
                  <td className="p-4">{row.productionApplicationStatus}</td>
                  <td className="p-4">
                    {DUPLICATE_APPLICATION_IDS.has(row.applicationId) ? (
                      <Link className="text-amber-300 underline" href={`/data-quality/season-zero-production/${row.applicationId}/duplicates`}>Yes — review candidates</Link>
                    ) : "No"}
                  </td>
                  <td className="p-4">
                    {row.resolution ? (
                      <div className="text-xs text-emerald-300">
                        <p className="font-semibold">{row.resolution.action.replaceAll("_", " ")}</p>
                        <p className="text-zinc-500">{row.resolution.reason}</p>
                      </div>
                    ) : row.resolutionStatus === "READY" ? (
                      <span className="text-xs text-zinc-500">No decision needed</span>
                    ) : (
                      <form action={recordSeasonZeroPlayerResolutionAction.bind(null, row.applicationId)} className="grid gap-2">
                        <select className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="action" required>
                          <option value="">Select action</option>
                          {seasonZeroPlayerResolutionActions.map((a) => <option key={a} value={a}>{a.replaceAll("_", " ")}</option>)}
                        </select>
                        <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-1 text-xs" name="reason" placeholder="Required reason" required />
                        <button className="rounded-lg border border-emerald-400/40 px-2 py-1 text-xs text-emerald-100">Record decision</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </OperationsShell>
  );
}
