import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createDocument } from "@/app/operations/actions";
import { hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export default async function DocumentsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/documents");
  if (!hasPermission(session.user.roles, "document:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  const documents = await prisma.opsDocument.findMany({ orderBy: { createdAt: "desc" } });
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Document Center</h1><form action={createDocument} className="mt-6 grid gap-3 rounded-2xl border border-white/[.08] bg-[#0b100e] p-5 md:grid-cols-[1fr_160px_2fr_auto]"><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="title" placeholder="Venue agreement / MC script" required /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="category" placeholder="Category" /><input className="rounded-xl border border-white/10 bg-[#050807] px-3 py-3 text-sm" name="fileUrl" placeholder="Secure file URL" /><button className="rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-zinc-950">Add</button></form><section className="mt-8 grid gap-3">{documents.map((d) => <article className="rounded-2xl border border-white/[.08] bg-[#0b100e] p-5" key={d.id}><b>{d.title}</b><p className="text-sm text-zinc-400">{d.category} - {d.status}</p>{d.fileUrl ? <a className="mt-2 block text-sm text-emerald-300" href={d.fileUrl}>Open document</a> : null}</article>)}</section></main></OperationsShell>;
}
