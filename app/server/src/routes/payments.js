import { Router } from 'express';
import { get, run } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { createPaymentIntent, refundPayment, capturePreauth, listPayments, handleWebhook } from '../lib/payments.js';
import { hydrate } from './appointments.js';

const router = Router();

router.get('/', requireAuth, requireRole('ADMIN'), (req, res) => {
  res.json(listPayments(req.query));
});

router.post('/', requireAuth, (req, res) => {
  const { appointment_id: appointmentId, method, card } = req.body || {};
  const appt = get('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!appt) return res.status(404).json({ error: 'agendamento não encontrado' });
  if (req.user.role === 'CLIENT' && appt.client_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });
  if (appt.payment_status === 'pago') return res.status(400).json({ error: 'agendamento já pago' });

  const payment = createPaymentIntent({
    appointmentId,
    userId: appt.client_id,
    method: method || 'card',
    amount: appt.total_cents,
    card,
  });
  res.status(201).json({ payment, appointment: hydrate(get('SELECT * FROM appointments WHERE id = ?', appointmentId)) });
});

router.get('/:id', requireAuth, (req, res) => {
  const payment = get('SELECT * FROM payments WHERE id = ?', req.params.id);
  if (!payment) return res.status(404).json({ error: 'pagamento não encontrado' });
  if (req.user.role === 'CLIENT' && payment.user_id !== req.user.sub) return res.status(403).json({ error: 'sem permissão' });
  const appointment = payment.appointment_id ? hydrate(get('SELECT * FROM appointments WHERE id = ?', payment.appointment_id)) : null;
  res.json({ ...payment, appointment });
});

router.post('/:id/capture', requireAuth, requireRole('ADMIN'), (req, res) => {
  const payment = capturePreauth(req.params.id);
  if (!payment) return res.status(400).json({ error: 'pagamento não está pré-autorizado' });
  res.json(payment);
});

router.post('/:id/refund', requireAuth, requireRole('ADMIN'), (req, res) => {
  const payment = get('SELECT * FROM payments WHERE id = ?', req.params.id);
  if (!payment) return res.status(404).json({ error: 'pagamento não encontrado' });
  const refund = refundPayment({
    appointmentId: payment.appointment_id,
    percent: Number(req.body?.percent ?? 100),
    reason: req.body?.reason || 'reembolso manual',
  });
  res.json(refund);
});

/** Webhook do gateway (Stripe / Mercado Pago / PagSeguro) */
router.post('/webhook', (req, res) => {
  const result = handleWebhook(req.body);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

/** Simulação de Pix/boleto pago — usado no ambiente de demonstração */
router.post('/:id/simulate-paid', requireAuth, (req, res) => {
  const payment = get('SELECT * FROM payments WHERE id = ?', req.params.id);
  if (!payment) return res.status(404).json({ error: 'pagamento não encontrado' });
  run('UPDATE payments SET status = ?, updated_at = ? WHERE id = ?', 'pago', new Date().toISOString(), payment.id);
  if (payment.appointment_id) {
    run(`UPDATE appointments SET payment_status = 'pago', status = 'confirmado' WHERE id = ?`, payment.appointment_id);
  }
  res.json(get('SELECT * FROM payments WHERE id = ?', payment.id));
});

export default router;
