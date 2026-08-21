import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createClub } from "@/app/clubs/actions";
import { ClubForm } from "@/app/clubs/club-form";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/authorization";

export default async function NewClubPage() {
  const rawSession = await auth();
  if (!rawSession?.user) redirect("/login?callbackUrl=/clubs/new");
  const session = await requirePermission("club:manage");
  const sports = await prisma.sport.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link className="text-sm text-zinc-400 hover:text-white" href="/clubs">
          ← Back to clubs
        </Link>
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-[#0b100e] p-6">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">
            Permanent identity
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Create club</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Create the club brand first. Register it in a season separately.
          </p>
          <div className="mt-8">
            <ClubForm action={createClub} sports={sports} submitLabel="Create club" />
          </div>
        </div>
      </main>
    </OperationsShell>
  );
}
