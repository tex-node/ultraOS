import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AnalyticsCard } from "@/components/analytics/cards/AnalyticsCard";
import { SocialCopyBlock } from "@/components/analytics/cards/SocialCopyBlock";
import { buildTeamProfileCard } from "@/lib/analytics/cards/team-cards";
import { loadSeasonGameCores } from "@/lib/analytics/game-analytics";
import { computeSeasonTeamTotals } from "@/lib/analytics/season-team-totals";
import { computeLeagueTeamDna } from "@/lib/analytics/team-dna";
import { computeTeamRanks, topRankBadges } from "@/lib/analytics/rank-context";
import { toSocialCopy, type CardFormat } from "@/lib/analytics/cards/types";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FORMAT_MAP: Record<string, CardFormat> = { square: "SOCIAL_SQUARE", portrait: "SOCIAL_PORTRAIT", broadcast: "BROADCAST_16_9" };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const club = await prisma.club.findUnique({ where: { id }, select: { name: true } });
  if (!club) return { title: "Team Card — Ultra Basketball" };
  const title = `${club.name} — Season Zero | Ultra Basketball`;
  const description = `Season Zero team card for ${club.name} — official box score data, Ultra Basketball.`;
  const imageUrl = `/api/share/team/${id}`;
  return {
    title, description,
    openGraph: { title, description, images: [imageUrl] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default async function ShareTeamCard({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ format?: string }> }) {
  const { id } = await params;
  const { format } = await searchParams;
  const cardFormat = FORMAT_MAP[format ?? ""] ?? "SOCIAL_SQUARE";

  const club = await prisma.club.findUnique({
    where: { id },
    select: { logoUrl: true, seasonClubs: { where: { status: "ACTIVE" }, select: { id: true, seasonId: true }, take: 1 } },
  });
  const seasonClub = club?.seasonClubs[0];
  if (!club || !seasonClub) notFound();

  const games = await loadSeasonGameCores(seasonClub.seasonId);
  const totalsByTeam = computeSeasonTeamTotals(games);
  const totals = totalsByTeam.get(seasonClub.id);
  if (!totals) notFound();

  const dnaByTeam = computeLeagueTeamDna(games);
  const dna = dnaByTeam.get(seasonClub.id) ?? null;
  const ranks = topRankBadges(computeTeamRanks(seasonClub.id, [...totalsByTeam.values()]));
  const card = buildTeamProfileCard(totals, dna, club.logoUrl, ranks, "BOX_SCORE_ONLY");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-4 bg-[#050807] px-4 py-12">
      <AnalyticsCard card={card} format={cardFormat} />
      <SocialCopyBlock copy={toSocialCopy(card)} />
      <p className="text-center text-xs text-zinc-600">Shareable team card — Season Zero. Not an exportable image; this page is the card.</p>
    </main>
  );
}
