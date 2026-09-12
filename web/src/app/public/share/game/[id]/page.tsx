import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GameResultCardView } from "@/components/analytics/cards/GameResultCardView";
import { SocialCopyBlock } from "@/components/analytics/cards/SocialCopyBlock";
import { buildGameResultCard } from "@/lib/analytics/cards/game-cards";
import { loadGameCoreByFixture } from "@/lib/analytics/game-analytics";
import { classifyGameStory } from "@/lib/analytics/game-story";
import { rankWhyTheyWon } from "@/lib/analytics/why-they-won";
import { getGameAnalyticsCapability } from "@/lib/game-data-capability";
import { toSocialCopy, type CardFormat } from "@/lib/analytics/cards/types";
import { PublicResourceLocatorType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { resolvePublicResourceLocator } from "@/lib/public-locators";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

async function loadSharedGame(fixtureId: string) {
  const locator = await resolvePublicResourceLocator(
    prisma,
    PublicResourceLocatorType.FIXTURE,
    fixtureId,
  );
  if (!locator) return null;
  return withOrganizationContext(locator.organizationId, (tx) =>
    loadGameCoreByFixture(locator.resourceId, tx),
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const game = await loadSharedGame(id);
  if (!game) return { title: "Game Card — Ultra Basketball" };
  const title = `${game.home.shortName} ${game.home.score} – ${game.away.score} ${game.away.shortName} | Ultra Basketball`;
  const description = `Season Zero final score — official box score data, Ultra Basketball.`;
  const imageUrl = `/api/share/game/${id}`;
  return {
    title, description,
    openGraph: { title, description, images: [imageUrl] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function ShareGameCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params;
  const { format } = await searchParams;
  const cardFormat = FORMAT_MAP[format ?? ""] ?? "SOCIAL_SQUARE";

  const game = await loadSharedGame(id);
  if (!game || game.status !== "FINAL") notFound();

  const tags = classifyGameStory(game);
  const factors = rankWhyTheyWon(game);
  const keyStat = factors[0] ? { label: factors[0].label, value: `${factors[0].winnerValue} vs ${factors[0].loserValue}` } : null;
  const capability = getGameAnalyticsCapability(game.dataCapability);
  const card = buildGameResultCard(game, tags, keyStat, capability);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 bg-[#050807] px-4 py-12">
      <GameResultCardView card={card} format={cardFormat} />
      <SocialCopyBlock copy={toSocialCopy(card)} />
      <p className="text-center text-xs text-zinc-600">Shareable game card — Season Zero. Not an exportable image; this page is the card.</p>
    </main>
  );
}
