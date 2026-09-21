import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/app/components/portal-shell";
import { WorkspaceShell } from "@/app/components/workspace-shell";
import { AuthenticationError } from "@/lib/authorization";
import { commissionSplitKobo, formatNaira } from "@/lib/money";
import { withOrganizationContext } from "@/lib/tenant-context";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const cards = [
  { href: "/dashboard", title: "Dashboard", body: "Revenue, ticket sales, live match status, vendor payouts at a glance." },
  { href: "/competitions", title: "Tournament builder", body: "Create tournaments, set formats and rules, manage teams and rosters." },
  { href: "/fixtures", title: "Scheduler", body: "Generate and adjust fixtures across venues and timeslots." },
  { href: "/gameday", title: "Live scorekeeping", body: "Match-day command: open scorepads, track live games, finalize results." },
  { href: "/events", title: "Ticketing & access", body: "Inventory, pricing tiers, discount codes, gate check-in." },
  { href: "/vendors", title: "Vendors & concessions", body: "Onboard vendors, approve menus, track orders and payouts." },
  { href: "/check-in", title: "Gate scanner", body: "Validate tickets and QR codes at venue entry." },
  { href: "/access", title: "Staff access", body: "Grant tournament-scoped game control without league-wide roles." },
];

const ELEVATED_ROLES = new Set([
  "SUPER_ADMIN",
  "LEAGUE_OPERATOR",
  "TOURNAMENT_DIRECTOR",
  "VENDOR_MANAGER",
  "SCOREKEEPER",
  "OFFICIAL",
  "COACH",
]);

function isStaff(roles: string[] | undefined, role: string) {
  const all = roles?.length ? roles : [role];
  return all.some((r) => ELEVATED_ROLES.has(r));
}

