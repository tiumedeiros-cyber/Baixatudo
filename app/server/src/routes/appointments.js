import { Router } from 'express';
import { all, get, run, uid, audit, getSetting } from '../db.js';
import { requireAuth } from '../auth.js';
import { getServices, hasConflict } from '../lib/availability.js';
import {
  applyCoupon,
  appointmentCode,
  totalDuration,
  addMinutesLocal,
  minutesBetween,
  parseLocal,
  refundPolicy,
  toLocal,
} from '../lib/scheduling.js';
import { notify } from '../lib/notify.js';
import { createPaymentIntent, refundPayment } from '../lib/payments.js';

const router = Router();

const STATUS_LABEL = {
  pendente: 'aguardando confirmação',
  confirmado: 'confirmado',
  em_atendimento: 'em atendimento',
  concluido: 'concluído',
  cancelado: 'cancelado',
  no_show: 'não compareceu',
};

export const hydrate = (row) => {
  if (!row) return null;
  const items = all('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY position', row.id);
  const professional = get(
    `SELECT p.id, p.rating, u.name, u.avatar_url FROM professionals p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    row.professional_id
  );
  const client = get('SELECT id, name, email, phone, avatar_url FROM users WHERE id = ?', row.client_id);
  const payment = get('SELECT * FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1', row.id);
  const review = get('SELECT * FROM reviews WHERE appointment_id = ?', row.id);
  const canReview = row.status === 'concluido' && !review;
  return {
    ...row,
    items,
    professional,
    client,
    payment,
    review,
    can_review: canReview,
    duration_min: items.reduce((sum, i) => sum + i.duration_min, 0),
    status_label: STATUS_LABEL[row.status] || row.status,
  };
};

function couponFor(code, subtotal) {
  if (!code) return { coupon: null, discount: 0, total: subtotal };
  const coupon = get('SELECT * FROM coupons WHERE UPPER(code) = ? AND active = 1', String(code).toUpperCase());
  if (!coupon) return { coupon: null, discount: 0, total: subtotal, error: 'cupom inválido' };
  if (coupon.expires_at && coupon.expires_at < new Date().toISOString().slice(0, 10)) {
    return { coupon: null, discount: 0, total: subtotal, error: 'cupom expirado' };
  }
  if (coupon.used_count >= coupon.usage_limit) {
    return { coupon: null, discount: 0, total: subtotal, error: 'cupom esgotado' };
  }
  const result = applyCoupon(subtotal, coupon);
  return { coupon, ...result };
}

/** Criação do agendamento — valida disponibilidade, preço, cupom e pagamento. */
router.post('/', requireAuth, (req, res) => {
  const {
    service_ids: rawServices,
    professional_id: professionalId,
    start_at: startAt,
    branch_id: branchId,
    coupon_code: couponCode,
    notes,
    payment_method: paymentMethod = 'onsite',
    client: guestData,
    addons = [],
    source = 'site',
  } = req.body || {};

  const serviceIds = [...(rawServices || []), ...addons];
  if (!serviceIds.length) return res.status(400).json({ error: 'selecione ao menos um serviço' });
  if (!professionalId) return res.status(400).json({ error: 'selecione um profissional' });
  if (!startAt) return res.status(400).json({ error: 'selecione o horário' });

  const services = getServices(serviceIds);
  if (services.length !== serviceIds.length) return res.status(400).json({ error: 'serviço indisponível' });

  const branch = get('SELECT * FROM branches WHERE id = ?', branchId || get('SELECT id FROM branches LIMIT 1').id);
  if (!branch) return res.status(400).json({ error: 'unidade inválida' });

  const professional = get('SELECT * FROM professionals WHERE id = ? AND active = 1', professionalId);
  if (!professional) return res.status(400).json({ error: 'profissional indisponível' });

  const settings = JSON.parse(branch.settings || '{}');
  const duration = totalDuration(services, settings.buffer_min ?? 5);
  const endAt = addMinutesLocal(startAt, duration);

  if (hasConflict(professionalId, startAt, endAt)) {
    return res.status(409).json({ error: 'esse horário acabou de ser reservado. escolha outro.' });
  }

  const now = toLocal(new Date());
  if (startAt <= now) return res.status(400).json({ error: 'horário no passado' });
  const lead = settings.min_lead_minutes ?? 60;
  if (minutesBetween(now, startAt) < lead) {
    return res.status(400).json({ error: `agendamentos exigem ${lead}min de antecedência` });
  }

  const subtotal = services.reduce((sum, s) => sum + s.price_cents, 0);
  const { coupon, discount, total, error } = couponFor(couponCode, subtotal);
  if (error) return res.status(400).json({ error });

  const clientId = req.user.sub;
  if (guestData?.name && req.user.role === 'CLIENT') {
    run('UPDATE users SET name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?', guestData.name, guestData.phone || null, clientId);
  }

  const id = uid('apt_');
  const checkinToken = uid('chk_');
  run(
    `INSERT INTO appointments (id, code, branch_id, client_id, professional_id, start_at, end_at, status,
       payment_status, subtotal_cents, discount_cents, total_cents, coupon_code, notes, checkin_token, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', 'pendente', ?, ?, ?, ?, ?, ?, ?)`,
    id,
    appointmentCode(),
    branch.id,
    clientId,
    professionalId,
    startAt,
    endAt,
    subtotal,
    discount,
    total,
    coupon?.code || null,
    notes || null,
    checkinToken,
    source
  );
  services.forEach((s, index) => {
    run(
      'INSERT INTO appointment_items (id, appointment_id, service_id, name, duration_min, price_cents, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('api_'),
      id,
      s.id,
      s.name,
      s.duration_min,
      s.price_cents,
      index
    );
  });
  if (coupon) run('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', coupon.id);

  let payment = null;
  if (total > 0 && paymentMethod !== 'onsite') {
    payment = createPaymentIntent({
      appointmentId: id,
      userId: clientId,
      method: paymentMethod,
      amount: total,
      card: req.body.card,
    });
  }

  run(
    'UPDATE appointments SET status = ?, payment_status = ? WHERE id = ?',
    payment ? (payment.status === 'autorizado' ? 'pendente' : 'pendente') : 'confirmado',
    payment ? (payment.status === 'pago' ? 'pago' : payment.status) : 'pendente',
    id
  );

  const clientUser = get('SELECT * FROM users WHERE id = ?', clientId);
  const when = startAt.replace('T', ' às ');
  notify({
    userId: clientId,
    type: 'agendamento_criado',
    channel: 'email',
    title: 'Agendamento recebido ✂️',
    body: `Olá ${clientUser.name}, recebemos seu pedido para ${when} com ${get('SELECT u.name FROM users u JOIN professionals p ON p.user_id = u.id WHERE p.id = ?', professionalId)?.name}.`,
    meta: { appointment_id: id },
  });
  notify({
    userId: get('SELECT user_id FROM professionals WHERE id = ?', professionalId).user_id,
    type: 'agendamento_criado',
    channel: 'push',
    title: 'Novo agendamento na sua agenda',
    body: `${clientUser.name} · ${when} · ${services.map((s) => s.name).join(' + ')}`,
    meta: { appointment_id: id },
  });
  audit(req.user, 'appointment.create', 'appointment', id, { startAt, professionalId, total });

  res.status(201).json({ appointment: hydrate(get('SELECT * FROM appointments WHERE id = ?', id)), payment });
});

