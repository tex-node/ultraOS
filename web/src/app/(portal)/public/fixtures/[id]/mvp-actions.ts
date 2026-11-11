"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { castMvpVote } from "@/server/mvp/votes";

// The MVP vote action (streak v12, Prompt 4).
//
// It returns a result object rather than throwing, because "you already voted" is a normal thing a fan does twice by
// accident - not a 500. Only an unknown failure throws.
const voteInput = z.object({
  gameId: z.string().min(1),
  playerId: z.string().min(1),
});

export type VoteActionResult = { ok: true } | { ok: false; reason: "NOT_SIGNED_IN" | "NOT_FINAL" | "NOT_A_CANDIDATE" | "ALREADY_VOTED" | "ERROR" };

export async function castMvpVoteAction(_previous: VoteActionResult | null, formData: FormData): Promise<VoteActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "NOT_SIGNED_IN" };
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const input = voteInput.parse({ gameId: formData.get("gameId"), playerId: formData.get("playerId") });

  const result = await withOrganizationContext(session.user.organizationId, (tx) =>
    castMvpVote({
      prisma: tx,
      organizationId: session.user.organizationId!,
      userId: session.user.id,
      gameId: input.gameId,
      playerId: input.playerId,
    }),
  );

  if (result.ok) revalidatePath("/public/fixtures/[id]", "page");
  return result;
}
