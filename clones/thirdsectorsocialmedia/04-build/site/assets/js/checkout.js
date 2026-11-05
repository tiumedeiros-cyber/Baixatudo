// Fluxo do checkout demo: passo 1 → passo 2 → sucesso, com rascunho em localStorage.
import {
  validateStep1, maskCpf, maskPhone, findCoupon, calcTotals,
  formatBRL, formatCountdown, orderId, PRICE_CENTS,
} from './logic.js';

const $ = s => document.querySelector(s);
const DRAFT = 'clube-checkout-draft';
const state = { coupon: null, method: 'pix', seconds: 420 };

/* ---------- countdown (demo: só client-side, observado no checkout real) ---------- */
const cd = $('#cd-time');
setInterval(() => {
  state.seconds = state.seconds > 0 ? state.seconds - 1 : 420;
  cd.textContent = formatCountdown(state.seconds);
}, 1000);
cd.textContent = formatCountdown(state.seconds);

/* ---------- máscaras ---------- */
$('#f-cpf').addEventListener('input', e => { e.target.value = maskCpf(e.target.value); });
$('#f-phone').addEventListener('input', e => { e.target.value = maskPhone(e.target.value); });

/* ---------- rascunho ---------- */
const fields = ['#f-name', '#f-email', '#f-cpf', '#f-phone'];
try {
  const saved = JSON.parse(localStorage.getItem(DRAFT) || 'null');
  if (saved) fields.forEach(f => { const el = $(f); if (saved[el.name]) el.value = saved[el.name]; });
} catch { /* rascunho corrompido: ignora */ }
const saveDraft = () => {
  const data = {};
  fields.forEach(f => { const el = $(f); data[el.name] = el.value; });
  localStorage.setItem(DRAFT, JSON.stringify(data));
};

/* ---------- passo 1 ---------- */
function showError(id, msg) {
  const box = $('#e-' + id), input = $('#f-' + id);
  if (msg) {
    box.textContent = msg; box.classList.add('show');
    if (input) input.setAttribute('aria-invalid', 'true');
  } else {
    box.textContent = ''; box.classList.remove('show');
    if (input) input.removeAttribute('aria-invalid');
  }
}
$('#form1').addEventListener('submit', e => {
  e.preventDefault();
  const v = {
    name: $('#f-name').value, email: $('#f-email').value,
    cpf: $('#f-cpf').value, phone: $('#f-phone').value,
  };
  const { ok, errors } = validateStep1(v);
  ['name', 'email', 'cpf', 'phone'].forEach(f => showError(f, errors[f]));
  $('#e-email-login').classList.toggle('show', /cadastrado/.test(errors.email || ''));
  if (!ok) { $('.err.show')?.scrollIntoView({ block: 'center' }); return; }
  saveDraft();
  goTo(2);
});

/* ---------- passos ---------- */
function goTo(step) {
  $('#step1').hidden = step !== 1;
  $('#step2').hidden = step !== 2;
  $('#step3').hidden = step !== 3;
  $('#tag-1').classList.toggle('on', step >= 1);
  $('#tag-2').classList.toggle('on', step >= 2);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$('#btn-back').addEventListener('click', () => goTo(1));

/* ---------- formas + totais ---------- */
function renderTotals() {
  const t = calcTotals({ method: state.method, coupon: state.coupon });
  $('#r-base').textContent = formatBRL(t.base);
  $('#r-pix').textContent = '−' + formatBRL(t.pixDiscount);
  $('#r-pix-row').hidden = t.pixDiscount === 0;
  $('#r-coupon-row').hidden = !t.couponDiscount;
  $('#r-coupon').textContent = '−' + formatBRL(t.couponDiscount);
  $('#r-coupon-name').textContent = state.coupon ? state.coupon.code : '';
  $('#r-total').textContent = formatBRL(t.total);
  $('#btn-pay-total').textContent = '(' + formatBRL(t.total) + ')';
}
document.querySelectorAll('input[name=method]').forEach(r => r.addEventListener('change', () => {
  state.method = r.value; renderTotals();
}));

/* ---------- cupom ---------- */
$('#btn-coupon').addEventListener('click', () => {
  const res = findCoupon($('#f-coupon').value);
  const msg = $('#e-coupon');
  msg.classList.remove('show');
  $('#r-coupon-added').classList.remove('show');
  if (res.ok) {
    state.coupon = res;
    $('#r-coupon-added').classList.add('show');
  } else {
    const text = { empty: 'Digite um cupom.', invalid: 'Cupom inválido.', expired: 'Este cupom expirou.' }[res.reason];
    msg.textContent = text; msg.classList.add('show');
    state.coupon = null;
  }
  renderTotals();
});

/* ---------- finalizar ---------- */
$('#btn-pay').addEventListener('click', () => {
  const t = calcTotals({ method: state.method, coupon: state.coupon });
  $('#order-id').textContent = orderId(Math.random);
  $('#order-total').textContent = formatBRL(t.total);
  localStorage.removeItem(DRAFT);
  goTo(3);
});
$('#btn-restart').addEventListener('click', () => {
  $('#form1').reset(); state.coupon = null; state.method = 'pix';
  document.querySelector('input[name=method][value=pix]').checked = true;
  $('#r-coupon-added').classList.remove('show'); showError('coupon' , '');
  ['name','email','cpf','phone'].forEach(f => showError(f, ''));
  $('#f-coupon').value = '';
  renderTotals(); goTo(1);
});

renderTotals();
