import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const roles = ["Registration", "MC", "Draft Operator", "Scorekeeper", "Statistician", "Media", "Photographer", "Security", "Medical", "Vendor Coordinator", "Volunteer Lead"];

export default async function StaffPlannerPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/staff-planner");
  if (!hasPermission(session.user.roles, "operations:view")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const assignments = await prisma.eventStaffAssignment.findMany({ orderBy: [{ eventId: "asc" }, { role: "asc" }] });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Event Staff Planner</h1><p className="mt-2 text-sm text-zinc-400">Season Zero operational roles and current assignment status.</p><section className="mt-8 grid gap-3 md:grid-cols-3">{roles.map((role) => { const assigned = assignments.find((a) => a.role === role); return <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={role}><b>{role}</b><p className="mt-2 text-sm text-zinc-400">{assigned?.personName ?? assigned?.userId ?? assigned?.staffId ?? "Unassigned"}</p><p className="mt-1 text-xs text-zinc-500">{assigned?.status ?? "OPEN"}</p></article>; })}</section></main></OperationsShell>;
}
