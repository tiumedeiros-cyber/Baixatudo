# Verificação da entrega

## Executado neste ambiente

- `npm test`: 8 testes unitários aprovados.
- `npm run check`: sintaxe dos módulos de interface, dados e extensão aprovada.
- `npm run test:browser`: teste Chromium headless aprovado, sem erros JavaScript da página principal.

O teste de navegador usa `@playwright/test` e Chromium via `@sparticuz/chromium`, ambos somente de desenvolvimento. As bibliotecas Linux são extraídas automaticamente para diretório temporário. Requer Linux compatível e `tar`. O servidor deve estar iniciado em outra sessão (`npm start`). Não altera o navegador do usuário.

## Fluxos verificados em navegador

- Página inicial em desktop 1440px e viewport móvel de 390px.
- Menu móvel e navegação administrativa.
- Ausência de rolagem horizontal no dashboard e editor em 390px.
- Criação de projeto, edição de código, autosave e persistência após recarregar.
- Interação JavaScript real no iframe de prévia.
- Salvamento e restauração de versões.
- Edição e salvamento da entrevista.
- Importação de captura como texto, sem executar `<script>` recebido.
- Busca por nome, resultado vazio e recuperação da lista.
- Atualização das configurações.
- Restauração de backup com confirmação.
- Ajustes de título e cores sem edição de código.
- Código da prévia sem acesso ao armazenamento do painel.
- Requisição de rede da prévia bloqueada por CSP.
- Backup corrompido não é sobrescrito por criação de novo projeto.
- Download do pacote da extensão responde com sucesso.

## Não verificado / indisponível

- Não houve teste em aparelho Android físico.
- Extensão não instalada/testada em navegador real com permissões, Firefox Android ou loja. O pacote é de desenvolvimento Chromium MV3.
- Modelo de IA, agente, REA e skill clonar-programa não foram instalados ou executados.
- Não houve clonagem de site ou programa.
- Nenhum teste de paridade com sistemas externos.
- Não há backend, conta, sincronização, pagamentos ou hospedagem permanente.
- Isolamento do iframe foi testado em cenários básicos; não constitui auditoria de segurança completa nem isolamento de recursos CPU/memória.

## Integridade do repositório

O ZIP original `baixartudo-atualizado.zip` foi mantido. Nenhum commit, push ou implantação em GitHub, Supabase ou Vercel foi realizado.

## Atualização 0.2 — integração pessoal de IA e implantação

- `npm test`: agora 15 testes aprovados, incluindo validação de destinos públicos, bloqueio SSRF, DNS misto, consentimento, extração de HTML e validação de geração.
- `npm run build`: aprovado. Biblioteca WebLLM empacotada localmente (aprox. 6 MB); pesos não incluídos.
- O teste de navegador agora inclui ativação, captura, geração, confirmação e versão automática com **fixtures determinísticas** de modelo/captura. Isso valida a integração da interface, não uma inferência real ou captura externa real.
- A tentativa real de captura de página pública GitHub neste sandbox retornou falha de certificado (`unable to verify the first certificate`). Verificação TLS foi mantida. O caminho de captura externa bem-sucedida ainda não foi comprovado.
- IA WebLLM com modelos Qwen2.5 foi integrada ao navegador. Download/inferência real, qualidade dos resultados, memória e compatibilidade Android ainda não verificados.
- Fontes originais de clonar-programa e skills de design/revisão foram incorporadas, com versões, licenças e atribuição. O adaptador seleciona orientações internas. Scripts completos de terminal, REA e Playwright não são executados neste modo.
- As afirmações da seção 0.1 sobre ausência total de skills/IA descrevem a entrega anterior. Permanecem indisponíveis análise desktop, execução de dependências e prova de paridade.
- A integração GitHub/Vercel e a autorização de publicação foram solicitadas posteriormente pelo usuário. O estado final da implantação será registrado separadamente.

## Publicação comprovada

- Repositório público existente reutilizado, branch `arena/a4f8fa06-baixatudo` enviada ao GitHub.
- Projeto Vercel novo: `baixatudo-studio` (`prj_xVyd7E2WdtQ6vDFKO03hvzbXsezt`), vinculado a esse repositório. Outros projetos não alterados.
- Deploy de produção `dpl_8NgnFaLGHcJRg39WeurJWAQJXCzZ`, commit de aplicação `cefbc79a8f50b0808923ccf948ff1ad25cfe8cb1`, confirmado em estado READY/PROMOTED. Build na Vercel concluído.
- https://baixatudo-studio.vercel.app acessado com renderização da interface sem login. O alias de equipe exige login; não foi removida a proteção dos aliases de build.
- `/api/capture` respondeu com a recusa esperada de método GET, provando a rota publicada. Captura POST externa bem-sucedida em produção ainda não testada.
- `/public/licenses/provenance.json` acessado publicamente e conferido.
- Importação da biblioteca WebLLM real empacotada aprovada no navegador, confirmando as exports de engine/worker; isso **não** valida a inferência ou o download de pesos. O teste assistido continua sendo fixture explícita.
- Verificações documentais/testes posteriores ao commit de aplicação não alteram o runtime implantado. Não foi configurado nem comprovado deploy automático de commits futuros.

## Atualização 0.3 — validação sem API e conectores opcionais

- 21 testes unitários aprovados: incluem bloqueio de modelos pagos no modo gratuito, destinos fixos, limites de mensagens, formato Gemini/OpenAI, falta de chave, rejeição de origem e ausência de fallback em 429.
- Navegador: fluxo manual sem GPU/chave, importação de arquivo HTML como evidência, recusa de resposta inválida, confirmação e versão antes de aplicar, interação funcional do contador importado na prévia.
- Navegador: seleção de OpenRouter não faz chamada, campo de chave é limpo, chave fixture ausente de localStorage/sessionStorage; chamada remota usa transporte fixture e após reload é bloqueada por falta de chave.
- Extensão: teste de interface com API Chromium simulada reproduz aba `kiwi-extension://` ativa e aba de site separada; a aba do site é selecionada corretamente e arquivo textual é lido. Isso NÃO comprova funcionamento em Kiwi real nem concessão de permissão no Android.
- Captura direta de URL da extensão, inferência externa real e conexões com chaves reais ainda não validadas. Nenhuma conta, assinatura, crédito ou chave de provedor foi criada.
- Interfaces/API, não executor completo: REA/Playwright remoto, análise de ZIP/EXE/APK, geração de backend e prova automática de paridade permanecem pendentes.
- A nova extensão ZIP precisa ser atualizada/reinstalada manualmente; não está distribuída por loja com atualização automática.
