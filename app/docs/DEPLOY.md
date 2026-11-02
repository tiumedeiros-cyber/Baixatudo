# Deploy, operação e rollback

O app é um **processo único**: Express serve a API em `/api/*` e o PWA compilado em `web/dist`.
Isso simplifica deploy (um container, uma porta, sem CORS) e mantém o preview sempre alinhado.

---

## 1. Checklist antes de publicar

- [ ] `JWT_SECRET` forte e exclusivo do ambiente (`openssl rand -hex 32`).
- [ ] `NODE_ENV=production` (o OTP deixa de devolver `debug_code`).
- [ ] `DATA_DIR` apontando para volume persistente.
- [ ] `npm test` verde (30 testes) e `npm run build` sem erros.
- [ ] Gateway de pagamento configurado e webhook apontando para `https://SEU_DOMINIO/api/payments/webhook`.
- [ ] Chaves de e-mail/SMS/push definidas (se os canais estiverem ligados em Configurações).
- [ ] Backup do banco atual (ver abaixo).
- [ ] HTTPS obrigatório (PWA, Web Push e service worker só funcionam em contexto seguro).
- [ ] Rodapé/Configurações com CNPJ, endereço e política de cancelamento revisados.

---

## 2. Opções de hospedagem

### Docker (recomendado — Railway, Render, Fly.io, VPS)

```bash
docker build -t navalha .
docker run -d --name navalha \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$JWT_SECRET \
  -v navalha-data:/app/server/data \
  navalha
```

### VPS com systemd

```ini
# /etc/systemd/system/navalha.service
[Unit]
Description=Navalha
After=network.target

[Service]
WorkingDirectory=/opt/navalha/app
ExecStart=/usr/bin/node server/src/index.js
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=JWT_SECRET=SEGREDO_FORTE
Restart=always

[Install]
WantedBy=multi-user.target
```

`nginx` na frente com proxy para `127.0.0.1:3000` e certificado (Certbot). Exemplo:

```nginx
server {
  server_name navalha.app;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Alternativas
- **Vercel/Netlify**: apenas o PWA (`web/dist`). A API precisa de host Node persistente.
- **Serverless** (Lambda/Cloud Functions): possível, mas o SQLite exige volume — migre para Postgres antes.

---

## 3. Banco de dados e backup

SQLite em modo WAL. Backup consistente **sem parar o serviço**:

```bash
sqlite3 server/data/navalha.db ".backup '/backups/navalha-$(date +%F-%H%M).db'"
```

Agende diariamente (cron) e retenha 30 dias. Para restaurar: pare o serviço, substitua o `.db`
(e remova `.db-wal`/`.db-shm`), suba novamente e valide `GET /api/health`.

### Migração para PostgreSQL
O schema (`server/src/schema.sql`) usa tipos básicos e é praticamente portável:
`TEXT → text/varchar`, `INTEGER → integer`, `datetime('now') → now()`, `json` para as colunas
serializadas. Troque a camada `server/src/db.js` por `pg` mantendo `all/get/run`.

---

## 4. Rollback

1. **Aplicação**: mantenha a imagem/tag anterior (`navalha:anterior`) pronta.
   ```bash
   docker stop navalha && docker rm navalha
   docker run -d --name navalha ... navalha:anterior
   ```
2. **Banco**: restaure o último `.backup` se a release tiver alterado dados.
3. **Cache**: o PWA faz `NetworkFirst` na API; se algum cliente estiver com versão antiga em cache,
   o service worker se atualiza no próximo carregamento (`registerType: autoUpdate`).
4. **Comunicação**: avise clientes com horário no dia via Marketing → campanha “instabilidade resolvida”.

---

## 5. Observabilidade

- Logs de acesso da API já saem no stdout (`MÉTODO rota status duração`).
- `/api/health` para liveness/readiness (já usado no `HEALTHCHECK` do Docker).
- Erros: envolver `app.use((err,...))` com Sentry (`SENTRY_DSN`).
- Métricas sugeridas: latência p95 de `/api/availability`, taxa de 409 em `/api/appointments`
  (indica disputa de horário), falhas de webhook e volume de notificações por canal.
- `audit_logs` é a fonte de verdade para “quem mudou o quê”.

---

## 6. Segurança em produção

- JWT curto (2h) + refresh rotativo já habilitados; considere reduzir para 30min.
- Rate limit em `/api/auth` (120 req/min por IP). Para produção, use Redis (multi-instância).
- CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy` já configurados.
- Senhas com `scrypt` + salt; nunca logadas.
- Webhook: valide a assinatura do gateway (Stripe `stripe-signature`, MP `x-signature`) antes de processar.
- LGPD: dados pessoais limitados ao necessário; ofereça exclusão via `DELETE` administrativo na ficha do cliente.
