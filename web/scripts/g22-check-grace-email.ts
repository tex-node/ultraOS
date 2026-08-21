import ExcelJS from "exceljs";
const FILE = "C:/UltraLeagueOS/data/TryOutsPlayers.xlsx";
async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  const sheet = workbook.getWorksheet("Female")!;
  const header = (sheet.getRow(1).values as unknown[]).map((v) => String(v ?? ""));
  const emailCol = header.indexOf("Email");
  let found = 0;
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as unknown[];
    const email = String(values[emailCol] ?? "").toLowerCase();
    if (email.includes("graceolutosoye") || email.includes("olutosoye")) {
      console.log(`row ${rowNumber}:`, JSON.stringify(values));
      found++;
    }
  });
  console.log("Total matches:", found, "out of", sheet.rowCount, "rows");
}
main();
