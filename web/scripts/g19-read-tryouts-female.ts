import ExcelJS from "exceljs";

const FILE = "C:/UltraLeagueOS/data/TryOutsPlayers.xlsx";

async function main() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE);
  console.log("Worksheets:", workbook.worksheets.map((w) => w.name).join(", "));
  for (const sheet of workbook.worksheets) {
    console.log(`\n=== ${sheet.name} (${sheet.rowCount} rows) ===`);
    const header = sheet.getRow(1).values;
    console.log("Header:", JSON.stringify(header));
    let printed = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1 || printed >= 5) return;
      console.log(rowNumber, JSON.stringify(row.values));
      printed++;
    });
  }
}

main();
