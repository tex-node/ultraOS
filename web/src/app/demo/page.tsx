import { OperationsShell } from "@/app/components/operations-shell";
import { Badge, Card } from "@/app/components/ui/primitives";
import { requirePermissionOrRedirect } from "@/lib/authorization";
import { withOrganizationContext } from "@/lib/tenant-context";
import { formatNaira } from "@/lib/money";
import Link from "next/link";

export const dynamic = "force-dynamic";

type DemoGame = {
  label: string;
  fixtureId: string;
  gameId: string;
  competition: string;
  note: string;
};

export default async function DemoPage() {
  const session = await requirePermissionOrRedirect("public:view", "/demo");
  if (!session.user.organizationId) {
    return (
      <OperationsShell user={session.user}>
        <main className="mx-auto max-w-3xl px-6 py-16">
          <p className="text-text-2">No organization context. Join a league first.</p>
        </main>
      </OperationsShell>
    );
  }

  const data = await withOrganizationContext(session.user.organizationId, async (tx) => {
    const demoComps = await tx.competition.findMany({
      where: { slug: { startsWith: "demo-" } },
      include: {
        sport: true,
        seasons: {
          include: {
            fixtures: {
              where: { recordOrigin: "DEMO" },
              include: { game: { select: { id: true, status: true } } },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const demoGames: DemoGame[] = demoComps.flatMap((comp) =>
      comp.seasons.flatMap((s) =>
        s.fixtures.map((f) => ({
          label: `${comp.name} — ${comp.sport.name}`,
          fixtureId: f.id,
          gameId: f.game?.id ?? "",
          competition: comp.slug,
          note: f.game?.status ?? "NOT_STARTED",
        })),
      ),
    );

    const demoEvent = await tx.event.findFirst({
      where: { id: "seed-event-season-zero-launch" },
      select: {
        id: true,
        name: true,
        seatZones: {
          where: { isActive: true },
          select: { id: true, name: true, priceKobo: true, capacity: true, reservedQuantity: true },
          orderBy: { priceKobo: "desc" },
        },
      },
    });

    const demoVendor = await tx.vendor.findFirst({
      where: { name: "Demo Kitchen" },
      select: {
        id: true,
        name: true,
        products: {
          where: { isActive: true },
          select: { id: true, name: true, priceKobo: true, approvalStatus: true },
          orderBy: { name: "asc" },
        },
      },
    });

    return { demoGames, demoEvent, demoVendor };
  });

  const sportIcons: Record<string, string> = {
    "Demo Basketball — Basketball": "🏀",
    "Demo Basketball (FIBA) — Basketball": "🏀",
    "Demo Volleyball — Volleyball": "🏐",
    "Demo Football — Football": "⚽",
    "Demo American Football — American Football": "🏈",
    "Demo Tennis — Tennis": "🎾",
    "Demo Table Tennis — Table Tennis": "🏓",
  };

  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-7xl px-6 py-10">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold">Demo Mode</h1>
          <Badge tone="featured">★ Demo Mode</Badge>
        </div>
        <p className="mt-2 max-w-3xl text-sm text-text-2">
          Every surface of the platform with sample data. Nothing here appears on the public
          site — demo events are hidden from the homepage, live center, and public APIs.
          Click through any section below to demonstrate the full experience.
        </p>

        {/* === GAME CONTROL === */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Game Control & Capture</h2>
          <p className="mt-1 text-sm text-text-3">
            Each demo game is LIVE. Open a scorer console to capture events in real time,
            or view the scoreboard and statistician output.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.demoGames.map((game) => (
              <Card key={game.fixtureId}>
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{sportIcons[game.label] ?? "🏆"}</span>
                  <Badge tone={game.note === "LIVE" ? "live" : "completed"}>
                    {game.note === "LIVE" ? "● LIVE" : game.note}
                  </Badge>
                </div>
                <h3 className="mt-2 font-display text-base font-semibold">{game.label}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/games/${game.fixtureId}/live`}
                    className="rounded-md bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
                  >
                    Scorer console
                  </Link>
                  <Link
                    href={`/games/${game.fixtureId}/stats`}
                    className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                  >
                    Statistician
                  </Link>
                  {game.gameId ? (
                    <Link
                      href={`/scoreboard/${game.gameId}`}
                      className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                    >
                      Scoreboard
                    </Link>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* === TICKETING === */}
        {data.demoEvent ? (
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">Ticketing & Seating</h2>
            <p className="mt-1 text-sm text-text-3">
              Zone-based ticketing with pricing, passes, promo codes, and QR delivery.
              The Season Zero Opening Night event has real zones you can reserve.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="font-semibold text-brand-300">{data.demoEvent.name}</h3>
                <div className="mt-3 space-y-1.5 text-sm">
                  {data.demoEvent.seatZones.map((zone) => (
                    <div key={zone.id} className="flex justify-between">
                      <span>{zone.name}</span>
                      <span className="text-text-3">
                        {zone.priceKobo === 0 ? "Free" : formatNaira(zone.priceKobo)} · {zone.capacity - zone.reservedQuantity}/{zone.capacity} left
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/events/${data.demoEvent.id}`}
                    className="rounded-md bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
                  >
                    Manage ticketing
                  </Link>
                  <Link
                    href={`/public/events/${data.demoEvent.id}`}
                    className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                  >
                    Fan view (public)
                  </Link>
                </div>
              </Card>
              <Card>
                <h3 className="font-semibold text-brand-300">Gate operations</h3>
                <p className="mt-1 text-sm text-text-2">
                  Scan QR codes at the gate or manage check-in exceptions.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href="/check-in"
                    className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                  >
                    Gate Scanner
                  </Link>
                  <Link
                    href="/qr-operations"
                    className="rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                  >
                    QR Ops
                  </Link>
                </div>
              </Card>
            </div>
          </section>
        ) : null}

        {/* === VENDORS & COMMERCE === */}
        {data.demoVendor ? (
          <section className="mt-10">
            <h2 className="font-display text-xl font-bold">Vendors & Ordering</h2>
            <p className="mt-1 text-sm text-text-3">
              Food and merchandise ordering with the Bachs payment gateway.
            </p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Card>
                <h3 className="font-semibold text-brand-300">{data.demoVendor.name}</h3>
                <div className="mt-2 space-y-1 text-sm">
                  {data.demoVendor.products.map((p) => (
                    <div key={p.id} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="text-text-3">{formatNaira(p.priceKobo)}</span>
                    </div>
                  ))}
                </div>
                <Link
                  href={`/vendors/${data.demoVendor.id}`}
                  className="mt-4 inline-block rounded-md bg-brand-400 px-3 py-2 text-xs font-semibold text-ink-900 transition hover:bg-brand-300"
                >
                  Manage vendor
                </Link>
              </Card>
              <Card>
                <h3 className="font-semibold text-brand-300">Orders</h3>
                <p className="mt-1 text-sm text-text-2">
                  Fan wallet orders flow through: Pending → Paid → Preparing → Ready → Collected.
                </p>
                <Link
                  href="/orders"
                  className="mt-4 inline-block rounded-md border border-line-strong px-3 py-2 text-xs text-text-2 transition hover:border-brand-400/40 hover:text-white"
                >
                  View orders
                </Link>
              </Card>
            </div>
          </section>
        ) : null}

        {/* === STANDINGS & STATS === */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Standings & Stats</h2>
          <p className="mt-1 text-sm text-text-3">
            Standings update automatically when games are finalized. Leaders derive from the
            event ledger.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/standings"
              className="rounded-md bg-brand-400 px-4 py-2 text-sm font-semibold text-ink-900 transition hover:bg-brand-300"
            >
              League tables
            </Link>
            <Link
              href="/leaders"
              className="rounded-md border border-line-strong px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white"
            >
              Leaders
            </Link>
            <Link
              href="/public/stats"
              className="rounded-md border border-line-strong px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white"
            >
              Stats hub
            </Link>
          </div>
        </section>

        {/* === PAYMENTS === */}
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold">Payments</h2>
          <p className="mt-1 text-sm text-text-3">
            Powered by Bachs. Reservations and orders route through hosted checkout;
            the webhook confirms payment automatically.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/vendors"
              className="rounded-md border border-line-strong px-4 py-2 text-sm text-text-2 transition hover:border-brand-400/40 hover:text-white"
            >
              Vendor payouts (Connect)
            </Link>
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}