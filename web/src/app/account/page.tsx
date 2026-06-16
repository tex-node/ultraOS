import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function AccountPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=/account");
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: {
      roles: {
        where: { revokedAt: null },
        orderBy: { grantedAt: "desc" },
      },
      athleteProfile: true,
      staffProfile: true,
      vendorProfile: true,
      mediaProfile: true,
      volunteerProfile: true,
      applicationsSubmitted: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      fanMemberships: {
        include: { fanClub: { include: { club: { select: { name: true } } } } },
        orderBy: { joinedAt: "desc" },
      },
      seatReservations: {
        include: {
          event: { select: { name: true, date: true } },
          seatZone: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      orders: {
        include: { event: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      accreditations: {
        include: { event: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  const roles = user.roles.length > 0 ? user.roles.map((role) => role.role) : ["FAN"];

  return (
    <main className="min-h-screen bg-[#050807] px-6 py-10 text-white">
      <section className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link className="text-sm text-emerald-400 hover:text-emerald-300" href="/public">
              Back to public site
            </Link>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight">My Account</h1>
            <p className="mt-2 text-sm text-zinc-400">
              {user.name} · {user.email}
            </p>
          </div>
          <Link
            className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
            href="/apply"
          >
            Apply for another role
          </Link>
        </div>

        <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Fan profile</p>
            <h2 className="mt-2 text-lg font-semibold">Active by default</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Reservations, orders, fan memberships, MVP voting, and public pages remain enabled.
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Active roles</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.map((role) => (
                <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300" key={role}>
                  {role}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Profiles</p>
            <p className="mt-2 text-sm text-zinc-300">
              {[user.athleteProfile && "Athlete", user.staffProfile && "Staff", user.vendorProfile && "Vendor", user.mediaProfile && "Media", user.volunteerProfile && "Volunteer"].filter(Boolean).join(", ") || "No participant profiles yet"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Applications</p>
            <h2 className="mt-2 text-3xl font-semibold">{user.applicationsSubmitted.length}</h2>
          </div>
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <AccountList title="Submitted applications">
            {user.applicationsSubmitted.map((application) => (
              <AccountRow
                key={application.id}
                primary={application.type}
                secondary={`${application.status.replaceAll("_", " ")} · ${application.createdAt.toLocaleString()}`}
              />
            ))}
          </AccountList>
          <AccountList title="Fan club memberships">
            {user.fanMemberships.map((membership) => (
              <AccountRow
                key={membership.id}
                primary={membership.fanClub.name}
                secondary={`${membership.fanClub.club.name} · joined ${membership.joinedAt.toLocaleDateString()}`}
              />
            ))}
          </AccountList>
          <AccountList title="Reservations">
            {user.seatReservations.map((reservation) => (
              <AccountRow
                key={reservation.id}
                primary={`${reservation.event.name} · ${reservation.seatZone.name}`}
                secondary={`${reservation.quantity} seat(s) · ${reservation.status} · ${reservation.paymentStatus}`}
              />
            ))}
          </AccountList>
          <AccountList title="Orders">
            {user.orders.map((order) => (
              <AccountRow
                key={order.id}
                primary={order.event.name}
                secondary={`${order.status} · ${order.paymentStatus} · ${order.collectionCode}`}
              />
            ))}
          </AccountList>
          <AccountList title="Accreditation status">
            {user.accreditations.map((accreditation) => (
              <AccountRow
                key={accreditation.id}
                primary={`${accreditation.event.name} · ${accreditation.category}`}
                secondary={`${accreditation.status} · ${accreditation.code}`}
              />
            ))}
          </AccountList>
        </section>
      </section>
    </main>
  );
}

function AccountList({ children, title }: { children: React.ReactNode; title: string }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-[#0b100e]">
      <h2 className="border-b border-white/[0.06] p-5 text-lg font-semibold">{title}</h2>
      <div className="divide-y divide-white/[0.06]">
        {hasChildren ? children : <p className="p-5 text-sm text-zinc-500">Nothing recorded yet.</p>}
      </div>
    </div>
  );
}

function AccountRow({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className="p-5">
      <p className="font-medium text-zinc-100">{primary}</p>
      <p className="mt-1 text-sm text-zinc-500">{secondary}</p>
    </div>
  );
}
