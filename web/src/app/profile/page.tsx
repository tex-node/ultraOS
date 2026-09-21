import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { prisma } from "@/lib/prisma";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

// The signed-in user's own profile: who they are, what they can do, and their password.
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/profile");

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      passwordHash: true,
      roles: { where: { revokedAt: null }, select: { role: true, organizationId: true }, orderBy: { grantedAt: "asc" } },
      gameControlGrants: {
        where: { revokedAt: null },
        select: {
          role: true,
          competition: { select: { name: true } },
          season: { select: { name: true } },
          event: { select: { name: true } },
        },
      },
    },
  });

  const scopeLabel = (grant: (typeof user.gameControlGrants)[number]) => {
    if (grant.competition) return `Tournament · ${grant.competition.name}`;
    if (grant.season) return `Season · ${grant.season.name}`;
    if (grant.event) return `Event · ${grant.event.name}`;
    return "Organization-wide";
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="mt-1 text-sm text-text-2">{user.name} · {user.email}</p>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-lg font-semibold">Access</h2>
          <p className="mt-1 text-sm text-text-2">Organization roles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {user.roles.length === 0 ? <span className="text-sm text-text-3">None</span> : null}
            {user.roles.map((assignment) => (
              <span key={`${assignment.role}-${assignment.organizationId ?? "platform"}`} className="rounded-full bg-white/[.06] px-3 py-1 text-xs text-text-1">
                {assignment.role}
                {assignment.organizationId ? "" : " (platform)"}
              </span>
            ))}
          </div>

          <p className="mt-4 text-sm text-text-2">Game control</p>
          {user.gameControlGrants.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">No scoped game-control grants.</p>
          ) : (
            <ul className="mt-2 grid gap-1 text-sm text-text-1">
              {user.gameControlGrants.map((grant, index) => (
                <li key={index}>
                  {grant.role} · {scopeLabel(grant)}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
          <h2 className="text-lg font-semibold">Password</h2>
          <ChangePasswordForm hasPassword={Boolean(user.passwordHash)} email={user.email} />
        </section>

        <p className="mt-6 text-xs text-text-3">
          Need a role for a whole tournament? An administrator can grant it from{" "}
          <Link href="/access" className="text-brand-300 underline">
            Access
          </Link>
          .
        </p>
      </main>
    </OperationsShell>
  );
}
