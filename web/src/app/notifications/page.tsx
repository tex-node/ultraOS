import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { OperationsShell } from "@/app/components/operations-shell";
import { createNotification } from "@/app/operations/actions";
import { OpsSeverity } from "@/generated/prisma/enums";
import { hasPermission } from "@/lib/permissions";
import { withOrganizationContext } from "@/lib/tenant-context";

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/notifications");
  if (!hasPermission(session.user.roles, "notification:manage")) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Access required</h1></main></OperationsShell>;
  if (!session.user.organizationId) return <OperationsShell user={session.user}><main className="mx-auto max-w-3xl px-6 py-16"><h1 className="text-3xl font-semibold">Organization context required</h1></main></OperationsShell>;
  const notifications = await withOrganizationContext(session.user.organizationId, (tx) => tx.opsNotification.findMany({ orderBy: { createdAt: "desc" }, take: 100 }));
  return <OperationsShell user={session.user}><main className="mx-auto max-w-6xl px-6 py-10"><h1 className="text-3xl font-semibold">Notification Center</h1><form action={createNotification} className="mt-6 grid gap-3 rounded-lg border border-line bg-ink-800 p-5 md:grid-cols-[1fr_160px_160px_2fr_auto]"><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="title" placeholder="Notification" required /><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="category" placeholder="Category" /><select className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="severity" defaultValue={OpsSeverity.MEDIUM}>{Object.values(OpsSeverity).map((x) => <option key={x} value={x}>{x}</option>)}</select><input className="rounded-md border border-line bg-ink-900 px-3 py-3 text-sm" name="message" placeholder="Message" required /><button className="rounded-md bg-brand-400 px-4 py-3 text-sm font-semibold text-ink-900">Create</button></form><section className="mt-8 grid gap-3">{notifications.map((n) => <article className="rounded-lg border border-line bg-ink-800 p-5" key={n.id}><b>{n.title}</b><p className="text-sm text-text-2">{n.category} - {n.severity} - {n.status}</p><p className="mt-2 text-sm text-text-3">{n.message}</p></article>)}</section></main></OperationsShell>;
}
