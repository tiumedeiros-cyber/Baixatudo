import { Router } from 'express';
import { all, get, run, uid, nowIso } from '../db.js';
import {
  hashPassword,
  verifyPassword,
  signAccess,
  signRefresh,
  rotateRefresh,
  revokeRefresh,
  requireAuth,
  publicUser,
} from '../auth.js';
import { notify } from '../lib/notify.js';

const router = Router();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
const normalizePhone = (phone) => String(phone || '').replace(/\D/g, '');

const issue = (user) => ({
  user: publicUser(user),
  access_token: signAccess(user),
  refresh_token: signRefresh(user).token,
  token_type: 'Bearer',
  expires_in: 7200,
});

function createUser({ name, email, phone, password, role = 'CLIENT', branch_id, oauth_provider, locale = 'pt-BR' }) {
  const branch = branch_id || get('SELECT id FROM branches ORDER BY created_at LIMIT 1')?.id || null;
  const id = uid('usr_');
  run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, branch_id, oauth_provider, locale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name,
    email,
    phone || null,
    password ? hashPassword(password) : null,
    role,
    branch,
    oauth_provider || null,
    locale
  );
  if (role === 'CLIENT') {
    run('INSERT INTO clients (id, user_id, branch_id) VALUES (?, ?, ?)', uid('cli_'), id, branch);
  }
  return get('SELECT * FROM users WHERE id = ?', id);
}

router.post('/register', (req, res) => {
  const { name, email, phone, password, locale } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'nome, e-mail e senha são obrigatórios' });
  if (String(password).length < 6) return res.status(400).json({ error: 'a senha deve ter ao menos 6 caracteres' });
  const existing = get('SELECT id FROM users WHERE email = ?', normalizeEmail(email));
  if (existing) return res.status(409).json({ error: 'e-mail já cadastrado' });

  const user = createUser({ name, email: normalizeEmail(email), phone, password, locale });
  notify({
    userId: user.id,
    type: 'boas_vindas',
    channel: 'email',
    title: 'Bem-vindo à Navalha 💈',
    body: `Olá ${name}, sua conta foi criada. Agende seu primeiro corte e ganhe 10% com o cupom BEMVINDO10.`,
  });
  res.status(201).json(issue(user));
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = get('SELECT * FROM users WHERE email = ?', normalizeEmail(email));
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'credenciais inválidas' });
  }
  res.json(issue(user));
});

/** Login social — em produção trocaria o `provider_token` pela verificação OAuth2 real. */
router.post('/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  const { email, name, provider_token } = req.body || {};
  if (!['google', 'facebook'].includes(provider)) return res.status(400).json({ error: 'provedor não suportado' });
  if (!email && !provider_token) return res.status(400).json({ error: 'informe email ou provider_token' });

  const mail = normalizeEmail(email || `${provider}_${String(provider_token).slice(0, 8)}@navalha.app`);
  let user = get('SELECT * FROM users WHERE email = ?', mail);
  if (!user) {
    user = createUser({ name: name || mail.split('@')[0], email: mail, oauth_provider: provider, password: null });
  }
  res.json(issue(user));
});

/** OTP via SMS — o código é devolvido em `debug_code` apenas fora de produção. */
router.post('/otp/request', (req, res) => {
  const raw = req.body?.phone || req.body?.identifier;
  if (!raw) return res.status(400).json({ error: 'informe o telefone' });
  const phone = normalizePhone(raw);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 5 * 60000).toISOString();
  run('INSERT INTO otp_codes (id, identifier, code, purpose, expires_at) VALUES (?, ?, ?, ?, ?)', uid('otp_'), phone, code, 'login', expires);
  console.log(`[sms] código OTP para ${phone}: ${code}`);
  res.json({
    ok: true,
    phone,
    expires_at: expires,
    ...(process.env.NODE_ENV === 'production' ? {} : { debug_code: code }),
  });
});

router.post('/otp/verify', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const { code, name } = req.body || {};
  const row = get(
    'SELECT * FROM otp_codes WHERE identifier = ? AND code = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
    phone,
    String(code || '')
  );
  if (!row || row.expires_at < nowIso()) return res.status(401).json({ error: 'código inválido ou expirado' });
  run('UPDATE otp_codes SET consumed_at = ? WHERE id = ?', nowIso(), row.id);

  let user = get('SELECT * FROM users WHERE phone = ?', phone);
  if (!user) {
    user = createUser({
      name: name || `Cliente ${phone.slice(-4)}`,
      email: `tel_${phone}@navalha.app`,
      phone,
      password: null,
    });
  }
  res.json(issue(user));
});

router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  const rotated = rotateRefresh(refresh_token);
  if (!rotated) return res.status(401).json({ error: 'refresh token inválido' });
  res.json({
    user: publicUser(rotated.user),
    access_token: signAccess(rotated.user),
    refresh_token: rotated.refresh.token,
    token_type: 'Bearer',
    expires_in: 7200,
  });
});

router.post('/logout', (req, res) => {
  if (req.body?.refresh_token) revokeRefresh(req.body.refresh_token);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.sub);
  if (!user) return res.status(404).json({ error: 'usuário não encontrado' });
  res.json(publicUser(user));
});

router.patch('/me', requireAuth, (req, res) => {
  const allowed = ['name', 'phone', 'avatar_url', 'locale', 'birthday', 'document'];
  const sets = [];
  const values = [];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(req.body[key]);
    }
  }
  if (req.body?.preferences) {
    sets.push('preferences = ?');
    values.push(JSON.stringify(req.body.preferences));
  }
  if (!sets.length) return res.status(400).json({ error: 'nada para atualizar' });
  values.push(req.user.sub);
  run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...values);
  res.json(publicUser(get('SELECT * FROM users WHERE id = ?', req.user.sub)));
});

router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.sub);
  if (user.password_hash && !verifyPassword(current_password, user.password_hash)) {
    return res.status(400).json({ error: 'senha atual incorreta' });
  }
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'nova senha muito curta' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(new_password), user.id);
  res.json({ ok: true });
});

/** Contas de demonstração exibidas na tela de login */
router.get('/demo-accounts', (_req, res) => {
  res.json(
    all(
      `SELECT u.email, u.role, u.name FROM users u WHERE u.email IN ('admin@navalha.app','barbeiro@navalha.app','cliente@navalha.app')`
    ).map((u) => ({ ...u, password: '123456' }))
  );
});

export default router;
