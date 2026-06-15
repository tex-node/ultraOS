import Link from "next/link";
import { OperationsShell } from "@/app/components/operations-shell";
import { createAthlete } from "@/app/players/actions";
import { AthleteForm } from "@/app/players/athlete-form";
import { requirePermission } from "@/lib/authorization";

export default async function NewAthletePage() {
  const session=await requirePermission("player:manage");
  return <OperationsShell user={session.user}><main className="mx-auto max-w-4xl px-6 py-10"><Link href="/players" className="text-sm text-zinc-400">← Back to athletes</Link><section className="mt-6 rounded-2xl border border-white/[.08] bg-[#0b100e] p-6"><p className="text-xs uppercase tracking-[.2em] text-emerald-400">Permanent identity</p><h1 className="mt-2 text-2xl font-semibold">Create athlete</h1><div className="mt-8"><AthleteForm action={createAthlete} label="Create athlete" /></div></section></main></OperationsShell>;
}
