import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { SocialCopyBlock } from "@/components/analytics/cards/SocialCopyBlock";
import { buildRecordCard } from "@/lib/analytics/cards/leaderboard-cards";
import { loadSeasonGameCores, loadSeasonPlayerTotals } from "@/lib/analytics/game-analytics";
import { buildGameRecords, buildPlayerSeasonRecords, buildPlayerSingleGameRecords, buildTeamRecords, type RecordEntry } from "@/lib/analytics/records";
import { toSocialCopy, type CardFormat } from "@/lib/analytics/cards/types";
import { resolveDefaultPublicOrganization, withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

async function findRecord(key: string): Promise<RecordEntry | null> {
  const organization = await resolveDefaultPublicOrganization();
  const season = await withOrganizationContext(organization.id, (tx) => tx.season.findFirst({ where: { status: "ACTIVE" } }));
  if (!season) return null;
  const decodedKey = decodeURIComponent(key);
  const [games, players] = await withOrganizationContext(organization.id, (tx) =>
    Promise.all([loadSeasonGameCores(season.id, tx), loadSeasonPlayerTotals(season.id, tx)]),
  );
  const allRecords = [
    ...buildPlayerSingleGameRecords(games),
    ...buildPlayerSeasonRecords(players),
    ...buildTeamRecords(games),
    ...buildGameRecords(games),
  ];
  return allRecords.find((r) => r.key === decodedKey) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }): Promise<Metadata> {
  const { key } = await params;
  const record = await findRecord(key);
  if (!record) return { title: "Season Zero Record — Ultra Basketball" };
  const title = `${record.title}: ${record.value} — ${record.holderName} | Ultra Basketball`;
  const description = `Season Zero record — ${record.title}, held by ${record.holderName}. Official box score data, Ultra Basketball.`;
  const imageUrl = `/api/share/record/${encodeURIComponent(record.key)}`;
  return {
    title, description,
    openGraph: { title, description, images: [imageUrl] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function ShareRecordCard({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ format?: string }> }) {
  const { key } = await params;
  const { format } = await searchParams;
  const cardFormat = FORMAT_MAP[format ?? ""] ?? "SOCIAL_SQUARE";

  const record = await findRecord(key);
  if (!record) notFound();

  const card = buildRecordCard(record, "BOX_SCORE_ONLY");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 bg-[#050807] px-4 py-12">
      <AnalyticsCard card={card} format={cardFormat} />
      <SocialCopyBlock copy={toSocialCopy(card)} />
      <p className="text-center text-xs text-zinc-600">Shareable record card — Season Zero. Not an exportable image; this page is the card.</p>
    </main>
  );
}
