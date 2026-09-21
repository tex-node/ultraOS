import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously read every organization's training sessions via the bare,
// unscoped client. Scoped to the acting user's own organization.
export default async function TrainingPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/training");
  if (!hasPermission(session.user.roles, "training:read")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const sessions = await withOrganizationContext(session.user.organizationId, (tx) =>
    tx.trainingSession.findMany({ orderBy: { occurredAt: "desc" }, take: 50, include: { participants: true, seasonClub: { include: { club: true } } } }),
  );
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><div className="flex justify-between gap-4"><h1 className="text-3xl font-semibold">Training</h1>{hasPermission(session.user.roles, "training:manage") ? <Link className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900" href="/training/new">New session</Link> : null}</div><section className="mt-8 grid gap-3">{sessions.map((item) => <Link className="rounded-lg border border-line bg-ink-800 p-5" href={`/training/${item.id}`} key={item.id}><p className="text-xs uppercase tracking-[.18em] text-brand-400">{item.sessionType}</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2><p className="text-sm text-text-2">{item.seasonClub?.club.name ?? "No club"} | {item.participants.length} records</p></Link>)}</section></main></OperationsShell>;
}
