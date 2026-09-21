import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createOperatorMessage } from "@/app/operations/actions";
import { OpsHealthStatus, OpsSeverity } from "@/generated/prisma/enums";
import { operationsSnapshot, type OpsSignal } from "@/lib/operations";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function OperationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/operations");
  const { session: authorizedSession, organizationId } = await requirePermissionWithOrganization("operations:view");
  const snapshot = await withOrganizationContext(organizationId, (tx) => operationsSnapshot(tx));
  return (
    <OperationsShell user={authorizedSession.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.22em] text-brand-400">Ultra Commissioner Dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold">League Command Center</h1>
            <p className="mt-2 text-sm text-text-2">One screen for Season Zero readiness, live operations, commerce, fan experience, and system health.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/incidents">Incidents</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/runbooks">Runbooks</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/tasks">Tasks</Link>
            <Link className="rounded-md border border-line px-4 py-3 text-sm" href="/launch-readiness">Launch Readiness</Link>
            <Link className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900" href="/display-monitoring">Displays</Link>
          </div>
        </div>
        <section className="mt-8 grid gap-5 xl:grid-cols-2">
          <SignalPanel title="Competition" signals={snapshot.competitionSignals} />
          <SignalPanel title="Operations" signals={snapshot.operationsSignals} />
          <SignalPanel title="Commerce and Fan Experience" signals={snapshot.commerceSignals} />
          <SignalPanel title="System Health" signals={snapshot.systemSignals} />
        </section>
        <section className="mt-8 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-xl font-semibold">Internal announcement</h2>
          <form action={createOperatorMessage} className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr_180px_auto]">
            <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="title" placeholder="Title" required />
            <input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="message" placeholder="Message" required />
            <select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="severity" defaultValue={OpsSeverity.MEDIUM}>{Object.values(OpsSeverity).map((s) => <option key={s} value={s}>{s}</option>)}</select>
            <button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Post</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}

function SignalPanel({ title, signals }: { title: string; signals: OpsSignal[] }) {
  return (
    <section className="rounded-lg border border-line bg-ink-800 p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {signals.map((signal) => {
          const body = <div className="rounded-md border border-line bg-black/20 p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-text-2">{signal.label}</p><span className={statusClass(signal.status)}>●</span></div><p className="mt-2 text-lg font-semibold">{signal.value}</p></div>;
          return signal.href ? <Link href={signal.href} key={signal.label}>{body}</Link> : <div key={signal.label}>{body}</div>;
        })}
      </div>
    </section>
  );
}

function statusClass(status: OpsHealthStatus) {
  if (status === OpsHealthStatus.GREEN) return "text-brand-300";
  if (status === OpsHealthStatus.AMBER) return "text-warn";
  return "text-danger";
}
