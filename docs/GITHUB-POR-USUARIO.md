# Proposta: código no GitHub de cada usuário

Estado: arquitetura proposta, não integração ativa. A sugestão do proprietário é adequada para entrega de código e versionamento, não substitui o executor de clonagem.

Fluxo recomendado: entrar na conta Baixatudo → conectar GitHub → escolher repositório privado dedicado ou pasta/branch autorizada → definir referência e escopo → reconstruir/verificar em ambiente isolado → revisar alterações → confirmar commit → conectar o repositório ao provedor de hospedagem → confirmar deploy.

Separar responsabilidades:
- Supabase: identidade, propriedade, metadados, vínculo com instalação do GitHub App, estado das tarefas e relatórios reduzidos.
- GitHub: código, histórico, documentação e testes. GitHub não deve ser depósito de vídeos, backups grandes ou segredos.
- Executor temporário: análise, geração, instalação e testes, com limites e isolamento. Continua sendo necessário e não se torna gratuito por usar GitHub.
- Hospedagem do usuário: build/deploy compatíveis com a tecnologia, banco e variáveis próprias. Commit só dispara deploy se a integração tiver sido configurada.

Preferir GitHub App instalado apenas nos repositórios escolhidos, permissões mínimas (conteúdo de código quando necessário e metadados), tokens curtos gerados no servidor, segredos em cofre e revogação acessível. Login com GitHub e autorização para gravar repositórios são permissões diferentes.

Nunca solicitar senha GitHub ou token amplo pelo chat; não usar as credenciais desta sessão Arena para usuários finais. A instalação do App deve ser vinculada ao usuário autenticado, com state/nonce e proteção CSRF, verificação de assinatura de webhooks e validação de propriedade no backend em cada operação.

Antes de escrever: mostrar destino/branch/pasta e diff, exigir consentimento, detectar conflitos, nunca forçar push, sobrescrever trabalho existente ou gerar credenciais no repositório. Workflows e scripts de deploy gerados precisam de revisão: um commit pode executar código e consumir quotas. Não incluir .env, chaves, cookies, dados privados ou assets sem licença.

Permitir validar sem GitHub e conectar antes da primeira exportação. Tornar GitHub obrigatório antes de qualquer teste cria uma barreira desnecessária. Limites de plano e custos de hospedagem/executor devem ser apresentados sem promessa de gratuidade ilimitada.
