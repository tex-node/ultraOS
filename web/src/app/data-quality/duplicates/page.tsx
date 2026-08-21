import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { approvedPlayerDuplicateGroups, duplicateIdentityReport } from "@/lib/data-quality";
import { draftCohortAnalysis } from "@/lib/draft-cohort";
import { hasPermission } from "@/lib/permissions";

export default async function DuplicateReviewPage({ searchParams }: { searchParams: Promise<{ filter?: string; scope?: string }> }) {
  const { filter, scope } = await searchParams;
  const draftCohortOnly = filter === "draft-cohort" || scope === "draft-cohort";
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/data-quality/duplicates");
  if (!hasPermission(session.user.roles, "data:readiness")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const [report, approvedPlayerGroups, cohortAnalysis] = await Promise.all([duplicateIdentityReport(), approvedPlayerDuplicateGroups(), draftCohortAnalysis()]);
  const cohortApplicationIds = new Set(cohortAnalysis.rows.map((row) => row.matchedApplicationId ?? row.applicationId).filter(Boolean));
  const cohortRowsByApplicationId = new Map(cohortAnalysis.rows.map((row) => [row.matchedApplicationId ?? row.applicationId, row]));
  const visibleGroups = draftCohortOnly
    ? approvedPlayerGroups.filter((group) => group.applications.some((application) => cohortApplicationIds.has(application.applicationId)))
    : [...approvedPlayerGroups].sort((left, right) => Number(right.applications.some((application) => cohortApplicationIds.has(application.applicationId))) - Number(left.applications.some((application) => cohortApplicationIds.has(application.applicationId))));
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-3xl font-semibold">Duplicate Identity Review</h1>
        <p className="mt-2 text-sm text-zinc-400">Read-only duplicate candidates. Ambiguous identities are not merged automatically; permanent Ultra IDs must be preserved or retired through alias records after review.</p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm">
          <Link className={draftCohortOnly ? "rounded-xl border border-white/10 px-4 py-3 text-zinc-300" : "rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950"} href="/data-quality/duplicates">All duplicate groups</Link>
          <Link className={draftCohortOnly ? "rounded-xl bg-emerald-400 px-4 py-3 font-semibold text-zinc-950" : "rounded-xl border border-white/10 px-4 py-3 text-zinc-300"} href="/data-quality/duplicates?scope=draft-cohort">Draft Cohort Only</Link>
        </div>
        <section className="mt-8 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5">
          <h2 className="text-lg font-semibold">Approved player application duplicate groups</h2>
          <p className="mt-1 text-xs text-zinc-500">{draftCohortOnly ? "Showing only duplicate groups that contain selected-cohort applications." : "Showing all approved-player duplicate groups."}</p>
          <div className="mt-4 grid gap-2">{visibleGroups.length ? visibleGroups.map((group) => {
            const selectedRows = group.applications.map((application) => cohortRowsByApplicationId.get(application.applicationId)).filter(isDefined);
            return (
              <Link className="rounded-xl border border-white/[.06] bg-black/20 px-4 py-3 text-sm" href={`/data-quality/duplicates/${group.id}`} key={group.id}>
                <div className="flex flex-wrap justify-between gap-3">
                  <span>{group.id}</span>
                  <span className={group.currentResolution === "UNRESOLVED" ? "text-amber-300" : "text-emerald-300"}>{group.currentResolution}</span>
                </div>
                {selectedRows.length ? <p className="mt-2 text-xs text-zinc-400">Selected cohort: {selectedRows.map((row) => `${row.worksheet} row ${row.rowNumber} - ${row.fullName}`).join("; ")}</p> : <p className="mt-2 text-xs text-zinc-600">Not in selected cohort</p>}
              </Link>
            );
          }) : <p className="text-sm text-zinc-500">No duplicate groups for this filter.</p>}</div>
        </section>
        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <Panel title="User email duplicates" rows={report.userEmails} keyName="email" />
          <Panel title="Athlete email duplicates" rows={report.athleteEmails} keyName="email" />
          <Panel title="Staff email duplicates" rows={report.staffEmails} keyName="email" />
          <Panel title="Athlete name duplicates" rows={report.athleteNames} keyName="name" />
          <Panel title="Staff name duplicates" rows={report.staffNames} keyName="name" />
        </section>
      </main>
    </OperationsShell>
  );
}

function Panel({ title, rows, keyName }: { title: string; rows: Record<string, string | number>[]; keyName: string }) {
  return <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 grid gap-2">{rows.length ? rows.map((row) => <div className="flex justify-between rounded-xl border border-white/[.06] bg-black/20 px-4 py-3 text-sm" key={String(row[keyName])}><span className="text-zinc-400">{row[keyName]}</span><b>{row.count}</b></div>) : <p className="text-sm text-zinc-500">No duplicate candidates.</p>}</div></section>;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
