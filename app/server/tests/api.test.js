/**
 * Testes de integração da API — sobem o servidor em uma porta livre com banco
 * temporários e exercitam os fluxos de autenticação, disponibilidade,
 * agendamento, conflito, cupom, cancelamento/reembolso e check-in.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverEntry = join(__dirname, '..', 'src', 'index.js');
const seedEntry = join(__dirname, '..', 'src', 'seed.js');
const dataDir = mkdtempSync(join(tmpdir(), 'navalha-test-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}/api`;

let child;
let adminToken;
let clientToken;

async function call(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

before(async () => {
  execFileSync(process.execPath, [seedEntry, '--force'], {
    env: { ...process.env, DATA_DIR: dataDir, NOTIFY_LOG: 'false' },
    stdio: 'ignore',
  });
  child = spawn(process.execPath, [serverEntry], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, NOTIFY_LOG: 'false' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 60; i += 1) {
    try {
      const health = await fetch(`${base}/health`);
      if (health.ok) break;
    } catch {
      /* ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const admin = await call('/auth/login', { method: 'POST', body: { email: 'admin@navalha.app', password: '123456' } });
  adminToken = admin.data.access_token;
  const client = await call('/auth/login', { method: 'POST', body: { email: 'cliente@navalha.app', password: '123456' } });
  clientToken = client.data.access_token;
});

after(() => {
  child?.kill('SIGKILL');
  rmSync(dataDir, { recursive: true, force: true });
});

test('health expõe status do serviço', async () => {
  const { status, data } = await call('/health');
  assert.equal(status, 200);
  assert.equal(data.status, 'ok');
  assert.equal(data.db, true);
});

test('login inválido retorna 401', async () => {
  const { status } = await call('/auth/login', { method: 'POST', body: { email: 'admin@navalha.app', password: 'errada' } });
  assert.equal(status, 401);
});

test('registro cria cliente e token de acesso', async () => {
  const email = `novo${Date.now()}@teste.com`;
  const { status, data } = await call('/auth/register', { method: 'POST', body: { name: 'Novo Cliente', email, password: 'segredo123', phone: '(49) 90000-0000' } });
  assert.equal(status, 201);
  assert.equal(data.user.role, 'CLIENT');
  assert.ok(data.access_token);
});

test('cliente não acessa rotas administrativas', async () => {
  const { status } = await call('/admin/clients', { token: clientToken });
  assert.equal(status, 403);
});

test('catálogo público lista serviços, barbeiros e planos', async () => {
  const services = await call('/services?branch=brn_centro');
  assert.equal(services.status, 200);
  assert.ok(services.data.length >= 8);
  const pros = await call('/professionals');
  assert.ok(pros.data.length >= 5);
  assert.ok(Array.isArray(pros.data[0].services));
  const plans = await call('/plans');
  assert.ok(plans.data.length >= 2);
});

test('disponibilidade retorna horários coerentes', async () => {
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const { status, data } = await call(`/availability?date=${date}&professional=pro_diego&services=svc_degrade`);
  assert.equal(status, 200);
  assert.equal(data.duration_min, 45);
  assert.ok(data.slots.length > 0);
  assert.ok(data.slots.every((slot) => slot.start_at.startsWith(date)));
  // duração respeitada
  for (const slot of data.slots.slice(0, 5)) {
    const start = new Date(slot.start_at).getTime();
    const end = new Date(slot.end_at).getTime();
    assert.equal((end - start) / 60000, 45);
  }
});

test('orçamento aplica cupom e recusa cupom inexistente', async () => {
  const ok = await call('/appointments/quote', { method: 'POST', body: { service_ids: ['svc_corte', 'svc_barba'], coupon_code: 'BEMVINDO10' } });
  assert.equal(ok.data.subtotal_cents, 10000);
  assert.equal(ok.data.discount_cents, 1000);
  assert.equal(ok.data.total_cents, 9000);
  const bad = await call('/appointments/quote', { method: 'POST', body: { service_ids: ['svc_corte'], coupon_code: 'NAOEXISTE' } });
  assert.equal(bad.data.error, 'cupom inválido');
});

test('cria agendamento, bloqueia conflito e impede passado', async () => {
  const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const availability = await call(`/availability?date=${date}&professional=pro_lucas&services=svc_corte`);
  const slot = availability.data.slots[0].start_at;

  const created = await call('/appointments', {
    method: 'POST',
    token: clientToken,
    body: { service_ids: ['svc_corte'], professional_id: 'pro_lucas', start_at: slot, branch_id: 'brn_centro', payment_method: 'pix' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.appointment.status, 'pendente');
  assert.match(created.data.appointment.code, /^NV-/);
  assert.equal(created.data.payment.status, 'pendente');

  const conflict = await call('/appointments', {
    method: 'POST',
    token: clientToken,
    body: { service_ids: ['svc_corte'], professional_id: 'pro_lucas', start_at: slot, branch_id: 'brn_centro' },
  });
  assert.equal(conflict.status, 409);

  const past = await call('/appointments', {
    method: 'POST',
    token: clientToken,
    body: { service_ids: ['svc_corte'], professional_id: 'pro_lucas', start_at: '2020-01-01T10:00', branch_id: 'brn_centro' },
  });
  assert.equal(past.status, 400);
});

test('check-in atualiza o agendamento de forma idempotente', async () => {
  const mine = await call('/appointments?scope=mine', { token: clientToken });
  const target = mine.data.find((appointment) => ['pendente', 'confirmado'].includes(appointment.status));
  assert.ok(target, 'precisa existir um agendamento futuro');
  const first = await call(`/appointments/checkin/${target.checkin_token}`, { method: 'POST' });
  assert.equal(first.status, 200);
  assert.equal(first.data.status, 'confirmado');
  assert.ok(first.data.checked_in_at);
  const second = await call(`/appointments/checkin/${target.checkin_token}`, { method: 'POST' });
  assert.equal(second.status, 200);
  assert.equal(second.data.checked_in_at, first.data.checked_in_at);
  const invalid = await call('/appointments/checkin/token-invalido', { method: 'POST' });
  assert.equal(invalid.status, 404);
});

test('cancelamento devolve percentual de reembolso conforme política', async () => {
  const mine = await call('/appointments?scope=mine', { token: clientToken });
  const target = mine.data.find((appointment) => appointment.status === 'pendente');
  assert.ok(target);
  const { status, data } = await call(`/appointments/${target.id}/cancel`, { method: 'POST', token: clientToken, body: { reason: 'teste' } });
  assert.equal(status, 200);
  assert.equal(data.appointment.status, 'cancelado');
  assert.ok([0, 50, 100].includes(data.refund_percent));
});

test('reagendamento rejeita horário ocupado', async () => {
  const mine = await call('/appointments?scope=all', { token: adminToken });
  const active = mine.data.filter((appointment) => ['pendente', 'confirmado'].includes(appointment.status));
  const a = active[0];
  const b = active.find((appointment) => appointment.professional_id === a.professional_id && appointment.id !== a.id);
  if (!b) return;
  const { status } = await call(`/appointments/${a.id}/reschedule`, { method: 'POST', token: adminToken, body: { start_at: b.start_at } });
  assert.equal(status, 409);
});

test('webhook de pagamento atualiza status do agendamento', async () => {
  const payments = await call('/payments', { token: adminToken });
  const pending = payments.data.find((payment) => payment.status === 'pendente');
  if (!pending) return;
  const { status, data } = await call('/payments/webhook', { method: 'POST', body: { type: 'payment.succeeded', data: { transaction_id: pending.transaction_id } } });
  assert.equal(status, 200);
  assert.equal(data.status, 'pago');
  const events = await call('/payments/webhook', { method: 'POST', body: { type: 'payment.succeeded', data: { transaction_id: 'tx-inexistente' } } });
  assert.equal(events.status, 400);
});

test('relatórios exigem autenticação e retornam métricas', async () => {
  const anon = await call('/reports/dashboard');
  assert.equal(anon.status, 401);
  const { status, data } = await call('/reports/dashboard', { token: adminToken });
  assert.equal(status, 200);
  assert.ok(data.revenue_cents > 0);
  assert.ok(Array.isArray(data.top_services));
  assert.ok(data.avg_rating > 0);
  const finance = await call('/reports/finance', { token: adminToken });
  assert.ok(Array.isArray(finance.data.commissions));
});

test('avaliação só é permitida em atendimento concluído e uma única vez', async () => {
  const mine = await call('/appointments?scope=mine', { token: clientToken });
  const done = mine.data.find((appointment) => appointment.status === 'concluido' && !appointment.review);
  if (!done) return;
  const first = await call('/reviews', { method: 'POST', token: clientToken, body: { appointment_id: done.id, rating: 5, comment: 'Ótimo' } });
  assert.equal(first.status, 201);
  const second = await call('/reviews', { method: 'POST', token: clientToken, body: { appointment_id: done.id, rating: 4 } });
  assert.equal(second.status, 409);
  const future = mine.data.find((appointment) => ['pendente', 'confirmado'].includes(appointment.status));
  if (future) {
    const invalid = await call('/reviews', { method: 'POST', token: clientToken, body: { appointment_id: future.id, rating: 5 } });
    assert.equal(invalid.status, 400);
  }
});

test('admin cria agendamento manual para cliente sem conta', async () => {
  const date = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10);
  const availability = await call(`/availability?date=${date}&professional=pro_marcos&services=svc_corte`);
  const slot = availability.data.slots.at(-1)?.start_at;
  if (!slot) return;
  const { status, data } = await call('/appointments/manual', {
    method: 'POST',
    token: adminToken,
    body: { client_name: 'Cliente Balcão', client_phone: '(49) 97777-0000', professional_id: 'pro_marcos', start_at: slot, service_ids: ['svc_corte'] },
  });
  assert.equal(status, 201);
  assert.equal(data.source, 'recepcao');
  assert.equal(data.status, 'confirmado');
});

test('notificações são geradas para eventos do agendamento', async () => {
  const { status, data } = await call('/notifications', { token: clientToken });
  assert.equal(status, 200);
  assert.ok(data.items.length > 0);
  const read = await call('/notifications/read', { method: 'POST', token: clientToken, body: {} });
  assert.equal(read.data.unread, 0);
});

test('auditoria registra ações administrativas', async () => {
  const { data } = await call('/admin/audit-logs', { token: adminToken });
  assert.ok(data.length > 0);
  assert.ok(data.some((log) => log.action.includes('appointment')));
});
