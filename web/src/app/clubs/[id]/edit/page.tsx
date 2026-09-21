import Link from "next/link";
import { notFound } from "next/navigation";
import { OperationsShell } from "@/app/components/operations-shell";
import { updateClub } from "@/app/clubs/actions";
import { ClubForm } from "@/app/clubs/club-form";
import { requirePermissionWithOrganization } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function EditClubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session, organizationId } = await requirePermissionWithOrganization("club:manage");
  const { id } = await params;
  const [club, sports] = await Promise.all([
    withOrganizationContext(organizationId, (tx) => tx.club.findUnique({ where: { id } })),
    prisma.sport.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!club) {
    notFound();
  }

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link className="text-sm text-text-2 hover:text-white" href={`/clubs/${club.id}`}>
          ← Back to club
        </Link>
        <div className="mt-6 rounded-lg border border-white/[0.08] bg-ink-800 p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-brand-400">
            Permanent identity
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Edit {club.name}</h1>
          <div className="mt-8">
            <ClubForm
              action={updateClub.bind(null, club.id)}
              sports={sports}
              club={club}
              submitLabel="Save club identity"
            />
          </div>
        </div>
      </main>
    </OperationsShell>
  );
}
