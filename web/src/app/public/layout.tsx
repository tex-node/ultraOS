import Link from "next/link";

export const dynamic = "force-dynamic";

// The nav has grown past what fits in one row below ~700px. Rather than restructure into a
// hamburger menu (out of scope — this is a targeted overflow fix, not a shell redesign), the nav
// becomes its own horizontally-scrollable strip below the logo row: links stay in the exact same
// order and behavior as desktop, the header's own height stays fixed, and — critically — the
// scroll is contained inside the nav element, so the page body itself never overflows
// horizontally at any width down to 360px.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <header className="border-b border-white/[.08]">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <Link href="/public" className="font-bold">NEON ULTRA</Link>
          <nav className="mt-3 flex gap-4 overflow-x-auto whitespace-nowrap pb-1 text-sm text-zinc-300 [scrollbar-width:thin]">
            <Link className="shrink-0" href="/public/events">Events</Link>
            <Link className="shrink-0" href="/public/clubs">Clubs</Link>
            <Link className="shrink-0" href="/public/fixtures">Fixtures</Link>
            <Link className="shrink-0" href="/public/players">Players</Link>
            <Link className="shrink-0" href="/public/standings">Standings</Link>
            <Link className="shrink-0" href="/public/stats">Stats</Link>
            <Link className="shrink-0" href="/public/celebrations">Celebrations</Link>
            <Link className="shrink-0 text-emerald-400" href="/apply">Apply</Link>
            <Link className="shrink-0 text-emerald-400" href="/account">My Account</Link>
            <Link className="shrink-0 text-emerald-400" href="/signup">Sign up</Link>
            <Link className="shrink-0 text-emerald-400" href="/login">Login</Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
