import { Router } from 'express';
import { all, get, run, uid, audit, parseJson, getSetting, setSetting } from '../db.js';
import { requireAuth, requireRole, hashPassword } from '../auth.js';
import { notify, templates } from '../lib/notify.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

/* ------------------------------- Unidades ------------------------------- */
router.get('/branches', (_req, res) => {
  res.json(all('SELECT * FROM branches ORDER BY name').map((b) => ({ ...b, settings: parseJson(b.settings, {}) })));
});

router.post('/branches', (req, res) => {
  const { name, slug, address, city, state, phone, settings } = req.body || {};
  if (!name) return res.status(400).json({ error: 'nome obrigatório' });
  const id = uid('brn_');
  run(
    'INSERT INTO branches (id, name, slug, address, city, state, phone, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    name,
    slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    address || null,
    city || null,
    state || null,
    phone || null,
    JSON.stringify(settings || { min_lead_minutes: 60, max_advance_days: 60, buffer_min: 5, day_capacity: 0 })
  );
  audit(req.user, 'branch.create', 'branch', id, { name });
  res.status(201).json(get('SELECT * FROM branches WHERE id = ?', id));
});

router.put('/branches/:id', (req, res) => {
  const branch = get('SELECT * FROM branches WHERE id = ?', req.params.id);
  if (!branch) return res.status(404).json({ error: 'unidade não encontrada' });
  const fields = ['name', 'address', 'city', 'state', 'phone', 'timezone', 'currency', 'locale', 'active'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(typeof req.body[f] === 'boolean' ? Number(req.body[f]) : req.body[f]);
    }
  }
  if (req.body?.settings) {
    sets.push('settings = ?');
    values.push(JSON.stringify({ ...parseJson(branch.settings, {}), ...req.body.settings }));
  }
  if (!sets.length) return res.status(400).json({ error: 'nada para atualizar' });
  run(`UPDATE branches SET ${sets.join(', ')} WHERE id = ?`, ...values, branch.id);
  audit(req.user, 'branch.update', 'branch', branch.id, req.body);
  res.json(get('SELECT * FROM branches WHERE id = ?', branch.id));
});

/* ------------------------------- Serviços ------------------------------- */
router.get('/services', (_req, res) => {
  res.json(all('SELECT * FROM services ORDER BY active DESC, category, name'));
});

router.post('/services', (req, res) => {
  const { name, description, category, duration_min, buffer_min, price_cents, image_url, branch_id, professional_ids = [] } = req.body || {};
  if (!name || !price_cents) return res.status(400).json({ error: 'nome e preço são obrigatórios' });
  const id = uid('svc_');
  run(
    `INSERT INTO services (id, branch_id, name, description, category, duration_min, buffer_min, price_cents, image_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    branch_id || get('SELECT id FROM branches LIMIT 1').id,
    name,
    description || null,
    category || 'cabelo',
    Number(duration_min || 30),
    Number(buffer_min || 5),
    Number(price_cents),
    image_url || null
  );
  for (const proId of professional_ids) {
    run('INSERT OR IGNORE INTO professional_services (professional_id, service_id) VALUES (?, ?)', proId, id);
  }
  audit(req.user, 'service.create', 'service', id, { name });
  res.status(201).json(get('SELECT * FROM services WHERE id = ?', id));
});

router.put('/services/:id', (req, res) => {
  const service = get('SELECT * FROM services WHERE id = ?', req.params.id);
  if (!service) return res.status(404).json({ error: 'serviço não encontrado' });
  const fields = ['name', 'description', 'category', 'duration_min', 'buffer_min', 'price_cents', 'image_url', 'active'];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (req.body?.[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(typeof req.body[f] === 'boolean' ? Number(req.body[f]) : req.body[f]);
    }
  }
  if (sets.length) run(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`, ...values, service.id);
  if (Array.isArray(req.body?.professional_ids)) {
    run('DELETE FROM professional_services WHERE service_id = ?', service.id);
    for (const proId of req.body.professional_ids) {
      run('INSERT OR IGNORE INTO professional_services (professional_id, service_id) VALUES (?, ?)', proId, service.id);
    }
  }
  audit(req.user, 'service.update', 'service', service.id, req.body);
  res.json(get('SELECT * FROM services WHERE id = ?', service.id));
});

