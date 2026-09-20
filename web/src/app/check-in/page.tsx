import { OperationsShell } from "@/app/components/operations-shell";
import { GateScanTools } from "./gate-tools";
import { requirePermissionOrRedirect } from "@/lib/authorization";

export default async function CheckInPage() {
  const session = await requirePermissionOrRedirect("check-in:operate", "/check-in");
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-xl px-6 py-16">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-8 text-center">
          <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Venue operations</p>
          <h1 className="mt-2 text-3xl font-semibold">Scan or enter QR code</h1>
          <p className="mt-2 text-sm text-zinc-400">QR scans open the verification record. Manual entry is available as fallback.</p>
          <div className="mt-6">
            <GateScanTools />
          </div>
        </section>
      </main>
    </OperationsShell>
  );
}
