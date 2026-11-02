import { Router } from 'express';
import { all, get, run, uid, audit } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { notify } from '../lib/notify.js';

const router = Router();

router.get('/', (req, res) => {
  const { professional_id: proId, limit = 20 } = req.query;
  res.json(
    all(
      `SELECT r.*, u.name AS client_name, u.avatar_url, pu.name AS professional_name
       FROM reviews r
       JOIN users u ON u.id = r.client_id
       JOIN professionals p ON p.id = r.professional_id
       JOIN users pu ON pu.id = p.user_id
       WHERE (? IS NULL OR r.professional_id = ?)
       ORDER BY r.created_at DESC LIMIT ?`,
      proId || null,
      proId || null,
      Number(limit)
    )
  );
});

router.post('/', requireAuth, (req, res) => {
  const { appointment_id: appointmentId, rating, comment } = req.body || {};
  const appt = get('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!appt) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (appt.client_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });
  if (appt.status !== 'concluido') return res.status(400).json({ error: 'avalie apenas atendimentos concluídos' });
  if (get('SELECT id FROM reviews WHERE appointment_id = ?', appointmentId)) {
    return res.status(409).json({ error: 'atendimento já avaliado' });
  }
  const stars = Math.min(5, Math.max(1, Number(rating) || 5));
  const id = uid('rev_');
  run(
    'INSERT INTO reviews (id, appointment_id, client_id, professional_id, rating, comment) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    appointmentId,
    req.user.sub,
    appt.professional_id,
    stars,
    comment || null
  );
  const agg = get('SELECT AVG(rating) AS avg FROM reviews WHERE professional_id = ?', appt.professional_id);
  run('UPDATE professionals SET rating = ? WHERE id = ?', Number(agg.avg.toFixed(2)), appt.professional_id);
  audit(req.user, 'review.create', 'review', id, { rating: stars });
  res.status(201).json(get('SELECT * FROM reviews WHERE id = ?', id));
});

router.post('/:id/reply', requireAuth, requireRole('ADMIN', 'PROFESSIONAL'), (req, res) => {
  run('UPDATE reviews SET reply = ? WHERE id = ?', req.body?.reply || '', req.params.id);
  res.json(get('SELECT * FROM reviews WHERE id = ?', req.params.id));
});

export default router;
