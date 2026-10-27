import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { loadLeagueDashboard } from "@/server/admin/league-dashboard";

export const dynamic = "force-dynamic";

// League admin dashboard (streak v19, Prompt 3).
//
// One page an organizer opens in the morning: what is running, what is live, what needs a decision, what was produced,
// what came in. It reads only its own organization - the slug in the URL is checked against the session, so an admin of
// one league cannot read another's numbers by editing the address.
const money = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;

export default async function LeagueDashboardPage({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/admin/${organizationSlug}/dashboard`);
  if (!hasPermission(session.user.roles, "operations:manage")) redirect("/dashboard");

  const organization = await prisma.organization.findFirst({ where: { slug: organizationSlug }, select: { id: true } });
  if (!organization) notFound();
  // The session's organization must be this one, unless the user is a platform administrator (who can see any league).
  const isPlatformAdmin = session.user.roles.includes("SUPER_ADMIN");
  if (!isPlatformAdmin && session.user.organizationId !== organization.id) notFound();

  const data = await loadLeagueDashboard(organizationSlug);
  if (!data) notFound();

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <p className="text-xs uppercase tracking-[.2em] text-brand-400">League dashboard</p>
        <h1 className="mt-2 text-2xl font-bold">{data.organization.name}</h1>
        <p className="mt-1 text-sm text-text-2">
          Plan <b className="text-text-1">{data.organization.plan}</b> ·{" "}
          <Link href="/settings/billing" className="text-brand-300 underline">billing</Link>
        </p>

        <section className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { label: "Active competitions", value: `${data.activeCompetitions}/${data.totalCompetitions}` },
            { label: "Live now", value: String(data.liveFixtures.length) },
            { label: "Pending applications", value: String(data.pendingApplications) },
            { label: "Highlights", value: String(data.recentHighlights.length) },
          ].map((card) => (
            <div key={card.label} className="rounded-lg border border-line bg-ink-800 p-4">
              <p className="text-[10px] uppercase tracking-wider text-text-3">{card.label}</p>
              <p className="mt-1 font-mono text-lg text-text-1">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Live now</h2>
          {data.liveFixtures.length === 0 ? (
            <p className="mt-2 text-xs text-text-3">Nothing is live. Scheduled fixtures appear here when a scorer starts a game.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {data.liveFixtures.map((fixture) => (
                <li key={fixture.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="text-text-1">
                    {fixture.homeName} <b className="font-mono">{fixture.homeScore}–{fixture.awayScore}</b> {fixture.awayName}
                  </span>
                  <span className="text-xs text-text-3">
                    {fixture.competitionName}
                    {fixture.period ? ` · period ${fixture.period}` : ""} ·{" "}
                    <Link href={`/games/${fixture.id}/live`} className="text-brand-300 underline">open console</Link>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Pending applications</h2>
            {data.pendingApplications === 0 ? (
              <p className="mt-2 text-xs text-text-3">Nothing waiting.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-text-2">
                {data.pendingByType.map((row) => (
                  <li key={row.type} className="flex justify-between font-mono">
                    <span>{row.type}</span>
                    <span>{row.count}</span>
                  </li>
                ))}
                <li className="pt-2">
                  <Link href="/applications" className="text-brand-300 underline">Review them</Link>
                </li>
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-line bg-ink-800 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Revenue</h2>
            <dl className="mt-2 space-y-1 text-xs text-text-2">
              <div className="flex justify-between"><dt>Paid ticket orders</dt><dd className="font-mono">{data.revenue.paidOrders}/{data.revenue.ticketOrders}</dd></div>
              <div className="flex justify-between"><dt>Ticket revenue</dt><dd className="font-mono">{money(data.revenue.ticketRevenueKobo)}</dd></div>
              <div className="flex justify-between"><dt>Subscription</dt><dd className="font-mono">{data.organization.plan}</dd></div>
            </dl>
            <p className="mt-2 text-[11px] text-text-3">
              Ticket revenue counts PAID orders only. A subscription shows its plan; the amount is Bachs&apos;s record,
              not this database&apos;s.
            </p>
          </div>
        </section>

        <section className="mt-4 rounded-lg border border-line bg-ink-800 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-3">Recent highlights</h2>
          {data.recentHighlights.length === 0 ? (
            <p className="mt-2 text-xs text-text-3">No highlight clips yet - they appear when a reviewer confirms a vision event.</p>
          ) : (
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              {data.recentHighlights.map((clip) => (
                <div key={clip.id} className="rounded border border-line p-2">
                  <p className="text-xs text-text-1">{clip.title ?? "Highlight"}</p>
                  <p className="text-[10px] text-text-3">{clip.createdAt.toISOString().slice(0, 10)}</p>
                  {clip.url ? <video controls preload="metadata" src={clip.url} className="mt-1 w-full rounded" aria-label={clip.title ?? "Highlight clip"} /> : null}
                  {clip.fixtureId ? (
                    <Link href={`/public/fixtures/${clip.fixtureId}`} className="mt-1 inline-block text-[10px] text-brand-300 underline">
                      match centre
                    </Link>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </OperationsShell>
  );
}
