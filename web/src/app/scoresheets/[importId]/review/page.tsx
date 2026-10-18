import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { auth } from "@/auth";
import { hasPermission } from "@/lib/permissions";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { correctedPlayerFromRow, loadScoresheetImportForReview, type CorrectedPlayer, type CorrectedScoresheet } from "@/server/scoresheet/imports";
import type { ChecksumReport } from "@/lib/scoresheet/checksums";
import { ReviewForm, type ReviewInitial } from "./review-form";

export const dynamic = "force-dynamic";

function emptyPlayer(): CorrectedPlayer {
  return {
    name: "",
    jerseyNumber: null,
    didNotPlay: false,
    minutesPlayed: 0,
    points: 0,
    fgm: 0,
    fga: 0,
    fg2m: 0,
    fg2a: 0,
    fg3m: 0,
    fg3a: 0,
    ftm: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    reb: 0,
    assists: 0,
    turnovers: 0,
    steals: 0,
    blocks: 0,
    fouls: 0,
  };
}

export default async function ScoresheetReviewPage({ params }: { params: Promise<{ importId: string }> }) {
  const { importId } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=/scoresheets/${importId}/review`);
  if (!hasPermission(session.user.roles, "data:import")) notFound();
  if (!session.user.organizationId) throw new MissingOrganizationContextError();

  const row = await withOrganizationContext(session.user.organizationId, (tx) =>
    loadScoresheetImportForReview(tx, session.user.organizationId!, importId),
  );
  if (!row) notFound();

  const teams = row.extraction?.teams ?? [];
  const homePlayers = (teams[0]?.players ?? []).map(correctedPlayerFromRow);
  const awayPlayers = (teams[1]?.players ?? []).map(correctedPlayerFromRow);
  const sum = (players: CorrectedPlayer[], key: keyof CorrectedPlayer) => players.reduce((total, player) => total + (typeof player[key] === "number" ? (player[key] as number) : 0), 0);
  const totalsOf = (players: CorrectedPlayer[]) => ({
    points: sum(players, "points"),
    rebounds: sum(players, "reb"),
    assists: sum(players, "assists"),
    turnovers: sum(players, "turnovers"),
    fouls: sum(players, "fouls"),
  });

  const corrected = row.corrected as unknown as CorrectedScoresheet | null;
  // Prefer what a reviewer already approved, so re-opening the page shows their numbers, not the
  // raw extraction again.
  const initial: ReviewInitial = {
    importId: row.id,
    status: row.status,
    sourceLabel: row.sourceLabel,
    imageUrl: row.imageUrl,
    imageName: row.mediaAsset?.originalFilename ?? null,
    warnings: row.extraction?.warnings ?? [],
    scheduledAt: corrected?.scheduledAt ?? new Date().toISOString().slice(0, 10),
    homeScore: corrected?.homeScore ?? sum(homePlayers, "points"),
    awayScore: corrected?.awayScore ?? sum(awayPlayers, "points"),
    periods: corrected?.periods ?? [
      { label: "Q1", homeScore: 0, awayScore: 0 },
      { label: "Q2", homeScore: 0, awayScore: 0 },
      { label: "Q3", homeScore: 0, awayScore: 0 },
      { label: "Q4", homeScore: 0, awayScore: 0 },
    ],
    home: corrected?.home ?? { clubName: teams[0]?.teamLabel ?? "Home", players: homePlayers.length > 0 ? homePlayers : [emptyPlayer()], totals: totalsOf(homePlayers) },
    away: corrected?.away ?? { clubName: teams[1]?.teamLabel ?? "Away", players: awayPlayers.length > 0 ? awayPlayers : [emptyPlayer()], totals: totalsOf(awayPlayers) },
    report: (row.checksums as unknown as ChecksumReport | null) ?? undefined,
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold">Review scoresheet</h1>
          <Link href="/scoresheets" className="text-sm text-info underline">
            All scoresheets
          </Link>
        </div>
        <p className="mt-1 text-sm text-text-2">
          {row.sourceLabel} Â· {row.status}
          {row.extractionVersion && row.extractionVersion !== "unset" ? ` Â· ${row.extractionVersion}` : ""}
        </p>
        {row.status === "FAILED" && row.failureReason ? (
          <p role="alert" className="mt-3 rounded-md bg-danger/10 p-3 text-sm text-danger">
            OCR failed on this sheet: {row.failureReason}. Reject it and upload a clearer photo, or enter the sheet by hand.
          </p>
        ) : null}
        <ReviewForm initial={initial} />
      </main>
    </OperationsShell>
  );
}
