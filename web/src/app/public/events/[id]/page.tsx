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
      <p className="text-xs uppercase tracking-[.24em] text-emerald-400">{event.status}</p>
      <h1 className="mt-2 text-4xl font-semibold">{event.name}</h1>
      <p className="mt-3 text-zinc-400">{formatLagosDateTime(event.startTime)} · {event.venue.name}, {event.venue.city}</p>
      <div className="mt-6 flex flex-wrap gap-2">{event.fixtures.map((fixture) => <span key={fixture.id} className="rounded-full bg-white/[.05] px-3 py-2 text-sm">{fixture.homeSeasonClub?.club.name ?? fixture.homeEntrant?.name ?? "TBD"} vs {fixture.awaySeasonClub?.club.name ?? fixture.awayEntrant?.name ?? "TBD"}</span>)}</div>
      {event.sponsorCampaigns.length ? <section className="mt-8 rounded-2xl border border-amber-400/20 bg-amber-400/[.05] p-5"><p className="text-xs uppercase tracking-[.2em] text-amber-300">Event partners</p><div className="mt-3 flex flex-wrap gap-3">{event.sponsorCampaigns.map((campaign)=><span key={campaign.id} className="rounded-full bg-white/[.06] px-3 py-2 text-sm">{campaign.sponsorName}<SponsorImpression campaignId={campaign.id} /></span>)}</div></section> : null}
      <section className="mt-10">
        <h2 className="text-2xl font-semibold">Choose your zone</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {event.seatZones.map((zone) => {
            const remaining = zone.capacity - zone.reservedQuantity;
            return <article key={zone.id} className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5"><div className="flex justify-between"><h3 className="font-semibold">{zone.name}</h3><span className="text-emerald-300">{zone.priceKobo === 0 ? "Free" : formatNaira(zone.priceKobo)}</span></div><p className="mt-2 text-sm text-zinc-500">{remaining} of {zone.capacity} remaining</p>{zone.fanClub ? <p className="mt-2 text-xs text-amber-300">{zone.fanClub.club.name} members · {zone.fanClubDiscountBps / 100}% discount</p> : null}<form action={reserveZone.bind(null,id)} className="mt-5 space-y-3"><input type="hidden" name="seatZoneId" value={zone.id} /><input name="guestName" required placeholder="Full name" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="guestEmail" type="email" required placeholder="Email" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="guestPhone" required placeholder="Phone" className="w-full rounded-lg bg-white/[.05] p-3" /><input name="quantity" type="number" min="1" max={Math.min(6, remaining)} defaultValue="1" required className="w-full rounded-lg bg-white/[.05] p-3" /><button disabled={remaining === 0} className="w-full rounded-lg bg-emerald-400 p-3 font-semibold text-zinc-950 disabled:opacity-40">Reserve zone</button></form></article>;
          })}
        </div>
      </section>
    </main>
  );
}
