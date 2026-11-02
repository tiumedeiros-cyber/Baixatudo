import { all, get, run, uid, parseJson, getSetting } from '../db.js';

/**
 * Central de notificações — grava no banco (in-app) e simula o disparo
 * pelos canais externos (e-mail/SMS/push). Em produção, basta trocar o
 * bloco `deliver()` por SendGrid/Twilio/Web Push.
 */
export function notify({ userId, type, title, body, channel = 'inapp', meta = {} }) {
  const settings = getSetting('integrations', {});
  const channels = new Set(['inapp', channel]);

  const created = [];
  for (const ch of channels) {
    const enabled =
      ch === 'inapp' ||
      (ch === 'email' && settings.email_enabled !== false) ||
      (ch === 'sms' && settings.sms_enabled === true) ||
      (ch === 'push' && settings.push_enabled === true);
    if (!enabled) continue;

    const id = uid('ntf_');
    run(
      `INSERT INTO notifications (id, user_id, channel, type, title, body, status, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      userId,
      ch,
      type,
      title,
      body,
      'enviado',
      JSON.stringify(meta)
    );
    created.push(id);
  }

  deliver({ userId, type, title, body, channel, meta });
  return created;
}

function deliver(payload) {
  // "Outbox" observável: em dev os disparos aparecem no log do servidor.
  if (process.env.NOTIFY_LOG !== 'false') {
    console.log(`[notify:${payload.channel}] ${payload.title} → ${payload.userId}`);
  }
}

export const notifyMany = (items) => items.map((item) => notify(item));

export const listNotifications = (userId, { limit = 60 } = {}) =>
  all('SELECT * FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?', userId, limit).map(parseMeta);

export const unreadCount = (userId) =>
  get('SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL', userId)?.total || 0;

export const markRead = (userId, id = null) => {
  if (id) {
    run('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?', new Date().toISOString(), id, userId);
  } else {
    run('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL', new Date().toISOString(), userId);
  }
};

export const templates = () => all('SELECT * FROM notification_templates ORDER BY key, channel');

export const renderTemplate = (key, vars = {}) => {
  const tpl = get('SELECT * FROM notification_templates WHERE key = ? LIMIT 1', key);
  if (!tpl) return { subject: key, body: '' };
  return {
    subject: tpl.subject || key,
    body: tpl.body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? ''),
    template_id: tpl.id,
  };
};

export const parseMeta = (row) => ({ ...row, meta: parseJson(row.meta, {}) });