/** Agendamento manual criado pela recepção (cliente pode não ter conta). */
router.post('/manual', requireAuth, (req, res) => {
  if (req.user.role === 'CLIENT') return res.status(403).json({ error: 'sem permissão' });
  const { client_name: clientName, client_phone: clientPhone, professional_id: professionalId, start_at: startAt, service_ids: serviceIds = [], notes, payment_method: paymentMethod = 'onsite' } = req.body || {};
  if (!clientName || !professionalId || !startAt || !serviceIds.length) {
    return res.status(400).json({ error: 'cliente, profissional, horário e serviços são obrigatórios' });
  }

  let clientUser = clientPhone ? get('SELECT * FROM users WHERE phone = ?', clientPhone) : null;
  if (!clientUser) {
    const email = clientPhone ? `tel_${String(clientPhone).replace(/\D/g, '')}@navalha.app` : `manual_${Date.now()}@navalha.app`;
    const userId = uid('usr_');
    const branchId = get('SELECT id FROM branches LIMIT 1').id;
    run(
      `INSERT INTO users (id, name, email, phone, role, branch_id) VALUES (?, ?, ?, ?, 'CLIENT', ?)`,
      userId, clientName, email, clientPhone || null, branchId
    );
    run('INSERT INTO clients (id, user_id, branch_id) VALUES (?, ?, ?)', uid('cli_'), userId, branchId);
    clientUser = get('SELECT * FROM users WHERE id = ?', userId);
  }

  const services = getServices(serviceIds);
  if (!services.length) return res.status(400).json({ error: 'serviços inválidos' });
  const duration = totalDuration(services, 5);
  const endAt = addMinutesLocal(startAt, duration);
  if (hasConflict(professionalId, startAt, endAt)) return res.status(409).json({ error: 'horário indisponível para este profissional' });

  const subtotal = services.reduce((sum, s) => sum + s.price_cents, 0);
  const id = uid('apt_');
  run(
    `INSERT INTO appointments (id, code, branch_id, client_id, professional_id, start_at, end_at, status, payment_status,
       subtotal_cents, discount_cents, total_cents, notes, checkin_token, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmado', 'pendente', ?, 0, ?, ?, ?, 'recepcao')`,
    id, appointmentCode(), get('SELECT branch_id FROM professionals WHERE id = ?', professionalId)?.branch_id,
    clientUser.id, professionalId, startAt, endAt, subtotal, subtotal, notes || null, uid('chk_')
  );
  services.forEach((service, index) => {
    run(
      'INSERT INTO appointment_items (id, appointment_id, service_id, name, duration_min, price_cents, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('api_'), id, service.id, service.name, service.duration_min, service.price_cents, index
    );
  });
  if (paymentMethod !== 'onsite') {
    createPaymentIntent({ appointmentId: id, userId: clientUser.id, method: paymentMethod, amount: subtotal });
  }
  notify({
    userId: clientUser.id,
    type: 'confirmacao',
    channel: 'sms',
    title: 'Agendamento confirmado',
    body: `${clientName}, seu horário em ${startAt.replace('T', ' às ')} foi reservado pela recepção.`,
    meta: { appointment_id: id },
  });
  audit(req.user, 'appointment.manual', 'appointment', id, { clientName, startAt });
  res.status(201).json(hydrate(get('SELECT * FROM appointments WHERE id = ?', id)));
});

