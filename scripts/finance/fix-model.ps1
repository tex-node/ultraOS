# Produce a corrected copy of the financial model with Excel automation, so the template's charts and formulas survive.
# Only the price period is corrected; every other input is left exactly as the owner entered it, and a notes sheet records
# what was changed and what still needs a decision.

$ErrorActionPreference = "Stop"
$src = "C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Copy of (EN) Module 6 - Financial Modeling Template (2025 Sept ver.) (3).xlsx"
$dst = "C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Ultra OS - Financial Model (corrected 2026-11-08).xlsx"

if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }
Copy-Item -LiteralPath $src -Destination $dst
Write-Output "copied -> $dst"

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
    $wb = $excel.Workbooks.Open($dst)

    # ---- 1. the price period: the template treats "units x price" as a year, so a $30/month licence must be entered as $360.
    $input = $wb.Worksheets.Item("Instructions & Input")
    # find the League Management Software row in the 4.2 price table (column E label, values in F/G/H)
    $priceRow = $null
    for ($r = 85; $r -le 92; $r++) {
        $label = [string]$input.Cells.Item($r, 5).Value2
        if ($label -like "*League Management*") { $priceRow = $r; break }
    }
    if (-not $priceRow) { throw "could not locate the League Management Software price row" }
    Write-Output "  price row: $priceRow  (was $([string]$input.Cells.Item($priceRow,6).Value2))"
    $input.Cells.Item($priceRow, 6).Value2 = 360
    $input.Cells.Item($priceRow, 7).Value2 = 360
    $input.Cells.Item($priceRow, 8).Value2 = 360

    # ---- 2. a notes sheet, so the next reader knows what was touched and what was not.
    $notes = $wb.Worksheets.Add([System.Reflection.Missing]::Value, $wb.Worksheets.Item($wb.Worksheets.Count))
    $notes.Name = "Model notes"
    $lines = @(
        @("Ultra OS - notes on this model", ""),
        @("", ""),
        @("Corrected on 2026-11-08", ""),
        @("1. League Management Software price", "Entered as 360 (annual), because the template multiplies units x price to get a YEAR. The price we quote everywhere else is `$30/month, i.e. `$360/year. Previously entered as 30, which booked `$2.50 per league per month."),
        @("2. Scouting Pool price", "Left at 30, treated as a per-profile annual listing fee. If a profile actually pays `$30/month, change F89:H89 to 360."),
        @("3. Data Logging and AI Coaching prices", "Left at 20 and 30 (annual per seat), and left blank for 2027 as entered. If these are monthly, multiply by 12."),
        @("4. Ticketing and data-feed revenue", "NOT modelled. The business-model section describes a 70/25/5 split across subscription, ticketing and a data feed; this workbook contains four licence products and no commission stream. Either add it to the model or change that narrative."),
        @("5. Salaries", "Founder `$4,500/yr, Head of Marketing `$4,500/yr, IT Manager `$4,500/yr, Sports Manager `$2,700/yr, Media Officer `$3,600/yr. These are part-time / local rates - say so in the narrative, or raise them before an investor reads the sheet."),
        @("6. Grants", "Not included anywhere. Every figure in this model is the business on its own revenue."),
        @("", ""),
        @("Colour convention in this workbook", "Inputs are blue on the input tab; everything else is formula. Only edit the input tab.")
    )
    $r = 1
    foreach ($line in $lines) {
        $notes.Cells.Item($r, 1).Value2 = $line[0]
        $notes.Cells.Item($r, 2).Value2 = $line[1]
        $r++
    }
    $notes.Cells.Item(1, 1).Font.Bold = $true
    $notes.Cells.Item(1, 1).Font.Size = 14
    $notes.Columns.Item(1).ColumnWidth = 42
    $notes.Columns.Item(2).ColumnWidth = 120
    $notes.Range("B4:B11").WrapText = $true
    $notes.Range("A4:A11").Font.Bold = $true

    $wb.Application.CalculateFull()
    $wb.Save()
    Write-Output "  saved: $dst"

    # ---- 3. read the recalculated headline figures straight from the P&L
    $pl = $wb.Worksheets.Item("P&L")
    $want = @("Revenue", "COGS", "Net revenue/Gross Profit", "Personnel Cost", "Operating Cost", "Fixed costs (OPEX)", "EBITDA", "Net Income")
    foreach ($name in $want) {
        for ($row = 1; $row -le 90; $row++) {
            $found = $false
            foreach ($col in 2, 3, 4) {
                $v = [string]$pl.Cells.Item($row, $col).Value2
                if ($v -eq $name) {
                    $e = $pl.Cells.Item($row, 5).Value2
                    $f = $pl.Cells.Item($row, 6).Value2
                    $g = $pl.Cells.Item($row, 7).Value2
                    Write-Output ("  {0,-28} 2027={1,12:N2}  2028={2,12:N2}  2029={3,12:N2}" -f $name, $e, $f, $g)
                    $found = $true
                    break
                }
            }
            if ($found) { break }
        }
    }
}
finally {
    if ($wb) { $wb.Close($false) }
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
