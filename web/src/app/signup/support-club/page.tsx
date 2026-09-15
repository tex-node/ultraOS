import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { chooseSupportedClub, skipSupportedClub } from "@/app/signup/support-club/actions";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

const CLUB_DISPLAY_IMAGE: Record<string, string> = {
  Apex: "/club-fan-display/apex.png",
  Eclipse: "/club-fan-display/eclipse.png",
  Ember: "/club-fan-display/ember.png",
  Flux: "/club-fan-display/flux.png",
  Halo: "/club-fan-display/halo.png",
  Nova: "/club-fan-display/nova.png",
  Surge: "/club-fan-display/surge.png",
  Vortex: "/club-fan-display/vortex.png",
};

// Phase 1 Stage 5.5B: self-service `/signup` (unlike `/apply/[organizationSlug]`, Stage 5.2B-1)
// never resolves or stamps an organization for the new FAN's role grant - it stays a deliberate
// platform-level (organizationId: null) UserRoleAssignment, per the doc comment on
// UserRoleAssignment.organizationId. session.user.organizationId is therefore null here for
// every self-registered fan, so it cannot be used as trusted provenance for this page. This is a
// slug-less, no-natural-tenant-anchor route exactly matching Stage 5.2D's Pattern D reasoning
// (see resolveDefaultPublicOrganization()'s doc comment) - reused here rather than inventing a
// new mechanism. Fully resolving self-signup's own org acquisition (an org-slug signup route,
// analogous to Stage 5.2B-1's /apply restructure) remains a separate, not-yet-scoped decision -
// named here, not silently solved.
export default async function SupportClubPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const { callbackUrl } = await searchParams;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${encodeURIComponent(`/signup/support-club${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`)}`);

  const organization = await resolveDefaultPublicOrganization();
  const { existingMembership, fanClubs } = await withOrganizationContext(organization.id, async (tx) => ({
    existingMembership: await tx.fanMembership.findFirst({ where: { userId: session.user.id } }),
    fanClubs: await tx.fanClub.findMany({ include: { club: true }, orderBy: { club: { name: "asc" } } }),
  }));
  if (existingMembership) redirect(callbackUrl || "/public/events");

  return (
    <main className="min-h-screen bg-[#050807] px-6 py-12 text-white">
      <section className="mx-auto max-w-4xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-400">Neon Ultra</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Do you want to support a club?</h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Pick one club to follow as your own — get their fan updates, and be part of their community from day one.
          You can only pick one, and it&apos;s completely optional.
        </p>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {fanClubs.map((fanClub) => (
            <form action={chooseSupportedClub} key={fanClub.id}>
              <input name="fanClubId" type="hidden" value={fanClub.id} />
              <input name="callbackUrl" type="hidden" value={callbackUrl ?? ""} />
              <button className="group w-full rounded-2xl border border-white/10 bg-[#0b100e] p-4 transition hover:border-emerald-400/60 hover:bg-emerald-400/[0.06]" type="submit">
                <div className="relative mx-auto h-20 w-20 overflow-hidden rounded-xl bg-white/5">
                  <Image alt={`${fanClub.club.name} logo`} className="object-contain" fill sizes="80px" src={CLUB_DISPLAY_IMAGE[fanClub.club.name] ?? fanClub.club.logoUrl ?? "/club-fan-display/apex.png"} />
                </div>
                <p className="mt-3 font-semibold group-hover:text-emerald-300">{fanClub.club.name}</p>
              </button>
            </form>
          ))}
        </div>

        <form action={skipSupportedClub} className="mt-8">
          <input name="callbackUrl" type="hidden" value={callbackUrl ?? ""} />
          <button className="text-sm text-zinc-500 underline decoration-dotted hover:text-zinc-300" type="submit">
            Skip for now
          </button>
        </form>
      </section>
    </main>
  );
}
