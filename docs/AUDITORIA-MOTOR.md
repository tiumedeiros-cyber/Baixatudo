# Motor, edição, GitHub e SaaS: auditoria e estado real

## Requisito do proprietário

Reconstrução de sistemas com comportamento real, execução e prévia ao vivo, edição visual, código no GitHub de cada usuário, administração separada, limites e cobrança futura. Esse objetivo não se resume a captura ou editor HTML.

## Materiais efetivamente examinados nesta etapa

- `darksemfiltro/clonar-programa`, revisão vendorizada registrada em `provenance.json`: LICENSE, metodologia, limitações, scripts de workspace/captura/comparação/inventário/doctor e instalador REA. O doctor foi executado, não apenas lido.
- `morluto/rea`: metadados e README atual consultados pelo GitHub, pacote oficial `rea-agents` consultado pelo npm. Licença declarada MIT, versão consultada 6.8.0. Exige Node `^22.23.4 || ^24.22.1 || >=26.12.1`, acima do Node 22.22.3 deste ambiente. Não foi instalado nem considerado executado. O REA é ferramenta de análise/MCP para um agente, não substitui implementação/teste do produto.
- `anthropics/skills`: arquivos de frontend-design e webapp-testing já vendorizados, proveniência e licenças Apache-2.0 preservadas. São orientações, não serviço de execução.
- `grapesjs` 0.23.9: metadados npm/licença BSD-3-Clause examinados como candidato a editor. NÃO foi instalado nem integrado. Introduzir editor de DOM sem isolar scripts de projetos não confiáveis cria risco de XSS; optamos por um inspector próprio, menor, no sandbox existente.

Isso não é uma alegação de leitura de todos os arquivos de todos os repositórios enviados em conversas anteriores. A cobertura acima é explícita; não foi executado instalador global nem configuração de ferramentas de terceiros.

## Achados concretos

| Material | O que faz | O que não faz |
|---|---|---|
| new-clone.mjs | Diretórios, intake, modelos e plano | Não escreve implementação em 04-build; isso foi verificado por teste real |
| capture-web.mjs | Navegador Playwright, screenshots e evidências | Não implementa o sistema; não pode ser exposto diretamente como endpoint público sem isolamento de rede/SSRF e sessões |
| inventory-files.mjs | Hashes, stacks, licenças e inventário de arquivos | Não transforma binário em aplicativo funcional |
| compare-behavior.mjs | Compara matrizes fornecidas | Não observa automaticamente todos os comportamentos nem escreve os testes; teste sintético provou sucesso e detecção de divergência |
| doctor.mjs | Verifica pré-requisitos e presença dos arquivos | `ok: true` com warnings não significa REA instalado nem clone funcional |
| REA | Analisa artefatos/comportamento para um agente | Não recupera código privado do backend nem fornece a IA/executor gratuitamente |

## Implementado nesta etapa

1. Conta existente do proprietário promovida, por operação de gerenciamento, após conferir e-mail confirmado. Senha não consultada/alterada; promoção não está codificada no frontend nem vinculada a e-mail hardcoded no produto.
2. `/#admin`: entrada separada com credenciais existentes; papel administrativo verificado em tabela privada no banco. Visão de usuários/contagens, controle de acesso às APIs, cotas e auditoria. Preferências pessoais separadas da administração.
3. Reserva atômica persistente antes de captura/IA: sessão verificada por Supabase, bloqueio por conta, flags globais, 20 capturas/dia UTC e limite total de tentativas de IA por conta (padrão 1). Não é cota de tokens nem medição de clones concluídos. Chave de IA continua pessoal, não compartilhada pelo administrador.
4. Editor visual próprio para HTML estático: seleção na prévia, texto simples/cores/fonte/ordem/remoção, prévia isolada interativa e salvamento com versão anterior. Sem execução de scripts no DOM da administração; HTML recebido é texto em template inerte. Componentes dinâmicos/backend exigem outro motor de edição.

## Faltante para cumprir o produto completo

- GitHub App do Baixatudo: instalação/autorização de cada usuário, callback seguro, vínculo no banco e tokens curtos no servidor. O acesso desta sessão Arena ao GitHub NÃO é o login dos usuários e não deve ser reutilizado para eles. São necessárias configuração do App e credenciais guardadas no ambiente, nunca no chat ou frontend.
- Executor de tarefas: ambiente por usuário/job com filesystem e rede isolados, sem credenciais de produção expostas ao código gerado, limites de CPU/memória/tempo, fila e cancelamento. Deve observar referência autorizada, gerar implementação, instalar/buildar, executar testes e iterar. A Vercel estática e o iframe atual não fazem isso.
- Prévia de sistema completo: serviço temporário isolado, origin separado e gateway autenticado. Um build estático não executa todo backend. Não abrir servidor arbitrário com tokens do administrador.
- Editor de sistemas completos: árvore de arquivos/componentes, mudanças estruturadas/diff, validação, rebuild/hot reload, testes e rollback. O inspector HTML entregue é somente uma parte, não "mudar qualquer sistema".
- IA administrativa: cofre no servidor, seleção de provedor/modelo, limite de tokens/custo reservado antes da chamada e reconciliação real do consumo; retries idempotentes e limites globais. Não usar apenas contagem no navegador.
- Cobrança: escolha/configuração do provedor, webhooks assinados e idempotentes, estados de assinatura, cancelamento, direito de acesso no servidor e ambiente de testes antes de cobrança real. Nenhum checkout/plano pago foi ativado.
- Licença: a skill incorporada proíbe monetização/SaaS sem autorização escrita. Antes de comercializar, obter essa autorização ou retirar/substituir o conteúdo e suas derivações restritas. Não basta renomear o motor ou esconder créditos.

## Próximo aceite verificável

Escolher UM sistema autorizado e seus fluxos P0, reconstruir e executar esses fluxos com testes do alvo e da implementação, demonstrar prévia e edição persistente, então exportar para um repositório autorizado do usuário. Não prometer clonagem universal ou recuperar serviços privados pela URL. Recursos ainda ausentes devem continuar marcados como ausentes.
