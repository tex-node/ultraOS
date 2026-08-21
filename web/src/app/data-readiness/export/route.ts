import { auth } from "@/auth";
import { auditRealData } from "@/lib/data-hygiene";
import { hasPermission } from "@/lib/permissions";

export async function GET() {
  const session = await auth();
  if (!session?.user || !hasPermission(session.user.roles, "data:readiness")) return new Response("Forbidden", { status: 403 });
  const audit = await auditRealData();
  const rows = [["section", "metric", "value"]];
  for (const [section, metrics] of Object.entries(audit)) {
    for (const [metric, value] of Object.entries(metrics)) rows.push([section, metric, String(value)]);
  }
  return new Response(rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=data-readiness.csv" },
  });
}
