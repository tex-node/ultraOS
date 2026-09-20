import Link from "next/link";

// Fan portal shell (product roadmap F1). Guest-safe by construction: every link here is a
// public route, and this shell never imports anything from the organizer workspace.
const discoverLinks = [
  { href: "/public/events", label: "Events" },
  { href: "/public/clubs", label: "Clubs" },
  { href: "/public/fixtures", label: "Fixtures" },
  { href: "/public/players", label: "Players" },
  { href: "/public/standings", label: "Standings" },
  { href: "/public/stats", label: "Stats" },
  { href: "/public/tickets", label: "Tickets" },
  { href: "/public/orders", label: "My Orders" },
  { href: "/public/celebrations", label: "Celebrations" },
  { href: "/live", label: "Live Center" },
];

const accountLinks = [
  { href: "/apply", label: "Apply" },
  { href: "/account", label: "My Account" },
  { href: "/signup", label: "Sign up" },
  { href: "/login", label: "Login" },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <header className="border-b border-white/[.08]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/public" className="font-bold">
              NEON ULTRA
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-emerald-400/40 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-400/10"
            >
              Organize an Event
            </Link>
          </div>
          <nav className="mt-3 flex gap-4 overflow-x-auto whitespace-nowrap pb-1 text-sm text-zinc-300 [scrollbar-width:thin]">
            {discoverLinks.map((link) => (
              <Link key={link.href} className="shrink-0 transition hover:text-white" href={link.href}>
                {link.label}
              </Link>
            ))}
            {accountLinks.map((link) => (
              <Link key={link.href} className="shrink-0 text-emerald-400 transition hover:text-emerald-300" href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
