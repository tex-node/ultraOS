import Link from "next/link";
import { notFound } from "next/navigation";
import { applicationCards, applicationConfigs } from "@/app/apply/application-config";
import { getClosedApplicationTypes } from "@/lib/application-intake";
import { OrganizationNotFoundError, resolveActiveOrganizationBySlug } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApplyOrgPageProps = {
  params: Promise<{ organizationSlug: string }>;
};

export default async function ApplyOrgPage({ params }: ApplyOrgPageProps) {
  const { organizationSlug } = await params;
  let organization;
  try {
    organization = await resolveActiveOrganizationBySlug(organizationSlug);
  } catch (error) {
    if (error instanceof OrganizationNotFoundError) notFound();
    throw error;
  }

  const closedTypes = await getClosedApplicationTypes(organization.id);

  return (
    <main className="min-h-screen bg-ink-900 px-6 py-12 text-white">
      <section className="mx-auto max-w-6xl">
        <Link className="text-sm text-brand-400 hover:text-brand-300" href="/public">
          Back to public site
        </Link>
        <div className="mt-8 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">
            Participant applications
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Apply to join {organization.name}</h1>
          <p className="mt-4 text-sm leading-6 text-text-2">
            Use Signup to create an account. Players, coaches, scouts, officials,
            vendors, media, and volunteers submit role-specific applications for
            review. Sensitive roles are never assigned automatically.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {applicationCards.map((card) => {
            const config = applicationConfigs[card.type];
            const isClosed = closedTypes.includes(card.type);
            return (
              <Link
                className="rounded-lg border border-white/[0.08] bg-ink-800 p-5 transition hover:border-brand-400/40 hover:bg-brand-400/[0.04]"
                href={`/apply/${organizationSlug}/${card.slug}`}
                key={card.type}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-text-3">
                    {card.type}
                  </p>
                  {isClosed ? <span className="rounded-full border border-warn/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warn">Closed</span> : null}
                </div>
                <h2 className="mt-3 text-xl font-semibold">{card.label}</h2>
                <p className="mt-3 text-sm leading-6 text-text-2">
                  {config.description}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
