# 💈 Navalha — barbearia com agendamentos online e gestão completa

Aplicação web responsiva (PWA) + API RESTful + três painéis (cliente, profissional e administrador)
implementando o briefing completo de uma barbearia moderna: agenda inteligente, pagamentos,
notificações, CRM, check-in por QR code, assinaturas, relatórios e multi-unidade.

> **Demo pronta para uso**: banco populado com 2 unidades, 5 barbeiros, 10 serviços,
> ~1.000 agendamentos de 60 dias, avaliações, cupons, campanhas e trilha de auditoria.

---

## 1. Como rodar

Requisitos: **Node.js ≥ 22.5** (usa o módulo nativo `node:sqlite`, sem dependências nativas).

```bash
npm install          # instala API (express, jwt) e PWA (react, vite, tailwind)
npm run seed         # popula o banco de demonstração (server/data/navalha.db)
npm run dev          # build do PWA + servidor em http://localhost:3000
```

Modo desenvolvimento do front (hot reload), com API em outro terminal:

```bash
npm start                    # API + build em :3000
npm run dev --workspace web  # Vite em :5173 com proxy /api → :3000
```

Testes (regras de agenda + integração da API):

```bash
npm test        # 30 testes: disponibilidade, conflitos, cupons, reembolso, check-in, auth, relatórios
```

### Contas de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@navalha.app` | `123456` |
| Barbeiro | `diego@navalha.app` | `123456` |
| Cliente | `cliente@navalha.app` | `123456` |

A tela `/entrar` tem botões de acesso rápido e também suporta **login por OTP (SMS)** e **Google/Facebook** (simulados).

---

## 2. Estrutura do projeto

```
app/
├── server/                  # API RESTful (Express + node:sqlite + JWT)
│   ├── src/
│   │   ├── index.js         # bootstrap, segurança, CSP, rate limit, SPA fallback
│   │   ├── db.js            # conexão, helpers, settings, auditoria
│   │   ├── schema.sql       # 20 tabelas relacionais
│   │   ├── auth.js          # scrypt + JWT access/refresh + RBAC
│   │   ├── seed.js          # dados de demonstração realistas
│   │   ├── routes/          # auth, catalog, appointments, payments, admin, reports, reviews, notifications
│   │   └── lib/
│   │       ├── scheduling.js    # regras puras de agenda (testadas)
│   │       ├── availability.js  # grade real por profissional/unidade
│   │       ├── payments.js      # gateway abstrato + webhook + reembolso
│   │       └── notify.js        # central de notificações (in-app/email/SMS/push)
│   └── tests/               # node:test — unitários e integração
├── web/                     # PWA React 18 + TypeScript + Tailwind 4 + Vite
│   └── src/
│       ├── pages/           # Landing, Booking, Login, ClientApp, ProPanel, admin/*, Misc
│       ├── components/      # UI (botões, modais, gráficos, toasts) e Shell (layouts)
│       └── lib/             # api client (refresh automático), auth, i18n, formatação
├── docs/                    # API (OpenAPI), manual do admin, deploy
├── Dockerfile
└── .env.example
```

Arquitetura em camadas: **PWA (React) → API REST JSON → regras de domínio → SQLite (WAL)**.
O front nunca conhece o banco; toda validação de conflito, preço e política acontece no servidor.

---

## 3. O que está implementado

### Autenticação e papéis
- Registro/login com e-mail + senha (scrypt), **refresh token rotativo**, JWT de 2h.
- **OTP por SMS** (`/auth/otp/request` + `/verify`) e login social **Google/Facebook** (troca de token).
- RBAC de três papéis: `CLIENT`, `PROFESSIONAL`, `ADMIN` — guards em todas as rotas sensíveis.
- Rate limit em `/api/auth`, cabeçalhos de segurança e CSP compatíveis com PWA.

### Agendamento
- Calendário visual com **disponibilidade real** por profissional, serviço e unidade.
- **Múltiplos serviços em sequência** com soma de duração + buffer entre eles.
- Opção “qualquer barbeiro disponível” (busca o primeiro slot livre entre todos).
- Regras configuráveis: antecedência mínima, janela máxima, buffer, capacidade diária.
- Bloqueio de sobreposição (com buffer), bloqueios de agenda, férias e folgas.
- Reagendamento e cancelamento com **política de reembolso** (100% / 50% / 0%).
- Agendamento **manual pela recepção** com criação automática de cliente e convite.

### Pagamentos
- Gateway abstraído (`lib/payments.js`) com gateway interno simulado — trocar por Stripe/Mercado Pago/PagSeguro sem tocar na UI.
- Métodos: cartão, Pix, boleto, pré-autorização e pagamento no local.
- **Webhook** `/api/payments/webhook` (`payment.succeeded`, `failed`, `refunded`, `preauth`).
- Reembolso total/parcial, captura de pré-autorização, cupons percentuais e fixos com mínimo/limite/validade.

