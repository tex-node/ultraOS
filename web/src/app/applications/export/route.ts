import ExcelJS from "exceljs";
import { auth } from "@/auth";
import {
  applicationExportRows,
  exportableTypeLabels,
  getApplicationData,
  parseExportableTypes,
} from "@/app/applications/application-data";
import { hasPermission } from "@/lib/permissions";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Authentication required.", { status: 401 });
  }
  if (!hasPermission(session.user.roles, "application:review")) {
    return new Response("Application review permission required.", { status: 403 });
  }
  if (!session.user.organizationId) {
    return new Response("No active organization for this account.", { status: 403 });
  }

  const url = new URL(request.url);
  const types = parseExportableTypes(url.searchParams.get("types"));
  const applications = await getApplicationData(session.user.organizationId, types);
  const { columns, rows } = applicationExportRows(applications);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ultra League OS";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("Applications");
  worksheet.addRow(columns);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const row of rows) {
    worksheet.addRow(row);
  }

  worksheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell?.((cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? "").length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 48);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const label = types.length === 1 ? exportableTypeLabels[types[0]].toLowerCase() : "applications";
  const filename = `ultra-${label}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(buffer, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}