router.post('/quote', (req, res) => {
  const { service_ids: serviceIds = [], coupon_code: couponCode, addons = [] } = req.body || {};
  const services = getServices([...serviceIds, ...addons]);
  const subtotal = services.reduce((sum, s) => sum + s.price_cents, 0);
  const { coupon, discount, total, error } = couponFor(couponCode, subtotal);
  res.json({
    services,
    subtotal_cents: subtotal,
    discount_cents: discount,
    total_cents: total,
    coupon: coupon ? { code: coupon.code, type: coupon.type, value: coupon.value } : null,
    duration_min: services.reduce((sum, s) => sum + s.duration_min, 0),
    error: error || null,
  });
});

router.get('/', requireAuth, (req, res) => {
  const { status, from, to, professional_id: proId, client_id: clientId, scope = 'mine', limit = 100 } = req.query;
  const filters = [];
  const params = [];

  if (scope === 'mine' && req.user.role === 'CLIENT') {
    filters.push('a.client_id = ?');
    params.push(req.user.sub);
  } else if (req.user.role === 'PROFESSIONAL' && scope !== 'all') {
    const pro = get('SELECT id FROM professionals WHERE user_id = ?', req.user.sub);
    filters.push('a.professional_id = ?');
    params.push(pro?.id || 'none');
  } else if (req.user.role !== 'ADMIN' && scope !== 'all') {
    return res.status(403).json({ error: 'sem permissão' });
  }
  if (proId) {
    filters.push('a.professional_id = ?');
    params.push(proId);
  }
  if (clientId) {
    filters.push('a.client_id = ?');
    params.push(clientId);
  }
  if (status) {
    const list = String(status).split(',');
    filters.push(`a.status IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }
  if (from) {
    filters.push('a.start_at >= ?');
    params.push(from);
  }
  if (to) {
    filters.push('a.start_at <= ?');
    params.push(to);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = all(`SELECT a.* FROM appointments a ${where} ORDER BY a.start_at DESC LIMIT ?`, ...params, Number(limit));
  res.json(rows.map(hydrate));
});

router.get('/queue', requireAuth, (req, res) => {
  const today = toLocal(new Date()).slice(0, 10);
  const rows = all(
    `SELECT a.*, u.name AS client_name FROM appointments a JOIN users u ON u.id = a.client_id
     WHERE a.start_at LIKE ? AND a.status IN ('confirmado','em_atendimento') ORDER BY a.start_at`,
    `${today}%`
  );
  const now = toLocal(new Date());
  const inService = rows
    .filter((a) => a.status === 'em_atendimento')
    .map((a) => ({ id: a.id, end_at: a.end_at, start_at: a.start_at }));
  const waiting = rows.filter((a) => a.checked_in_at && a.status === 'confirmado').length;
  res.json({
    now,
    in_service: inService,
    waiting_count: waiting,
    queue: rows.map((a) => ({ ...hydrate(a), client_name: a.client_name })),
  });
});

router.get('/:id', requireAuth, (req, res) => {
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (req.user.role === 'CLIENT' && row.client_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });
  res.json(hydrate(row));
});

router.patch('/:id', requireAuth, (req, res) => {
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  const isOwner = row.client_id === req.user.sub;
  if (!isOwner && req.user.role === 'CLIENT') return res.status(403).json({ error: 'sem permissão' });

  const fields = ['notes', 'internal_notes', 'status', 'checked_in_at', 'started_at', 'finished_at', 'payment_status'];
  const sets = [];
  const values = [];
  for (const field of fields) {
    if (req.body?.[field] !== undefined) {
      sets.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'nada para atualizar' });
  run(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`, ...values, row.id);
  if (req.body?.status) audit(req.user, `appointment.${req.body.status}`, 'appointment', row.id, {});
  res.json(hydrate(get('SELECT * FROM appointments WHERE id = ?', row.id)));
});

/** Transições de status do atendimento (profissional/admin) */
router.post('/:id/status', requireAuth, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['confirmado', 'em_atendimento', 'concluido', 'no_show', 'cancelado'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'status inválido' });
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (req.user.role === 'CLIENT' && status !== 'cancelado') return res.status(403).json({ error: 'sem permissão' });

  const patch = { status };
  if (status === 'em_atendimento') patch.started_at = toLocal(new Date());
  if (status === 'concluido') {
    patch.finished_at = toLocal(new Date());
    patch.checked_in_at = row.checked_in_at || toLocal(new Date());
    const client = get('SELECT * FROM clients WHERE user_id = ?', row.client_id);
    if (client) {
      run(
        'UPDATE clients SET visits = visits + 1, total_spent_cents = total_spent_cents + ? WHERE id = ?',
        row.total_cents,
        client.id
      );
    }
    if (row.payment_status !== 'pago') {
      run('UPDATE appointments SET payment_status = ? WHERE id = ?', 'pago', row.id);
      const pending = get(`SELECT * FROM payments WHERE appointment_id = ? AND status IN ('pendente','autorizado')`, row.id);
      if (pending) run('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?', 'pago', new Date().toISOString(), pending.id);
    }
    notify({
      userId: row.client_id,
      type: 'avaliacao',
      channel: 'push',
      title: 'Como foi seu atendimento?',
      body: 'Avalie o profissional e ganhe 5% no próximo corte.',
      meta: { appointment_id: row.id },
    });
  }

  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(', ');
  run(`UPDATE appointments SET ${sets} WHERE id = ?`, ...Object.values(patch), row.id);
  audit(req.user, `appointment.status.${status}`, 'appointment', row.id, patch);
  res.json(hydrate(get('SELECT * FROM appointments WHERE id = ?', row.id)));
});

