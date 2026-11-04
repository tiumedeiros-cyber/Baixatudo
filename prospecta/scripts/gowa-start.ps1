# Inicia o GOWA (WhatsApp em Go) já ligado ao painel. NÃO baixa nada: o executável precisa estar
# em .\gowa\whatsapp.exe (veja docs\WHATSAPP.md, passo 2).
#
#   powershell -ExecutionPolicy Bypass -File scripts\gowa-start.ps1
#
# Lê do .env.local: WA_WEBHOOK_SECRET e GOWA_BASIC_AUTH. O GOWA sobe em http://localhost:3300
# (a 3000 é do painel) e avisa o painel de cada resposta em /api/webhooks/wa.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "gowa\whatsapp.exe"
$envFile = Join-Path $root ".env.local"

if (-not (Test-Path $exe)) {
  Write-Host "Não achei $exe" -ForegroundColor Yellow
  Write-Host "Baixe o GOWA (Windows x86_64) em https://github.com/aldinokemal/go-whatsapp-web-multidevice/releases/latest"
  Write-Host "e coloque o executável em gowa\whatsapp.exe. Detalhes em docs\WHATSAPP.md."
  exit 1
}
if (-not (Test-Path $envFile)) { Write-Host "Falta o .env.local" -ForegroundColor Yellow; exit 1 }

function Get-EnvValue([string]$name) {
  $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$name\s*=" } | Select-Object -First 1
  if (-not $line) { return "" }
  return (($line -split "=", 2)[1]).Trim().Trim('"').Trim("'")
}

$secret = Get-EnvValue "WA_WEBHOOK_SECRET"
$basic = Get-EnvValue "GOWA_BASIC_AUTH"
# O webhook vai para o painel. Se você publicou o painel (Vercel), ponha o endereço em
# PANEL_URL no .env.local (ex.: PANEL_URL=https://prospecta-editor-studio.vercel.app).
$panel = Get-EnvValue "PANEL_URL"
if (-not $panel) { $panel = "http://localhost:3000" }

if (-not $secret) { Write-Host "Falta WA_WEBHOOK_SECRET no .env.local" -ForegroundColor Yellow; exit 1 }
if (-not $basic) { Write-Host "Defina GOWA_BASIC_AUTH=usuario:senha no .env.local (invente um usuário e uma senha)." -ForegroundColor Yellow; exit 1 }

Set-Location (Join-Path $root "gowa")
$user = ($basic -split ":", 2)[0]
Write-Host "GOWA em http://localhost:3300  |  webhook -> $panel/api/webhooks/wa" -ForegroundColor Green
Write-Host "Abra http://localhost:3300 no navegador para escanear o QR code (WhatsApp > Aparelhos conectados)."
Write-Host "Usuário: $user  |  a senha é a parte depois do ':' em GOWA_BASIC_AUTH, no .env.local" -ForegroundColor DarkGray

# Opções que apertam o padrão do GOWA (conferidas na ajuda da versão 9.6.0):
#  --host 127.0.0.1            só este computador acessa (o padrão escuta a rede inteira)
#  --cors-allowed-origins      só a própria tela do GOWA pode chamar a API pelo navegador (o padrão é qualquer site)
#  --auto-download-media=false não guarda no disco as mídias que o lead mandar (só texto e "chegou um áudio" importam)
#  --mcp-enabled=false         desliga o endpoint MCP, que o painel não usa
& $exe rest `
  --host 127.0.0.1 `
  --port 3300 `
  --basic-auth $basic `
  --cors-allowed-origins "http://localhost:3300,http://127.0.0.1:3300" `
  --auto-download-media=false `
  --mcp-enabled=false `
  --webhook "$panel/api/webhooks/wa" `
  --webhook-secret $secret `
  --webhook-events "message,message.ack"
