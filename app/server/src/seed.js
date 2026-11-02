/**
 * Seed de demonstração — cria uma barbearia completa, com histórico de
 * 60 dias, agenda de hoje e próximos agendamentos, para que todos os
 * relatórios e painéis tenham dados reais.
 *
 * Uso: npm run seed   (ou `node server/src/seed.js --force`)
 */
import { db, get, run, uid, setSetting, localDate, localDateTime } from './db.js';
import { hashPassword } from './auth.js';
import { addMinutesLocal, appointmentCode, parseLocal, totalDuration } from './lib/scheduling.js';

const force = process.argv.includes('--force');
const hasData = get('SELECT COUNT(*) AS total FROM users')?.total > 0;

if (hasData && !force) {
  console.log('Banco já populado. Use --force para recriar.');
  process.exit(0);
}

if (hasData) {
  for (const table of [
    'reviews', 'payments', 'appointment_items', 'appointments', 'notifications', 'notification_templates',
    'campaigns', 'audit_logs', 'coupons', 'subscriptions', 'plans', 'clients', 'time_off', 'working_hours',
    'professional_services', 'professionals', 'services', 'refresh_tokens', 'otp_codes', 'users', 'branches', 'settings',
  ]) {
    db.exec(`DELETE FROM ${table}`);
  }
}

const PASSWORD = hashPassword('123456');
const today = new Date();
const todayStr = localDate(today);
const dayShift = (days) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return localDate(d);
};
const nowLocal = localDateTime(today);

/* ------------------------------- Unidades ------------------------------- */
const branches = [
  {
    id: 'brn_centro',
    name: 'Navalha — Centro',
    slug: 'centro',
    address: 'Rua Marechal Deodoro, 245',
    city: 'Joaçaba',
    state: 'SC',
    phone: '(49) 3522-1180',
    settings: { min_lead_minutes: 60, max_advance_days: 60, buffer_min: 5, day_capacity: 0, open_hours: '09:00–20:00' },
  },
  {
    id: 'brn_norte',
    name: 'Navalha — Zona Norte',
    slug: 'norte',
    address: 'Av. Sete de Setembro, 1420',
    city: 'Joaçaba',
    state: 'SC',
    phone: '(49) 3522-4477',
    settings: { min_lead_minutes: 30, max_advance_days: 45, buffer_min: 5, day_capacity: 24, open_hours: '10:00–21:00' },
  },
];

for (const b of branches) {
  run(
    'INSERT INTO branches (id, name, slug, address, city, state, phone, settings) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    b.id, b.name, b.slug, b.address, b.city, b.state, b.phone, JSON.stringify(b.settings)
  );
}