router.delete('/services/:id', (req, res) => {
  run('UPDATE services SET active = 0 WHERE id = ?', req.params.id);
  audit(req.user, 'service.archive', 'service', req.params.id, {});
  res.json({ ok: true });
});

/* ----------------------------- Profissionais ---------------------------- */
router.get('/professionals', (_req, res) => {
  const rows = all(
    `SELECT p.*, u.name, u.email, u.phone, u.avatar_url FROM professionals p
     JOIN users u ON u.id = p.user_id ORDER BY p.active DESC, u.name`
  );
  res.json(
    rows.map((p) => ({
      ...p,
      specialties: parseJson(p.specialties, []),
      services: all('SELECT service_id FROM professional_services WHERE professional_id = ?', p.id).map((r) => r.service_id),
      working_hours: all('SELECT * FROM working_hours WHERE professional_id = ? ORDER BY weekday, start_min', p.id),
      time_off: all('SELECT * FROM time_off WHERE professional_id = ? AND end_at >= ? ORDER BY start_at', p.id, new Date().toISOString().slice(0, 10)),
    }))
  );
});

router.post('/professionals', (req, res) => {
  const { name, email, phone, bio, specialties = [], commission_pct = 40, branch_id, password = '123456', avatar_url } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'nome e e-mail são obrigatórios' });
  if (get('SELECT id FROM users WHERE email = ?', String(email).toLowerCase())) {
    return res.status(409).json({ error: 'e-mail já cadastrado' });
  }
  const userId = uid('usr_');
  const branchId = branch_id || get('SELECT id FROM branches LIMIT 1').id;
  run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, branch_id, avatar_url)
     VALUES (?, ?, ?, ?, ?, 'PROFESSIONAL', ?, ?)`,
    userId,
    name,
    String(email).toLowerCase(),
    phone || null,
    hashPassword(password),
    branchId,
    avatar_url || null
  );
  const id = uid('pro_');
  run(
    'INSERT INTO professionals (id, user_id, branch_id, bio, specialties, commission_pct) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    userId,
    branchId,
    bio || null,
    JSON.stringify(specialties),
    Number(commission_pct)
  );
  // horário padrão: terça a sábado 09:00-19:00 com almoço
  for (const weekday of [2, 3, 4, 5, 6]) {
    run(
      'INSERT INTO working_hours (id, professional_id, weekday, start_min, end_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('wh_'),
      id,
      weekday,
      540,
      1140,
      720,
      780
    );
  }
  audit(req.user, 'professional.create', 'professional', id, { name });
  res.status(201).json({ id, user_id: userId, name, email, branch_id: branchId });
});

router.put('/professionals/:id', (req, res) => {
  const pro = get('SELECT * FROM professionals WHERE id = ?', req.params.id);
  if (!pro) return res.status(404).json({ error: 'profissional não encontrado' });
  const { bio, specialties, commission_pct, active, avatar_url, phone, name } = req.body || {};
  if (bio !== undefined) run('UPDATE professionals SET bio = ? WHERE id = ?', bio, pro.id);
  if (specialties !== undefined) run('UPDATE professionals SET specialties = ? WHERE id = ?', JSON.stringify(specialties), pro.id);
  if (commission_pct !== undefined) run('UPDATE professionals SET commission_pct = ? WHERE id = ?', Number(commission_pct), pro.id);
  if (active !== undefined) run('UPDATE professionals SET active = ? WHERE id = ?', active ? 1 : 0, pro.id);
  if (avatar_url !== undefined) run('UPDATE users SET avatar_url = ? WHERE id = ?', avatar_url, pro.user_id);
  if (phone !== undefined) run('UPDATE users SET phone = ? WHERE id = ?', phone, pro.user_id);
  if (name !== undefined) run('UPDATE users SET name = ? WHERE id = ?', name, pro.user_id);
  if (Array.isArray(req.body?.service_ids)) {
    run('DELETE FROM professional_services WHERE professional_id = ?', pro.id);
    for (const sid of req.body.service_ids) {
      run('INSERT OR IGNORE INTO professional_services (professional_id, service_id) VALUES (?, ?)', pro.id, sid);
    }
  }
  audit(req.user, 'professional.update', 'professional', pro.id, req.body);
  res.json(get('SELECT * FROM professionals WHERE id = ?', pro.id));
});

/** Substitui a grade completa de horários recorrentes */
router.put('/professionals/:id/working-hours', (req, res) => {
  const pro = get('SELECT * FROM professionals WHERE id = ?', req.params.id);
  if (!pro) return res.status(404).json({ error: 'profissional não encontrado' });
  const hours = req.body?.working_hours || [];
  run('DELETE FROM working_hours WHERE professional_id = ?', pro.id);
  for (const h of hours) {
    run(
      'INSERT INTO working_hours (id, professional_id, weekday, start_min, end_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('wh_'),
      pro.id,
      Number(h.weekday),
      Number(h.start_min),
      Number(h.end_min),
      h.break_start ?? null,
      h.break_end ?? null
    );
  }
  audit(req.user, 'professional.working_hours', 'professional', pro.id, { count: hours.length });
  res.json(all('SELECT * FROM working_hours WHERE professional_id = ? ORDER BY weekday', pro.id));
});

router.post('/professionals/:id/time-off', (req, res) => {
  const pro = get('SELECT * FROM professionals WHERE id = ?', req.params.id);
  if (!pro) return res.status(404).json({ error: 'profissional não encontrado' });
  const { start_at, end_at, reason, kind = 'folga' } = req.body || {};
  if (!start_at || !end_at) return res.status(400).json({ error: 'informe início e fim' });
  const id = uid('tof_');
  run('INSERT INTO time_off (id, professional_id, start_at, end_at, reason, kind) VALUES (?, ?, ?, ?, ?, ?)', id, pro.id, start_at, end_at, reason || null, kind);
  const affected = all(
    `SELECT a.id, a.client_id, a.start_at FROM appointments a
     WHERE a.professional_id = ? AND a.status IN ('pendente','confirmado') AND a.start_at >= ? AND a.start_at < ?`,
    pro.id,
    start_at,
    end_at
  );
  for (const appt of affected) {
    notify({
      userId: appt.client_id,
      type: 'aviso_profissional',
      channel: 'sms',
      title: 'Precisamos remarcar seu horário',
      body: `O profissional ficou indisponível em ${appt.start_at.replace('T', ' ')}. Acesse o app para escolher um novo horário.`,
      meta: { appointment_id: appt.id },
    });
  }
  audit(req.user, 'professional.time_off', 'professional', pro.id, { start_at, end_at, kind, affected: affected.length });
  res.status(201).json({ id, affected_appointments: affected.length });
});

router.delete('/time-off/:id', (req, res) => {
  run('DELETE FROM time_off WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

/* -------------------------------- Clientes ------------------------------ */
router.get('/clients', (req, res) => {
  const search = req.query.q ? `%${String(req.query.q).toLowerCase()}%` : null;
  const rows = all(
    `SELECT u.id, u.name, u.email, u.phone, u.created_at, u.tags, c.id AS client_id,
            c.notes, c.tags AS client_tags, c.visits, c.total_spent_cents, c.no_shows, c.favorite_professional_id,
            (SELECT MAX(start_at) FROM appointments a WHERE a.client_id = u.id) AS last_visit,
            (SELECT MIN(start_at) FROM appointments a WHERE a.client_id = u.id AND a.status IN ('confirmado','pendente') AND a.start_at >= datetime('now')) AS next_visit
     FROM users u JOIN clients c ON c.user_id = u.id
     WHERE u.role = 'CLIENT' AND (? IS NULL OR LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ?)
     ORDER BY c.total_spent_cents DESC`,
    search,
    search,
    search,
    search
  );
  res.json(rows.map((r) => ({ ...r, tags: parseJson(r.client_tags, parseJson(r.tags, [])), notes: parseJson(r.notes, []) })));
});

router.get('/clients/:id', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ? OR user_id = ?', req.params.id, req.params.id);
  if (!client) return res.status(404).json({ error: 'cliente não encontrado' });
  const user = get('SELECT id, name, email, phone, birthday, document, preferences, created_at FROM users WHERE id = ?', client.user_id);
  const appointments = all(
    `SELECT a.*, u.name AS professional_name FROM appointments a
     JOIN professionals p ON p.id = a.professional_id JOIN users u ON u.id = p.user_id
     WHERE a.client_id = ? ORDER BY a.start_at DESC LIMIT 40`,
    client.user_id
  );
  res.json({
    ...client,
    notes: parseJson(client.notes, []),
    tags: parseJson(client.tags, []),
    user: { ...user, preferences: parseJson(user.preferences, {}) },
    appointments,
    payments: all('SELECT * FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', client.user_id),
  });
});

router.post('/clients/:id/notes', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ? OR user_id = ?', req.params.id, req.params.id);
  if (!client) return res.status(404).json({ error: 'cliente não encontrado' });
  const notes = parseJson(client.notes, []);
  const note = {
    id: uid('note_'),
    author: req.user.name,
    body: req.body?.body || '',
    photo_url: req.body?.photo_url || null,
    created_at: new Date().toISOString(),
  };
  notes.unshift(note);
  run('UPDATE clients SET notes = ? WHERE id = ?', JSON.stringify(notes), client.id);
  res.status(201).json(note);
});

router.put('/clients/:id/tags', (req, res) => {
  const client = get('SELECT * FROM clients WHERE id = ? OR user_id = ?', req.params.id, req.params.id);
  if (!client) return res.status(404).json({ error: 'cliente não encontrado' });
  run('UPDATE clients SET tags = ? WHERE id = ?', JSON.stringify(req.body?.tags || []), client.id);
  res.json({ tags: req.body?.tags || [] });
});

/* ------------------------------ Cupons/Planos --------------------------- */
router.get('/coupons', (_req, res) => res.json(all('SELECT * FROM coupons ORDER BY created_at DESC')));

router.post('/coupons', (req, res) => {
  const { code, type = 'percent', value, min_cents = 0, usage_limit = 100, expires_at } = req.body || {};
  if (!code || !value) return res.status(400).json({ error: 'código e valor obrigatórios' });
  const id = uid('cpn_');
  run(
    'INSERT INTO coupons (id, code, type, value, min_cents, usage_limit, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    String(code).toUpperCase(),
    type,
    Number(value),
    Number(min_cents),
    Number(usage_limit),
    expires_at || null
  );
  res.status(201).json(get('SELECT * FROM coupons WHERE id = ?', id));
});

router.put('/coupons/:id', (req, res) => {
  run('UPDATE coupons SET active = ? WHERE id = ?', req.body?.active ? 1 : 0, req.params.id);
  res.json(get('SELECT * FROM coupons WHERE id = ?', req.params.id));
});

router.get('/plans', (_req, res) => res.json(all('SELECT * FROM plans').map((p) => ({ ...p, perks: parseJson(p.perks, []) }))));

router.post('/plans', (req, res) => {
  const { name, price_cents, billing = 'mensal', discount_pct = 10, credits = 4, perks = [] } = req.body || {};
  if (!name || !price_cents) return res.status(400).json({ error: 'nome e preço obrigatórios' });
  const id = uid('pln_');
  run(
    'INSERT INTO plans (id, branch_id, name, price_cents, billing, discount_pct, credits, perks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    get('SELECT id FROM branches LIMIT 1').id,
    name,
    Number(price_cents),
    billing,
    Number(discount_pct),
    Number(credits),
    JSON.stringify(perks)
  );
  res.status(201).json(get('SELECT * FROM plans WHERE id = ?', id));
});

/* ------------------------------ Campanhas ------------------------------- */
router.get('/campaigns', (_req, res) => res.json(all('SELECT * FROM campaigns ORDER BY created_at DESC')));

router.post('/campaigns', (req, res) => {
  const { name, channel = 'email', segment = 'todos', body } = req.body || {};
  if (!name || !body) return res.status(400).json({ error: 'nome e mensagem obrigatórios' });
  const conditions = {
    todos: '',
    inativos: `AND julianday('now') - julianday(COALESCE((SELECT MAX(start_at) FROM appointments a WHERE a.client_id = u.id AND a.start_at <= datetime('now','localtime')), '2020-01-01')) > 45`,
    vip: `AND (SELECT SUM(total_cents) FROM appointments a WHERE a.client_id = u.id AND a.status='concluido') > 20000`,
    aniversariantes: `AND CAST(strftime('%m', u.birthday) AS INTEGER) = CAST(strftime('%m','now') AS INTEGER)`,
  };
  const recipients = all(`SELECT u.id FROM users u WHERE u.role = 'CLIENT' ${conditions[segment] || ''}`);
  const id = uid('cmp_');
  run('INSERT INTO campaigns (id, name, channel, segment, body, recipients) VALUES (?, ?, ?, ?, ?, ?)', id, name, channel, segment, body, recipients.length);
  for (const r of recipients.slice(0, 50)) {
    notify({ userId: r.id, type: 'campanha', channel, title: name, body, meta: { campaign_id: id } });
  }
  audit(req.user, 'campaign.send', 'campaign', id, { segment, recipients: recipients.length });
  res.status(201).json(get('SELECT * FROM campaigns WHERE id = ?', id));
});

/* --------------------------- Templates/Config --------------------------- */
router.get('/notification-templates', (_req, res) => res.json(templates()));

router.put('/notification-templates/:id', (req, res) => {
  const { subject, body, active } = req.body || {};
  run(
    'UPDATE notification_templates SET subject = COALESCE(?, subject), body = COALESCE(?, body), active = COALESCE(?, active) WHERE id = ?',
    subject ?? null,
    body ?? null,
    active === undefined ? null : active ? 1 : 0,
    req.params.id
  );
  res.json(get('SELECT * FROM notification_templates WHERE id = ?', req.params.id));
});

router.get('/settings', (_req, res) => {
  res.json({
    business: getSetting('business', {}),
    policies: getSetting('policies', {}),
    integrations: getSetting('integrations', {}),
    users: all('SELECT id, name, email, role, branch_id FROM users WHERE role IN (\'ADMIN\',\'PROFESSIONAL\')'),
  });
});

router.put('/settings', (req, res) => {
  for (const key of ['business', 'policies', 'integrations']) {
    if (req.body?.[key]) setSetting(key, { ...getSetting(key, {}), ...req.body[key] });
  }
  audit(req.user, 'settings.update', 'settings', 'global', req.body);
  res.json({ ok: true, integrations: getSetting('integrations', {}) });
});

router.get('/audit-logs', (req, res) => {
  const limit = Number(req.query.limit || 100);
  res.json(all('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?', limit).map((r) => ({ ...r, payload: parseJson(r.payload, {}) })));
});

router.post('/users', (req, res) => {
  const { name, email, role = 'PROFESSIONAL', password = '123456', branch_id, phone } = req.body || {};
  if (!['ADMIN', 'PROFESSIONAL'].includes(role)) return res.status(400).json({ error: 'perfil inválido' });
  if (get('SELECT id FROM users WHERE email = ?', String(email).toLowerCase())) return res.status(409).json({ error: 'e-mail já cadastrado' });
  const id = uid('usr_');
  run(
    'INSERT INTO users (id, name, email, phone, password_hash, role, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    name,
    String(email).toLowerCase(),
    phone || null,
    hashPassword(password),
    role,
    branch_id || get('SELECT id FROM branches LIMIT 1').id
  );
  if (role === 'PROFESSIONAL') {
    run('INSERT INTO professionals (id, user_id, branch_id, specialties) VALUES (?, ?, ?, ?)', uid('pro_'), id, branch_id || get('SELECT id FROM branches LIMIT 1').id, '[]');
  }
  audit(req.user, 'user.create', 'user', id, { role });
  res.status(201).json(get('SELECT id, name, email, role FROM users WHERE id = ?', id));
});

export default router;