### Notificações
- Central in-app + outbox para e-mail/SMS/push (SendGrid/Twilio/Web Push no lugar de `deliver()`).
- Templates editáveis com variáveis (`{{nome}}`, `{{data}}`, `{{codigo}}`…).
- Eventos: boas-vindas, agendamento criado, confirmação, lembrete, cancelamento, reagendamento,
  check-in, pagamento confirmado, pedido de avaliação, aviso de indisponibilidade do barbeiro.

### Clientes e CRM
- Ficha com histórico, notas do barbeiro (com autor e data), tags, visitas, total gasto, no-shows.
- Segmentação: todos, VIP, inativos (45+ dias), aniversariantes → **campanhas em massa**.
- Exportação CSV de clientes e fechamento financeiro.

### Equipe e agenda do profissional
- CRUD de profissionais com especialidades, bio, comissão e ativação.
- **Escala recorrente por dia da semana** (com almoço), férias/folgas/bloqueios.
- Painel do barbeiro: agenda do dia, iniciar/finalizar atendimento, fila e check-ins, anotações internas.

### Check-in e fila
- QR code por agendamento (`/checkin/:token`), idempotente, com push para o profissional.
- Fila ao vivo com estimativa de espera (`estimateWait`).

### Relatórios e métricas
- Dashboard: faturamento, ticket médio, cancelamentos, no-show, avaliação média, receita por dia.
- Serviços mais vendidos, ocupação e comissão por profissional, formas de pagamento.
- Financeiro: fechamento diário, descontos, reembolsos, comissões.
- Trilha de **auditoria** de todas as ações administrativas.

### Assinaturas, multi-unidade e internacionalização
- Planos do **Clube Navalha** (créditos, desconto, prioridade) + assinatura do cliente.
- Duas unidades com regras próprias (lead time, janela, capacidade) e catálogo por unidade.
- i18n (PT/EN/ES) no front, formatação de moeda/data por locale, `lang` dinâmico.

### PWA, UX e acessibilidade
- Manifest + service worker (precache + NetworkFirst para API + offline básico).
- Instalável em Android/iOS/desktop, atalhos de agendamento.
- Mobile-first, foco visível, `aria-*` em modais/menus/abas, `prefers-reduced-motion`,
  contraste alto no tema escuro (WCAG 2.1 AA nas telas principais).

---

## 4. Modelo de dados (resumo)

`branches`, `users`, `otp_codes`, `refresh_tokens`, `professionals`, `services`,
`professional_services`, `working_hours`, `time_off`, `clients`, `plans`, `subscriptions`,
`coupons`, `appointments`, `appointment_items`, `payments`, `reviews`, `notifications`,
`notification_templates`, `campaigns`, `audit_logs`, `settings`.

Detalhes e relacionamentos: [`docs/API.md`](docs/API.md#modelo-de-dados).
Todos os horários de agenda são strings locais `YYYY-MM-DDTHH:MM` — comparação determinística,
sem armadilhas de fuso; o timezone da unidade fica em `branches.timezone`.

---

## 5. Variáveis de ambiente

Copie `.env.example` → `.env`. Principais:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta HTTP (API + PWA) |
| `JWT_SECRET` | dev | **Obrigatório trocar em produção** |
| `DATA_DIR` | `server/data` | Diretório do SQLite |
| `PAYMENT_GATEWAY` | `navalha-pay` | Gateway ativo |
| `NOTIFY_LOG` | `true` | Log do outbox de notificações |
| `SENDGRID_API_KEY` / `TWILIO_*` | — | Canais reais de e-mail/SMS |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | — | Web Push |

---

## 6. Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | build do PWA e sobe tudo em `:3000` |
| `npm start` | só o servidor (serve `web/dist`) |
| `npm run seed` | recria o banco demo (`--force`) |
| `npm test` | testes unitários + integração |
| `npm run build` | build de produção do PWA |
| `npm run dev --workspace web` | Vite com hot reload |

---

## 7. Deploy e documentação

- [`docs/API.md`](docs/API.md) — referência completa dos endpoints + coleção de exemplos + OpenAPI.
- [`docs/MANUAL-ADMIN.md`](docs/MANUAL-ADMIN.md) — manual de uso do administrador e do barbeiro.
- [`docs/DEPLOY.md`](docs/DEPLOY.md) — checklist de deploy, backup, rollback e hardening.

Build com Docker:

```bash
docker build -t navalha .
docker run -p 3000:3000 -v navalha-data:/app/server/data -e JWT_SECRET=... navalha
```

---

## 8. Próximos passos sugeridos

- Trocar o gateway simulado por **Stripe/Mercado Pago** (a interface já existe em `lib/payments.js`).
- Migrar SQLite → **PostgreSQL** (schema quase idêntico) e Redis para cache de disponibilidade.
- Envio real de e-mail/SMS/Web Push e sincronização com Google Calendar/Outlook.
- Testes E2E com Playwright dos fluxos de reserva, pagamento e check-in.
- Sentry + OpenTelemetry para observabilidade e alertas de falha em webhooks.