/* --------------------------------- Usuários ----------------------------- */
const people = [
  { id: 'usr_admin', name: 'Rafael Moretti', email: 'admin@navalha.app', role: 'ADMIN', phone: '(49) 99911-2200', branch: 'brn_centro' },
  { id: 'usr_admin2', name: 'Camila Duarte', email: 'gerente@navalha.app', role: 'ADMIN', phone: '(49) 99911-2201', branch: 'brn_norte' },
  { id: 'usr_pro1', name: 'Diego Almeida', email: 'diego@navalha.app', role: 'PROFESSIONAL', phone: '(49) 99880-3311', branch: 'brn_centro' },
  { id: 'usr_pro2', name: 'Bruno Tavares', email: 'bruno@navalha.app', role: 'PROFESSIONAL', phone: '(49) 99880-3322', branch: 'brn_centro' },
  { id: 'usr_pro3', name: 'Lucas Ferreira', email: 'lucas@navalha.app', role: 'PROFESSIONAL', phone: '(49) 99880-3333', branch: 'brn_centro' },
  { id: 'usr_pro4', name: 'Aline Souza', email: 'aline@navalha.app', role: 'PROFESSIONAL', phone: '(49) 99880-3344', branch: 'brn_norte' },
  { id: 'usr_pro5', name: 'Marcos Vinícius', email: 'marcos@navalha.app', role: 'PROFESSIONAL', phone: '(49) 99880-3355', branch: 'brn_norte' },
  { id: 'usr_cli1', name: 'Thiago Medeiros', email: 'cliente@navalha.app', role: 'CLIENT', phone: '(49) 99123-4567', branch: 'brn_centro', birthday: '1992-06-14' },
  { id: 'usr_cli2', name: 'João Pedro Lima', email: 'joao@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4568', branch: 'brn_centro', birthday: '1988-11-02' },
  { id: 'usr_cli3', name: 'Felipe Andrade', email: 'felipe@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4569', branch: 'brn_centro', birthday: '1995-03-22' },
  { id: 'usr_cli4', name: 'Ricardo Bruning', email: 'ricardo@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4570', branch: 'brn_centro', birthday: '1990-08-30' },
  { id: 'usr_cli5', name: 'Gabriel Fiorentin', email: 'gabriel@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4571', branch: 'brn_norte', birthday: '1999-01-09' },
  { id: 'usr_cli6', name: 'Eduardo Kern', email: 'eduardo@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4572', branch: 'brn_centro', birthday: '1984-12-05' },
  { id: 'usr_cli7', name: 'Vitor Hugo Sartori', email: 'vitor@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4573', branch: 'brn_centro', birthday: '1997-07-18' },
  { id: 'usr_cli8', name: 'Alexandre Bisol', email: 'alexandre@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4574', branch: 'brn_norte', birthday: '1979-04-27' },
  { id: 'usr_cli9', name: 'Matheus Correa', email: 'matheus@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4575', branch: 'brn_centro', birthday: '2001-09-11' },
  { id: 'usr_cli10', name: 'Otávio Ferraz', email: 'otavio@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4576', branch: 'brn_centro', birthday: '1993-02-19' },
  { id: 'usr_cli11', name: 'Henrique Dal Piva', email: 'henrique@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4577', branch: 'brn_norte', birthday: '1987-05-08' },
  { id: 'usr_cli12', name: 'Ramon Bortolini', email: 'ramon@exemplo.com', role: 'CLIENT', phone: '(49) 99123-4578', branch: 'brn_centro', birthday: '1996-10-25' },
];

