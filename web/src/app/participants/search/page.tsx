import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import type { Prisma } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function ParticipantSearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/participants/search");
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
  const athletes = query
    ? await prisma.athlete.findMany({
        where: {
          OR: athleteSearch,
        },
        include: { registrations: { include: { seasonClub: { include: { club: true } } }, orderBy: { createdAt: "desc" }, take: 1 } },
        take: 30,
      })
    : [];
  const staff = query
    ? await prisma.staff.findMany({
        where: {
          OR: staffSearch,
        },
        take: 30,
      })
    : [];
  return <OperationsShell user={session.user}><main className="mx-auto max-w-5xl px-6 py-10"><h1 className="text-3xl font-semibold">Participant Search</h1><form className="mt-6"><input className="w-full rounded-xl border border-white/10 bg-[#050807] px-4 py-3 text-sm" name="q" defaultValue={query} placeholder="Ultra ID, name, tryout number, club, position" /></form><section className="mt-8 grid gap-4 md:grid-cols-2"><div><h2 className="text-xl font-semibold">Athletes</h2><div className="mt-4 grid gap-3">{athletes.map((athlete) => <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/players/${athlete.ultraAthleteId ?? athlete.id}`} key={athlete.id}><b>{athlete.firstName} {athlete.lastName}</b><p className="text-sm text-zinc-400">{athlete.ultraAthleteId ?? "ID pending"} | {athlete.registrations[0]?.seasonClub?.club.name ?? "Unassigned"}</p></Link>)}</div></div><div><h2 className="text-xl font-semibold">Staff</h2><div className="mt-4 grid gap-3">{staff.map((person) => <Link className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" href={`/staff/${person.ultraStaffId ?? person.id}`} key={person.id}><b>{person.name}</b><p className="text-sm text-zinc-400">{person.ultraStaffId ?? "ID pending"} | {person.role}</p></Link>)}</div></div></section></main></OperationsShell>;
}
