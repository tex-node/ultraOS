import Link from "next/link";
import { redirect } from "next/navigation";
import { PortalShell } from "@/app/components/portal-shell";
import { WorkspaceShell } from "@/app/components/workspace-shell";
import { AuthenticationError } from "@/lib/authorization";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

const cards = [
  { href: "/dashboard", title: "Dashboard", body: "Revenue, ticket sales, live match status, vendor payouts at a glance." },
  { href: "/competitions", title: "Tournament builder", body: "Create tournaments, set formats and rules, manage teams and rosters." },
  { href: "/fixtures", title: "Scheduler", body: "Generate and adjust fixtures across venues and timeslots." },
  { href: "/gameday", title: "Live scorekeeping", body: "Match-day command: open scorepads, track live games, finalize results." },
  { href: "/events", title: "Ticketing & access", body: "Inventory, pricing tiers, discount codes, gate check-in." },
  { href: "/check-in", title: "Gate scanner", body: "Validate tickets and QR codes at venue entry." },
  { href: "/vendors", title: "Vendors & concessions", body: "Onboard vendors, approve menus, track orders and payouts." },
  { href: "/access", title: "Staff access", body: "Grant tournament-scoped game control without league-wide roles." },
];

function isStaff(roles: string[] | undefined, role: string) {
  return roles?.includes("SUPER_ADMIN") || roles?.includes("LEAGUE_OPERATOR") || role === "SUPER_ADMIN" || role === "LEAGUE_OPERATOR";
}

// Organizer workspace hub (product roadmap F1.2). Staff land on section cards; everyone
// else gets a plain-language panel pointing back to the fan portal or applications.
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
          <p className="mt-3 text-sm text-zinc-400">
            Your account has fan access. To run tournaments, apply as an organizer or ask your
            league administrator for staff access — nothing here affects your fan experience.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/public"
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Back to fan portal
            </Link>
            <Link
              href="/apply"
              className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300"
            >
              Apply as organizer
            </Link>
          </div>
        </main>
      </PortalShell>
    );
  }

  return (
    <WorkspaceShell user={session.user}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Organizer workspace</h1>
        <p className="mt-1 text-sm text-zinc-400">Run your tournaments end to end — pick a section to begin.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 transition hover:border-emerald-400/30"
            >
              <h2 className="font-semibold text-emerald-300">{card.title}</h2>
              <p className="mt-1 text-sm text-zinc-400">{card.body}</p>
            </Link>
          ))}
        </div>
      </main>
    </WorkspaceShell>
  );
}
