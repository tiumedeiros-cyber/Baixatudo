# IA para validar o Baixatudo sem contratar API paga

Pesquisa de fontes oficiais. Não existe garantia de gratuidade permanente, disponibilidade ou qualidade. Não foram criadas contas, adquiridos créditos, ativadas assinaturas ou cadastradas chaves.

## Recomendação prática

- Para inferência remota gratuita com chave: começar por **OpenRouter `openrouter/free`** ou um modelo elegível à faixa gratuita do **Gemini**, se o proprietário puder usar uma conta/chave. O primeiro tem uma rota explicitamente limitada a modelos gratuitos. Isso ainda não entrega um executor de clonagem.
- Sem nova conta, chave ou contratação de API: **WebLLM** em aparelho compatível, ou **validação manual** com uma IA à qual o usuário já tenha acesso. Não equivale a agente autônomo.
- Não é necessário comprar uma API agora para testar entrada de referência, especificação, aplicação de código, prévia, versões e exportação. Os conectores podem ser ativados depois.

## Comparação

| Opção | Gratuito significa | Requisito / limite | Decisão nesta versão |
| --- | --- | --- | --- |
| OpenRouter | Variantes gratuitas e rota `openrouter/free` | Conta, chave, limites e disponibilidade variáveis | Adaptador pronto; não ativado sem chave. Modo gratuito rejeita modelos pagos e não configura fallback pago. |
| Gemini | Input/output gratuitos em determinados modelos da faixa Free | Conta Google/AI Studio, chave, região/verificação/modelo elegíveis; alguns modelos são só pagos. Na faixa gratuita o conteúdo pode ser usado para melhoria de produtos | Adaptador pronto; não ativado. O aplicativo não verifica o faturamento da conta. |
| Groq | Cotas de API dependem do modelo e da conta | Conta, chave e limites de requisições/tokens | Adaptador pronto; não ativado. |
| WebLLM | Inferência no aparelho, sem provedor de API | WebGPU, download de pesos, memória, internet e bateria | Mantido como alternativa; inferência real no Android ainda não validada. |
| OpenCode | Cliente/agente e ofertas de modelos não são a mesma coisa | Documentação atual exige conta e descreve restrições de uso dos modelos gratuitos; não é API anônima genérica para embutir | Não prometer API gratuita anônima ou ilimitada. |
| Puter | API JavaScript sem chave própria não significa uso anônimo ilimitado | Conta/cota do usuário e condições do serviço | Não integrado para não impor novo cadastro. |
| LLM7 | Documentação atual oferece token gratuito com quotas | O quickstart atual exige token do dashboard; a página de limites lista Free token e Pro | Não tratado como endpoint sem cadastro. O catálogo GET público não comprova inferência gratuita anônima. |
| Ollama / modelos locais de servidor | Runtime e pesos podem ser gratuitos | É necessário hardware compatível; não oferece uma máquina grátis | Não é uma solução cloud incluída no sistema. |
| IA web já utilizada pelo proprietário | Pode permitir validar sem contratar outra API | Limites e política da ferramenta; exige copiar pedido/importar resposta | Modo manual implementado e identificado como manual. |

## O que uma IA sozinha não resolve

O vídeo mostra skill + modelo + agente com ferramentas + ambiente de execução. Para reconstrução completa, ainda é necessário capturar comportamento autorizado, organizar especificação, implementar componentes/servidor quando aplicável, executar, testar e corrigir em ciclos. A Vercel hospeda o Studio e suas funções limitadas; não é uma máquina persistente com desktop/REA/Playwright para o agente.

Nesta versão, nenhum conector de texto recebe acesso a terminal. Respostas HTML/CSS/JS só são aplicadas após validação e confirmação, em prévia isolada. Não é correto afirmar clonagem integral, engenharia reversa de EXE/APK ou paridade comprovada.

## Fontes oficiais consultadas

- Gemini — preços, faixa gratuita e tratamento de dados: https://ai.google.dev/gemini-api/docs/pricing
- Gemini — necessidade de chave, verificação e segurança: https://ai.google.dev/gemini-api/docs/api-key
- OpenRouter — variantes grátis e alerta sobre fallback pago: https://openrouter.ai/docs/guides/routing/model-variants/free
- OpenRouter — limites e quota da chave: https://openrouter.ai/docs/api/reference/limits
- Groq — limites por organização/modelo: https://console.groq.com/docs/rate-limits
- OpenCode — modelos/condições atuais: https://opencode.ai/docs/zen/
- Puter — API, parâmetros, respostas e cobrança do uso: https://docs.puter.com/AI/chat/
- LLM7 — token exigido pelo quickstart: https://docs.llm7.io/quickstart
- LLM7 — quotas e plano pago: https://docs.llm7.io/limits
- LLM7 — catálogo público, não prova de inferência: https://api.llm7.io/v1/models
- WebLLM — inferência em navegador: https://webllm.mlc.ai/docs/user/basic_usage.html
- clonar-programa: https://github.com/darksemfiltro/clonar-programa

Limites e modelos mudam. Evitar números promocionais como promessa de capacidade do Baixatudo. Nunca usar chave encontrada publicamente, endpoint de terceiros obtido por bypass de autenticação ou múltiplas contas para contornar quotas.
