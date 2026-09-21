import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { MissingOrganizationContextError } from "@/lib/authorization";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function VenueMapPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/venue-map");
  if (!hasPermission(session.user.roles, "operations:view")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) throw new MissingOrganizationContextError();
  const zones = await withOrganizationContext(session.user.organizationId, (tx) => tx.venueZone.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }));
  const fallback = ["VIP", "General", "Media", "Officials", "Players", "Medical", "Vendor", "Emergency Exit"];
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Venue Map</h1><p className="mt-2 text-sm text-text-2">Simple operational occupancy view for event zones.</p><section className="mt-8 grid gap-4 md:grid-cols-4">{(zones.length ? zones : fallback.map((name) => ({ id: name, name, category: name, occupancy: 0, capacity: null, status: "GREEN", notes: null }))).map((zone) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={zone.id}><div className="flex justify-between"><b>{zone.name}</b><span className={zone.status === "GREEN" ? "text-brand-300" : zone.status === "AMBER" ? "text-warn" : "text-danger"}>●</span></div><p className="mt-3 text-sm text-text-2">{zone.category}</p><p className="mt-2 text-2xl font-semibold">{zone.occupancy}/{zone.capacity ?? "?"}</p></article>)}</section></main></OperationsShell>;
}
