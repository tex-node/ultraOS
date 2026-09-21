import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { ApplicationForm } from "@/app/apply/application-form";
import { applicationConfigs, applySlugToType } from "@/app/apply/application-config";
import { submitApplication } from "@/app/apply/[organizationSlug]/actions";
import { getClosedApplicationTypes } from "@/lib/application-intake";
import { OrganizationNotFoundError, resolveActiveOrganizationBySlug } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ApplyRolePageProps = {
  params: Promise<{ organizationSlug: string; role: string }>;
};

export default async function ApplyRolePage({ params }: ApplyRolePageProps) {
  const { organizationSlug, role } = await params;
  const type = applySlugToType[role];
  if (!type) {
    notFound();
  }

  let organization;
  try {
    organization = await resolveActiveOrganizationBySlug(organizationSlug);
  } catch (error) {
    if (error instanceof OrganizationNotFoundError) notFound();
    throw error;
  }

  const config = applicationConfigs[type];
  const session = await auth();
  const callbackUrl = `/apply/${organizationSlug}/${role}`;
  const closedTypes = await getClosedApplicationTypes(organization.id);
  const isClosed = closedTypes.includes(type);

  return (
    <main className="min-h-screen bg-ink-900 px-6 py-12 text-white">
      <section className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <Link className="text-sm text-brand-400 hover:text-brand-300" href={`/apply/${organizationSlug}`}>
            Back to applications
          </Link>
          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">
            {config.type} intake — {organization.name}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{config.title}</h1>
          <p className="mt-4 text-sm leading-6 text-text-2">{config.description}</p>
          <div className="mt-6 rounded-lg border border-white/[0.08] bg-white/[0.03] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-text-3">Review rule</p>
            <p className="mt-2 text-sm leading-6 text-text-1">{config.reviewNote}</p>
          </div>
        </div>
        {isClosed ? (
          <div className="rounded-lg border border-warn/20 bg-amber-400/[0.06] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warn">
              Applications closed
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Not accepting new {config.type.toLowerCase()} applications right now</h2>
            <p className="mt-3 text-sm leading-6 text-text-2">
              This intake is temporarily closed. Please check back later.
            </p>
          </div>
        ) : session?.user ? (
          <ApplicationForm config={config} action={submitApplication.bind(null, organizationSlug)} />
        ) : (
          <div className="rounded-lg border border-white/[0.08] bg-ink-800 p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-400">
              Account required
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Create or sign in to continue</h2>
            <p className="mt-3 text-sm leading-6 text-text-2">
              Applications must attach to one login identity. This prevents duplicate
              accounts and lets a fan apply for another role from the same account.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Link
                className="rounded-md bg-brand-400 px-4 py-3 text-center text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
                href={`/signup?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Signup
              </Link>
              <Link
                className="rounded-md border border-line px-4 py-3 text-center text-sm font-semibold text-text-1 transition hover:border-emerald-400/50"
                href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
              >
                Sign in
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