router.post('/:id/cancel', requireAuth, (req, res) => {
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (req.user.role === 'CLIENT' && row.client_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });
  if (['cancelado', 'concluido'].includes(row.status)) return res.status(400).json({ error: 'agendamento não pode ser cancelado' });

  const policies = getSetting('policies', {});
  const hours = Math.max(0, Math.round((parseLocal(row.start_at) - parseLocal(toLocal(new Date()))) / 3600000));
  const percent = refundPolicy({ hoursBefore: hours, policy: policies });
  let refund = null;

  if (row.payment_status === 'pago') {
    refund = refundPayment({ appointmentId: row.id, percent, reason: req.body?.reason });
  }

  run(
    'UPDATE appointments SET status = ?, payment_status = ? WHERE id = ?',
    'cancelado',
    refund ? 'reembolsado' : row.payment_status,
    row.id
  );
  notify({
    userId: row.client_id,
    type: 'cancelamento',
    channel: 'email',
    title: 'Agendamento cancelado',
    body: refund
      ? `Cancelamento confirmado. Reembolso de ${percent}% (${(refund.refunded_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) será processado em até 5 dias úteis.`
      : 'Cancelamento confirmado. Nenhum valor a reembolsar conforme a política vigente.',
    meta: { appointment_id: row.id },
  });
  const proUser = get('SELECT user_id FROM professionals WHERE id = ?', row.professional_id);
  if (proUser) {
    notify({
      userId: proUser.user_id,
      type: 'cancelamento',
      channel: 'push',
      title: 'Agendamento cancelado',
      body: `${row.start_at.replace('T', ' ')} liberado na sua agenda.`,
      meta: { appointment_id: row.id },
    });
  }
  audit(req.user, 'appointment.cancel', 'appointment', row.id, { hours, percent, reason: req.body?.reason });
  res.json({ appointment: hydrate(get('SELECT * FROM appointments WHERE id = ?', row.id)), refund, refund_percent: percent });
});

