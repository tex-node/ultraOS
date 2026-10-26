import { notFound } from "next/navigation";
import { PortalShell } from "@/app/components/portal-shell";
import { SubSiteTabs } from "./sub-site-tabs";
import { TOURNAMENT_STATUS_STYLE, tournamentStatusFromSeasons } from "@/lib/tournament-subsite";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Tournament sub-site chrome (product roadmap F2): hero banner with live status + share,
// sub-navigation for Overview / Fixtures & Stats. Resolves organization + competition from
// the slug inside existing tenancy — no new tenant layer.
export default async function TournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ organizationSlug: string; competitionSlug: string }>;
}) {
  const { organizationSlug, competitionSlug } = await params;
  // Multi-tenant public routing (streak v16, Prompt 2): the organization comes from the URL, not from the deployment.
  // resolveDefaultPublicOrganization() stays for pages that genuinely serve the platform default; a tournament sub-site
  // is addressed by its own tenant, which is what lets a partner league live at its own path.
  const organization = await resolveActiveOrganizationBySlug(organizationSlug).catch(() => null);
  if (!organization) notFound();
  const competition = await withOrganizationContext(organization.id, (tx) =>
    tx.competition.findFirst({
      where: { organizationId: organization.id, slug: competitionSlug, isActive: true },
      include: {
        sport: true,
        seasons: { select: { id: true, status: true, fixtures: { select: { status: true } } } },
      },
    }),
  );
  if (!competition) notFound();
  const status = tournamentStatusFromSeasons(
    competition.seasons.map((s) => ({ fixtureStatuses: s.fixtures.map((f) => f.status), seasonStatus: s.status })),
  );
  const basePath = `/t/${organizationSlug}/${competition.slug}`;

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
          <SubSiteTabs basePath={basePath} title={competition.name} />
        </div>
      </div>
      {children}
    </PortalShell>
  );
}
