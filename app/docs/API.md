# Navalha · API REST

Base: `/api` · JSON · autenticação `Authorization: Bearer <access_token>` · datas de agenda em `YYYY-MM-DDTHH:MM` (hora local da unidade).

Respostas de erro: `{ "error": "mensagem legível" }` com status `400/401/403/404/409/429/500`.

---

## Autenticação

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/auth/register` | público | cria cliente. Body: `{name,email,password,phone?,locale?}` → `201 {user, access_token, refresh_token, expires_in}` |
| POST | `/auth/login` | público | `{email,password}` → tokens |
| POST | `/auth/oauth/:provider` | público | `:provider` = `google`\|`facebook`. Body `{email?,name?,provider_token?}` |
| POST | `/auth/otp/request` | público | `{phone}` → `{ok, expires_at, debug_code?}` (código só em dev) |
| POST | `/auth/otp/verify` | público | `{phone,code,name?}` → tokens (cria conta se novo) |
| POST | `/auth/refresh` | público | `{refresh_token}` → novos tokens (rotativo, o antigo é revogado) |
| POST | `/auth/logout` | público | `{refresh_token}` revoga a sessão |
| GET | `/auth/me` | auth | perfil do usuário logado |
| PATCH | `/auth/me` | auth | `name, phone, avatar_url, locale, birthday, document, preferences` |
| POST | `/auth/change-password` | auth | `{current_password,new_password}` |
| GET | `/auth/demo-accounts` | público | contas de demonstração |

**Papéis**: `CLIENT`, `PROFESSIONAL`, `ADMIN`. Rotas `/admin/*` exigem `ADMIN`; `/reports/*` aceita `ADMIN|PROFESSIONAL`.

### Exemplo

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@navalha.app","password":"123456"}'
```

---

## Catálogo e disponibilidade

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/branches` | público | unidades com `settings` (lead, janela, buffer, capacidade) |
| GET | `/branches/:idOrSlug` | público | detalhe da unidade |
| GET | `/services?branch=&category=` | público | serviços ativos |
| GET | `/services/:id` | público | serviço + profissionais habilitados |
| GET | `/professionals?branch=&service=` | público | barbeiros com especialidades, nota e `services[]` |
| GET | `/professionals/:id` | público | perfil, serviços, últimas 20 avaliações |
| GET | `/professionals/:id/agenda?date=YYYY-MM-DD` | auth | agenda do dia (itens, check-in, `time_off`) |
| GET | `/availability?date=&services=&professional=&branch=` | público | **grade de horários livres** |
| GET | `/working-hours?professional=` | público | escala recorrente |
| GET | `/plans` | público | planos do clube |
| GET | `/reviews?professional_id=&limit=` | público | avaliações públicas |
| GET | `/settings/public` | público | dados do negócio, políticas e integrações ativas |

### `GET /availability`

```
/api/availability?date=2026-11-06&services=svc_degrade,svc_barba&professional=pro_diego
```

```json
{
  "date": "2026-11-06",
  "duration_min": 80,
  "buffer_min": 5,
  "min_lead_minutes": 60,
  "services": [{ "id": "svc_degrade", "name": "Degradê Navalhado", "duration_min": 45, "price_cents": 7000 }],
  "slots": [{ "start_at": "2026-11-06T09:45", "end_at": "2026-11-06T11:05", "professional_id": "pro_diego" }]
}
```

Use `professional=any` (ou omita) para receber a união dos horários de todos os barbeiros habilitados.

---

## Agendamentos

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/appointments` | auth | cria agendamento (valida conflito, lead time, cupom e pagamento) |
| POST | `/appointments/quote` | público | prévia de preço/duração com cupom |
| POST | `/appointments/manual` | ADMIN/PRO | recepção cria para cliente (cria conta se necessário) |
| GET | `/appointments?scope=mine\|all&status=&from=&to=&professional_id=&limit=` | auth | lista (cliente vê só os seus) |
| GET | `/appointments/queue` | auth | fila do dia + atendimentos em andamento |
| GET | `/appointments/:id` | auth | detalhe com itens, pagamento, review |
| PATCH | `/appointments/:id` | auth | `notes, internal_notes, status, checked_in_at, started_at, finished_at, payment_status` |
| POST | `/appointments/:id/status` | ADMIN/PRO | `confirmado\|em_atendimento\|concluido\|no_show\|cancelado` |
| POST | `/appointments/:id/cancel` | auth | `{reason?}` → `{appointment, refund, refund_percent}` |
| POST | `/appointments/:id/reschedule` | auth | `{start_at}` → `409` se houver conflito |
| POST | `/appointments/checkin/:token` | público | check-in por QR (idempotente) |
| GET | `/appointments/:id/qrcode` | auth | token e URL de check-in |

### Criar agendamento

```json
POST /api/appointments
{
  "service_ids": ["svc_degrade", "svc_barba"],
  "professional_id": "pro_diego",
  "start_at": "2026-11-06T09:45",
  "branch_id": "brn_centro",
  "coupon_code": "BEMVINDO10",
  "payment_method": "pix",
  "notes": "máquina 0.5 nas laterais",
  "client": { "name": "Thiago", "phone": "(49) 99123-4567" }
}
```

Regras aplicadas no servidor:

1. serviços válidos e ativos; 2. profissional ativo; 3. conflito de agenda (+5 min de buffer);
4. horário no futuro e acima do `min_lead_minutes`; 5. cupom (validade, limite, valor mínimo);
6. cálculo de `subtotal/discount/total`; 7. criação do `payment` quando não for `onsite`;
8. notificações para cliente e profissional; 9. auditoria.

Resposta `201`:

```json
{
  "appointment": { "id": "apt_...", "code": "NV-YMWZA7", "status": "pendente", "total_cents": 10350, "items": [] },
  "payment": { "id": "pay_...", "status": "pendente", "checkout_url": "/pagamento/pay_..." }
}
```

---

## Pagamentos

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/payments?from=&to=&status=` | ADMIN | transações com cliente e código do agendamento |
| POST | `/payments` | auth | cria intent `{appointment_id, method, card?}` |
| GET | `/payments/:id` | auth (dono/admin) | detalhe + agendamento |
| POST | `/payments/:id/capture` | ADMIN | captura pré-autorização |
| POST | `/payments/:id/refund` | ADMIN | `{percent, reason}` |
| POST | `/payments/:id/simulate-paid` | auth | simula Pix/boleto compensado (demo) |
| POST | `/payments/webhook` | público | `{type, data:{transaction_id}}` |

Eventos aceitos no webhook: `payment.succeeded`, `payment.failed`, `payment.refunded`, `payment.preauth`.

---

## Avaliações e notificações

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| POST | `/reviews` | auth | `{appointment_id, rating 1-5, comment}` — só atendimento concluído e uma vez |
| POST | `/reviews/:id/reply` | ADMIN/PRO | resposta pública |
| GET | `/notifications` | auth | `{unread, items}` |
| POST | `/notifications/read` | auth | `{id?}` (sem id marca todas) |
| POST | `/notifications/push/subscribe` | auth | registra subscription Web Push |
| GET | `/notifications/clients` | ADMIN/PRO | fichas de clientes para o barbeiro |

---

## Relatórios

| Método | Rota | Descrição |
| --- | --- | --- |
| GET | `/reports/dashboard?from=&to=` | faturamento, ticket, taxas, série diária, top serviços, ocupação, meios de pagamento, agenda do dia |
| GET | `/reports/finance?from=&to=` | fechamento diário, descontos, reembolsos, por método, comissões |
| GET | `/reports/occupancy?from=&to=` | atendimentos, cancelamentos, no-show e % de ocupação por barbeiro |

---

## Administração (`ADMIN`)

| Método | Rota | Descrição |
| --- | --- | --- |
| GET/POST | `/admin/branches` | listar / criar unidade |
| PUT | `/admin/branches/:id` | atualizar dados e regras (`settings`) |
| GET/POST | `/admin/services` | listar / criar serviço |
| PUT/DELETE | `/admin/services/:id` | atualizar / arquivar |
| GET/POST | `/admin/professionals` | listar / criar profissional (escala padrão ter-sáb) |
| PUT | `/admin/professionals/:id` | bio, especialidades, comissão, ativo, serviços |
| PUT | `/admin/professionals/:id/working-hours` | substitui a grade recorrente |
| POST | `/admin/professionals/:id/time-off` | bloqueio/férias + notifica afetados |
| DELETE | `/admin/time-off/:id` | remove bloqueio |
| GET | `/admin/clients?q=` | CRM com busca, tags, visitas, LTV |
| GET | `/admin/clients/:id` | ficha completa (notas, histórico, pagamentos) |
| POST | `/admin/clients/:id/notes` | adiciona nota `{body, photo_url?}` |
| PUT | `/admin/clients/:id/tags` | `{tags: []}` |
| GET/POST | `/admin/coupons` · PUT `/admin/coupons/:id` | cupons |
| GET/POST | `/admin/plans` | planos de assinatura |
| GET/POST | `/admin/campaigns` | campanha por segmento (`todos`, `inativos`, `vip`, `aniversariantes`) |
| GET | `/admin/notification-templates` · PUT `/:id` | templates |
| GET/PUT | `/admin/settings` | negócio, políticas, integrações |
| GET | `/admin/audit-logs?limit=` | trilha de auditoria |
| POST | `/admin/users` | cria usuário ADMIN/PROFESSIONAL |

---

## Modelo de dados

```
branches ─┬─< professionals ─┬─< working_hours
          │                  ├─< time_off
          │                  ├─< professional_services >─ services
          │                  └─< appointments >─ appointment_items
          ├─< services       │        │
          ├─< clients >─ users         ├─< payments
          └─< plans                    └─< reviews
users ─< refresh_tokens, otp_codes, notifications
coupons · campaign_s · notification_templates · audit_logs · settings
```

Campos principais de `appointments`:
`id, code, branch_id, client_id, professional_id, start_at, end_at, status, payment_status,
subtotal_cents, discount_cents, total_cents, coupon_code, notes, internal_notes, checkin_token,
checked_in_at, started_at, finished_at, source, created_at`.

Status: `pendente → confirmado → em_atendimento → concluido` (ou `cancelado` / `no_show`).

---

## OpenAPI

Spec resumida em [`openapi.yaml`](openapi.yaml) — importável no Insomnia/Postman/Swagger Editor
para gerar clientes e validar contratos.