for (const p of people) {
  run(
    `INSERT INTO users (id, name, email, phone, password_hash, role, branch_id, birthday, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    p.id, p.name, p.email, p.phone, PASSWORD, p.role, p.branch, p.birthday || null,
    new Date(Date.now() - Math.random() * 300 * 86400000).toISOString()
  );
  if (p.role === 'CLIENT') {
    run('INSERT INTO clients (id, user_id, branch_id) VALUES (?, ?, ?)', uid('cli_'), p.id, p.branch);
  }
}

/* ------------------------------ Profissionais --------------------------- */
const professionals = [
  { id: 'pro_diego', userId: 'usr_pro1', branch: 'brn_centro', specialties: ['Degradê', 'Navalhado', 'Barba'], commission: 45, bio: 'Barbeiro há 12 anos, especialista em degradê navalhado e desenho de barba.' },
  { id: 'pro_bruno', userId: 'usr_pro2', branch: 'brn_centro', specialties: ['Clássico', 'Social', 'Barba'], commission: 40, bio: 'Apaixonado por cortes clássicos e barbearia tradicional com toalha quente.' },
  { id: 'pro_lucas', userId: 'usr_pro3', branch: 'brn_centro', specialties: ['Infantil', 'Platinado', 'Color'], commission: 38, bio: 'Colorimetria masculina, platinado e cortes infantis sem drama.' },
  { id: 'pro_aline', userId: 'usr_pro4', branch: 'brn_norte', specialties: ['Degradê', 'Freestyle'], commission: 42, bio: 'Freestyle, desenhos e degradê de precisão.' },
  { id: 'pro_marcos', userId: 'usr_pro5', branch: 'brn_norte', specialties: ['Barboterapia', 'Social'], commission: 40, bio: 'Barboterapia completa e cuidados com a pele do rosto.' },
];

for (const p of professionals) {
  run(
    'INSERT INTO professionals (id, user_id, branch_id, bio, specialties, commission_pct, rating) VALUES (?, ?, ?, ?, ?, ?, ?)',
    p.id, p.userId, p.branch, p.bio, JSON.stringify(p.specialties), p.commission, 4.9
  );
  const days = p.branch === 'brn_centro' ? [2, 3, 4, 5, 6] : [1, 2, 3, 4, 5, 6];
  for (const weekday of days) {
    run(
      'INSERT INTO working_hours (id, professional_id, weekday, start_min, end_min, break_start, break_end) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('wh_'), p.id, weekday, 540, 1200, 720, 780
    );
  }
}

/* -------------------------------- Serviços ------------------------------ */
const services = [
  { id: 'svc_corte', name: 'Corte Social', category: 'cabelo', duration: 30, price: 5500, desc: 'Corte na tesoura e máquina, finalização com pomada.', img: 'corte-social' },
  { id: 'svc_degrade', name: 'Degradê Navalhado', category: 'cabelo', duration: 45, price: 7000, desc: 'Degradê com acabamento na navalha e finalização premium.', img: 'degrade' },
  { id: 'svc_barba', name: 'Barba Terapia', category: 'barba', duration: 30, price: 4500, desc: 'Toalha quente, óleo essencial, navalha e balm calmante.', img: 'barba' },
  { id: 'svc_combo', name: 'Combo Corte + Barba', category: 'combo', duration: 75, price: 10500, desc: 'O clássico completo: cabelo, barba e hidratação.', img: 'combo' },
  { id: 'svc_platinado', name: 'Platinado', category: 'coloracao', duration: 120, price: 22000, desc: 'Descoloração global, matização e tratamento reconstrutor.', img: 'platinado' },
  { id: 'svc_infantil', name: 'Corte Infantil', category: 'cabelo', duration: 30, price: 4500, desc: 'Corte para crianças até 10 anos, com paciência de sobra.', img: 'infantil' },
  { id: 'svc_sobrancelha', name: 'Sobrancelha na Navalha', category: 'estetica', duration: 15, price: 2500, desc: 'Design de sobrancelha com navalha e pinça.', img: 'sobrancelha' },
  { id: 'svc_hidratacao', name: 'Hidratação Capilar', category: 'tratamento', duration: 30, price: 4000, desc: 'Máscara reconstrutora com massagem no couro cabeludo.', img: 'hidratacao' },
  { id: 'svc_pigmentacao', name: 'Pigmentação de Barba', category: 'barba', duration: 30, price: 5000, desc: 'Preenchimento de falhas com pigmento e correção de desenho.', img: 'pigmentacao' },
  { id: 'svc_plano', name: 'Visita do Plano Mensal', category: 'combo', duration: 30, price: 0, desc: 'Corte incluso no plano de assinatura.', img: 'plano' },
];

for (const s of services) {
  run(
    `INSERT INTO services (id, branch_id, name, description, category, duration_min, buffer_min, price_cents, image_url)
     VALUES (?, ?, ?, ?, ?, ?, 5, ?, ?)`,
    s.id, 'brn_centro', s.name, s.desc, s.category, s.duration, s.price, s.img
  );
  // cópia para a segunda unidade com pequeno acréscimo
  run(
    `INSERT INTO services (id, branch_id, name, description, category, duration_min, buffer_min, price_cents, image_url)
     VALUES (?, ?, ?, ?, ?, ?, 5, ?, ?)`,
    `${s.id}_n`, 'brn_norte', s.name, s.desc, s.category, s.duration, Math.round(s.price * 1.05), s.img
  );
}

const link = (proId, serviceIds) => {
  for (const sid of serviceIds) {
    run('INSERT OR IGNORE INTO professional_services (professional_id, service_id) VALUES (?, ?)', proId, sid);
    run('INSERT OR IGNORE INTO professional_services (professional_id, service_id) VALUES (?, ?)', proId, `${sid}_n`);
  }
};
link('pro_diego', ['svc_corte', 'svc_degrade', 'svc_barba', 'svc_combo', 'svc_sobrancelha', 'svc_pigmentacao']);
link('pro_bruno', ['svc_corte', 'svc_barba', 'svc_combo', 'svc_infantil', 'svc_hidratacao']);
link('pro_lucas', ['svc_corte', 'svc_platinado', 'svc_infantil', 'svc_hidratacao', 'svc_degrade']);
link('pro_aline', ['svc_corte', 'svc_degrade', 'svc_barba', 'svc_combo', 'svc_sobrancelha']);
link('pro_marcos', ['svc_corte', 'svc_barba', 'svc_combo', 'svc_pigmentacao']);

/* ------------------------------ Planos/Cupons --------------------------- */
run(
  'INSERT INTO plans (id, branch_id, name, price_cents, billing, discount_pct, credits, perks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  'pln_mensal', 'brn_centro', 'Clube Navalha', 12900, 'mensal', 15, 4,
  JSON.stringify(['4 cortes por mês', '15% off em barba e tratamentos', 'Prioridade na agenda', 'Bebida cortesia'])
);
run(
  'INSERT INTO plans (id, branch_id, name, price_cents, billing, discount_pct, credits, perks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  'pln_premium', 'brn_centro', 'Clube Premium', 22900, 'mensal', 25, 6,
  JSON.stringify(['6 atendimentos por mês', '25% off em qualquer serviço', 'Atendimento fora do horário', 'Produtos com desconto'])
);
run('INSERT INTO subscriptions (id, user_id, plan_id, renews_at) VALUES (?, ?, ?, ?)', uid('sub_'), 'usr_cli1', 'pln_mensal', dayShift(23));

const coupons = [
  ['BEMVINDO10', 'percent', 10, 0, 500, dayShift(90)],
  ['BARBA20', 'percent', 20, 4000, 200, dayShift(30)],
  ['NAVALHA15', 'fixed', 1500, 7000, 100, dayShift(60)],
  ['ANIVER25', 'percent', 25, 0, 50, null],
];
for (const [code, type, value, min, limit, exp] of coupons) {
  run(
    'INSERT INTO coupons (id, code, type, value, min_cents, usage_limit, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    uid('cpn_'), code, type, value, min, limit, exp
  );
}

/* --------------------------- Templates de mensagem ---------------------- */
const templates = [
  ['agendamento_criado', 'email', 'Agendamento recebido', 'Olá {{nome}}, recebemos sua reserva para {{data}} com {{profissional}}. Código: {{codigo}}.'],
  ['agendamento_criado', 'sms', null, 'Navalha: reserva em {{data}} confirmada. Código {{codigo}}.'],
  ['confirmacao', 'email', 'Seu horário está confirmado ✂️', 'Tudo certo, {{nome}}! Te esperamos em {{data}} na unidade {{unidade}}.'],
  ['lembrete', 'sms', null, 'Lembrete: seu horário na Navalha é amanhã às {{hora}}. Responda SIM para confirmar.'],
  ['cancelamento', 'email', 'Agendamento cancelado', 'Seu agendamento foi cancelado. Reembolso previsto: {{reembolso}}.'],
  ['reagendamento', 'sms', null, 'Seu horário na Navalha foi remarcado para {{data}}.'],
  ['avaliacao', 'push', null, 'Como foi seu atendimento com {{profissional}}? Avalie e ganhe 5% no próximo corte.'],
  ['checkin', 'push', null, '{{cliente}} chegou para o atendimento das {{hora}}.'],
  ['pagamento_confirmado', 'email', 'Pagamento confirmado', 'Recebemos o pagamento de {{valor}}. Obrigado, {{nome}}!'],
  ['aviso_profissional', 'sms', null, 'O profissional ficou indisponível em {{data}}. Acesse o app e escolha um novo horário.'],
  ['boas_vindas', 'email', 'Bem-vindo à Navalha 💈', 'Olá {{nome}}, sua conta está pronta. Use o cupom BEMVINDO10 no primeiro agendamento.'],
];
for (const [key, channel, subject, body] of templates) {
  run(
    'INSERT INTO notification_templates (id, key, channel, subject, body) VALUES (?, ?, ?, ?, ?)',
    uid('tpl_'), key, channel, subject, body
  );
}

/* ------------------------------ Configurações --------------------------- */
setSetting('business', {
  name: 'Navalha Barbearia',
  legal_name: 'Navalha Barbearia Ltda.',
  cnpj: '12.345.678/0001-90',
  email: 'contato@navalha.app',
  phone: '(49) 3522-1180',
  whatsapp: '+554935221180',
  instagram: '@navalha.barbearia',
  site: 'https://navalha.app',
  currency: 'BRL',
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
});

setSetting('policies', {
  min_lead_minutes: 60,
  max_advance_days: 60,
  buffer_min: 5,
  cancellation_hours: 4,
  no_show_fee_pct: 50,
  refund: [
    { min_hours: 24, percent: 100 },
    { min_hours: 4, percent: 50 },
    { min_hours: 0, percent: 0 },
  ],
  terms:
    'Cancelamentos com mais de 24h de antecedência têm reembolso integral. Entre 4h e 24h, 50%. Menos de 4h ou não comparecimento, sem reembolso.',
});

setSetting('integrations', {
  email_enabled: true,
  sms_enabled: true,
  push_enabled: true,
  google_calendar: true,
  outlook: false,
  mailchimp: true,
  mercadopago: true,
  stripe: false,
  pagseguro: false,
  whatsapp: true,
  pos_local: false,
});

/* ------------------------------- Histórico ------------------------------ */
const serviceById = Object.fromEntries(services.map((s) => [s.id, s]));
const clientIds = people.filter((p) => p.role === 'CLIENT').map((p) => p.id);
const proBranch = Object.fromEntries(professionals.map((p) => [p.id, p.branch]));
const proServices = {
  pro_diego: ['svc_corte', 'svc_degrade', 'svc_barba', 'svc_combo', 'svc_sobrancelha', 'svc_pigmentacao'],
  pro_bruno: ['svc_corte', 'svc_barba', 'svc_combo', 'svc_infantil', 'svc_hidratacao'],
  pro_lucas: ['svc_corte', 'svc_platinado', 'svc_infantil', 'svc_hidratacao', 'svc_degrade'],
  pro_aline: ['svc_corte', 'svc_degrade', 'svc_barba', 'svc_combo', 'svc_sobrancelha'],
  pro_marcos: ['svc_corte', 'svc_barba', 'svc_combo', 'svc_pigmentacao'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const proList = Object.keys(proServices);
const usedSlots = new Set();
let appointmentSeq = 0;

function createAppointment({ proId, clientId, dateStr, startMin, serviceIds, status, paymentMethod, paymentStatus, rating }) {
  const branchId = proBranch[proId];
  const svc = serviceIds.map((id) => (branchId === 'brn_norte' ? `${id}_n` : id));
  const rows = svc.map((sid) => ({
    id: sid,
    name: serviceById[sid.replace(/_n$/, '')].name,
    duration_min: serviceById[sid.replace(/_n$/, '')].duration,
    price_cents:
      branchId === 'brn_norte'
        ? Math.round(serviceById[sid.replace(/_n$/, '')].price * 1.05)
        : serviceById[sid.replace(/_n$/, '')].price,
  }));
  const startAt = `${dateStr}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
  const duration = totalDuration(rows, 5);
  const endAt = addMinutesLocal(startAt, duration);
  const key = `${proId}-${startAt}`;
  if (usedSlots.has(key)) return null;
  usedSlots.add(key);

  const subtotal = rows.reduce((s, r) => s + r.price_cents, 0);
  const discount = Math.random() > 0.82 ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal - discount;
  const id = uid('apt_');
  appointmentSeq += 1;

  run(
    `INSERT INTO appointments (id, code, branch_id, client_id, professional_id, start_at, end_at, status,
      payment_status, subtotal_cents, discount_cents, total_cents, coupon_code, notes, checkin_token, started_at, finished_at, checked_in_at, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, appointmentCode(), branchId, clientId, proId, startAt, endAt, status,
    paymentStatus, subtotal, discount, total, discount ? 'BEMVINDO10' : null, null, uid('chk_'),
    status === 'concluido' ? startAt : null,
    status === 'concluido' ? endAt : null,
    status === 'concluido' ? startAt : null,
    Math.random() > 0.5 ? 'site' : 'app',
    `${dateStr}T00:00:00.000Z`
  );
  rows.forEach((r, i) => {
    run(
      'INSERT INTO appointment_items (id, appointment_id, service_id, name, duration_min, price_cents, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('api_'), id, r.id, r.name, r.duration_min, r.price_cents, i
    );
  });

  if (status === 'concluido' || paymentStatus === 'pago' || paymentStatus === 'autorizado') {
    run(
      `INSERT INTO payments (id, appointment_id, user_id, method, amount_cents, status, preauth, transaction_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      uid('pay_'), id, clientId, paymentMethod, total,
      paymentStatus === 'autorizado' ? 'autorizado' : paymentStatus === 'pago' ? 'pago' : paymentStatus,
      paymentMethod === 'preauth' ? 1 : 0,
      `tx_${Math.random().toString(36).slice(2, 12)}`,
      `${dateStr}T00:00:00.000Z`, `${dateStr}T00:00:00.000Z`
    );
  }

  if (status === 'concluido' && rating) {
    run(
      'INSERT INTO reviews (id, appointment_id, client_id, professional_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      uid('rev_'), id, clientId, proId, rating, REVIEWS[Math.floor(Math.random() * REVIEWS.length)], `${dateStr}T20:00:00.000Z`
    );
  }
  return id;
}

const REVIEWS = [
  'Atendimento impecável, sai com o degradê mais afiado que já tive.',
  'Ambiente muito agradável e o barbeiro entendeu exatamente o que eu queria.',
  'Pontual, caprichoso e ainda deu dicas de como manter o corte.',
  'Melhor barbearia da cidade, recomendo de olhos fechados.',
  'Barba impecável, toalha quente faz toda a diferença.',
  'Muito bom, só achei que demorou um pouco para começar.',
  'Serviço excelente e atendimento super atencioso.',
  'Platinado ficou perfeito, sem danificar o cabelo.',
];

const PAY_METHODS = ['card', 'pix', 'onsite', 'onsite', 'card', 'preauth'];

// 60 dias de histórico
for (let dayOffset = -60; dayOffset <= 14; dayOffset += 1) {
  const dateStr = dayShift(dayOffset);
  const weekday = parseLocal(`${dateStr}T12:00`).getDay();
  if (weekday === 0) continue; // domingo fechado

  const activePros = proList.filter((proId) => (proBranch[proId] === 'brn_centro' ? weekday >= 2 : weekday >= 1));
  for (const proId of activePros) {
    const slotsCount = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < slotsCount; i += 1) {
      const startMin = 540 + Math.floor(Math.random() * 16) * 30;
      if (startMin >= 1140) continue;
      const clientId = pick(clientIds);
      const serviceIds = [pick(proServices[proId])];
      if (Math.random() > 0.75) {
        const extra = pick(proServices[proId].filter((s) => s !== serviceIds[0]));
        if (extra) serviceIds.push(extra);
      }

      let status;
      let paymentStatus;
      let rating = null;
      let method = pick(PAY_METHODS);

      if (dayOffset < 0) {
        const roll = Math.random();
        status = roll > 0.12 ? 'concluido' : roll > 0.06 ? 'cancelado' : 'no_show';
        paymentStatus = status === 'concluido' ? 'pago' : status === 'cancelado' ? (Math.random() > 0.5 ? 'reembolsado' : 'pendente') : 'pendente';
        if (status === 'cancelado') method = 'onsite';
        if (status === 'concluido' && Math.random() > 0.35) rating = Math.random() > 0.15 ? 5 : 4;
      } else if (dayOffset === 0) {
        const startAt = `${dateStr}T${String(Math.floor(startMin / 60)).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;
        if (startAt < nowLocal) {
          status = 'concluido';
          paymentStatus = 'pago';
          rating = Math.random() > 0.6 ? 5 : null;
        } else {
          status = Math.random() > 0.55 ? 'confirmado' : 'pendente';
          paymentStatus = Math.random() > 0.5 ? 'pago' : 'pendente';
        }
      } else {
        status = Math.random() > 0.25 ? 'confirmado' : 'pendente';
        paymentStatus = Math.random() > 0.6 ? 'pago' : 'pendente';
        method = paymentStatus === 'pago' ? pick(['card', 'pix', 'preauth']) : 'onsite';
      }

      createAppointment({ proId, clientId, dateStr, startMin, serviceIds, status, paymentMethod: method, paymentStatus, rating });
    }
  }
}

// Alguns atendimentos em andamento / fila de hoje (para o painel de check-in)
const queueBase = 600 + Math.floor(Math.random() * 4) * 30;
createAppointment({
  proId: 'pro_diego', clientId: 'usr_cli3', dateStr: todayStr, startMin: queueBase,
  serviceIds: ['svc_degrade'], status: 'em_atendimento', paymentMethod: 'pix', paymentStatus: 'pago',
});

// Bloqueios de agenda
run(
  'INSERT INTO time_off (id, professional_id, start_at, end_at, reason, kind) VALUES (?, ?, ?, ?, ?, ?)',
  uid('tof_'), 'pro_lucas', `${dayShift(6)}T09:00`, `${dayShift(9)}T19:00`, 'Congresso de colorimetria', 'ferias'
);
run(
  'INSERT INTO time_off (id, professional_id, start_at, end_at, reason, kind) VALUES (?, ?, ?, ?, ?, ?)',
  uid('tof_'), 'pro_bruno', `${dayShift(3)}T12:00`, `${dayShift(3)}T18:00`, 'Consulta médica', 'folga'
);

/* ------------------------- Histórico de clientes ------------------------- */
for (const clientId of clientIds) {
  const stats = get(
    `SELECT COUNT(*) AS visits, COALESCE(SUM(total_cents),0) AS spent FROM appointments
     WHERE client_id = ? AND status = 'concluido'`,
    clientId
  );
  const noShows = get(`SELECT COUNT(*) AS total FROM appointments WHERE client_id = ? AND status='no_show'`, clientId)?.total || 0;
  const tags = Number(stats.spent) > 60000 ? ['vip', 'recorrente'] : Number(stats.visits) > 6 ? ['recorrente'] : ['novo'];
  run(
    'UPDATE clients SET visits = ?, total_spent_cents = ?, no_shows = ?, tags = ?, favorite_professional_id = ? WHERE user_id = ?',
    stats.visits, stats.spent, noShows, JSON.stringify(tags),
    pick(proList), clientId
  );
}

// Notas de ficha de cliente
const client1 = get('SELECT * FROM clients WHERE user_id = ?', 'usr_cli1');
if (client1) {
  run(
    'UPDATE clients SET notes = ? WHERE id = ?',
    JSON.stringify([
      { id: uid('note_'), author: 'Diego Almeida', body: 'Prefere máquina 0.5 nas laterais e tesoura no topo. Alérgico a pós finalizador.', photo_url: null, created_at: new Date(Date.now() - 20 * 86400000).toISOString() },
      { id: uid('note_'), author: 'Rafael Moretti', body: 'Assinante do Clube Navalha — lembrar de aplicar 15% off nos extras.', photo_url: null, created_at: new Date(Date.now() - 5 * 86400000).toISOString() },
    ]),
    client1.id
  );
}

/* ---------------------------- Notificações ----------------------------- */
const notifSeed = [
  ['usr_cli1', 'agendamento_criado', 'Agendamento recebido ✂️', 'Recebemos seu pedido de Degradê Navalhado.', 'email'],
  ['usr_cli1', 'lembrete', 'Lembrete de atendimento', 'Seu horário é amanhã às 10:00 na unidade Centro.', 'sms'],
  ['usr_cli1', 'avaliacao', 'Como foi seu atendimento?', 'Avalie o Diego e ganhe 5% no próximo corte.', 'push'],
  ['usr_pro1', 'checkin', 'Cliente fez check-in', 'Felipe Andrade chegou para o atendimento das 10:00.', 'push'],
  ['usr_admin', 'campanha', 'Campanha enviada', '311 clientes receberam a promoção de aniversário.', 'inapp'],
];
for (const [userId, type, title, body, channel] of notifSeed) {
  run(
    'INSERT INTO notifications (id, user_id, channel, type, title, body, status, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    uid('ntf_'), userId, channel, type, title, body, 'enviado',
    new Date(Date.now() - Math.random() * 5 * 86400000).toISOString()
  );
}

/* ------------------------------- Campanhas ------------------------------ */
run(
  'INSERT INTO campaigns (id, name, channel, segment, body, recipients) VALUES (?, ?, ?, ?, ?, ?)',
  uid('cmp_'), 'Aniversariantes de novembro', 'whatsapp', 'aniversariantes',
  'Feliz aniversário! 🎉 Seu corte tem 25% off este mês com o cupom ANIVER25.', 42
);
run(
  'INSERT INTO campaigns (id, name, channel, segment, body, recipients) VALUES (?, ?, ?, ?, ?, ?)',
  uid('cmp_'), 'Sentimos sua falta', 'email', 'inativos',
  'Faz tempo que você não passa por aqui. Volte com 20% off usando BARBA20.', 118
);

/* ------------------------------- Auditoria ------------------------------ */
run(
  'INSERT INTO audit_logs (id, actor_id, actor_name, action, entity, entity_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
  uid('log_'), 'usr_admin', 'Rafael Moretti', 'settings.update', 'settings', 'global', JSON.stringify({ policies: 'refund' })
);

const totalAppointments = get('SELECT COUNT(*) AS total FROM appointments')?.total;
const totalRevenue = get(`SELECT COALESCE(SUM(total_cents),0) AS total FROM appointments WHERE status='concluido'`)?.total;
console.log(
  `✅ Seed concluído: ${totalAppointments} agendamentos, ${clientIds.length} clientes, ${professionals.length} profissionais, R$ ${(totalRevenue / 100).toFixed(2)} em receita histórica.`
);
console.log('   Login demo → admin@navalha.app / diego@navalha.app / cliente@navalha.app · senha 123456');
