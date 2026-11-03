import Link from "next/link";
import { notFound } from "next/navigation";
import { EventResultsBoard } from "@/app/components/event-results-board";
import { PublicRegistrationExperience } from "@/app/components/public-registration";
import { formatLagosDateTime } from "@/lib/format-datetime";
import { loadPublicEventStory } from "@/lib/public/event-story";
import { resolvePublicShortLink } from "@/lib/public-short-links";
import { loadPublicRegistration } from "@/lib/registration/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// app.neonultra.ng/giesm - the address the organiser hands out.
//
// Until v33 this was registration only, and it 404'd the moment the event moved to COMPLETED: the form
// is looked up with `status: "OPEN"` and `Event.status = "PUBLISHED"`, so the brand link died exactly
// when people wanted to read the results. It now serves the event, in this order:
//   1. registration, while a public form is accepting entries;
//   2. the finished event's published results (team standings + flag race, with bibs and medals);
//   3. a page that says the event exists but has nothing published yet - never a 404 for a real event.
export default async function GiesmEventPage() {
  const link = resolvePublicShortLink("giesm");
  if (!link) notFound();

  const registration = await loadPublicRegistration(link.organizationSlug, link.eventSlug).catch(() => null);
  if (registration) {
    return <PublicRegistrationExperience organizationSlug={link.organizationSlug} eventSlug={link.eventSlug} />;
  }

  const loaded = await loadPublicEventStory(link.organizationSlug, link.eventSlug);
  if (!loaded) notFound();
  const { story } = loaded;
  const tournamentHref = story.competition ? `/t/${loaded.organizationSlug}/${story.competition.slug}` : null;
  const isFinished = story.status === "COMPLETED";
  const when = formatLagosDateTime(story.startTime);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <p className="text-xs uppercase tracking-[.24em] text-brand-400">
        {isFinished ? "Final" : story.status} · GIESM
      </p>
      <h1 className="mt-2 font-display text-4xl font-bold">{story.name}</h1>
      <p className="mt-3 text-text-2">
        {when}
        {story.venue ? ` · ${story.venue.name}, ${story.venue.city}` : ""}
      </p>

      {story.results ? (
        <EventResultsBoard results={story.results} showGenderHeadings={false} />
      ) : (
        <section className="mt-10 rounded-lg border border-line bg-ink-800 p-6">
          <h2 className="text-xl font-semibold">Results not published yet</h2>
          <p className="mt-2 text-sm text-text-2">
            The event {isFinished ? "has finished" : "is scheduled"}, but no results have been published for it.
            {isFinished ? " The organiser can publish them from the event's admin page." : ""}
          </p>
        </section>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        {tournamentHref ? (
          <Link href={tournamentHref} className="rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300">
            Full tournament
          </Link>
        ) : null}
        <Link href={`/public/events/${story.slug}`} className="text-sm text-brand-300 underline-offset-4 hover:underline">
          Event page
        </Link>
      </div>
    </main>
  );
}
