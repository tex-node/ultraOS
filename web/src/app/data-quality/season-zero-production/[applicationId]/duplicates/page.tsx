import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { recordSeasonZeroPlayerResolutionAction } from "@/app/data-quality/season-zero-production/actions";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { SEASON_ZERO_SELECTED_PLAYERS, duplicateCandidatesForApplication, seasonZeroPlayerResolutionActions } from "@/lib/season-zero-production-reconciliation";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function SeasonZeroDuplicateReviewPage({ params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/data-quality/season-zero-production/${applicationId}/duplicates`);
  let organizationId: string;
  try {
    ({ organizationId } = await requirePermissionWithOrganization("data:readiness"));
  } catch {
    return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  }
  const selected = SEASON_ZERO_SELECTED_PLAYERS.find((p) => p.applicationId === applicationId);
  if (!selected) notFound();

  const candidates = await withOrganizationContext(organizationId, (tx) => duplicateCandidatesForApplication(applicationId, tx, organizationId));

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link className="text-sm text-zinc-400" href="/data-quality/season-zero-production">Back to Season Zero review</Link>
        <p className="mt-6 text-xs uppercase tracking-[.2em] text-emerald-400">Duplicate identity review</p>
        <h1 className="mt-2 text-3xl font-semibold">{selected.name}</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {candidates.length} candidate Application{candidates.length === 1 ? "" : "s"} found by matching email.
          The workbook-specified canonical Application is marked below. Nothing is merged, deleted, approved, or
          rejected here — recording a decision only stores it for later, explicitly-authorized application.
        </p>

        <div className="mt-8 grid gap-4">
          {candidates.map((c) => (
            <div className={c.isCanonical ? "rounded-2xl border border-emerald-400/40 bg-emerald-400/5 p-5" : "rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"} key={c.applicationId}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{c.applicationId} {c.isCanonical ? <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-xs font-bold text-zinc-950">WORKBOOK CANONICAL</span> : null}</p>
                <span className="text-xs uppercase text-zinc-400">{c.status}</span>
              </div>
              <div className="mt-3 grid gap-1 text-sm text-zinc-300 md:grid-cols-2">
                <p>Name: {c.normalizedName}</p>
                <p>User ID: {c.userId ?? "-"}</p>
                <p>Email: {c.maskedEmail}</p>
                <p>Phone: {c.maskedPhone}</p>
                <p>Submitted: {new Date(c.submittedAt).toISOString()}</p>
                <p>Reviewed: {c.reviewedAt ? new Date(c.reviewedAt).toISOString() : "-"}</p>
              </div>
              {c.reviewNotes ? <p className="mt-2 text-xs text-zinc-500">Notes: {c.reviewNotes}</p> : null}
              <form action={recordSeasonZeroPlayerResolutionAction.bind(null, applicationId)} className="mt-4 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
                <input name="candidateApplicationId" type="hidden" value={c.applicationId} />
                <select className="rounded-lg border border-white/10 bg-[#050807] px-2 py-2 text-xs" defaultValue={c.isCanonical ? "USE_AS_CANONICAL_SEASON_ZERO_APPLICATION" : "KEEP_AS_HISTORICAL_DUPLICATE"} name="action">
                  {seasonZeroPlayerResolutionActions.map((a) => <option key={a} value={a}>{a.replaceAll("_", " ")}</option>)}
                </select>
                <input className="rounded-lg border border-white/10 bg-[#050807] px-2 py-2 text-xs" name="reason" placeholder="Required reason" required />
                <button className="rounded-lg border border-white/10 px-3 py-2 text-xs">Record for this candidate</button>
              </form>
            </div>
          ))}
        </div>
      </main>
    </OperationsShell>
  );
}
