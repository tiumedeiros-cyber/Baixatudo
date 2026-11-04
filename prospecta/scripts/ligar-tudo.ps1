# Liga o sistema inteiro com um clique: painel, GOWA (WhatsApp) e worker (o relógio de envio).
# Cada um abre na sua própria janela, já na pasta certa. Para desligar, feche a janela.
# Só liga o que ainda não estiver ligado, então pode rodar de novo sem medo.
#
# Duplo clique em "Ligar-sistema.bat" (na pasta do projeto) ou no atalho da Área de trabalho.
# Isto NÃO envia nada: o envio real só acontece depois de você liberar no painel (Configurações).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Test-Port([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-Janela([string]$titulo, [string]$comando) {
  $cmd = "`$Host.UI.RawUI.WindowTitle = '$titulo'; $comando"
  Start-Process -FilePath "powershell.exe" -WorkingDirectory $root -ArgumentList @(
    "-NoExit", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ('"' + $cmd + '"')
  )
}

Write-Host ""
Write-Host "  JK Prospect X1: ligando o sistema" -ForegroundColor Green
Write-Host ""

# 1) Painel (o site que você abre no navegador)
if (Test-Port 3000) {
  Write-Host "  [1] Painel ........ já estava ligado" -ForegroundColor DarkGray
} else {
  # o `npm run dev` já escuta só em 127.0.0.1 (package.json): só este computador acessa o painel
  Start-Janela "1 - PAINEL (localhost:3000)" "npm run dev"
  Write-Host "  [1] Painel ........ ligando (janela nova)" -ForegroundColor Cyan
}

# 2) GOWA (a ligação com o WhatsApp)
if (Test-Port 3300) {
  Write-Host "  [2] GOWA .......... já estava ligado" -ForegroundColor DarkGray
} else {
  Start-Janela "2 - GOWA (WhatsApp)" "& '$root\scripts\gowa-start.ps1'"
  Write-Host "  [2] GOWA .......... ligando (janela nova)" -ForegroundColor Cyan
}

# 3) Espera o painel responder antes de ligar o worker e abrir o navegador
Write-Host "  Esperando o painel ficar pronto (a primeira vez do dia demora uns segundos)..." -NoNewline
$pronto = $false
for ($i = 0; $i -lt 60; $i++) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/login" -TimeoutSec 5
    if ($r.StatusCode -eq 200) { $pronto = $true; break }
  } catch { }
  Write-Host "." -NoNewline
  Start-Sleep -Seconds 2
}
Write-Host ""

if (-not $pronto) {
  Write-Host "  O painel não respondeu em 2 minutos. Olhe a janela '1 - PAINEL' para ver o erro." -ForegroundColor Yellow
  Start-Sleep -Seconds 10
  exit 1
}

# 4) Worker (manda uma mensagem de cada vez, só quando você liberar o envio)
$workerLigado = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match "worker-loop" }
if ($workerLigado) {
  Write-Host "  [3] Worker ........ já estava ligado" -ForegroundColor DarkGray
} else {
  Start-Janela "3 - WORKER (envio)" "npm run worker"
  Write-Host "  [3] Worker ........ ligando (janela nova)" -ForegroundColor Cyan
}

Start-Process "http://localhost:3000"
Write-Host ""
Write-Host "  Pronto. O painel abriu no navegador: http://localhost:3000" -ForegroundColor Green
Write-Host "  O WhatsApp se conecta em: http://localhost:3300 (usuário jk; a senha está no .env.local)" -ForegroundColor DarkGray
Write-Host "  Para desligar, feche as janelas que abriram: a do painel, a do GOWA (WhatsApp) e a do worker." -ForegroundColor DarkGray
Start-Sleep -Seconds 12
