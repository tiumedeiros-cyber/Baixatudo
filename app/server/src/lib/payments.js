import { all, get, run, uid } from '../db.js';
import { notify } from './notify.js';

/**
 * Camada de pagamentos — abstrai o gateway.
 * Hoje usa um gateway interno simulado ("navalha-pay") que reproduz o ciclo
 * de vida real (intent → autorização → captura → reembolso). Para ligar
 * Stripe/Mercado Pago, implemente `charge()`/`refund()` com o SDK oficial e
 * mantenha o webhook em /api/payments/webhook.
 */
const GATEWAY = process.env.PAYMENT_GATEWAY || 'navalha-pay';

const fakeTxId = (prefix = 'tx') => `${prefix}_${Math.random().toString(36).slice(2, 12)}`;

export function createPaymentIntent({ appointmentId, userId, method, amount, card }) {
  const id = uid('pay_');
  let status = 'pendente';
  let txId = fakeTxId();

  if (method === 'card') {
    // Cartões terminados em 0002 falham (útil para testar o fluxo de erro)
    const number = String(card?.number || '4242424242424242').replace(/\D/g, '');
    status = number.endsWith('0002') ? 'falhou' : 'pago';
  } else if (method === 'preauth') {
    status = 'autorizado';
  } else if (method === 'pix') {
    status = 'pendente';
  } else if (method === 'boleto') {
    status = 'pendente';
  }

  run(
    `INSERT INTO payments (id, appointment_id, user_id, method, amount_cents, status, preauth, transaction_id, gateway, raw)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    appointmentId,
    userId,
    method,
    amount,
    status,
    method === 'preauth' ? 1 : 0,
    txId,
    GATEWAY,
    JSON.stringify({ simulated: true, card_brand: card?.brand || 'visa' })
  );

  const payment = get('SELECT * FROM payments WHERE id = ?', id);
  if (status === 'pago' && appointmentId) {
    run(`UPDATE appointments SET payment_status = 'pago', status = 'confirmado' WHERE id = ?`, appointmentId);
  }
  return { ...payment, checkout_url: `/pagamento/${id}` };
}

export function refundPayment({ appointmentId, percent = 100, reason = '' }) {
  const payment = get(
    `SELECT * FROM payments WHERE appointment_id = ? AND status IN ('pago','autorizado') ORDER BY created_at DESC LIMIT 1`,
    appointmentId
  );
  if (!payment) return null;
  const refunded = Math.round((payment.amount_cents * percent) / 100);
  const status = percent >= 100 ? 'reembolsado' : percent > 0 ? 'reembolsado' : 'cancelado';
  run(
    `UPDATE payments SET status = ?, refunded_cents = ?, updated_at = ?, raw = ? WHERE id = ?`,
    status,
    refunded,
    new Date().toISOString(),
    JSON.stringify({ refund_reason: reason, refund_percent: percent }),
    payment.id
  );
  run(`UPDATE appointments SET payment_status = ? WHERE id = ?`, status, appointmentId);
  return { ...payment, status, refunded_cents: refunded };
}

export function capturePreauth(paymentId) {
  const payment = get('SELECT * FROM payments WHERE id = ?', paymentId);
  if (!payment || payment.status !== 'autorizado') return null;
  run(`UPDATE payments SET status = 'pago', updated_at = ? WHERE id = ?`, new Date().toISOString(), paymentId);
  return get('SELECT * FROM payments WHERE id = ?', paymentId);
}

export const listPayments = ({ from, to, status } = {}) => {
  const filters = [];
  const params = [];
  if (from) {
    filters.push('p.created_at >= ?');
    params.push(from);
  }
  if (to) {
    filters.push('p.created_at <= ?');
    params.push(to);
  }
  if (status) {
    filters.push('p.status = ?');
    params.push(status);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  return all(
    `SELECT p.*, a.code AS appointment_code, a.start_at, u.name AS client_name
     FROM payments p
     LEFT JOIN appointments a ON a.id = p.appointment_id
     LEFT JOIN users u ON u.id = p.user_id
     ${where} ORDER BY p.created_at DESC LIMIT 200`,
    ...params
  );
};

export function handleWebhook(event) {
  const { type, data } = event || {};
  if (!data?.transaction_id) return { ok: false, error: 'transaction_id obrigatório' };
  const payment = get('SELECT * FROM payments WHERE transaction_id = ?', data.transaction_id);
  if (!payment) return { ok: false, error: 'pagamento não encontrado' };

  const statusMap = {
    'payment.succeeded': 'pago',
    'payment.failed': 'falhou',
    'payment.refunded': 'reembolsado',
    'payment.preauth': 'autorizado',
  };
  const status = statusMap[type];
  if (!status) return { ok: false, error: `evento desconhecido: ${type}` };

  run('UPDATE payments SET status = ?, updated_at = ?, raw = ? WHERE id = ?', status, new Date().toISOString(), JSON.stringify(event), payment.id);
  if (payment.appointment_id) {
    run('UPDATE appointments SET payment_status = ? WHERE id = ?', status, payment.appointment_id);
    if (status === 'pago') {
      const appt = get('SELECT * FROM appointments WHERE id = ?', payment.appointment_id);
      if (appt) {
        notify({
          userId: appt.client_id,
          type: 'pagamento_confirmado',
          channel: 'email',
          title: 'Pagamento confirmado ✅',
          body: `Recebemos seu pagamento de ${(payment.amount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Até breve!`,
          meta: { appointment_id: appt.id },
        });
      }
    }
  }
  return { ok: true, payment_id: payment.id, status };
}
