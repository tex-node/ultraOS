import { auditRealData } from "@/lib/data-hygiene";
import { requirePlatformPermission } from "@/lib/authorization";

export async function GET() {
  try {
    await requirePlatformPermission("data:readiness");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const audit = await auditRealData();
  const rows = [["section", "metric", "value"]];
  for (const [section, metrics] of Object.entries(audit)) {
    for (const [metric, value] of Object.entries(metrics)) rows.push([section, metric, String(value)]);
  }
  return new Response(rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=data-readiness.csv" },
  });
}
