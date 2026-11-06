# Limitações da ferramenta e do método

## O que o REA faz

O REA gera **evidência** estática e de execução controlada. Ele inventaria artefatos
(ASAR, bundles, binários), reconstrói grafos de JavaScript/Electron (módulos, IPC, endpoints,
SQL), inspeciona binários nativos e .NET, captura cenários de navegador e compara evidências.

Ele **não** é um botão de "clonar tudo": não escreve a spec, não implementa o clone e não
prova comportamento que ninguém observou.

## Limites do REA

| Limite | Efeito prático |
|---|---|
| Análise estática | Não vê `eval`, IPC registrado dinamicamente, plugins de runtime ou código gerado |
| Cobertura | Grafo grande não significa 100% do produto; confira lacunas |
| Ofuscação e packers | Protetores comerciais podem impedir a leitura |
| Código nativo | A decompilação é aproximada; nomes e intenção se perdem |
| Web | Depende de bundles e source maps; se o "cérebro" está no servidor, só o corpo aparece |
| Saída | Grafos de centenas de MB; use filtros e views, ou o contexto explode |
| Plataforma | Motores variam por sistema; nem todo formato tem suporte em todo SO |

## Onde mora o "cérebro" do alvo

| Categoria | Onde mora | O que dá para recuperar |
|---|---|---|
| A · local puro | binário | muito: UI, lógica local, dados |
| B · local com dados | binário + disco | muito, mas dados e configuração espalhados |
| C · cliente fino | nuvem | só a interface e o contrato observável |
| D · remoto puro | servidor | só o comportamento observável |
| E · modelo de IA | pesos / serviço | nada do modelo; substitua por outro ou reimplemente o fluxo |

Se o valor está no servidor, não existe arquivo para abrir. Documente o comportamento e
reconstrua o cliente.

## Limites do método

- **Tela não é função.** Interface igual pode esconder regras que você não viu.
- **Tempo e disco.** App pequeno: horas. App grande: dias e dezenas de GB.
- **Agente alucina.** Exija evidência e marque suposições.
- **"Parece igual" não é teste.** Sem E2E e contratos, não há prova de paridade.
- **Ambiente.** Sistema, navegador e dependências podem faltar.

## Desktop

- O `capture-native-ui-scenario` do REA só funciona no macOS. No Windows use
  `capture-desktop.ps1` (UI Automation); no Linux, AT-SPI.
- App UWP/MSIX minimizado ou suspenso devolve árvore vazia: restaure a janela e repita.
- `WindowsApps` tem permissão restrita: copie o binário para uma pasta de trabalho.
- Binário grande (acima de ~5 MB) pode estourar o tempo do Ghidra; analise strings e seções.

## Como reduzir o risco

1. Congele versão, hash e data.
2. Combine análise estática, execução e teste.
3. Trabalhe em cópia, nunca no original.
4. Declare "não testado" em vez de inventar.
