import Link from "next/link";
import { MissingOrganizationContextError, requirePermissionOrRedirect } from "@/lib/authorization";
import { OperationsShell } from "@/app/components/operations-shell";
import { buildSystemHealth, type BrowserSourceHealth } from "@/lib/system-health-loader";
import type { HealthStatus, ComponentHealth } from "@/lib/system-health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// G.20 Part IV-X, XLI-XLII. "IS THE LIVE PRODUCTION SYSTEM HEALTHY RIGHT NOW?" - one screen, no
// developer stack traces, HEALTHY/WARNING/CRITICAL/UNKNOWN only. Read-only: this page and
// buildSystemHealth() never write anything (Part XLII: "Do not let this write game state").
// Reloading the page IS "RUN SYSTEM CHECK" (Part XLIII) - every value here is freshly computed
// server-side on every request, never cached.
export default async function BroadcastDiagnostics({ searchParams }: { searchParams: Promise<{ gameId?: string }> }) {
  const { gameId } = await searchParams;
  const session = await requirePermissionOrRedirect("broadcast:operate", "/broadcast/diagnostics");
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const health = await buildSystemHealth(session.user.organizationId, gameId);

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[.2em] text-info">Broadcast</p>
            <h1 className="mt-2 text-3xl font-bold">Live System Diagnostics</h1>
          </div>
          <OverallBadge status={health.overallStatus} />
        </div>
        <p className="mt-2 text-xs text-text-3">
          Generated {health.generatedAt} · Release <code className="text-text-2">{health.release.name}</code> ·
          {" "}<Link href="/broadcast/diagnostics" className="text-info hover:underline">Run system check again</Link>
        </p>

        {health.critical.length > 0 ? (
          <IncidentPrompt title="Critical issues" items={health.critical} type="TECHNICAL" severity="CRITICAL" />
        ) : null}
        {health.warnings.length > 0 ? (
          <IncidentPrompt title="Warnings" items={health.warnings} type="TECHNICAL" severity="MEDIUM" />
        ) : null}

        <Section title="System">
          <Row {...health.service} />
          <Row {...health.database} />
        </Section>

        <Section title="Game Data">
          {health.selectedGame ? (
            <>
              <p className="text-sm text-text-1">
                {health.selectedGame.homeShortName} vs {health.selectedGame.awayShortName} · {health.selectedGame.status}
                {" · "}<a href={`/broadcast/diagnostics?gameId=${health.selectedGame.gameId}`} className="text-info hover:underline">permalink</a>
              </p>
              {health.snapshot ? <Row {...health.snapshot} detail={`${health.snapshot.detail}${health.snapshot.ageSeconds !== null ? ` (freshness: ${health.snapshot.freshness})` : ""}`} /> : null}
            </>
          ) : (
            <p className="text-sm text-text-3">{health.noLiveGameReason}</p>
          )}
        </Section>

        {health.reconciliation ? (
          <Section title="Scorer / Statistician Reconciliation">
            <Row {...health.reconciliation} />
          </Section>
        ) : null}

        <Section title="Presentation">
          <Row {...health.presentation} detail={`${health.presentation.detail}${health.presentation.freshness !== "NOT_APPLICABLE" ? ` (${health.presentation.freshness})` : ""}`} />
        </Section>

        {health.browserSources.length > 0 ? (
          <Section title="Browser Sources">
            <div className="grid gap-2 sm:grid-cols-2">
              {health.browserSources.map((b) => <BrowserSourceRow key={b.type} source={b} />)}
            </div>
          </Section>
        ) : null}

        <Section title="Public / Commentator">
          <Row {...health.publicLive} />
          <Row {...health.broadcastStats} />
        </Section>
      </main>
    </OperationsShell>
  );
}

const STATUS_STYLE: Record<HealthStatus, string> = {
  HEALTHY: "border-brand-400/40 bg-brand-400/10 text-brand-300",
  WARNING: "border-amber-400/40 bg-warn/10 text-warn",
  CRITICAL: "border-red-400/40 bg-red-400/10 text-red-300",
  UNKNOWN: "border-zinc-500/40 bg-zinc-500/10 text-text-2",
};

function OverallBadge({ status }: { status: HealthStatus }) {
  return <span className={`rounded-full border px-4 py-1.5 text-sm font-black uppercase tracking-wide ${STATUS_STYLE[status]}`}>{status}</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-info">{title}</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function Row(props: ComponentHealth) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-4 py-2.5 ${STATUS_STYLE[props.status]}`}>
      <span className="text-sm font-semibold text-white">{props.label}</span>
      <span className="text-right text-xs text-text-1">{props.detail}</span>
      <span className="shrink-0 text-xs font-black uppercase">{props.status}</span>
    </div>
  );
}

function BrowserSourceRow({ source }: { source: BrowserSourceHealth }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${STATUS_STYLE[source.status]}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-white">{source.label}</span>
        <span className="text-[10px] font-black uppercase">{source.status}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-text-1">{source.detail}</p>
    </div>
  );
}

// Part XIII: reuse the existing incident system - never a second incident table, never auto-
// created (operator confirms via the normal /incidents form, prefilled here).
function IncidentPrompt({ title, items, type, severity }: { title: string; items: string[]; type: string; severity: string }) {
  const description = items.join(" | ").slice(0, 500);
  return (
    <div className="mt-6 rounded-md border border-line bg-ink-800 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-text-2">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-1">
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
      <Link
        href={`/incidents?type=${type}&severity=${severity}&title=${encodeURIComponent(title)}&description=${encodeURIComponent(description)}`}
        className="mt-3 inline-block rounded-lg border border-red-400/30 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-400/10"
      >
        Report Incident
      </Link>
    </div>
  );
}
