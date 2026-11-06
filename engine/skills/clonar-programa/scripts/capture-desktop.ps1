<#
.SYNOPSIS
  Captura uma janela de programa desktop no Windows: arvore UI Automation + screenshot.
.DESCRIPTION
  Obrigatorio escolher a janela por -Title, -ProcessName ou -Hwnd (use -ListWindows para ver as opcoes).
  Por padrao o screenshot usa PrintWindow (so a propria janela). -ScreenCopy tambem copia a tela
  naquela area (pode incluir outras janelas por cima: revise antes de compartilhar).
  A arvore UIA e as imagens podem conter dados pessoais: revise a evidencia.
  Saidas: ui-tree.json, capture-meta.json, window.png (e window-screen.png com -ScreenCopy).
  Codigos: 0 ok - 2 arvore vazia - 3 janela nao encontrada ou nao escolhida.
  (Arquivo mantido em ASCII para o Windows PowerShell 5.1 ler sem BOM.)
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File capture-desktop.ps1 -ListWindows
  powershell -NoProfile -ExecutionPolicy Bypass -File capture-desktop.ps1 -Title "*Calculadora*" -OutDir 01-evidence\desktop
#>
param(
  [string]$Title = "",
  [string]$ProcessName = "",
  [long]$Hwnd = 0,
  [Alias("Out")][string]$OutDir = ".\01-evidence\desktop",
  [int]$MaxDepth = 14,
  [int]$MaxNodes = 6000,
  [switch]$NoScreenshot,
  [switch]$ScreenCopy,
  [switch]$ListWindows
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class NativeCapture {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

# Coordenadas em pixels reais (sem isso, telas com 125%/150% de escala cortam o screenshot).
[void][NativeCapture]::SetProcessDPIAware()

function Get-TopWindows {
  $windows = New-Object System.Collections.Generic.List[object]
  $callback = [NativeCapture+EnumWindowsProc]{
    param($hWnd, $lParam)
    if (-not [NativeCapture]::IsWindowVisible($hWnd)) { return $true }
    $length = [NativeCapture]::GetWindowTextLength($hWnd)
    if ($length -le 0) { return $true }
    $buffer = New-Object System.Text.StringBuilder ($length + 1)
    [void][NativeCapture]::GetWindowText($hWnd, $buffer, $buffer.Capacity)
    $processId = [uint32]0
    [void][NativeCapture]::GetWindowThreadProcessId($hWnd, [ref]$processId)
    $name = ""
    try { $name = (Get-Process -Id $processId -ErrorAction Stop).ProcessName } catch {}
    $windows.Add([pscustomobject]@{ Handle = $hWnd; Title = $buffer.ToString(); ProcessId = [int]$processId; ProcessName = $name })
    return $true
  }
  [void][NativeCapture]::EnumWindows($callback, [IntPtr]::Zero)
  return $windows
}

function Show-Windows($list) {
  $list | Sort-Object ProcessName, Title | ForEach-Object { "{0} | {1} | pid={2} | hwnd={3}" -f $_.ProcessName, $_.Title, $_.ProcessId, $_.Handle.ToInt64() }
}

$windows = Get-TopWindows
if ($ListWindows) { Show-Windows $windows; exit 0 }

if ($Hwnd -eq 0 -and [string]::IsNullOrWhiteSpace($Title) -and [string]::IsNullOrWhiteSpace($ProcessName)) {
  Write-Host "Escolha a janela com -Title, -ProcessName ou -Hwnd (nada e capturado por padrao, para nao pegar uma janela qualquer)."
  Write-Host "Janelas visiveis:"
  Show-Windows $windows | ForEach-Object { Write-Host "  $_" }
  exit 3
}

if ($Hwnd -ne 0) {
  $found = @($windows | Where-Object { $_.Handle.ToInt64() -eq $Hwnd })
} else {
  $found = @($windows | Where-Object {
    ([string]::IsNullOrWhiteSpace($Title) -or $_.Title -like $Title) -and
    ([string]::IsNullOrWhiteSpace($ProcessName) -or $_.ProcessName -like $ProcessName)
  })
}
if ($found.Count -eq 0) {
  Write-Host "Nenhuma janela encontrada para Title='$Title' ProcessName='$ProcessName' Hwnd='$Hwnd'."
  Write-Host "Janelas visiveis:"
  Show-Windows $windows | ForEach-Object { Write-Host "  $_" }
  exit 3
}
if ($found.Count -gt 1) {
  Write-Host ("Aviso: {0} janelas combinam; usando a primeira. Seja mais especifico (-Hwnd) se precisar." -f $found.Count)
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$target = $found | Select-Object -First 1
$hWnd = [IntPtr]$target.Handle
$wasMinimized = [NativeCapture]::IsIconic($hWnd)
if ($wasMinimized) {
  # SW_RESTORE so quando minimizada: nao altera janela maximizada.
  [void][NativeCapture]::ShowWindow($hWnd, 9)
  Start-Sleep -Milliseconds 500
}
[void][NativeCapture]::SetForegroundWindow($hWnd)
try {
  $shell = New-Object -ComObject WScript.Shell
  [void]$shell.AppActivate($target.ProcessId)
} catch {}
Start-Sleep -Milliseconds 700

function Get-PatternNames($element) {
  $names = New-Object System.Collections.Generic.List[string]
  $patterns = @(
    [System.Windows.Automation.InvokePattern]::Pattern,
    [System.Windows.Automation.ValuePattern]::Pattern,
    [System.Windows.Automation.SelectionItemPattern]::Pattern,
    [System.Windows.Automation.ExpandCollapsePattern]::Pattern,
    [System.Windows.Automation.TogglePattern]::Pattern,
    [System.Windows.Automation.RangeValuePattern]::Pattern,
    [System.Windows.Automation.WindowPattern]::Pattern,
    [System.Windows.Automation.ScrollPattern]::Pattern,
    [System.Windows.Automation.TextPattern]::Pattern
  )
  foreach ($pattern in $patterns) {
    $object = $null
    try {
      if ($element.TryGetCurrentPattern($pattern, [ref]$object)) {
        $names.Add($pattern.ProgrammaticName.Replace("PatternIdentifiers.Pattern", ""))
      }
    } catch {}
  }
  return $names.ToArray()
}

$script:nodes = New-Object System.Collections.Generic.List[object]
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker

function Add-UiNode($element, [int]$depth) {
  if ($null -eq $element -or $depth -gt $MaxDepth -or $script:nodes.Count -ge $MaxNodes) { return }
  try {
    $current = $element.Current
    $rect = $current.BoundingRectangle
    $script:nodes.Add([pscustomobject]@{
      depth = $depth
      controlType = $current.ControlType.ProgrammaticName.Replace("ControlType.", "")
      name = $current.Name
      automationId = $current.AutomationId
      className = $current.ClassName
      frameworkId = $current.FrameworkId
      isEnabled = $current.IsEnabled
      isOffscreen = $current.IsOffscreen
      rect = [pscustomobject]@{ x = [math]::Round($rect.X); y = [math]::Round($rect.Y); width = [math]::Round($rect.Width); height = [math]::Round($rect.Height) }
      patterns = @(Get-PatternNames $element)
    })
  } catch { return }
  try {
    $child = $walker.GetFirstChild($element)
    while ($null -ne $child -and $script:nodes.Count -lt $MaxNodes) {
      Add-UiNode $child ($depth + 1)
      $child = $walker.GetNextSibling($child)
    }
  } catch {}
}

$root = [System.Windows.Automation.AutomationElement]::FromHandle($hWnd)
Add-UiNode $root 0
if ($script:nodes.Count -eq 0) {
  Start-Sleep -Milliseconds 900
  [void][NativeCapture]::ShowWindow($hWnd, 9)
  [void][NativeCapture]::SetForegroundWindow($hWnd)
  Start-Sleep -Milliseconds 700
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hWnd)
  Add-UiNode $root 0
}

$treePath = Join-Path $OutDir "ui-tree.json"
$metaPath = Join-Path $OutDir "capture-meta.json"
$tree = [pscustomobject]@{ window = $target.Title; process = $target.ProcessName; processId = $target.ProcessId; hwnd = $hWnd.ToString(); nodeCount = $script:nodes.Count; nodes = $script:nodes }
$tree | ConvertTo-Json -Depth 10 | Set-Content -Path $treePath -Encoding UTF8

$screenshotPath = $null
$screenPath = $null
if (-not $NoScreenshot) {
  $rect = New-Object NativeCapture+RECT
  [void][NativeCapture]::GetWindowRect($hWnd, [ref]$rect)
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -gt 0 -and $height -gt 0) {
    # PrintWindow (flag 2 = conteudo completo) pega so a janela, mesmo atras de outras (UWP/ApplicationFrameHost).
    $printPath = Join-Path $OutDir "window.png"
    $printBitmap = New-Object System.Drawing.Bitmap $width, $height
    $printGraphics = [System.Drawing.Graphics]::FromImage($printBitmap)
    $hdc = $printGraphics.GetHdc()
    $printed = [NativeCapture]::PrintWindow($hWnd, $hdc, 2)
    $printGraphics.ReleaseHdc($hdc)
    if ($printed) {
      $printBitmap.Save($printPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $screenshotPath = $printPath
    }
    $printGraphics.Dispose()
    $printBitmap.Dispose()

    # Copia da tela: so com -ScreenCopy, ou como plano B quando o PrintWindow falha.
    if ($ScreenCopy -or -not $printed) {
      $screenPath = Join-Path $OutDir "window-screen.png"
      $bitmap = New-Object System.Drawing.Bitmap $width, $height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bitmap.Size)
      $bitmap.Save($screenPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()
      if (-not $printed) { Copy-Item $screenPath $printPath -Force; $screenshotPath = $printPath }
    }
  }
}

$meta = [pscustomobject]@{
  capturedAt = (Get-Date).ToString("o")
  title = $target.Title
  process = $target.ProcessName
  processId = $target.ProcessId
  hwnd = $hWnd.ToString()
  wasMinimized = $wasMinimized
  nodeCount = $script:nodes.Count
  screenshot = $screenshotPath
  screenshotScreen = $screenPath
  tree = $treePath
  os = [System.Environment]::OSVersion.VersionString
  privacy = "A arvore UIA e as imagens podem conter dados pessoais. Revise antes de compartilhar."
  warning = if ($script:nodes.Count -eq 0) { "Arvore UIA vazia. Janela pode estar minimizada, suspensa (UWP) ou sem acessibilidade exposta." } else { $null }
}
$meta | ConvertTo-Json -Depth 5 | Set-Content -Path $metaPath -Encoding UTF8

Write-Host ("Janela: {0} ({1}, pid {2})" -f $target.Title, $target.ProcessName, $target.ProcessId)
Write-Host ("Nos UIA: {0}" -f $script:nodes.Count)
Write-Host ("Arvore: {0}" -f $treePath)
if ($screenshotPath) { Write-Host ("Screenshot: {0}" -f $screenshotPath) }
Write-Host "Revise a evidencia: pode conter dados pessoais."
if ($script:nodes.Count -eq 0) {
  Write-Host "Aviso: arvore vazia. Restaure/ative a janela (UWP) e rode de novo." -ForegroundColor Yellow
  exit 2
}
