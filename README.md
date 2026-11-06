# Baixatudo Studio — uso pessoal não comercial

Workspace web para organizar, reconstruir rascunhos de páginas a partir de evidências e editar projetos. Sem cadastro no aplicativo, sem pagamentos e sem chave de provedor de IA. O ZIP original de download de vídeos foi preservado.

## Publicação

- Aplicativo: https://baixatudo-studio.vercel.app
- Fonte: https://github.com/tiumedeiros-cyber/Baixatudo/tree/arena/a4f8fa06-baixatudo
- Foi reutilizado o repositório existente; não foi criado um duplicado. A branch `main` e os outros projetos Vercel não foram alterados.
- Vercel: projeto separado `baixatudo-studio`, plano Hobby existente. Deploy de produção manual a partir da branch desta sessão; publicação automática de commits futuros não foi configurada/validada.
- O endereço principal foi acessado sem login. Os aliases de build/equipe podem exigir login da Vercel; prefira o endereço principal acima.

## Executar

Node.js 22+ e npm:

```sh
npm ci
npm start
```

Abra a porta 3000. O servidor escuta em `0.0.0.0`. O build estático fica em `site-output/` (não versionado). A função `api/capture.js` é compatível com a implantação configurada na Vercel. `npm run build` empacota a biblioteca WebLLM e prepara as orientações internas, sem baixar pesos de modelos.

## Fluxo do usuário

1. Criar um projeto e preencher prioridades/referência.
2. Preparar uma referência pública, com consentimento, ou importar captura da extensão.
3. Em Administração, verificar o aparelho e autorizar o download do modelo de IA.
4. No projeto, pedir “Recriar referência”, “Melhorar design” ou “Revisar qualidade”.
5. Conferir o resumo e aceitar ou recusar o resultado. O código anterior vira uma versão.
6. Testar manualmente a prévia e exportar backup/código.

## IA real, com limitações explícitas

A implementação usa **WebLLM com modelos Qwen2.5** em um Web Worker, no aparelho do usuário. Nenhum provedor de inferência é configurado e nenhuma chave é necessária. Os pesos são baixados de Hugging Face e a biblioteca WASM do GitHub após autorização. O download pode exceder 1 GB; são necessários WebGPU, memória e navegador compatíveis. Internet, energia e bateria ainda têm custos. A inferência real e sua qualidade **não foram validadas no Android do usuário nem neste ambiente**, onde não foi baixado um modelo.

As respostas devem conter JSON com HTML/CSS/JS completos. Respostas inválidas não substituem o projeto. Mudanças concorrentes são detectadas. Geração fica em rascunho não testado e exige confirmação antes da aplicação. Há cancelamento por encerramento do worker.

Isso **não é um agente com terminal** e não implementa o produto inteiro de um site: não recupera backend, não executa REA/Playwright, não faz engenharia reversa desktop, não prova paridade e não publica código gerado automaticamente.

## Skills internas

As fontes estão em `engine/skills/`, com revisão e proveniência em `engine/skills/provenance.json`:

- **clonar-programa**, por **Dark Sem Filtro**: uso pessoal, educacional e não comercial. A licença exige preservar créditos e avisos, inclusive em derivados. Qualquer monetização/uso comercial depende de autorização escrita.
- **frontend-design** e **webapp-testing**, da **Anthropic**: Apache-2.0 conforme as licenças preservadas em cada pasta.

O adaptador usa trechos das orientações dentro do contexto do modelo e mantém os scripts upstream no código-fonte. Não executa instaladores ou comandos sugeridos pelas skills automaticamente. A interface principal mostra tarefas simples, não exige que o usuário conheça skills. Créditos e licenças permanecem acessíveis. Os prompts não são segredos nem mecanismos de autenticação.

A revisão de qualidade orientada por IA não é execução dos testes de `webapp-testing`. Motion, n8n e ferramentas que exigem outros runtimes não foram integradas.

## Captura de URL

`POST /api/capture` exige JSON e consentimento. Captura HTML público sem executar JavaScript. Bloqueia credenciais, portas alternativas, endereços privados/reservados, DNS misto e redirecionamentos para redes privadas. A conexão é fixada ao IP validado, com TLS verificado, limite de 1 MB e prazo total. A resposta inclui texto reduzido e limitações. Páginas dinâmicas podem retornar evidência insuficiente.

O endpoint é público e tem limitação básica de 5 pedidos/minuto por IP **por instância**. Não é limite distribuído nem autenticação. Para disponibilizar a terceiros, adicionar autenticação, limitação durável e controles de abuso. A aplicação não armazena projetos no servidor, mas a hospedagem pode registrar metadados de requisições. Não envie URLs com tokens, dados privados ou credenciais. Falha de TLS não é contornada.

## Segurança e dados

Projetos ficam em `localStorage`, por navegador/origem. Não há sincronização entre dispositivos. Faça backups; limpar dados do navegador ou mudar de endereço pode tornar os projetos inacessíveis. As áreas pessoal e administrativa são configurações locais, não uma barreira de autenticação. Não há segredo de provedor de IA no frontend ou backend.

Prévia: iframe com `sandbox="allow-scripts"`, sem `allow-same-origin`, CSP bloqueando rede, frames e formulários. Não é isolamento de CPU/memória nem uma auditoria completa. O HTML exportado não mantém essas mesmas restrições; revise antes de abrir ou publicar. Capturas e resumos são escapados, nunca renderizados como instrução executável.

## Extensão

`public/baixatudo-extension.zip` contém uma extensão Chromium MV3 de captura manual de texto visível. Instalação: extraia, abra gerenciador de extensões em Chrome/Edge desktop, ative modo de desenvolvedor e carregue a pasta sem compactação. Revise o texto antes de salvar JSON e importe-o em Projeto → Referências.

Pede somente `activeTab` e `scripting`, sem permissões permanentes para sites. Remove valores de campos e query/hash da URL; ainda pode haver informação privada no texto, exigindo revisão. Não envia captura automaticamente, não executa clonagem sozinha e não foi validada em navegador Android físico ou loja.

## Verificar e empacotar

```sh
npm test
npm run check
# Com o servidor rodando (Linux compatível):
npm run test:browser
npm run package
```

Veja `VERIFICACAO.md` para o que foi e não foi testado. Os ZIPs em `entregas/` são arquivos de conveniência; o código-fonte e as licenças são a referência.
