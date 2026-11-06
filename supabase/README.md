# Ativação de contas — pendente de autorização funcional

A conexão de gerenciamento Supabase retornou erro 401 na listagem dos projetos. Não foram criados usuários, projetos, tabelas ou políticas em um banco real. O proprietário precisa reconectar o Supabase no Arena; não deve enviar credenciais pelo chat.

## Depois da reconexão (operador)

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