router.post('/:id/reschedule', requireAuth, (req, res) => {
  const { start_at: startAt } = req.body || {};
  if (!startAt) return res.status(400).json({ error: 'informe o novo horário' });
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (req.user.role === 'CLIENT' && row.client_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });

  const duration = minutesBetween(row.start_at, row.end_at);
  const endAt = addMinutesLocal(startAt, duration);
  if (hasConflict(row.professional_id, startAt, endAt, row.id)) {
    return res.status(409).json({ error: 'horário indisponível' });
  }
  const previous = row.start_at;
  run('UPDATE appointments SET start_at = ?, end_at = ?, status = ?, checkin_token = ? WHERE id = ?', startAt, endAt, 'confirmado', uid('chk_'), row.id);
  notify({
    userId: row.client_id,
    type: 'reagendamento',
    channel: 'sms',
    title: 'Agendamento remarcado',
    body: `Seu horário mudou de ${previous.replace('T', ' ')} para ${startAt.replace('T', ' ')}.`,
    meta: { appointment_id: row.id },
  });
  audit(req.user, 'appointment.reschedule', 'appointment', row.id, { previous, startAt });
  res.json(hydrate(get('SELECT * FROM appointments WHERE id = ?', row.id)));
});

/** Check-in (app ou QR code) */
router.post('/checkin/:token', (req, res) => {
  const row = get('SELECT * FROM appointments WHERE checkin_token = ?', req.params.token);
  if (!row) return res.status(404).json({ error: 'check-in inválido' });
  if (row.status === 'cancelado') return res.status(400).json({ error: 'agendamento cancelado' });
  if (!row.checked_in_at) {
    run('UPDATE appointments SET checked_in_at = ?, status = CASE WHEN status = ? THEN ? ELSE status END WHERE id = ?',
      toLocal(new Date()), 'pendente', 'confirmado', row.id);
    const proUser = get('SELECT user_id FROM professionals WHERE id = ?', row.professional_id);
    if (proUser) {
      notify({
        userId: proUser.user_id,
        type: 'checkin',
        channel: 'push',
        title: 'Cliente fez check-in',
        body: `${get('SELECT name FROM users WHERE id = ?', row.client_id).name} chegou para o atendimento das ${row.start_at.slice(11)}.`,
        meta: { appointment_id: row.id },
      });
    }
  }
  res.json(hydrate(get('SELECT * FROM appointments WHERE id = ?', row.id)));
});

router.get('/:id/qrcode', requireAuth, (req, res) => {
  const row = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'agendamento não encontrado' });
  res.json({ token: row.checkin_token, url: `/checkin/${row.checkin_token}`, code: row.code });
});

export default router;
