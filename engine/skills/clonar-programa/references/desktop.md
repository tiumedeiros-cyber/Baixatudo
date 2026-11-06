# Programas desktop

## Onde olhar

### Windows

- `%LOCALAPPDATA%\Programs\<nome>` — instaladores por usuário (Electron, Tauri).
- `%PROGRAMFILES%\<nome>` e `%PROGRAMFILES(X86)%\<nome>` — instalação machine-wide.
- `%APPDATA%\<nome>` e `%LOCALAPPDATA%\<nome>` — dados, cache, configurações, banco.
- `C:\ProgramData\<nome>` — dados compartilhados.
- Registro: `HKCU\Software\<nome>`, `HKLM\Software\<nome>`, `Uninstall`.

### macOS/Linux

- `/Applications/<nome>.app` (macOS), `~/Library/Application Support/<nome>`;
- `/opt/<nome>`, `/usr/lib/<nome>`, `~/.config/<nome>`, `~/.local/share/<nome>`.

## Identificar a tecnologia

| Pista | Tecnologia |
|---|---|
| `resources/app.asar`, `app.asar.unpacked`, `electron.exe` | Electron |
| `package.json` + `node_modules`, `*.node` | Node/Electron |
| `.dll` + `*.deps.json`, `hostfxr`, `Microsoft.NETCore.App` | .NET |
| `python3*.dll`, `site-packages`, `*.pyc` | Python empacotado |
| `libcef.dll`, `chrome_elf.dll` | CEF/Chromium |
| `*.pak`, `icudtl.dat`, `v8_context_snapshot` | Chromium/Electron |
| `*.jar`, `jre`, `lib/jvm` | Java |
| `Qt5Core.dll`, `Qt6Core.dll` | Qt |
| `webview2loader.dll` | WebView2 |
| `AppxManifest.xml` + `WindowsApps` + `.exe` | MSIX/UWP/AppX |

## Windows nativo, MSIX e UWP

- App instalado pela Microsoft Store fica em
  `C:\Program Files\WindowsApps\<PackageFamilyName>` (ACL restritiva).
- O `MainWindowHandle` do processo do app pode ser `0`; a janela visível costuma pertencer
  ao `ApplicationFrameHost`/`ApplicationFrameWindow`, com PID diferente.
- O caminho correto é achar a janela por **título/classe/HWND**, não só por `Get-Process`.
- Para análise estática, copie o binário/DLL para uma pasta de trabalho temporária; o Ghidra
  não lê `WindowsApps` diretamente (EACCES). Analise a cópia, guarde hash + caminho original
  na evidência e apague a cópia no fim.
- Binário grande (acima de ~5 MB) pode estourar o timeout do import do Ghidra (~5,5 min).
  Registre como limitação e analise strings/seções em vez de repetir o mesmo import.
- `AppxManifest.xml` informa identidade, arquitetura e pontos de entrada; extraia uma cópia
  com `makeappx unpack`/7-Zip quando a licença permitir.

## Runtime

- Abra o app em uma VM/conta isolada quando possível.
- **macOS:** `rea capture-native-ui-scenario`/`observe_native_ui` podem ser usados quando o
  provider suportar. **Windows:** essas operações são macOS-only; use UI Automation.
- **Windows:** capture com `scripts/capture-desktop.ps1` (UIA + screenshot). Você precisa
  escolher a janela por título, processo ou HWND; sem isso o script só lista as janelas:
  ```powershell
  # lista janelas visíveis
  powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" -ListWindows

  # captura por título (wildcard) e/ou processo
  powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" `
    -Title "*Nome da janela*" -ProcessName "app" -OutDir "$W/01-evidence/desktop"

  # ou por HWND
  powershell -NoProfile -ExecutionPolicy Bypass -File "$S/scripts/capture-desktop.ps1" `
    -Hwnd 123456 -OutDir "$W/01-evidence/desktop"
  ```
  O script restaura a janela só se estiver minimizada, extrai a árvore UIA (controle, nome,
  automationId, geometria, padrões) e salva `window.png` (PrintWindow, só a janela). Com
  `-ScreenCopy` salva também `window-screen.png` (cópia da tela, que pode incluir outras
  janelas por cima: revise). A árvore e as imagens podem ter dados pessoais.
- **Inventário:** `node "$S/scripts/inventory-files.mjs" --dir "<pasta>" --out "$W/01-evidence/desktop"`
  lista arquivos e hashes, versão dos `.exe`, arquivos de licença, tecnologia (Electron, .NET,
  Qt, WebView2, Flutter...) e o conteúdo do `app.asar` (`asar-1.json`).
- **macOS:** use AXUIElement (Accessibility API) ou `osascript`/Swift; capture por
  `CGWindowListCreateImage`.
- **Linux:** use AT-SPI (`pyatspi`/`dogtail`) ou `xdotool` + `import`/`grim`; capture a
  janela por WM_CLASS/título.
- **Electron:** `list-electron-targets` + `observe-javascript-runtime`; para UI,
  `capture-electron-scenario` quando disponível.
- Observe arquivos abertos, conexões e processos (Process Monitor, `lsof`, `netstat`).

### Armadilha: janela minimizada/suspensa

App UWP/MSIX minimizado ou suspenso pode expor **zero nós** na UIA. Um dump nesse estado
parece “app sem interface” e gera falso negativo. Antes de capturar:

1. restaure com `WindowPattern.SetWindowVisualState(Normal)` ou `ShowWindow(SW_RESTORE)`;
2. traga para frente (`SetForegroundWindow`/`AppActivate`);
3. espere 0,5–1 s e leia de novo;
4. se continuar vazio, registre a limitação e tente outra janela/processo.

O `capture-desktop.ps1` já tenta restaurar e repetir a leitura; se ainda vier vazio, ele
retorna código 2 com aviso.

## Banco e arquivos

- SQLite: abra uma cópia, nunca o original; `sqlite3 .schema`, `SELECT` de metadados.
- JSON/YAML: versione amostras redigidas.
- Logs: úteis para nomes de eventos/erros; remova dados pessoais.

## Limites e ética

- Não contorne licenciamento, assinatura, DRM ou update assinado.
- Não distribua binários, DLLs, fontes ou assets do alvo.
- Não execute código desconhecido fora de sandbox/VM.
- Se o app exige login, use a conta da própria pessoa e só os dados necessários.
- Copiar para uma pasta de trabalho é para análise, não para entrega.
