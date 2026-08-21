import ExcelJS from "exceljs";

const FILE = "C:/UltraLeagueOS/data/TryOutsPlayers.xlsx";
const queries = ["udoyibo", "agomuo", "oyekan", "ogekan", "chilese", "sylvia", "olutosoye"];

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const sheet = workbook.getWorksheet("Female")!;
  const header = (sheet.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
  const nameCol = header.indexOf("Full Name");
  const phoneCol = header.indexOf("Phone");
  const emailCol = header.indexOf("Email");
  const statusCol = header.indexOf("Status");

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const name = String(values[nameCol] ?? "").toLowerCase();
    if (queries.some((q) => name.includes(q))) {
      console.log(`row ${rowNumber}: "${values[nameCol]}" phone=${values[phoneCol]} email=${values[emailCol]} status=${values[statusCol]}`);
    }
  });
}

main();
