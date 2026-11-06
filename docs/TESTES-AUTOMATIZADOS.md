# Automação e critério de produção

## Um comando

`npm ci && npm run verify`

Requer Node >=22.19, Python 3 para empacotar e dependências do Chromium (o ambiente Arena contém as usadas nas suítes atuais). O comando faz build, testa segurança/unidades e HTTP real, inicia servidor em porta livre, executa navegador desktop/mobile, duas contas com SDK/backend controlados, tenta extensão MV3 real e captura HTTPS real do repositório público do próprio proprietário. Encerra o servidor ao finalizar; cada suíte tem timeout. Não aciona provedor pago, não envia e-mails, não altera contas de pessoas e não desativa TLS.

Saída: `test-results/verification.json`, `RELATORIO.md` e logs. Essa pasta é ignorada pelo Git. O relatório identifica o commit e alterações locais. Uma suíte falhando retorna código diferente de zero; suítes de interface com mocks continuam identificadas como tal. O relatório não usa screenshots privadas como artefato de CI.

`npm run release:check` executa os testes e retorna falha enquanto os bloqueios reais persistirem. Hoje a implementação deliberadamente **não oferece um caminho para declarar o clone completo pronto**: faltam recursos do produto. Não basta editar um JSON de evidências para habilitar liberação. Os bloqueios devem ser substituídos por verificações dos recursos à medida que forem implementados.

## Extensão

O Chromium reduzido/headless shell disponível aqui falhou em abrir a extensão real. Isso não prova defeito da extensão, mas impede aprová-la. `CHROMIUM_EXECUTABLE` pode apontar para Chromium completo compatível com extensões. O workflow instala Chromium completo do Playwright e usa essa opção. A tentativa de baixar outro navegador neste ambiente foi bloqueada no host de distribuição; nenhum binário não verificado foi executado. Mobile emulado não comprova Android/Kiwi físico.

## HTTPS

A imagem Arena possui uma CA de ambiente no repositório confiável do sistema, que o Node não usa por padrão. O servidor de testes usa `--use-system-ca`, mantendo verificação TLS e validação de hostname. Nunca configurar `NODE_TLS_REJECT_UNAUTHORIZED=0` nem `rejectUnauthorized:false`. A captura real contra GitHub funcionou com o repositório de CAs do sistema. Essa observação não prova a captura pública na Vercel; há infraestrutura diferente.

## Limites de evidência

- HTTP/unidades reais: rejeição de origem, protocolo e IP privado; configuração de contas fail-closed; limites UTF-8 em stream/string/Buffer/objeto; CSP, arquivos e download ZIP; rate limit no processo local.
- Interface real: criar/editar/recarregar/restaurar, versões, importação/exportação e isolamento da prévia; desktop e largura 390px. Transporte remoto e geração são fixtures, não inferência real.
- Contas: navegador com SDK/backend controlados; SQL RLS real foi executado separadamente em transação com rollback. Nenhum dos dois prova o recebimento de e-mail ou login real completo.
- Extensão: teste real separado do teste de popup simulado. Uma falha no teste real não é ignorada.

## Bloqueios atuais de liberação integral

1. SMTP/remetente e recebimento de confirmação/recuperação não comprovados.
2. E2E com duas contas reais, expiração e falhas de sincronização ainda incompleto.
3. Inferência real e qualidade de reconstrução não comprovadas.
4. Instalação/permissões/captura em Android físico não comprovadas.
5. Executor isolado e reconstrução de sistemas completos/backend não implementados.
6. APIs de captura/IA ainda têm limites em memória por processo, não quotas duráveis por usuário nem validação de carga/abuso distribuído.

A integração GitHub por usuário é proposta separada, não recurso pronto. Não é permitido usar credenciais desta sessão como credenciais dos usuários finais.

## CI

`.github/workflows/verification.yml`: execução na branch autorizada, PR e manual; permissões somente leitura, sem deploy e sem acesso a segredos do usuário. O job ficará vermelho enquanto a trava de produção estiver bloqueada. Isso é intencional, não deve ser contornado para obter um badge verde. Consumo de CI obedece ao plano/limites da conta; nenhum plano pago ou compra foi habilitado.
