# Manual de uso — Navalha

Três personas usam o sistema: **cliente**, **profissional** e **administrador**.
Login em `/entrar` (e-mail/senha, código por SMS ou Google/Facebook).

---

## 1. Cliente (`/app`)

**Agendar** — `Agendar` no topo ou `/agendar`:

1. Marque um ou mais serviços. A duração é somada e o preço aparece no resumo.
2. Escolha o barbeiro (ou “qualquer barbeiro disponível”) e o dia no calendário.
3. Clique no horário livre → `Continuar` → revise dados, aplique cupom e escolha o pagamento
   (no local, Pix, cartão ou pré-autorização) → `Confirmar agendamento`.
4. A tela de sucesso mostra o **QR code de check-in** e o código do agendamento.

**Meus horários** — próximo atendimento em destaque com:
- `Fazer check-in` (avisa o barbeiro que você chegou);
- `Cancelar` (mostra quanto será reembolsado antes de confirmar);
- `Remarcar` (volta para a agenda com o mesmo barbeiro).

**Histórico** — todos os atendimentos; quando o serviço está concluído aparece `Avaliar`
(estrelas + comentário; rende 5% no próximo corte).

**Clube** — plano ativo, créditos usados no mês e opção de upgrade.

**Notificações** — central com confirmações, lembretes e campanhas; botão para marcar tudo como lido.

**Meu perfil** — nome, WhatsApp, aniversário, idioma, barbeiro favorito, estilo habitual,
alergias (visíveis ao barbeiro) e ativação de push.

---

## 2. Profissional (`/pro`)

- **Minha agenda**: escolha a data, veja os atendimentos em ordem com valor e serviços.
- Botões de fluxo: `Confirmar` → `Iniciar` → `Finalizar` (ao finalizar, o pagamento pendente
  é marcado como pago e o cliente recebe pedido de avaliação).
- Selo **check-in** indica que o cliente já chegou; o painel “Fila e check-in de hoje” mostra
  quem está aguardando e quem está na cadeira.
- `Detalhes` abre a ficha do atendimento: telefone, forma de pagamento, observação do cliente
  e **anotação interna** (visível só para a equipe).
- **Meus clientes**: fichas com visitas, total gasto, tags e última nota.

---

## 3. Administrador (`/admin`)

### Visão geral
KPIs de 7/30/60 dias (faturamento, atendimentos, ticket médio, avaliação), gráfico de receita,
top serviços, desempenho da equipe, meios de pagamento e a agenda de hoje.

### Agenda do dia
Navegue por data, filtre por profissional, veja cada barbeiro em um cartão e opere o fluxo:
`Confirmar`, `Iniciar`, `Finalizar`, `No-show`.

### Agendamentos
Filtros por período, status e busca (nome/código); cancelamento com reembolso automático.
**Novo manual** cria um agendamento para quem ligou: digite nome/telefone, escolha serviços,
o sistema mostra só os horários livres e cria a conta do cliente se necessário, enviando SMS.

### Clientes (CRM)
Busca e segmentos (VIP, inativos 45+, novos). Clique na linha para abrir a ficha:
LTV, visitas, no-shows, notas do barbeiro (adicionar inline), últimos atendimentos e pagamentos.
`Exportar CSV` gera a lista filtrada.

### Serviços
Cardápio por unidade, preço, duração e ativação. `Editar` altera dados; desativar mantém o histórico.

### Equipe & escala
- Clique nos dias da semana para montar a **escala recorrente** (padrão ter–sáb, 09h–20h, com almoço).
- `Bloquear período` para folga/férias/compromisso: clientes afetados recebem SMS para remarcar.
- `Novo profissional` cria o usuário (senha padrão `123456`) e sugere escala inicial.

### Financeiro
Receita bruta, descontos, reembolsos, ticket médio, fechamento diário (CSV), comissões por barbeiro,
receita por método, últimas transações (com `Reembolsar`) e gestão de cupons.

### Marketing
Campanha por canal (e-mail, SMS, WhatsApp, push) e segmento (todos, inativos, VIP, aniversariantes).
O histórico registra quantos clientes receberam. À direita, os **templates** de cada evento podem ser
editados com variáveis `{{nome}}`, `{{data}}`, `{{hora}}`, `{{codigo}}`, `{{profissional}}`.

### Relatórios
Ocupação por profissional, cancelamentos, no-shows e as avaliações recentes com comentários.

### Configurações
- Dados do negócio (razão social, CNPJ, contatos).
- Políticas: antecedência mínima, janela máxima, buffer, taxa de no-show e texto dos termos.
- Unidades: lead time, janela e capacidade diária por loja.
- Integrações: Google Calendar, Outlook, Stripe, Mercado Pago, PagSeguro, Mailchimp, WhatsApp, POS,
  e-mail, SMS e Web Push.
- Usuários com acesso e **trilha de auditoria** (quem fez o quê e quando).

---

## 4. Recepção — check-in rápido

1. O cliente mostra o QR code (tela de sucesso ou `Meus horários`).
2. Leitura da câmera abre `/checkin/<token>`: o sistema confirma a chegada e avisa o barbeiro.
3. Se o QR não estiver disponível, abra `Agenda do dia` e use o fluxo de status (`Iniciar`).

---

## 5. Perguntas frequentes da operação

**Como impedir agendamentos em cima da hora?**
Configurações → Políticas → *Antecedência mínima*. Vale para site e API imediatamente.

**Como fechar a barbearia em um feriado?**
Equipe & escala → `Bloquear período` em cada barbeiro (ou desative a unidade em Configurações).

**Como dar desconto só para um cliente?**
Financeiro → `Novo cupom` (percentual ou valor fixo) e envie o código por WhatsApp.

**Onde vejo quem cancelou e quanto foi reembolsado?**
Financeiro → transações (status `Reembolsado`) e Configurações → auditoria (ação `appointment.cancel`).

**Como mudar o preço de um serviço?**
Serviços → `Editar`. Agendamentos já criados mantêm o preço congelado em `appointment_items`.
