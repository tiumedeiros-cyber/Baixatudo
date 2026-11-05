// Lógica pura do clone (testável em Node). Contrato próprio, espelhando o observado no alvo.
export const PRICE_CENTS = 2700; // R$ 27,00 pagamento único (observado)
export const PIX_DISCOUNT = 0.05; // -5% no Pix (observado no banner do checkout)
export const REGISTERED_EMAILS = ['test@test.com', 'clube@exemplo.com']; // simulação de "e-mail já cadastrado"

export const COUPONS = {
  CLUBE5: { kind: 'fixed', value: 500, label: 'CLUBE5 · R$ 5,00 off' },
  EXPIROU: { kind: 'expired' },
};

export function formatBRL(cents) {
  const v = cents / 100;
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function normalizeDigits(s) { return (s || '').replace(/\D+/g, ''); }

export function normalizeCpf(s) { return normalizeDigits(s).slice(0, 11); }

export function isValidCpf(s) {
  const d = normalizeCpf(s);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(d[i]) * (10 - i);
  let d1 = (sum * 10) % 11; if (d1 === 10) d1 = 0;
  if (d1 !== Number(d[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * (11 - i);
  let d2 = (sum * 10) % 11; if (d2 === 10) d2 = 0;
  return d2 === Number(d[10]);
}

export function maskCpf(s) {
  const d = normalizeCpf(s);
  const p = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
  return (p[3] ? `${p[0]}.${p[1]}.${p[2]}-${p[3]}` : p[2] ? `${p[0]}.${p[1]}.${p[2]}` : p[1] ? `${p[0]}.${p[1]}` : p[0]).replace(/^\.$/, '');
}

export function maskPhone(s) {
  let d = normalizeDigits(s).slice(0, 11);
  if (d.length > 10) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  if (d.length > 6) return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  if (d.length > 2) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return d;
}

export function isValidName(s) {
  const parts = (s || '').trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every(p => p.length >= 2);
}

export function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim());
}

export function isEmailRegistered(s) {
  return REGISTERED_EMAILS.includes((s || '').trim().toLowerCase());
}

export function isValidPhone(s) {
  const d = normalizeDigits(s);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  const unused = [10, 20, 29, 30, 36, 40, 50, 52, 56, 57, 58, 59, 60, 70, 78, 80, 90];
  return ddd >= 11 && ddd <= 99 && !unused.includes(ddd); // simplificação própria, documentada na spec
}

export function findCoupon(code) {
  const key = (code || '').trim().toUpperCase();
  if (!key) return { ok: false, reason: 'empty' };
  const c = COUPONS[key];
  if (!c) return { ok: false, reason: 'invalid' };
  if (c.kind === 'expired') return { ok: false, reason: 'expired' };
  return { ok: true, code: key, discountCents: c.value, label: c.label };
}

// method: 'pix' | 'card' | 'boleto'
export function calcTotals({ method = 'pix', coupon = null } = {}) {
  const base = PRICE_CENTS;
  const couponDiscount = coupon && coupon.ok ? Math.min(coupon.discountCents, base) : 0;
  const afterCoupon = base - couponDiscount;
  const pixDiscount = method === 'pix' ? Math.round(afterCoupon * PIX_DISCOUNT) : 0;
  const total = afterCoupon - pixDiscount;
  return { base, couponDiscount, afterCoupon, pixDiscount, total };
}

export function validateStep1({ name, email, cpf, phone }) {
  const errors = {};
  if (!isValidName(name)) errors.name = 'Digite seu nome completo (nome e sobrenome).';
  const em = (email || '').trim();
  if (!isValidEmail(em)) errors.email = 'Digite um e-mail válido.';
  else if (isEmailRegistered(em)) errors.email = 'E-mail já cadastrado! Utilize outro e-mail ou faça login.';
  if (!isValidCpf(cpf)) errors.cpf = 'CPF inválido. Informe os 11 dígitos.';
  if (!isValidPhone(phone)) errors.phone = 'Informe DDD + número (WhatsApp ou celular).';
  return { ok: Object.keys(errors).length === 0, errors };
}

export function formatCountdown(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `00:${mm}:${ss}`;
}

export function orderId(rand = Math.random) {
  return 'DEMO-' + String(Math.floor(rand() * 1e6)).padStart(6, '0');
}
