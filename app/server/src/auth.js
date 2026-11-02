import jwt from 'jsonwebtoken';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';
import { get, run, uid } from './db.js';

const SECRET = process.env.JWT_SECRET || 'navalha-dev-secret-change-in-production';
export const ACCESS_TTL = '2h';
export const REFRESH_TTL_DAYS = 30;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function signAccess(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name, email: user.email, branch_id: user.branch_id },
    SECRET,
    { expiresIn: ACCESS_TTL }
  );
}

export function signRefresh(user) {
  const token = randomUUID();
  const expires = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000).toISOString();
  run('INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)', uid('rt_'), user.id, token, expires);
  return { token, expires_at: expires };
}

export function rotateRefresh(token) {
  const row = get('SELECT * FROM refresh_tokens WHERE token = ? AND revoked_at IS NULL', token);
  if (!row || row.expires_at < new Date().toISOString()) return null;
  const user = get('SELECT * FROM users WHERE id = ?', row.user_id);
  if (!user) return null;
  run('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?', new Date().toISOString(), row.id);
  return { user, refresh: signRefresh(user) };
}

export function revokeRefresh(token) {
  run('UPDATE refresh_tokens SET revoked_at = ? WHERE token = ?', new Date().toISOString(), token);
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'não autenticado' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'token inválido ou expirado' });
  }
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'não autenticado' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'sem permissão' });
  next();
};

export const optionalAuth = (req, _res, next) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), SECRET);
    } catch {
      /* segue anônimo */
    }
  }
  next();
};

export const publicUser = (user) => {
  if (!user) return null;
  const client = get('SELECT * FROM clients WHERE user_id = ?', user.id);
  const professional = get('SELECT * FROM professionals WHERE user_id = ?', user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    branch_id: user.branch_id,
    avatar_url: user.avatar_url,
    locale: user.locale,
    birthday: user.birthday,
    document: user.document,
    preferences: JSON.parse(user.preferences || '{}'),
    tags: JSON.parse(user.tags || '[]'),
    client_id: client?.id || null,
    professional_id: professional?.id || null,
    created_at: user.created_at,
  };
};
