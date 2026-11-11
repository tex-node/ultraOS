import type { KeyReview } from "@/lib/coaching/game-plan";
import { Card, formatDate, Num, SectionTitle, VerdictChip } from "./ui";

// Post-game review: the plan was rebuilt from games BEFORE this one only (no hindsight), then each
// Key to the Game is marked HELD / BROKEN / NOT_TESTABLE with the actual figure against the one the
// key set out to beat.

export function ReviewView({
  focusName,
  opponentName,
  scheduledAt,
  focusScore,
  opponentScore,
  reviews,
  unavailableReason,
}: {
  focusName: string;
  opponentName: string;
  scheduledAt: Date;
  focusScore: number;
  opponentScore: number;
  reviews: KeyReview[];
  unavailableReason: string | null;
}) {
  const count = (v: KeyReview["verdict"]) => reviews.filter((r) => r.verdict === v).length;
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-1">Review: {focusName} vs {opponentName}</h1>
      <p className="mt-1 text-sm text-text-2">
        {formatDate(scheduledAt)} · final <Num>{focusScore}-{opponentScore}</Num>
      </p>
      <p className="mt-1 text-xs text-text-3">Built only from games played before this one.</p>

      {unavailableReason ? (
        <Card quiet className="mt-4">
          <p data-state="unavailable" className="text-sm text-text-2">{unavailableReason}</p>
        </Card>
      ) : reviews.length === 0 ? (
        <Card quiet className="mt-4">
          <p data-state="no-keys" className="text-sm text-text-2">The plan had no keys for this opponent, so there is nothing to review.</p>
        </Card>
      ) : (
        <>
          <p className="mt-3 text-sm text-text-1" data-summary="verdicts">
            <Num>{count("HELD")}</Num> held · <Num>{count("BROKEN")}</Num> broken · <Num>{count("NOT_TESTABLE")}</Num> not testable
          </p>
          <SectionTitle>Keys</SectionTitle>
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.key.kind} data-key={r.key.kind} data-verdict={r.verdict}>
                <Card quiet={r.verdict === "NOT_TESTABLE"}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-text-1">{r.key.title}</h3>
                    <VerdictChip verdict={r.verdict} />
                  </div>
                  <p className="mt-1 text-sm text-text-2">{r.key.rationale}</p>
                  <p className="mt-2 text-xs text-text-2">
                    {r.actual != null ? (
                      <>Actual <Num>{r.actual}</Num>, expected {r.expected}.</>
                    ) : (
                      <>Could not be checked from this box score (expected {r.expected}).</>
                    )}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
