# Capture just the UltraOS Scoring window to a PNG, so we can see what the webview actually rendered.
# PrintWindow works for WebView2 (it composites into the window's own DC); a plain screen grab would capture the whole desktop.
param(
    [string]$Exe = "C:\Users\XPS\apex-court-target\debug\ultraos-desktop.exe",
    [string]$Out = "C:\UltraLeagueOS\desktop\window-capture.png",
    [int]$WaitSeconds = 18
)

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32Capture {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@

$process = Start-Process -FilePath $Exe -PassThru
Start-Sleep -Seconds $WaitSeconds
$process.Refresh()
if ($process.HasExited) { Write-Output "process exited early"; exit 1 }

$handle = $process.MainWindowHandle
if ($handle -eq [IntPtr]::Zero) { Write-Output "no main window handle"; Stop-Process -Id $process.Id -Force; exit 1 }

[void][Win32Capture]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 800

$rect = New-Object Win32Capture+RECT
[void][Win32Capture]::GetWindowRect($handle, [ref]$rect)
$width = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top

$bitmap = New-Object System.Drawing.Bitmap $width, $height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$hdc = $graphics.GetHdc()
# 2 = PW_RENDERFULLCONTENT, required to capture WebView2 content rather than an empty frame
[void][Win32Capture]::PrintWindow($handle, $hdc, 2)
$graphics.ReleaseHdc($hdc)
$graphics.Dispose()
$bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

Write-Output "captured $width x $height -> $Out"
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
