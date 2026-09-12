import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { SocialCopyBlock } from "@/components/analytics/cards/SocialCopyBlock";
import { buildPlayerSpotlightCard } from "@/lib/analytics/cards/player-cards";
import { loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { computePlayerRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { toSocialCopy, type CardFormat } from "@/lib/analytics/cards/types";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  locatorMatchesResource,
  resolvePublicResourceLocator,
} from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

async function loadSharedAthlete(athleteId: string) {
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.ATHLETE,
    athleteId,
  );
  if (!locator) return null;
  const athlete = await withOrganizationContext(locator.organizationId, (tx) =>
    tx.athlete.findUnique({
      where: { id: locator.resourceId },
      select: {
        id: true, organizationId: true,
        firstName: true, lastName: true, photoUrl: true,
        registrations: { include: { season: true }, orderBy: { season: { startDate: "desc" } } },
      },
    }),
  );
  if (!locatorMatchesResource(locator, athlete)) return null;
  return athlete;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const athlete = await loadSharedAthlete(id);
  if (!athlete) return { title: "Player Card — Ultra Basketball" };
  const title = `${athlete.firstName} ${athlete.lastName} — Season Zero | Ultra Basketball`;
  const description = `Season Zero player card for ${athlete.firstName} ${athlete.lastName} — official box score data, Ultra Basketball.`;
  const imageUrl = `/api/share/player/${id}`;
  return {
    title, description,
    openGraph: { title, description, images: [imageUrl] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function SharePlayerCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params;
  const { format } = await searchParams;
  const cardFormat = FORMAT_MAP[format ?? ""] ?? "SOCIAL_SQUARE";

  const athlete = await loadSharedAthlete(id);
  if (!athlete) notFound();
  const reg = athlete.registrations.find((r) => r.season.status === "ACTIVE");
  if (!reg) notFound();

  const totals = await withOrganizationContext(reg.organizationId, (tx) => loadSeasonPlayerTotals(reg.seasonId, tx));
  const target = totals.find((t) => t.playerId === reg.id);
  if (!target) notFound();

  const ranks = topRankBadges(computePlayerRanks(reg.id, totals));
  // Season Zero is uniformly BOX_SCORE_ONLY — a real per-season capability rollup only becomes
  // necessary once a mixed-capability season exists (see capability gating docs).
  const card = buildPlayerSpotlightCard(target, ranks, athlete.photoUrl, "BOX_SCORE_ONLY");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 bg-[#050807] px-4 py-12">
      <AnalyticsCard card={card} format={cardFormat} />
      <SocialCopyBlock copy={toSocialCopy(card)} />
      <p className="text-center text-xs text-zinc-600">Shareable player card — Season Zero. Not an exportable image; this page is the card.</p>
    </main>
  );
}
