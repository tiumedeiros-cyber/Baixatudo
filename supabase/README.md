# Contas — Supabase conectado

A conexão de gerenciamento foi restabelecida após o erro 401 anterior. Foi criado o projeto `baixatudo-studio` (`soosjvzvcznlrbingyfp`) em `sa-east-1`, solicitando explicitamente o plano gratuito. A migração foi aplicada e o serviço de autenticação/configuração de produção foi conectado. Nenhuma senha de banco ou chave de serviço foi gravada no repositório. A aplicação usa somente a chave publicável e os tokens do próprio usuário.

As regras RLS foram verificadas no banco real, dentro de uma transação desfeita ao final: visibilidade de apenas uma linha própria, bloqueio de alteração/remoção alheia e transferência de proprietário; atualização própria permitida. Os usuários e registros de teste não persistiram. Isso não comprova entrega de e-mails nem o ciclo completo de autenticação por navegador. Confirmação de e-mail permanece obrigatória. SMTP próprio ainda não foi configurado; o remetente padrão tem restrições e não deve ser presumido como envio público de produção.

## Checklist operacional (configuração aplicada; etapas de validação restantes)

1. Identificar com o proprietário o projeto correto. Não usar outro banco por tentativa, nem habilitar plano pago.
2. Conferir a configuração de Auth, limites de e-mail e confirmação; manter confirmação de e-mail. Configurar site URL e redirects restritos ao endereço principal do Studio, sem wildcard amplo. Não alterar Auth de outro aplicativo sem autorização.
3. Aplicar `migrations/202611060001_workspaces.sql` no projeto autorizado. A tabela é específica deste aplicativo. RLS é habilitado e forçado; usuários autenticados só leem/escrevem a linha com seu `auth.uid()`.
4. Configurar na Vercel somente deste projeto: `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` (publishable ou anon, nunca service_role/secret). `BAIXATUDO_AUTH_ENABLED=true` é opt-in explícito, somente após a migração/configuração. Reimplantar.
5. Testar com contas reais distintas: signup, e-mail, signin, recuperação, senha, logout, novas abas/dispositivos, POST direto tentando proprietário alheio e conflitos de versão. Não considerar os testes com fixtures como prova das políticas reais.

## Implementação

- `api/config.js` só retorna configuração pública aprovada; recusa exposição de chaves secretas/de serviço.
- Sem ativação explícita, modo local é sinalizado como não multiusuário; nenhum cadastro fictício é apresentado como funcional.
- Falha de configuração/rede com login ativado bloqueia a área em vez de abrir dados locais de outro usuário.
- Sessão do SDK usa sessionStorage. Projetos autenticados ficam em memória e no banco, não em cache de localStorage. A chave de API de IA é apagada na troca de conta.
- Não há migração automática de projetos locais: proprietário pode fazer backup e restaurar conscientemente na própria conta.
- Atualizações usam revisão otimista e fila sequencial. Conflito ou erro de rede sinaliza não sincronizado, bloqueia substituição silenciosa e permite backup. Logout com dados pendentes requer confirmação de descarte.
- Isto é administração do próprio espaço, não painel global de gestão de outros usuários.
