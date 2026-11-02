import { Router } from 'express';
import { all, get } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';

const router = Router();
router.use(requireAuth, requireRole('ADMIN', 'PROFESSIONAL'));

const range = (req) => {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const from = req.query.from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return { from, to };
};

router.get('/dashboard', (req, res) => {
  const { from, to } = range(req);
  const done = all(
    `SELECT * FROM appointments WHERE status = 'concluido' AND start_at >= ? AND start_at <= ?`,
    `${from}T00:00`,
    `${to}T23:59`
  );
  const allRange = all('SELECT * FROM appointments WHERE start_at >= ? AND start_at <= ?', `${from}T00:00`, `${to}T23:59`);
  const revenue = done.reduce((s, a) => s + a.total_cents, 0);
  const canceled = allRange.filter((a) => a.status === 'cancelado').length;
  const noShow = allRange.filter((a) => a.status === 'no_show').length;
  const ticket = done.length ? Math.round(revenue / done.length) : 0;

  const byDay = {};
  for (const a of done) {
    const day = a.start_at.slice(0, 10);
    byDay[day] = (byDay[day] || 0) + a.total_cents;
  }

  const topServices = all(
    `SELECT ai.name, COUNT(*) AS qty, SUM(ai.price_cents) AS revenue
     FROM appointment_items ai JOIN appointments a ON a.id = ai.appointment_id
     WHERE a.status = 'concluido' AND a.start_at >= ? AND a.start_at <= ?
     GROUP BY ai.name ORDER BY revenue DESC LIMIT 6`,
    `${from}T00:00`,
    `${to}T23:59`
  );

  const occupancy = all(
    `SELECT p.id, u.name, COUNT(a.id) AS atendimentos, COALESCE(SUM(a.total_cents), 0) AS revenue,
            COALESCE(AVG(r.rating), 0) AS rating
     FROM professionals p JOIN users u ON u.id = p.user_id
     LEFT JOIN appointments a ON a.professional_id = p.id AND a.status = 'concluido' AND a.start_at >= ? AND a.start_at <= ?
     LEFT JOIN reviews r ON r.professional_id = p.id
     GROUP BY p.id ORDER BY atendimentos DESC`,
    `${from}T00:00`,
    `${to}T23:59`
  );

  const paymentMethods = all(
    `SELECT method, COUNT(*) AS qty, SUM(amount_cents) AS total FROM payments
     WHERE status = 'pago' AND created_at >= ? GROUP BY method`,
    from
  );

  const clientCount = get('SELECT COUNT(*) AS total FROM clients')?.total || 0;
  const newClients = get('SELECT COUNT(*) AS total FROM clients WHERE created_at >= ?', from)?.total || 0;
  const avgRating = get('SELECT AVG(rating) AS avg FROM reviews')?.avg || 0;
  const todayAppointments = all(
    `SELECT a.*, u.name AS client_name FROM appointments a JOIN users u ON u.id = a.client_id
     WHERE a.start_at LIKE ? AND a.status NOT IN ('cancelado') ORDER BY a.start_at`,
    `${new Date().toISOString().slice(0, 10)}%`
  );

  res.json({
    range: { from, to },
    revenue_cents: revenue,
    appointments_done: done.length,
    appointments_total: allRange.length,
    cancel_rate: allRange.length ? Number(((canceled / allRange.length) * 100).toFixed(1)) : 0,
    no_show_rate: allRange.length ? Number(((noShow / allRange.length) * 100).toFixed(1)) : 0,
    avg_ticket_cents: ticket,
    revenue_by_day: Object.entries(byDay).map(([date, cents]) => ({ date, cents })).sort((a, b) => a.date.localeCompare(b.date)),
    top_services: topServices,
    occupancy,
    payment_methods: paymentMethods,
    clients: { total: clientCount, new: newClients },
    avg_rating: Number(Number(avgRating).toFixed(2)),
    today_appointments: todayAppointments,
  });
});

router.get('/finance', (req, res) => {
  const { from, to } = range(req);
  const rows = all(
    `SELECT date(a.start_at) AS day,
            SUM(a.total_cents) AS gross,
            SUM(a.discount_cents) AS discounts,
            COUNT(*) AS appointments
     FROM appointments a WHERE a.status = 'concluido' AND a.start_at >= ? AND a.start_at <= ?
     GROUP BY day ORDER BY day`,
    `${from}T00:00`,
    `${to}T23:59`
  );
  const refunded = get(
    `SELECT COALESCE(SUM(refunded_cents), 0) AS total FROM payments WHERE updated_at >= ?`,
    from
  )?.total || 0;
  const byMethod = all(
    `SELECT method, COALESCE(SUM(amount_cents),0) AS total, COUNT(*) AS qty FROM payments
     WHERE status IN ('pago','autorizado') AND created_at >= ? GROUP BY method`,
    from
  );
  const commissions = all(
    `SELECT u.name, p.commission_pct, COALESCE(SUM(a.total_cents),0) AS revenue,
            ROUND(COALESCE(SUM(a.total_cents),0) * p.commission_pct / 100.0) AS commission
     FROM professionals p JOIN users u ON u.id = p.user_id
     LEFT JOIN appointments a ON a.professional_id = p.id AND a.status='concluido' AND a.start_at >= ? AND a.start_at <= ?
     GROUP BY p.id ORDER BY revenue DESC`,
    `${from}T00:00`,
    `${to}T23:59`
  );
  res.json({
    from,
    to,
    daily: rows,
    refunded_cents: refunded,
    gross_cents: rows.reduce((s, r) => s + r.gross, 0),
    discounts_cents: rows.reduce((s, r) => s + r.discounts, 0),
    by_method: byMethod,
    commissions,
  });
});

router.get('/occupancy', (req, res) => {
  const { from, to } = range(req);
  const rows = all(
    `SELECT p.id, u.name,
            COUNT(a.id) AS appointments,
            COALESCE(SUM(CASE WHEN a.status='concluido' THEN 1 ELSE 0 END), 0) AS done,
            COALESCE(SUM(CASE WHEN a.status='cancelado' THEN 1 ELSE 0 END), 0) AS canceled,
            COALESCE(SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END), 0) AS no_shows
     FROM professionals p JOIN users u ON u.id = p.user_id
     LEFT JOIN appointments a ON a.professional_id = p.id AND a.start_at >= ? AND a.start_at <= ?
     GROUP BY p.id ORDER BY appointments DESC`,
    `${from}T00:00`,
    `${to}T23:59`
  );
  const capacityHours = 8 * 6; // 8h/dia, 6 dias — referência para % de ocupação
  res.json(
    rows.map((r) => ({
      ...r,
      occupancy_pct: Number(Math.min(100, (r.done / (capacityHours / 30)) * 100).toFixed(1)),
    }))
  );
});

export default router;
