import { OperationsShell } from "@/app/components/operations-shell";
import { findCheckInCode } from "./actions";
import { requirePermission } from "@/lib/authorization";

export default async function CheckInPage() {
  const session = await requirePermission("check-in:operate");
  return (
    <OperationsShell user={session.user}>
      <main className="mx-auto max-w-xl px-6 py-16">
        <section className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-8 text-center">
          <p className="text-xs uppercase tracking-[.24em] text-emerald-400">Venue operations</p>
          <h1 className="mt-2 text-3xl font-semibold">Scan or enter QR code</h1>
          <p className="mt-2 text-sm text-zinc-400">QR scans open the verification record. Manual entry is available as fallback.</p>
          <form action={findCheckInCode} className="mt-8 flex gap-2">
            <input name="code" required autoFocus placeholder="Ticket, accreditation, or collection code" className="min-w-0 flex-1 rounded-xl bg-white/[.05] p-4" />
            <button className="rounded-xl bg-emerald-400 px-5 font-semibold text-zinc-950">Find</button>
          </form>
        </section>
      </main>
    </OperationsShell>
  );
}
