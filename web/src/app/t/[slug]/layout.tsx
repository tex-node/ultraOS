import { notFound } from "next/navigation";
import { PortalShell } from "@/app/components/portal-shell";
import { SubSiteTabs } from "./sub-site-tabs";
import { TOURNAMENT_STATUS_STYLE, tournamentStatusFromFixtureStatuses } from "@/lib/tournament-subsite";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

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
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const organization = await resolveDefaultPublicOrganization();
  const competition = await withOrganizationContext(organization.id, (tx) =>
    tx.competition.findFirst({
      where: { organizationId: organization.id, slug, isActive: true },
      include: {
        sport: true,
        seasons: { select: { id: true, status: true, fixtures: { select: { status: true } } } },
      },
    }),
  );
  if (!competition) notFound();
  const status = tournamentStatusFromFixtureStatuses(
    competition.seasons.flatMap((s) => s.fixtures.map((f) => f.status)),
    competition.seasons.map((s) => s.status),
  );
  const basePath = `/t/${competition.slug}`;

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
