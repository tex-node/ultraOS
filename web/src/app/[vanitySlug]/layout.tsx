import { notFound } from "next/navigation";
import { PortalShell } from "@/app/components/portal-shell";
import { SubSiteTabs } from "@/app/t/[slug]/sub-site-tabs";
import { TOURNAMENT_STATUS_STYLE, tournamentStatusFromSeasons } from "@/lib/tournament-subsite";
import { resolveVanityCompetitionId } from "@/lib/vanity-tournament";
import { withOrganizationContext } from "@/lib/tenant-context";
import { hasInsightsAccess } from "@/lib/insights-access";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Top-level vanity tournament chrome (external stats ingestion, 2026-09-22): the short-URL
// sibling of /t/[slug] for any OTHER organization's tournament (e.g. /lbcl). Next.js resolves
// every real static top-level route (login, public, dashboard, ...) before ever reaching this
// dynamic segment, so this can never shadow an existing page - a request only lands here if no
// static route matched, and it 404s unless the segment is a registered COMPETITION locator key.
export default async function VanityTournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ vanitySlug: string }>;
}) {
  const { vanitySlug } = await params;
  const resolved = await resolveVanityCompetitionId(vanitySlug);
  if (!resolved) notFound();

  const competition = await withOrganizationContext(resolved.organizationId, (tx) =>
    tx.competition.findUnique({
      where: { id: resolved.competitionId },
      include: { sport: true, seasons: { select: { id: true, status: true, fixtures: { select: { status: true } } } } },
    }),
  );
  if (!competition) notFound();

  const status = tournamentStatusFromSeasons(
    competition.seasons.map((s) => ({ fixtureStatuses: s.fixtures.map((f) => f.status), seasonStatus: s.status })),
  );
  const basePath = `/${vanitySlug}`;

  // Insights is a private coaching view for one account, not a public tab - see
  // src/lib/insights-access.ts. Fetching the session per request is cheap and this layout
  // already does several other awaits before render.
  let session = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  const extraTabs = [{ href: `${basePath}/highlights`, label: "Highlights" }];
  if (hasInsightsAccess(session?.user?.email)) {
    extraTabs.push({ href: `${basePath}/insights`, label: "Insights" });
  }

  return (
    <PortalShell>
      <div className="border-b border-line bg-gradient-to-b from-brand-400/[.06] to-transparent">
        <div className="mx-auto max-w-6xl px-6 pb-5 pt-10">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${TOURNAMENT_STATUS_STYLE[status]}`}
            >
              {status === "LIVE" ? "● LIVE" : status}
            </span>
            <span className="rounded-full border border-line bg-white/[.04] px-3 py-1 text-[11px] uppercase tracking-wider text-text-2">
              {competition.sport.name}
            </span>
          </div>
          <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">{competition.name}</h1>
          {competition.description ? <p className="mt-2 max-w-3xl text-text-2">{competition.description}</p> : null}
          <SubSiteTabs basePath={basePath} title={competition.name} extraTabs={extraTabs} />
        </div>
      </div>
      {children}
    </PortalShell>
  );
}
