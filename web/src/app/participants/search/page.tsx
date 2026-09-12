import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

// Phase 1 Stage 5.5B: previously searched every organization's athletes and staff (name, Ultra
// ID, and - for data:readiness holders - email/phone) via the bare, unscoped client, with no
// permission gate beyond being logged in. Scoped to the acting user's own organization.
// ultraAthleteId/ultraStaffId are deliberately GLOBAL-unique (Stage 5.4A), so scoping the
// contains-search to the caller's own organization can only exclude rows that were never theirs
// to see - it cannot hide a legitimate same-org match.
export default async function ParticipantSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/participants/search");
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const { q = "" } = await searchParams;
  const query = q.trim();
  const canUsePrivate = hasPermission(session.user.roles, "data:readiness");
  const athleteSearch: Prisma.AthleteWhereInput[] = [
    { ultraAthleteId: { contains: query, mode: "insensitive" } },
    { firstName: { contains: query, mode: "insensitive" } },
    { lastName: { contains: query, mode: "insensitive" } },
    { registrations: { some: { tryoutNumber: { contains: query, mode: "insensitive" } } } },
  ];
  const staffSearch: Prisma.StaffWhereInput[] = [
    { ultraStaffId: { contains: query, mode: "insensitive" } },
    { name: { contains: query, mode: "insensitive" } },
  ];
  if (canUsePrivate) {
    athleteSearch.push({ email: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } });
    staffSearch.push({ email: { contains: query, mode: "insensitive" } }, { phone: { contains: query, mode: "insensitive" } });
  }
  const [athletes, staff] = await withOrganizationContext(session.user.organizationId, (tx) => Promise.all([
    query
      ? tx.athlete.findMany({
          where: {
            OR: athleteSearch,
          },
          include: { registrations: { include: { seasonClub: { include: { club: true } } }, orderBy: { createdAt: "desc" }, take: 1 } },
          take: 30,
        })
      : Promise.resolve([]),
    query
      ? tx.staff.findMany({
          where: {
            OR: staffSearch,
          },
          take: 30,
        })
      : Promise.resolve([]),
  ]));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-5xl px-6 py-10"><h1 className="text-3xl font-semibold">Participant Search</h1><form className="mt-6"><input className="w-full rounded-xl border border-white/10 bg-[#050807] px-4 py-3 text-sm" name="q" defaultValue={query} placeholder="Ultra ID, name, tryout number, club, position" /></form><section className="mt-8 grid gap-4 md:grid-cols-2"><div><h2 className="text-xl font-semibold">Athletes</h2><div className="mt-4 grid gap-3">{athletes.map((athlete) => <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/players/${athlete.ultraAthleteId ?? athlete.id}`} key={athlete.id}><b>{athlete.firstName} {athlete.lastName}</b><p className="text-sm text-zinc-400">{athlete.ultraAthleteId ?? "ID pending"} | {athlete.registrations[0]?.seasonClub?.club.name ?? "Unassigned"}</p></Link>)}</div></div><div><h2 className="text-xl font-semibold">Staff</h2><div className="mt-4 grid gap-3">{staff.map((person) => <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/staff/${person.ultraStaffId ?? person.id}`} key={person.id}><b>{person.name}</b><p className="text-sm text-zinc-400">{person.ultraStaffId ?? "ID pending"} | {person.role}</p></Link>)}</div></div></section></main></OperationsShell>;
}
