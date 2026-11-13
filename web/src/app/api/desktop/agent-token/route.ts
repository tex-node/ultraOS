import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authorization";
import { signAgentProof } from "@/lib/desktop/agent-proof";

export const dynamic = "force-dynamic";

// Issues the short-lived proof the desktop agent needs before it will accept anything from the page.
//
// This is the only new server surface the desktop app requires: it is session-authenticated like any other route, so an
// unauthenticated page cannot obtain a proof, and therefore cannot obtain an agent token. Every call issues a fresh proof -
// there is nothing to cache or revoke, and the 5-minute expiry bounds a stolen one.
//
// The proof carries userId and orgId for logging and for scoping later server-side work (vision sync). Neither is the
// authorization decision here; the session is.
export async function GET() {
  try {
    const session = await requireSession();
    const proof = signAgentProof({
      userId: session.user.id,
      orgId: session.user.organizationId ?? null,
    });
    return NextResponse.json({ proof }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // AuthenticationError and anything else that means "no session" are the same answer to the caller: 401, no detail.
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
}
