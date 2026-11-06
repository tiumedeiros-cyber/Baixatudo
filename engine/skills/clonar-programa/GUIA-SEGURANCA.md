# Guia de segurança: prompt injection, jailbreak e o lado "blackhat" da engenharia reversa

Este guia é **teórico e de estudo**. Ele explica o que existe, por que funciona, como as
pessoas se defendem e **por onde estudar**. Ele **não traz exemplos de ataque, payloads,
prompts prontos nem passo a passo** de nada disso, de propósito.

Por que ele existe numa skill de clonagem: quando você aponta uma LLM para um site ou programa
de terceiros, ela passa a ler **conteúdo que outra pessoa controla**. Entender os riscos faz de
você um usuário mais seguro e abre um caminho de estudo em segurança, uma área que paga bem e
que precisa de gente.

> **Regra do guia.** Conhecimento de segurança é neutro; o uso não é. Tudo aqui vale para
> **defender, pesquisar e praticar em ambiente seu ou autorizado**. Se você não tem
> autorização, o assunto é só leitura.

## Sumário

1. [Mapa rápido](#1-mapa-rápido)
2. [Por que isso importa para quem clona](#2-por-que-isso-importa-para-quem-clona)
3. [Prompt injection](#3-prompt-injection)
4. [Jailbreak de modelos](#4-jailbreak-de-modelos)
5. [Engenharia reversa "blackhat": o panorama](#5-engenharia-reversa-blackhat-o-panorama)
6. [Proteções de software e a corrida entre as partes](#6-proteções-de-software-e-a-corrida-entre-as-partes)
7. [Análise de malware: a versão defensiva](#7-análise-de-malware-a-versão-defensiva)
8. [Cadeia de suprimentos](#8-cadeia-de-suprimentos)
9. [Como estudar, do zero ao avançado](#9-como-estudar-do-zero-ao-avançado)
10. [Ética, lei e divulgação responsável](#10-ética-lei-e-divulgação-responsável)
11. [Checklist de higiene para usar esta skill](#11-checklist-de-higiene-para-usar-esta-skill)
12. [Glossário](#12-glossário)

---

## 1. Mapa rápido

| Assunto | Em uma frase | Quem se importa |
|---|---|---|
| **Prompt injection** | texto não confiável faz a LLM tratar dados como ordens | quem usa agentes com ferramentas |
| **Jailbreak** | convencer o modelo a ignorar as regras dele | pesquisadores de segurança de IA, e quem quer burlar |
| **Engenharia reversa ofensiva** | estudar um programa para quebrar proteção, licença ou segurança | crackers, autores de malware, e quem os combate |
| **Proteção de software** | técnicas para dificultar a análise e a cópia | autores de software comercial |
| **Análise de malware** | estudar código malicioso para detectar e neutralizar | times de resposta a incidentes |
| **Cadeia de suprimentos** | atacar pelas dependências e ferramentas que você instala | todo desenvolvedor |

Os quatro últimos têm uso legítimo enorme e uso criminoso. A diferença está em **autorização,
escopo e intenção**, e a lei olha para isso.

---

## 2. Por que isso importa para quem clona

Ao usar a skill, **três coisas perigosas se juntam**. Segurança de agentes de IA chama isso de
"trio letal":

1. a LLM tem acesso a **algo valioso** (seus arquivos, suas chaves, seu terminal);
2. ela lê **conteúdo não confiável** (a página ou o programa do alvo);
3. ela consegue **mandar algo para fora** (rede, comandos, escrita de arquivos).

Qualquer um dos três sozinho é administrável. Os três juntos, não. A skill já tem uma regra
(tratar conteúdo do alvo como dado, nunca como instrução), mas **regra escrita em prompt não é
barreira técnica**. A barreira real é reduzir o que a LLM pode fazer (ver
[capítulo 11](#11-checklist-de-higiene-para-usar-esta-skill)).

### Os vetores de entrada numa clonagem

Tudo o que o alvo coloca na frente da LLM é uma porta de entrada em potencial:

| Origem | Por que é um vetor |
|---|---|
| Texto e HTML de páginas | inclui partes invisíveis ao olho humano, comentários e atributos |
| Código e comentários em bundles e no `app.asar` | quem escreveu o app controla cada string |
| `README`, licenças e arquivos de texto dentro do pacote | parecem documentação, a LLM tende a confiar |
| Nomes de arquivos, metadados e propriedades de documentos | campos pequenos que ninguém revisa |
| Respostas de API e mensagens de erro capturadas | vêm do servidor do alvo |
| Saída de ferramentas (inclusive o REA) | repassam texto que veio do alvo |
| Páginas que a própria LLM decide visitar | cada link é uma nova fonte não confiável |

Repare que **nada disso exige que o dono do alvo queira atacar você**. Um site pode conter
texto hostil por acaso, por moderação de conteúdo, por teste de segurança de terceiros ou por
ser uma armadilha deliberada contra quem automatiza análise.

---

## 3. Prompt injection

### 3.1 O conceito

Um modelo de linguagem recebe tudo como uma sequência única de texto: as instruções do
desenvolvedor, o pedido do usuário e o conteúdo que ele foi ler. **Não existe uma fronteira
rígida** entre "o que é ordem" e "o que é dado". Prompt injection é explorar isso: embutir, no
conteúdo, texto que o modelo interpreta como instrução.

É o equivalente, em IA, da injeção de SQL: dados e comandos misturados num mesmo canal. Só que,
diferente do SQL, **ainda não existe um "parâmetro preparado" que resolva de vez**. Por isso
a defesa é por camadas.

### 3.2 Direta e indireta

| Tipo | Quem injeta | Exemplo conceitual de cenário |
|---|---|---|
| **Direta** | o próprio usuário, no chat | alguém tenta fazer um assistente público sair do papel |
| **Indireta** | um terceiro, via conteúdo que a LLM lê | uma página, um arquivo ou um e-mail com texto que a LLM acaba obedecendo |

Para a skill, o risco relevante é o **indireto**. Você não está atacando a si mesmo; um conteúdo
de fora está tentando falar com a sua LLM.

### 3.3 O que um atacante tenta obter (impacto)

- **Vazamento de dados:** fazer a LLM ler algo privado e enviá-lo para fora.
- **Ações indevidas:** rodar comandos, apagar ou alterar arquivos, instalar pacotes.
- **Envenenamento do resultado:** deixar a spec, o código ou o relatório errados de modo
  sutil (por exemplo, uma dependência trocada ou um endpoint falso).
- **Persistência:** gravar algo em arquivos de configuração ou memória do agente para agir
  depois.
- **Engano do usuário:** fazer a LLM afirmar algo falso com confiança.

### 3.4 Por que é difícil de resolver

- O modelo **não separa** instrução de dado por natureza.
- Quanto mais útil o agente (mais ferramentas, mais autonomia), maior a superfície.
- Filtros de texto são contornáveis, porque a linguagem natural tem infinitas formas.
- O texto malicioso pode estar **escondido** ao olhar humano (formatação, tamanho, ordem de
  leitura), mas visível ao modelo.
- Há ataques **multimodais**: o conteúdo hostil pode estar numa imagem, e não em texto.

### 3.5 Defesa em camadas

Nenhuma camada basta; juntas reduzem o risco de forma real.

| Camada | Ideia | Na prática, para esta skill |
|---|---|---|
| **Menor privilégio** | a LLM só pode o que precisa | rode o agente numa pasta de trabalho, sem acesso ao resto do disco |
| **Sem segredos no ambiente** | o que não existe não vaza | não deixe chaves, tokens e senhas em variáveis de ambiente ou arquivos que o agente alcança |
| **Isolamento** | o dano fica contido | VM, contêiner ou conta separada para alvos desconhecidos |
| **Aprovação humana** | ação sensível pede um "sim" | mantenha as confirmações do seu cliente ligadas para instalar, apagar e rodar comandos |
| **Quebrar o trio letal** | tirar uma das três pernas | sem rede de saída livre, ou sem acesso a dados privados, o ataque perde força |
| **Tratar saída de ferramenta como não confiável** | o texto do alvo atravessa as ferramentas | revise o que a LLM resumiu, principalmente comandos que ela propõe a partir do alvo |
| **Revisão de mudanças** | olhar o que foi alterado | confira diffs, arquivos novos e dependências adicionadas antes de aceitar |
| **Listas de permissão** | só o que foi aprovado roda | limite os comandos e os domínios que o agente pode usar |
| **Logs e auditoria** | saber o que aconteceu | guarde o registro das ações do agente e leia depois |
| **Dados e instruções em canais separados** | reduz a mistura | prefira ferramentas que entregam o conteúdo do alvo marcado como dado, e instruções vindas só de você |

Sinais de alerta durante o uso: a LLM de repente **muda de objetivo**, **propõe instalar algo
que ninguém pediu**, **quer acessar um domínio novo**, **cita instruções "que encontrou"** no
alvo ou **pede para desligar uma confirmação**. Pare e leia o que aconteceu.

### 3.6 Como estudar prompt injection

**Referências fundamentais**

- **OWASP Top 10 for LLM Applications**: o item de *Prompt Injection* e os vizinhos
  (vazamento de informações sensíveis, agência excessiva, cadeia de suprimentos).
- **MITRE ATLAS**: matriz de táticas e técnicas contra sistemas de IA, no estilo ATT&CK.
- **NIST AI 100-2 (Adversarial Machine Learning)**: taxonomia e terminologia oficial.
- **Blog de Simon Willison**: onde o termo "prompt injection" e o "trio letal" foram
  popularizados; leitura constante e acessível.
- **Documentação de segurança** dos fabricantes de modelos e dos clientes de agentes
  (modelos de permissão, sandbox, aprovação de ferramentas).

**Artigos acadêmicos para ler com calma**

- "Not what you've signed up for: Compromising Real-World LLM-Integrated Applications with
  Indirect Prompt Injection" (Greshake et al., 2023): o trabalho que formalizou a injeção
  indireta.
- Trabalhos sobre **defesas** por design de agentes (separação entre planejador e executor,
  políticas de fluxo de dados). Busque por "prompt injection defenses for agents" e leia os
  artigos mais citados e as respostas a eles.

**Ferramentas defensivas de teste** (para testar **os seus** sistemas)

- **garak** (scanner de vulnerabilidades de LLM), **PyRIT** (framework de red team de IA) e
  **promptfoo** (avaliação e red team de prompts). Servem para medir a robustez do **seu**
  agente, em ambiente seu.

**Prática legal e segura**

- Jogos e desafios feitos para isso, como o **Gandalf** (Lakera) e competições como o
  **HackAPrompt**.
- Seu próprio laboratório: monte um agente de brinquedo, sem acesso a nada importante, e
  estude como ele reage a conteúdo não confiável.

---

## 4. Jailbreak de modelos

### 4.1 O que é

Jailbreak é fazer um modelo **violar as regras de segurança** que o treinamento tentou impor,
produzindo o que ele normalmente recusaria. É diferente de prompt injection: no jailbreak, o
alvo é a **política do modelo**; na injeção, o alvo é a **cadeia de instruções do sistema**.
Os dois podem se combinar.

### 4.2 Por que o fenômeno existe (a teoria)

A literatura aponta causas estruturais, não só "falhas pontuais":

- **Objetivos em conflito:** o modelo foi treinado para ser útil e obediente **e** para ser
  seguro. Há situações em que esses objetivos se chocam.
- **Generalização incompleta:** o treinamento de segurança cobre certos tipos de pedido; o
  modelo tem capacidades que vão além do que a segurança consegue vigiar.
- **Sensibilidade ao contexto:** o mesmo conteúdo é aceitável ou não conforme o enquadramento,
  e enquadramentos são infinitos.
- **Janela de contexto longa:** muito texto de contexto pode deslocar o comportamento do
  modelo.
- **Fragilidade a otimização:** pesquisas mostraram que sequências de texto geradas por busca
  automática podem empurrar modelos para fora do comportamento treinado.

### 4.3 Famílias de ataque (só os nomes)

As taxonomias públicas costumam agrupar assim. Aqui entra **apenas a classificação**, sem
exemplos nem receitas:

- ataques por **enquadramento** (contexto fictício, papéis, hipóteses);
- ataques por **ofuscação ou codificação** do pedido;
- ataques **em vários turnos**, que avançam aos poucos;
- ataques por **contexto longo** ou volume de exemplos;
- ataques por **otimização automática** de texto (acesso ao modelo ou transferência);
- ataques **multimodais** (imagem e áudio);
- ataques por **injeção indireta**, em que o conteúdo carrega o pedido.

### 4.4 Como os modelos se defendem

Treinamento de segurança e alinhamento, classificadores de entrada e de saída, monitoramento de
abuso, limites de uso, atualização contínua, programas de recompensa por falhas e **red teaming**
(testes ofensivos feitos de forma autorizada). Nenhuma defesa é perfeita; o objetivo é elevar
o custo e detectar abuso.

### 4.5 Por que "destravar agente" não é um bom caminho

- **Quebra os termos de uso** da ferramenta e pode custar sua conta.
- **Reduz a confiabilidade**: um modelo fora do alinhamento erra mais e inventa mais.
- **Aumenta o seu risco**, porque você perde as proteções que o impedem de causar dano sem
  querer, como apagar arquivos ou vazar dados.
- **Para clonar não precisa.** O método da skill é feito para funcionar com o modelo dentro das
  regras: estudar o comportamento, escrever código próprio e provar paridade.

### 4.6 Como estudar jailbreak (como pesquisa)

- **Artigos:** "Jailbroken: How Does LLM Safety Training Fail?" (Wei et al., 2023), que
  explica as duas causas centrais; "Universal and Transferable Adversarial Attacks on Aligned
  Language Models" (Zou et al., 2023), sobre ataques por otimização; e o estudo da Anthropic
  sobre jailbreak por muitos exemplos em contexto longo.
- **Documentos dos fabricantes:** *system cards* e relatórios de avaliação de segurança dos
  modelos. Descrevem o que foi testado e as limitações conhecidas.
- **Caminho profissional e legal:** programas de **bug bounty** e de **red team de IA** dos
  fabricantes, que definem escopo e regras. É assim que se pesquisa ofensivamente **com
  autorização** e, às vezes, recebendo por isso.
- **Comunidades acadêmicas:** conferências de segurança e de aprendizado de máquina (USENIX
  Security, IEEE S&P, CCS, NeurIPS, ICLR) têm trilhas sobre segurança de modelos.

---

## 5. Engenharia reversa "blackhat": o panorama

"Blackhat" descreve quem age **sem autorização ou para causar dano**. A técnica de engenharia
reversa é a mesma que o profissional usa; o que muda é o objetivo. Este capítulo mostra o
**mapa do terreno**, não as trilhas.

### 5.1 Motivações

| Motivação | Descrição | Situação legal em geral |
|---|---|---|
| **Pirataria / "cracking"** | remover ou burlar licenciamento e DRM | ilegal na maioria dos países |
| **Trapaça em jogos** | alterar ou observar um jogo online para vantagem | viola termos; pode ser crime conforme o caso |
| **Criação de malware** | estudar sistemas para atacá-los | crime |
| **Roubo de propriedade intelectual** | copiar algoritmo ou código proprietário | violação de direito autoral e segredo industrial |
| **Espionagem** | extrair dados ou segredos | crime |
| **Pesquisa de vulnerabilidades** | achar falhas para vender, divulgar ou explorar | depende de autorização e de como é divulgada |

Do outro lado, os usos legítimos: **análise de malware**, **pesquisa de vulnerabilidades com
autorização**, **forense digital**, **interoperabilidade**, **preservação de software antigo**
e **ensino**.

### 5.2 O ciclo de estudo de um alvo (visão geral)

Profissionais e atacantes seguem o mesmo raciocínio geral:

1. **Reconhecimento:** que tecnologia é, que versão, que proteções existem.
2. **Análise estática:** estudar os arquivos sem executar.
3. **Análise dinâmica:** observar o programa rodando em ambiente controlado.
4. **Hipótese e verificação:** formular "como isso funciona" e testar.
5. **Documentação:** registrar para repetir e comunicar.

Repare que é o **mesmo esqueleto** da skill: congelar, capturar, reconstruir, verificar. O que
separa o profissional do criminoso não é o método, é a **autorização e o que se faz depois**.

### 5.3 Categorias de problemas que um estudo de segurança procura

Em segurança de software, relatórios e livros classificam as falhas em grandes famílias:

- falhas de **memória** (estouro de buffer e parentes);
- falhas de **lógica** (regras de negócio mal impostas, fluxos fora de ordem);
- falhas de **autenticação e autorização**;
- falhas de **criptografia** (uso errado de algoritmos, chaves embutidas);
- falhas de **entrada não validada** (injeção, desserialização insegura);
- falhas de **configuração** (permissões, serviços expostos);
- falhas de **cadeia de suprimentos** (dependências comprometidas).

Entender as famílias já ensina a **programar melhor**, que é o ganho mais imediato para quem
clona: o seu clone não deve repetir esses erros.

### 5.4 Riscos específicos de apps Electron e web

Para quem estuda o alvo (e para quem constrói o clone), os riscos clássicos dessas plataformas:

- **Electron:** o app combina a segurança de um navegador com acesso ao sistema. Configurações
  como isolamento de contexto, integração com Node na interface e carregamento de conteúdo
  remoto definem se uma falha de página vira execução de código no computador. Os "fuses" do
  Electron e a integridade do `app.asar` fazem parte da defesa.
- **Web:** autenticação e sessão, controle de acesso por objeto, injeção em formulários e
  consultas, segredos expostos no cliente, configuração de CORS e de cabeçalhos de segurança.

A referência certa para estudar isso é o **OWASP** (Top 10 de aplicações web, ASVS e o
*Web Security Testing Guide*) e a **documentação oficial de segurança do Electron**.

---

## 6. Proteções de software e a corrida entre as partes

Quem vende software tenta dificultar a análise e a cópia. Quem analisa tenta superar essas
barreiras. É uma corrida antiga; entender **as categorias** ajuda a saber por que um alvo
resiste à análise.

| Categoria de proteção | Objetivo | Efeito para quem analisa |
|---|---|---|
| **Minificação e ofuscação** | tornar o código ilegível | a leitura direta perde valor; observa-se o comportamento |
| **Empacotadores e protetores** | comprimir ou cifrar o executável | o código real só aparece em execução |
| **Máquinas virtuais de código** | transformar o código em formato próprio | exige entender o interpretador antes do programa |
| **Anti-depuração e anti-análise** | detectar que está sendo observado | o programa muda de comportamento sob observação |
| **Verificação de integridade** | detectar alteração do binário | impede ou denuncia modificações |
| **Assinatura de código** | garantir origem e não adulteração | binário alterado perde a assinatura |
| **Licenciamento online e atestação** | exigir validação no servidor | a lógica crítica sai do cliente, e o cliente isolado não basta |
| **DRM** | controlar acesso ao conteúdo | combina criptografia, hardware e serviço remoto |

Duas lições práticas:

1. **Nenhuma proteção no cliente é definitiva.** O código roda na máquina de quem analisa. O
   que realmente protege é **mover a lógica de valor para o servidor**.
2. **Para a skill, proteção é um limite declarado.** Se o alvo usa um protetor forte ou licença
   online, registre como limitação e foque no comportamento observável. Contornar proteção
   está fora do escopo e, em muitos países, é ilegal.

---

## 7. Análise de malware: a versão defensiva

É o uso mais respeitado de engenharia reversa e uma carreira de verdade (resposta a
incidentes, *threat intelligence*, empresas de antivírus).

### 7.1 Princípios de laboratório

- **Isolamento total.** VM sem compartilhamento de pastas, área de transferência e rede
  desligados, ou rede **fechada** dedicada ao laboratório.
- **Instantâneos (snapshots).** Volte ao estado limpo a cada amostra.
- **Nunca no computador principal.** E nunca com suas contas logadas.
- **Contenção de rede.** Se a amostra precisa de "internet", simule-a dentro do laboratório.
- **Registro de tudo.** Hashes, linha do tempo, observações.
- **Manuseio seguro.** Amostras com extensão alterada ou em arquivos protegidos, para não serem
  abertas sem querer.

### 7.2 O que a análise produz

Indicadores de comprometimento (hashes, domínios, caminhos), regras de detecção, descrição de
capacidades e recomendações de contenção. É informação **defensiva**.

### 7.3 Por que isso interessa a quem clona

As mesmas ferramentas e a mesma disciplina (VM, hash, evidência, registro) servem para analisar
com segurança **qualquer programa que você não conhece**. Um instalador de origem duvidosa,
mesmo que seja "só um app que quero clonar", merece o tratamento de amostra suspeita.

---

## 8. Cadeia de suprimentos

Você vai instalar pacotes (`npm`, `pip`, extensões, ferramentas globais como o próprio REA). Cada
instalação é um ato de confiança.

### 8.1 O que existe

- **Pacote malicioso por nome parecido** (typosquatting) ou publicado por quem tomou uma conta.
- **Scripts de instalação** que rodam código na sua máquina no momento do `install`.
- **Dependência legítima que foi comprometida** depois.
- **Extensões, plugins e "skills" de terceiros** que carregam instruções e código.
- **Binários baixados** sem verificação de origem ou hash.

### 8.2 Hábitos que reduzem o risco

- Instale só de **fontes oficiais** e confira o **nome exato** e o dono do pacote.
- **Fixe versões** em vez de usar sempre "a mais recente" (a skill oferece `--version` no
  `install-rea.mjs`).
- Leia o que o instalador vai fazer **antes** de aplicar (a skill mostra o plano do
  `rea setup` antes de executar).
- Prefira **permissões mínimas** e evite instalar globalmente quando der.
- Revise **skills e prompts de terceiros** antes de usar: instruções em texto também são código,
  porque o agente as segue.
- Use **verificação de hash e assinatura** quando o projeto fornece.
- Mantenha ferramentas atualizadas, e leia as notas de segurança dos projetos que você usa.

---

## 9. Como estudar, do zero ao avançado

### 9.1 Trilha sugerida

| Etapa | Foco | O que fazer |
|---|---|---|
| **0. Base** | lógica de programação, Linux, terminal, redes | uma linguagem (Python ou JavaScript), linha de comando e noções de HTTP |
| **1. Web** | como sites funcionam e falham | DevTools, HTTP, cookies, sessões; depois o OWASP Top 10 |
| **2. Sistema e C** | memória, ponteiros, processos | aprender C e como um programa roda no sistema operacional |
| **3. Assembly e binários** | ler código de máquina | x86-64 básico, formatos de executável, uma ferramenta de análise como o Ghidra |
| **4. Prática guiada** | exercícios com solução conhecida | desafios de engenharia reversa e CTFs |
| **5. Especialização** | malware, vulnerabilidades, firmware, segurança de IA | escolha uma e aprofunde |

Não pule a etapa 0. Quase todo travamento em segurança vem de falta de base em redes, sistema
operacional ou programação.

### 9.2 Livros de referência

- *Practical Malware Analysis* (Sikorski e Honig): o clássico de análise de malware.
- *Reversing: Secrets of Reverse Engineering* (Eldad Eilam): fundamentos de engenharia
  reversa.
- *The Ghidra Book* (Eagle e Nance): a ferramenta de decompilação da NSA, em profundidade.
- *Practical Binary Analysis* (Dennis Andriesse): análise de binários na prática.
- *Hacking: The Art of Exploitation* (Jon Erickson): como funcionam as falhas de memória.
- *The Web Application Hacker's Handbook* (Stuttard e Pinto): segurança web.
- *Serious Cryptography* (Jean-Philippe Aumasson): criptografia sem matemática pesada.
- *Security Engineering* (Ross Anderson): visão ampla e gratuita online.

### 9.3 Plataformas e laboratórios (legais, feitos para praticar)

- **pwn.college**, **OverTheWire**, **picoCTF**: cursos e desafios graduais, bons para começar.
- **Crackmes.one**: programas criados **para serem estudados**, com a autorização do autor.
- **TryHackMe** e **Hack The Box**: laboratórios guiados e competitivos.
- **PortSwigger Web Security Academy**: segurança web, gratuita e excelente.
- **Malware Unicorn** e **OpenSecurityTraining2**: oficinas de engenharia reversa e malware.
- Ambientes prontos para análise: **FLARE-VM** (Windows) e **REMnux** (Linux), feitos para
  laboratórios de análise.

### 9.4 Comunidades e leitura contínua

- Conferências: **DEF CON**, **Black Hat**, **REcon**, **Hexacon**, **USENIX Security**
  (muitas palestras têm vídeo aberto).
- Publicações: **Phrack**, **PoC||GTFO**, o blog do **Google Project Zero**, e relatórios
  técnicos de empresas de segurança.
- **Prática de escrita:** documente o que aprende. *Write-ups* de CTF são o melhor portfólio.

### 9.5 Segurança de IA como carreira

É uma área nova e com falta de gente: **red team de IA**, avaliação de agentes, segurança de
sistemas com LLM. Para entrar: estude o OWASP LLM Top 10 e o MITRE ATLAS, monte agentes de
brinquedo, participe de competições abertas, escreva análises e acompanhe os programas de
pesquisa dos fabricantes.

---

## 10. Ética, lei e divulgação responsável

### 10.1 As três perguntas

Antes de qualquer teste, responda:

1. **Eu tenho autorização?** Do dono, por escrito, ou o alvo é meu ou um laboratório feito
   para isso.
2. **Qual é o escopo?** O que posso e o que não posso tocar.
3. **O que farei com o que achar?** Reportar, corrigir ou guardar para estudo. Nunca explorar
   em terceiros.

### 10.2 Lei (visão geral, sem substituir um advogado)

Cada país trata isso de um jeito. Nomes que aparecem com frequência: nos Estados Unidos, a
**DMCA (seção 1201)**, contra burlar proteção de acesso, e a **CFAA**, sobre acesso não
autorizado a sistemas; na União Europeia, a **Diretiva 2009/24/CE**, que prevê exceções
limitadas de engenharia reversa para interoperabilidade; no Brasil, a **Lei do Software
(9.609/98)**, a **Lei de Direitos Autorais (9.610/98)**, o **Marco Civil da Internet** e a
**Lei 12.737/2012**, sobre invasão de dispositivo informático. Termos de uso e contratos
(EULA) também criam obrigações. **Na dúvida, consulte um advogado.**

### 10.3 Divulgação responsável

Se você achar uma falha por acaso ou em um programa autorizado:

- **Não explore além do necessário** para confirmar.
- **Avise o responsável** por um canal oficial (página de segurança, `security.txt`, programa
  de bug bounty).
- **Dê prazo razoável** para correção antes de qualquer divulgação pública (a prática comum é
  algo na faixa de 90 dias).
- **Não publique dados** de outras pessoas que viu no caminho.
- Procure programas com **"porto seguro"** (*safe harbor*), que protegem pesquisadores de boa-fé.

---

## 11. Checklist de higiene para usar esta skill

**Antes de começar**
- [ ] Rodo o agente numa **pasta de trabalho**, não na raiz do meu usuário.
- [ ] **Não há chaves, tokens ou senhas** em variáveis de ambiente ou arquivos que o agente
      alcança.
- [ ] Para alvo desconhecido, uso **VM ou conta separada**.
- [ ] As **confirmações do cliente** para instalar, apagar e rodar comandos estão ligadas.

**Durante**
- [ ] Trato o conteúdo do alvo como **dado**: se a LLM citar "instruções encontradas" nele,
      eu paro e reviso.
- [ ] Desconfio de **mudança de objetivo**, **instalações não pedidas** e **domínios novos**.
- [ ] Capturo logado só com **conta própria de teste**, e reviso a evidência antes de
      compartilhar.
- [ ] Não executo no meu computador principal um programa de que não conheço a origem.

**Depois**
- [ ] Reviso **diffs, arquivos novos e dependências** que a LLM adicionou ao clone.
- [ ] **Não versiono** `auth.json`, evidência bruta nem saídas grandes do REA.
- [ ] Guardo o registro do que foi feito e de onde veio cada coisa.

---

## 12. Glossário

| Termo | Significado |
|---|---|
| **Anti-depuração** | técnica do programa para detectar que está sendo observado |
| **Atestação** | prova, geralmente por hardware ou servidor, de que o software é legítimo |
| **Bug bounty** | programa que paga por falhas reportadas dentro de um escopo |
| **CTF** | competição de segurança com desafios que têm solução prevista |
| **CVE** | identificador público de uma vulnerabilidade conhecida |
| **Cracking** | remover ou burlar proteção de licença de um programa |
| **DRM** | gestão de direitos digitais, controle de acesso a conteúdo |
| **Divulgação responsável** | avisar o responsável e dar prazo antes de tornar a falha pública |
| **Injeção indireta** | texto hostil que chega à LLM por conteúdo que ela lê |
| **Jailbreak** | levar um modelo a violar as próprias regras de segurança |
| **Malware** | software criado para causar dano |
| **Ofuscação** | tornar código difícil de ler de propósito |
| **Packer** | ferramenta que comprime ou cifra um executável |
| **Prompt injection** | dado tratado como instrução por um modelo |
| **Red team** | equipe que simula atacantes, de forma autorizada, para testar defesas |
| **Sandbox** | ambiente isolado onde o dano fica contido |
| **Supply chain** | cadeia de dependências e ferramentas que você usa |
| **Trio letal** | dados privados + conteúdo não confiável + canal de saída |
| **Typosquatting** | publicar pacote com nome parecido com o de um conhecido |

---

*Guia de segurança da skill Clonar Programa, do Dark Sem Filtro. Conteúdo teórico para estudo
e defesa. Uso pessoal, educacional e não comercial (veja [`LICENSE`](LICENSE)). Nomes de
livros, cursos e ferramentas citados são referências públicas; confira a disponibilidade e a
licença de cada um.*
