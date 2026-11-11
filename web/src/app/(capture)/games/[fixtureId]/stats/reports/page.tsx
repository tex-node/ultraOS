import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ReportsIndex({ params }: { params: Promise<{ fixtureId: string }> }) {
  const { fixtureId } = await params;
  redirect(`/games/${fixtureId}/stats/reports/box-score`);
}