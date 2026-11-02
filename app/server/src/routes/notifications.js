import { Router } from 'express';
import { all, get, run, uid, parseJson } from '../db.js';
import { requireAuth } from '../auth.js';
import { listNotifications, unreadCount, markRead, parseMeta } from '../lib/notify.js';

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json({ unread: unreadCount(req.user.sub), items: listNotifications(req.user.sub, { limit: Number(req.query.limit || 60) }) });
});

router.post('/read', requireAuth, (req, res) => {
  markRead(req.user.sub, req.body?.id || null);
  res.json({ ok: true, unread: unreadCount(req.user.sub) });
});

/** Solicitação de Web Push — em produção o servidor guardaria a subscription e usaria web-push. */
router.post('/push/subscribe', requireAuth, (req, res) => {
  const existing = parseJson(get('SELECT preferences FROM users WHERE id = ?', req.user.sub)?.preferences, {});
  run(
    'UPDATE users SET preferences = ? WHERE id = ?',
    JSON.stringify({ ...existing, push_subscription: req.body?.subscription || null, push_enabled: true }),
    req.user.sub
  );
  res.json({ ok: true });
});

router.get('/clients', requireAuth, (req, res) => {
  if (req.user.role === 'CLIENT') return res.status(403).json({ error: 'sem permissão' });
  res.json(
    all(
      `SELECT c.*, u.name, u.email, u.phone FROM clients c JOIN users u ON u.id = c.user_id
       WHERE (? IS NULL OR c.branch_id = ?) ORDER BY u.name`,
      req.query.branch || null,
      req.query.branch || null
    ).map((c) => ({ ...c, notes: parseJson(c.notes, []), tags: parseJson(c.tags, []) }))
  );
});

export default router;
