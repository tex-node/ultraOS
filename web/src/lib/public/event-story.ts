import { parseEventResults, type EventResults } from "@/lib/public/event-results";
import { resolveActiveOrganizationBySlug, withOrganizationContext } from "@/lib/tenant-context";

// The durable public "story" of an event: identity, venue, dates and the published results, readable
// whatever the event's status is (v33).
//
// WHY THIS EXISTS. The GIESM short link (app.neonultra.ng/giesm) was served by the registration
// experience, which requires a PUBLISHED event with an OPEN public form. Once the event was marked
// COMPLETED the link 404'd - so the one URL the organiser had been handing out died on the day the
// results became interesting. A completed event with published results is exactly what a reader wants
// at that address, so the page falls back to this loader instead of notFound().
export type PublicEventStory = {
  id: string;
  name: string;
  slug: string;
  status: string;
  startTime: Date;
  endTime: Date | null;
  results: EventResults | null;
  venue: { name: string; city: string } | null;
  competition: { slug: string; name: string } | null;
};

export async function loadPublicEventStory(
  organizationSlug: string,
  eventSlug: string,
): Promise<{ organizationSlug: string; story: PublicEventStory } | null> {
  const organization = await resolveActiveOrganizationBySlug(organizationSlug).catch(() => null);
  if (!organization) return null;

  const event = await withOrganizationContext(organization.id, (tx) =>
    tx.event.findFirst({
      where: { organizationId: organization.id, slug: eventSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        startTime: true,
        endTime: true,
        results: true,
        venue: { select: { name: true, city: true } },
        season: {
          select: { competition: { select: { slug: true, name: true } } },
        },
      },
    }),
  ).catch(() => null);
  if (!event) return null;

  return {
    organizationSlug: organization.slug,
    story: {
      id: event.id,
      name: event.name,
      slug: event.slug ?? eventSlug,
      status: event.status,
      startTime: event.startTime,
      endTime: event.endTime,
      results: parseEventResults(event.results),
      venue: event.venue ? { name: event.venue.name, city: event.venue.city } : null,
      competition: event.season?.competition
        ? { slug: event.season.competition.slug, name: event.season.competition.name }
        : null,
    },
  };
}
