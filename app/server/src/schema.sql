-- Navalha · esquema relacional (SQLite)
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  phone TEXT,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  currency TEXT DEFAULT 'BRL',
  locale TEXT DEFAULT 'pt-BR',
  active INTEGER DEFAULT 1,
  settings TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'CLIENT', -- CLIENT | PROFESSIONAL | ADMIN
  branch_id TEXT REFERENCES branches(id),
  avatar_url TEXT,
  locale TEXT DEFAULT 'pt-BR',
  birthday TEXT,
  document TEXT,
  preferences TEXT DEFAULT '{}',
  tags TEXT DEFAULT '[]',
  oauth_provider TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT DEFAULT 'login',
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS professionals (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  bio TEXT,
  specialties TEXT DEFAULT '[]',
  commission_pct REAL DEFAULT 40,
  rating REAL DEFAULT 5,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'cabelo',
  duration_min INTEGER NOT NULL DEFAULT 30,
  buffer_min INTEGER NOT NULL DEFAULT 5,
  price_cents INTEGER NOT NULL DEFAULT 0,
  image_url TEXT,
  active INTEGER DEFAULT 1,
  required_professional_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS professional_services (
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (professional_id, service_id)
);

CREATE TABLE IF NOT EXISTS working_hours (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL, -- 0 domingo .. 6 sábado
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  break_start INTEGER,
  break_end INTEGER
);

CREATE TABLE IF NOT EXISTS time_off (
  id TEXT PRIMARY KEY,
  professional_id TEXT NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL, -- YYYY-MM-DDTHH:MM (hora local)
  end_at TEXT NOT NULL,
  reason TEXT,
  kind TEXT DEFAULT 'folga' -- folga | ferias | bloqueio
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT,
  notes TEXT DEFAULT '[]', -- [{id, author, body, photo_url, created_at}]
  tags TEXT DEFAULT '[]',
  favorite_professional_id TEXT,
  total_spent_cents INTEGER DEFAULT 0,
  visits INTEGER DEFAULT 0,
  no_shows INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  branch_id TEXT,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  billing TEXT DEFAULT 'mensal',
  discount_pct INTEGER DEFAULT 10,
  credits INTEGER DEFAULT 4,
  perks TEXT DEFAULT '[]',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT DEFAULT 'ativa',
  started_at TEXT DEFAULT (datetime('now')),
  renews_at TEXT
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'percent', -- percent | fixed
  value INTEGER NOT NULL,
  min_cents INTEGER DEFAULT 0,
  usage_limit INTEGER DEFAULT 100,
  used_count INTEGER DEFAULT 0,
  expires_at TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  branch_id TEXT NOT NULL,
  client_id TEXT NOT NULL REFERENCES users(id),
  professional_id TEXT NOT NULL REFERENCES professionals(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmado', -- pendente | confirmado | em_atendimento | concluido | cancelado | no_show
  payment_status TEXT DEFAULT 'pendente', -- pendente | pago | autorizado | reembolsado | cancelado
  subtotal_cents INTEGER DEFAULT 0,
  discount_cents INTEGER DEFAULT 0,
  total_cents INTEGER DEFAULT 0,
  coupon_code TEXT,
  notes TEXT,
  internal_notes TEXT,
  checkin_token TEXT,
  checked_in_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  source TEXT DEFAULT 'site',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS appointment_items (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL,
  name TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  position INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE CASCADE,
  user_id TEXT,
  method TEXT NOT NULL, -- card | pix | boleto | onsite | preauth
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | pago | autorizado | reembolsado | cancelado | falhou
  preauth INTEGER DEFAULT 0,
  transaction_id TEXT,
  refunded_cents INTEGER DEFAULT 0,
  gateway TEXT DEFAULT 'navalha-pay',
  raw TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  appointment_id TEXT UNIQUE NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  reply TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'inapp', -- inapp | email | sms | push
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  status TEXT DEFAULT 'enviado', -- enviado | pendente | falhou
  read_at TEXT,
  meta TEXT DEFAULT '{}',
  sent_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL,
  channel TEXT NOT NULL,
  locale TEXT DEFAULT 'pt-BR',
  subject TEXT,
  body TEXT NOT NULL,
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT DEFAULT 'email',
  segment TEXT DEFAULT 'todos',
  body TEXT,
  recipients INTEGER DEFAULT 0,
  status TEXT DEFAULT 'enviada',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  actor_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  payload TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_appointments_pro ON appointments(professional_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id, start_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, sent_at);
