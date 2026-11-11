import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

export const dynamic = "force-dynamic";

// Registration receipt (streak v19, Prompt 2).
//
// A public form that redirects into a login screen is a form that loses the person who just filled it in. This page is
// reachable without a session, shows the reference, and says plainly whether a confirmation email went out - because on
// an environment with no mail server, "check your inbox" would be a lie.
export default async function RegistrationSubmittedPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; competitionSlug: string }>;
  searchParams: Promise<{ application?: string; emailed?: string }>;
}) {
  const { organizationSlug, competitionSlug } = await params;
  const query = await searchParams;
  const emailed = query.emailed === "1";

  let summary: { name: string; competitionName: string; status: string } | null = null;
  if (query.application) {
    // Application is RLS-protected too, so it is read inside the tenant the URL names. An unknown slug resolves to no
    // organization and therefore to no application - the reference alone must not reveal another tenant's record.
    const organization = await prisma.organization.findFirst({ where: { slug: organizationSlug }, select: { id: true } });
    const application = organization
      ? await withOrganizationContext(organization.id, (tx) =>
          tx.application.findFirst({ where: { id: query.application }, select: { submittedData: true, status: true } }),
        )
      : null;
    if (application) {
      const data = (application.submittedData ?? {}) as Record<string, unknown>;
      summary = {
        name: `${String(data.firstName ?? "")} ${String(data.lastName ?? "")}`.trim(),
        competitionName: String(data.competitionName ?? ""),
        status: application.status.replaceAll("_", " ").toLowerCase(),
      };
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-12 sm:px-6">
      <p className="text-xs uppercase tracking-[.2em] text-brand-400">Registration received</p>
      <h1 className="mt-2 text-2xl font-bold">{summary?.name ? `Thank you, ${summary.name}` : "Thank you"}</h1>
      {summary ? (
        <p className="mt-2 text-sm text-text-2">
          Your application for <b className="text-text-1">{summary.competitionName}</b> is <b className="text-text-1">{summary.status}</b>.
          A league administrator will review it - you are not registered until they approve it.
        </p>
      ) : (
        <p className="mt-2 text-sm text-text-2">Your registration was received.</p>
      )}

      {query.application ? (
        <p className="mt-4 rounded-lg border border-line bg-ink-800 px-4 py-3 font-mono text-xs text-text-2">
          Reference: {query.application}
        </p>
      ) : null}

      <p className="mt-4 rounded-lg border border-line px-4 py-3 text-xs text-text-2">
        {emailed
          ? "A confirmation email is on its way. Keep the reference above in case you need to ask about it."
          : "No confirmation email was sent: this environment has no mail server configured. Keep the reference above - it is the only record you will have until the league contacts you."}
      </p>

      <Link href={`/t/${organizationSlug}/${competitionSlug}`} className="mt-6 inline-block text-sm text-brand-300 underline">
        Back to {competitionSlug.replaceAll("-", " ")}
      </Link>
    </main>
  );
}
