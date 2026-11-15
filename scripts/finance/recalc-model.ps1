# Open the corrected workbook once in Excel to confirm it loads cleanly, bake the recalculated values into the file, and print
# the headline P&L rows. Excel COM is flaky on this machine, so every call retries.

$ErrorActionPreference = "Stop"
$dst = "C:\Users\XPS\OneDrive\Documents\Projects\NEON Ultra\SOVO\Ultra OS - Financial Model (corrected 2026-11-08).xlsx"

function Invoke-Com([scriptblock]$Action, [string]$What, [int]$Tries = 8) {
    for ($i = 1; $i -le $Tries; $i++) {
        try { return & $Action } catch {
            if ($i -eq $Tries) { throw "$What failed after $Tries tries: $($_.Exception.Message)" }
            Start-Sleep -Milliseconds (700 * $i)
        }
    }
}

$excel = Invoke-Com { New-Object -ComObject Excel.Application } "start Excel"
$excel.Visible = $false
$excel.DisplayAlerts = $false
$wb = $null
try {
    $wb = Invoke-Com { $excel.Workbooks.Open($dst) } "open workbook"
    Invoke-Com { $excel.CalculateFull() } "calculate" | Out-Null

    $pl = $wb.Worksheets.Item("P&L")
    foreach ($name in @("Revenue", "Net revenue/Gross Profit", "Fixed costs (OPEX)", "EBITDA", "Net Income")) {
        for ($row = 1; $row -le 90; $row++) {
            $hit = $false
            foreach ($col in 2, 3, 4) {
                if ([string]$pl.Cells.Item($row, $col).Value2 -eq $name) {
                    $e = $pl.Cells.Item($row, 5).Value2
                    $f = $pl.Cells.Item($row, 6).Value2
                    $g = $pl.Cells.Item($row, 7).Value2
                    Write-Output ("  {0,-26} 2027={1,12:N2}  2028={2,12:N2}  2029={3,12:N2}" -f $name, $e, $f, $g)
                    $hit = $true; break
                }
            }
            if ($hit) { break }
        }
    }
    Invoke-Com { $wb.Save() } "save" | Out-Null
    Write-Output "  saved with recalculated values"
}
finally {
    if ($wb) { try { $wb.Close($false) | Out-Null } catch {} }
    try { $excel.Quit() | Out-Null } catch {}
    try { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) } catch {}
}
