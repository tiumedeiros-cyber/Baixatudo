# Prévia do site, proposta e produção

O que o painel faz do "pode" do lead até o site entregue. Nada aqui envia mensagem sozinho nem
mexe em dinheiro: a mensagem sempre vira **rascunho** para você aprovar, e o Pix cai na **sua**
conta (você marca no painel quando receber).

```
lead diz "pode"
   └─► Gerar prévia do site ──► link secreto /p/<código longo>
          └─► Preparar mensagem ──► rascunho na Fila ──► você aprova ──► sai pelo WhatsApp
                 └─► lead pergunta o preço ──► Criar proposta ──► Preparar mensagem com o valor
                        └─► lead paga o sinal no seu Pix ──► "Recebi o sinal"
                               └─► lead vira Ganho + abre o projeto em Produção (prazo e lista de tarefas)
```

## Como a prévia funciona

- **Gerar prévia** (na página da conversa ou do lead): monta um site de uma página com os dados
  públicos do Google Maps do negócio (nome, bairro, telefone, nota, avaliações, Instagram). O modelo é
  escolhido pelo nicho (estética, barbearia, clínica, genérico) e você troca modelo e cores antes de gerar.
- Os **serviços são exemplos do ramo** e a própria página avisa isso ("Exemplos do ramo, só para você
  visualizar") e traz uma faixa fixa "Prévia para {negócio}, criada por {sua marca}. Ainda não é o site
  final". Ela não se passa pelo site oficial do negócio.
- A **nota do Google só aparece se for 4,0 ou mais**. Abaixo disso a prévia mostra só o volume de avaliações.
- O botão "Gostei, quero este site" (faixa de cima) abre o **seu** WhatsApp. Cadastre o número em
  *Configurações → Seu WhatsApp de contato*. Sem número, o botão some.
- A página é só HTML: sem JavaScript no navegador do lead, sem rastreio, sem requisições externas,
  com `noindex` (o Google não lista).
- **Visitas**: o painel conta quantas vezes o link foi aberto. O robô de pré-visualização do próprio
  WhatsApp (que abre o link quando a mensagem sai) e as aberturas pelo painel não contam.

## Segurança do link

- O endereço é um código aleatório de 20 caracteres (~100 bits). Quem não tem o link não encontra a prévia.
- O visitante anônimo só consegue chamar uma função do banco (`view_demo`) que devolve **só o conteúdo
  da prévia publicada**, para o código exato. Nenhuma tabela é aberta e nada do resto do painel aparece.
- **Tirar do ar** faz o link deixar de abrir na hora (a prévia fica guardada, nada é apagado).
- Quem recebe o link pode repassá-lo. Trate como um link "qualquer um com o link vê".

## Para o lead conseguir abrir: publique o painel

No seu computador o endereço é `http://localhost:3000`, que **só abre aí**. O painel avisa quando o
link é local e **recusa preparar a mensagem** com link local (no modo real), para você não mandar um
link que não abre. Você tem três caminhos; todos usam a variável `SITE_URL` no `.env.local`:

```
SITE_URL=https://seu-endereco-publico
```

1. **Túnel temporário (para testar hoje, sem custo).** Um túnel (por exemplo o `cloudflared`, da
   Cloudflare) expõe o seu `localhost:3000` num endereço `https` público enquanto estiver rodando. O
   endereço muda a cada vez, e o link enviado deixa de funcionar quando o túnel cai. Serve para o
   piloto e para ver funcionando. (Baixar o `cloudflared` é um passo seu.)
2. **Publicar o painel numa hospedagem (recomendado depois do piloto).** O painel é um projeto Next.js
   comum. Na hospedagem coloque **só** estas variáveis: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e
   `OWNER_EMAIL`. **Não** coloque `SUPABASE_SECRET_KEY`, `WORKER_TOKEN` nem as do GOWA: elas ficam só
   no seu PC. Assim a versão pública abre a prévia e o login, e nada além disso. **Confirme nos termos
   do provedor se o plano grátis permite uso comercial** (alguns planos grátis proíbem).
3. **Domínio próprio** (ex.: `previa.seudominio.com.br` apontando para a hospedagem). Dá mais confiança
   ao lead. É opcional.

Depois de definir `SITE_URL`, reinicie o painel. As prévias já geradas continuam existindo e o painel
passa a mostrar os links com o endereço novo. Mensagens que você já aprovou e enviaram um link com o
endereço antigo continuam com ele, então prefira publicar antes de enviar.

> **Aviso sobre o login na versão pública.** O botão "Entrar neste computador" **só funciona abrindo
> por localhost**: em qualquer endereço público ele é recusado e o painel pede **e-mail e senha do
> Supabase** (só do `OWNER_EMAIL`). Antes de publicar, **defina uma senha** para o seu usuário em
> *Supabase → Authentication → Users*, e desligue *Allow new users to sign up*. Na hospedagem pública
> **não coloque** `SUPABASE_SECRET_KEY` nem `SESSION_SECRET` (só `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`
> e `OWNER_EMAIL`): sem elas o painel público não tem como ignorar a proteção do banco.

## Proposta e Financeiro

- **Criar proposta** (na conversa ou no lead): nome do que está sendo vendido, valor (padrão = ticket
  médio das Configurações, R$ 800), sinal (padrão 50%) e prazo (padrão 7 dias).
- **Preparar mensagem com o valor** cria um **rascunho** com valor, sinal, saldo, prazo e a sua chave Pix.
  Cadastre a chave em *Configurações → Sua chave Pix*. **Sem chave cadastrada a mensagem não inventa
  nenhuma**: ela diz que você passa a chave quando o lead confirmar.
- O fluxo da proposta: Rascunho → Enviada → Aceita → **Sinal pago** → **Paga** (ou Cancelada).
  Dá para pular passos (ex.: de Enviada direto para Sinal pago). Depois que o sinal entrou, só avança
  para Paga: cancelar com dinheiro recebido some com o caixa, então registre reembolso nas anotações.
- **Você marca o que recebeu.** Não há integração com banco ou Asaas/Mercado Pago ainda (veja
  "O que falta"). O painel pede confirmação antes de marcar um pagamento.
- Ao marcar **sinal pago** (ou pago): o lead vira **Ganho**, o *valor fechado* do lead é atualizado,
  e o **projeto** abre em Produção com o prazo contado a partir daquele dia.
- *Financeiro* soma: **Recebido** (sinal + total já recebidos), **A receber** (o que falta nas propostas
  em aberto), **Conversão** (vendas fechadas / propostas enviadas) e **Ticket médio**.

## Produção

Cada projeto tem: status (Briefing → Em produção → Em revisão → Entregue), prazo (atrasado fica
vermelho), uma lista de tarefas (padrão de 6 itens; você marca, acrescenta e não precisa apagar) e um
campo de briefing para colar o que o cliente mandar.

## O que falta (não foi feito de propósito)

- **Pix automático (Asaas ou Mercado Pago):** exige conta sua e decisão de qual usar. Hoje é manual.
- **Mensagem automática com a prévia:** o sistema nunca envia o link sozinho; você aprova. Se existir
  uma prévia no ar e o lead disser "pode", o rascunho de resposta **já vem com o link** (se `SITE_URL`
  for público), mas continua dependendo da sua aprovação.
- **Fotos e textos reais do negócio** na prévia: hoje usa só dados do Google Maps. Quando o cliente
  mandar o material, você produz o site de verdade; a prévia é para ele dizer "quero".
- **Exportar a prévia como arquivo** para hospedar em outro lugar.
