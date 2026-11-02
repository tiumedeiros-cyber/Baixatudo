import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Serverless (Vercel/Lambda) não tem disco persistente: usamos /tmp.
if (process.env.VERCEL && !process.env.DATA_DIR) process.env.DATA_DIR = '/tmp/navalha-data';

const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH || join(DATA_DIR, 'navalha.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(readFileSync(join(__dirname, 'schema.sql'), 'utf8'));

export const uid = (prefix = '') => prefix + randomUUID().replace(/-/g, '').slice(0, 20);

export const nowIso = () => new Date().toISOString();
export const todayLocal = (d = new Date()) => localDate(d);
export const localDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const localDateTime = (d) => `${localDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const get = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export const parseJson = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const getSetting = (key, fallback = null) => {
  const row = get('SELECT value FROM settings WHERE key = ?', key);
  return row ? parseJson(row.value, fallback) : fallback;
};

export const setSetting = (key, value) =>
  run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    key,
    JSON.stringify(value),
    nowIso()
  );

export const audit = (actor, action, entity, entityId, payload = {}) =>
  run(
    'INSERT INTO audit_logs (id, actor_id, actor_name, action, entity, entity_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('log_'),
    actor?.id || null,
    actor?.name || 'sistema',
    action,
    entity,
    entityId,
    JSON.stringify(payload)
  );

export const dbPath = DB_PATH;

/** Popula o banco de demonstração se estiver vazio (usado no cold start serverless). */
export async function ensureSeeded() {
  const hasUsers = db.prepare('SELECT COUNT(*) AS total FROM users').get()?.total > 0;
  if (hasUsers) return false;
  console.log('[db] banco vazio — executando seed de demonstração');
  process.argv.push('--force');
  await import('./seed.js');
  return true;
}