// Organizer workspace hub (product roadmap F1.2/F6.2): live numbers plus section cards.
// Link visibility here is convenience only — every target page enforces its own gates.
export default async function AdminHub() {
  let session = null;
  try {
    session = await auth();
  } catch (error) {
    if (error instanceof AuthenticationError) redirect("/login?callbackUrl=/admin");
    throw error;
  }
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  if (!isStaff(session.user.roles, session.user.role)) {
    return (
      <PortalShell>
        <main className="mx-auto max-w-2xl px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold">The organizer workspace is for event staff</h1>
          <p className="mt-3 text-sm text-text-2">
            Your account has fan access. To run tournaments, apply as an organizer or ask your
            league administrator for staff access — nothing here affects your fan experience.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/public"
              className="rounded-lg border border-line px-4 py-2 text-sm text-text-1 transition hover:border-white/20 hover:text-white"
            >
              Back to fan portal
            </Link>
            <Link
              href="/apply"
              className="rounded-lg bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
            >
              Apply as organizer
            </Link>
          </div>
        </main>
      </PortalShell>
    );
  }

  const organizationId = session.user.organizationId;
  const stats = organizationId
    ? await withOrganizationContext(organizationId, async (tx) => {
        const [ticketRevenue, orderRevenue, reservations, tickets, liveFixtures, paidOrders] = await Promise.all([
          tx.seatReservation.aggregate({ where: { paymentStatus: "PAID" }, _sum: { totalKobo: true } }),
          tx.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { totalKobo: true } }),
          tx.seatReservation.count({ where: { status: "CONFIRMED" } }),
          tx.ticket.count({ where: { status: { in: ["ACTIVE", "USED"] } } }),
          tx.fixture.findMany({
            where: { status: "LIVE" },
            orderBy: { scheduledAt: "desc" },
            take: 5,
            select: {
              id: true,
              homeScore: true,
              awayScore: true,
              homeSeasonClub: { select: { club: { select: { name: true } } } },
              awaySeasonClub: { select: { club: { select: { name: true } } } },
              homeEntrant: { select: { name: true } },
              awayEntrant: { select: { name: true } },
            },
          }),
          tx.order.findMany({
            where: { paymentStatus: "PAID" },
            select: { totalKobo: true, items: { select: { totalKobo: true, product: { select: { vendor: { select: { name: true, commissionBps: true } } } } } } },
            orderBy: { createdAt: "desc" },
            take: 200,
          }),
        ]);
        const vendorGross = new Map<string, { gross: number; commission: number }>();
        for (const order of paidOrders) {
          for (const item of order.items) {
            const vendor = item.product.vendor?.name ?? "Direct sales";
            const split = commissionSplitKobo(item.totalKobo, item.product.vendor?.commissionBps ?? 0);
            const entry = vendorGross.get(vendor) ?? { gross: 0, commission: 0 };
            entry.gross += item.totalKobo;
            entry.commission += split.commissionKobo;
            vendorGross.set(vendor, entry);
          }
        }
        return {
          ticketRevenueKobo: ticketRevenue._sum.totalKobo ?? 0,
          orderRevenueKobo: orderRevenue._sum.totalKobo ?? 0,
          reservations,
          tickets,
          liveFixtures,
          vendorGross: [...vendorGross.entries()]
            .map(([vendor, figures]) => ({ vendor, ...figures, net: figures.gross - figures.commission }))
            .sort((a, b) => b.gross - a.gross)
            .slice(0, 5),
        };
      })
    : null;

  return (
    <WorkspaceShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Organizer workspace</h1>
        <p className="mt-1 text-sm text-text-2">Run your tournaments end to end — pick a section to begin.</p>
        {stats ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Ticket revenue (paid)" value={formatNaira(stats.ticketRevenueKobo)} />
            <Stat label="Food & merch revenue (paid)" value={formatNaira(stats.orderRevenueKobo)} />
            <Stat label="Reservations / tickets" value={`${stats.reservations} / ${stats.tickets}`} />
            <Stat label="Live now" value={String(stats.liveFixtures.length)} />
          </div>
        ) : null}
        {stats && stats.liveFixtures.length > 0 ? (
          <section className="mt-6 rounded-lg border border-emerald-400/20 bg-brand-400/[.04] p-5">
            <h2 className="text-sm font-bold uppercase tracking-[.15em] text-brand-400">Live matches</h2>
            <div className="mt-3 space-y-2">
              {stats.liveFixtures.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>
                    {f.homeSeasonClub?.club.name ?? f.homeEntrant?.name ?? "TBD"} {f.homeScore} – {f.awayScore}{" "}
                    {f.awaySeasonClub?.club.name ?? f.awayEntrant?.name ?? "TBD"}
                  </span>
                  <Link href={`/games/${f.id}/live`} className="text-brand-300">
                    Open console →
                  </Link>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        {stats && stats.vendorGross.length > 0 ? (
          <section className="mt-6 rounded-lg border border-line bg-ink-800 p-5">
            <h2 className="text-sm font-bold uppercase tracking-[.15em] text-text-2">Vendor payouts (paid orders)</h2>
            <div className="mt-3 space-y-1 text-sm">
              {stats.vendorGross.map((row) => (
                <div key={row.vendor} className="flex justify-between gap-2">
                  <span>{row.vendor}</span>
                  <span className="text-text-2">
                    {formatNaira(row.gross)} gross · <span className="text-brand-300">{formatNaira(row.net)} net</span>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-lg border border-line bg-ink-800 p-5 transition hover:border-brand-400/30"
            >
              <h2 className="font-semibold text-brand-300">{card.title}</h2>
              <p className="mt-1 text-sm text-text-2">{card.body}</p>
            </Link>
          ))}
        </div>
      </main>
    </WorkspaceShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-ink-800 p-4">
      <p className="text-xs uppercase tracking-[.15em] text-text-3">{label}</p>
      <p className="mt-1 text-xl font-bold text-brand-300">{value}</p>
    </div>
  );
}
