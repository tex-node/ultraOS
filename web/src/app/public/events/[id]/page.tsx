import { notFound } from "next/navigation";
import { reserveZone } from "../actions";
import { SponsorImpression } from "../sponsor-impression";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { formatNaira } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.EVENT,
    id,
  );
  if (!locator) notFound();
  const event = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.event.findFirst({
      where: { id: locator.resourceId, status: { in: ["PUBLISHED", "IN_PROGRESS"] } },
      include: {
        venue: true,
        fixtures: {
          include: {
            homeSeasonClub: { include: { club: true } },
            awaySeasonClub: { include: { club: true } },
            homeEntrant: true,
            awayEntrant: true,
          },
        },
        seatZones: {
          where: { isActive: true },
          include: { fanClub: { include: { club: true } } },
          orderBy: { priceKobo: "desc" },
        },
        sponsorCampaigns: {
          where: { isActive: true },
          orderBy: { sponsorName: "asc" },
        },
      },
    }),
  );
  if (!event || !locatorMatchesResource(locator, event)) notFound();
  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.24em] text-brand-400">{event.status}</p>
      <h1 className="mt-2 font-display text-4xl font-bold">{event.name}</h1>
      <p className="mt-3 text-text-2">{formatLagosDateTime(event.startTime)} · {event.venue.name}, {event.venue.city}</p>
      <div className="mt-6 flex flex-wrap gap-2">{event.fixtures.map((fixture) => <span key={fixture.id} className="rounded-full border border-line bg-white/[.04] px-3 py-2 text-sm text-text-1">{fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "TBD"} vs {fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "TBD"}</span>)}</div>
      {event.sponsorCampaigns.length ? <section className="mt-8 rounded-lg border border-warn/20 bg-warn/[.05] p-5"><p className="text-xs uppercase tracking-[.2em] text-warn">Event partners</p><div className="mt-3 flex flex-wrap gap-3">{event.sponsorCampaigns.map((campaign)=><span key={campaign.id} className="rounded-full border border-line bg-white/[.04] px-3 py-2 text-sm">{campaign.sponsorName}<SponsorImpression campaignId={campaign.id} /></span>)}</div></section> : null}
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Choose your zone</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {event.seatZones.map((zone) => {
            const remaining = zone.capacity - zone.reservedQuantity;
            const tier = zone.passTier === "DAY_PASS" ? "Day pass" : zone.passTier === "TOURNAMENT_PASS" ? "Full-tournament pass" : null;
            return <article key={zone.id} className="rounded-lg border border-line bg-ink-800 p-5"><div className="flex justify-between"><h3 className="font-semibold">{zone.name}</h3><span className="text-brand-300">{zone.priceKobo === 0 ? "Free" : formatNaira(zone.priceKobo)}</span></div>{tier ? <p className="mt-1 text-xs font-semibold text-info">{tier}{zone.passValidFrom || zone.passValidTo ? ` · valid${zone.passValidFrom ? ` from ${zone.passValidFrom.toLocaleDateString()}` : ""}${zone.passValidTo ? ` to ${zone.passValidTo.toLocaleDateString()}` : ""}` : ""}</p> : null}<p className="mt-2 text-sm text-text-3">{remaining} of {zone.capacity} remaining</p>{zone.fanClub ? <p className="mt-2 text-xs text-warn">{zone.fanClub.club.name} members · {zone.fanClubDiscountBps / 100}% discount</p> : null}<form action={reserveZone.bind(null,id)} className="mt-5 space-y-3"><input type="hidden" name="seatZoneId" value={zone.id} /><input name="guestName" required placeholder="Full name" className="w-full rounded-md border border-line bg-ink-700 p-3 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none" /><input name="guestEmail" type="email" required placeholder="Email" className="w-full rounded-md border border-line bg-ink-700 p-3 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none" /><input name="guestPhone" required placeholder="Phone" className="w-full rounded-md border border-line bg-ink-700 p-3 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none" /><input name="quantity" type="number" min="1" max={Math.min(6, remaining)} defaultValue="1" required className="w-full rounded-md border border-line bg-ink-700 p-3 text-sm text-text-1 focus:border-brand-400 focus:shadow-glow-green focus:outline-none" /><input name="promoCode" placeholder="Promo code (optional)" className="w-full rounded-md border border-line bg-ink-700 p-3 text-sm text-text-1 placeholder:text-text-3 focus:border-brand-400 focus:shadow-glow-green focus:outline-none" /><button disabled={remaining === 0} className="w-full rounded-md bg-brand-400 p-3 font-semibold text-ink-900 transition hover:bg-brand-300 disabled:opacity-40">Reserve zone</button></form></article>;
          })}
        </div>
      </section>
    </main>
  );
}
