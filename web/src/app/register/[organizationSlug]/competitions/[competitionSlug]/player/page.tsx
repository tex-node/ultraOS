import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";
import { RegistrationForm } from "../registration-form";

export const dynamic = "force-dynamic";

// Public player registration (streak v19, Prompt 2).
//
// Addressed by organization AND competition slug, like the tournament site: a public form must be unambiguous about
// which league it is filling, and a bare competition slug would collide across tenants the moment a second organization
// names a competition "League".
export default async function PlayerRegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; competitionSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { organizationSlug, competitionSlug } = await params;
  // Errors now arrive as a redirect (streak v21) so the form works before hydration; this is where they surface.
  const { error } = await searchParams;

  const organization = await prisma.organization.findFirst({
    where: { slug: organizationSlug, status: "ACTIVE" },
    select: { id: true, name: true, slug: true },
  });
  if (!organization) notFound();

  // Competition is a TENANT table with RLS forced. A bare prisma query here runs with app.current_org_id unset, which
  // the policy resolves to the platform default organization - so an LBCL competition is invisible and this page 404s
  // for every real league. The tenant context is not optional for a public page; it is what proves which tenant is
  // being read.
  const competition = await withOrganizationContext(organization.id, (tx) => tx.competition.findFirst({
    where: { organizationId: organization.id, slug: competitionSlug, isActive: true },
    select: {
      id: true,
      name: true,
      sport: { select: { name: true } },
      // Seasons are a relation of the COMPETITION (not a scalar on it), and SeasonStatus has no UPCOMING: a season is
      // DRAFT, ACTIVE or COMPLETED. Registration is open for an ACTIVE season, or a DRAFT one that has not started -
      // a season that has finished must not accept new players.
      seasons: {
        where: { status: { in: ["ACTIVE", "DRAFT"] } },
        orderBy: { startDate: "asc" },
        take: 1,
        select: { id: true, name: true, startDate: true, status: true },
      },
    },
  }));
  if (!competition) notFound();

  const season = competition.seasons[0] ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Link href={`/t/${organization.slug}/${competitionSlug}`} className="text-xs text-text-3 underline">
        ← {competition.name}
      </Link>
      <p className="mt-3 text-xs uppercase tracking-[.2em] text-brand-400">Player registration</p>
      <h1 className="mt-2 text-2xl font-bold">{competition.name}</h1>
      <p className="mt-1 text-sm text-text-2">
        {organization.name} · {competition.sport.name}
        {season ? ` · ${season.name}` : ""}
      </p>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      ) : null}

      {season ? (
        <div className="mt-6">
          <RegistrationForm
            organizationId={organization.id}
            competitionId={competition.id}
            seasonId={season.id}
            organizationSlug={organization.slug}
            competitionSlug={competitionSlug}
            competitionName={competition.name}
          />
        </div>
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-ink-800 px-4 py-3 text-sm text-text-2">
          Registration is closed: this competition has no upcoming or active season. Check back when the next season is
          announced.
        </p>
      )}
    </main>
  );
}
