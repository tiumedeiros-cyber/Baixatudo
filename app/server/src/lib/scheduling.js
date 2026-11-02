/**
 * Núcleo de regras de agenda — funções puras, testáveis com node:test.
 * Todos os horários são strings locais "YYYY-MM-DDTHH:MM" (sem timezone),
 * o que mantém as comparações determinísticas e legíveis.
 */

export const SLOT_STEP_MIN = 15;

export const pad = (n) => String(n).padStart(2, '0');

export const toDateStr = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const toLocal = (date) =>
  `${toDateStr(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

export const dateStrToMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export const slotToISO = (dateStr, minutes) => `${dateStr}T${minutesToTime(minutes)}`;

export const parseLocal = (value) => {
  const [date, time = '00:00'] = String(value).split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

export const addMinutesLocal = (value, minutes) => toLocal(new Date(parseLocal(value).getTime() + minutes * 60000));

export const minutesBetween = (a, b) => Math.round((parseLocal(b) - parseLocal(a)) / 60000);

export const weekdayOf = (dateStr) => parseLocal(`${dateStr}T12:00`).getDay();

export const overlaps = (startA, endA, startB, endB) => startA < endB && startB < endA;
/** Alias legível usado nos testes e nas regras de conflito de agenda */
export const hasConflictOverlap = overlaps;

/** Duração total dos serviços + buffers entre eles */
export const totalDuration = (services = [], gapMin = 0) => {
  if (!services.length) return 0;
  return services.reduce((sum, s) => sum + Number(s.duration_min || 0), 0) + gapMin * (services.length - 1);
};

/**
 * Gera os horários disponíveis para um dia.
 * @param {object} opts
 * @param {string} opts.date YYYY-MM-DD
 * @param {{start_min:number,end_min:number,break_start?:number,break_end?:number}[]} opts.workingHours
 * @param {{start_at:string,end_at:string}[]} opts.busy intervalos já ocupados (inclui buffer aplicado)
 * @param {number} opts.durationMin duração total do atendimento
 * @param {number} [opts.step] granularidade em minutos
 * @param {number} [opts.bufferMin] buffer após o atendimento
 * @param {string} [opts.now] agora no formato local
 * @param {number} [opts.minLeadMinutes] antecedência mínima
 * @param {number} [opts.maxAdvanceDays] janela máxima de agendamento
 * @param {number} [opts.dayCapacity] vagas máximas no dia (0 = ilimitado)
 * @param {number} [opts.dayBooked] vagas já usadas no dia
 */
export function generateSlots(opts) {
  const {
    date,
    workingHours = [],
    busy = [],
    durationMin,
    step = SLOT_STEP_MIN,
    bufferMin = 0,
    now,
    minLeadMinutes = 0,
    maxAdvanceDays = 60,
    dayCapacity = 0,
    dayBooked = 0,
  } = opts;

  if (!date || !durationMin) return [];
  if (dayCapacity > 0 && dayBooked >= dayCapacity) return [];

  const todayStr = now ? now.slice(0, 10) : null;
  if (todayStr) {
    const maxDate = new Date(parseLocal(`${todayStr}T00:00`).getTime() + maxAdvanceDays * 86400000);
    if (date > toDateStr(maxDate)) return [];
  }

  const earliest = now ? new Date(parseLocal(now).getTime() + minLeadMinutes * 60000) : null;
  const slots = [];

  for (const wh of workingHours) {
    const blocks = [];
    if (wh.break_start != null && wh.break_end != null && wh.break_end > wh.break_start) {
      blocks.push([wh.start_min, wh.break_start], [wh.break_end, wh.end_min]);
    } else {
      blocks.push([wh.start_min, wh.end_min]);
    }

    for (const [blockStart, blockEnd] of blocks) {
      for (let start = blockStart; start + durationMin <= blockEnd; start += step) {
        const startAt = slotToISO(date, start);
        const endAt = slotToISO(date, start + durationMin);
        if (earliest && parseLocal(startAt).getTime() < earliest.getTime()) continue;
        const conflict = busy.some((b) => overlaps(startAt, addMinutesLocal(endAt, bufferMin), b.start_at, b.end_at));
        if (conflict) continue;
        slots.push({ start_at: startAt, end_at: endAt, professional_id: opts.professionalId ?? null });
      }
    }
  }
  return slots;
}

/** Política de cancelamento / reembolso em % do valor pago */
export function refundPolicy({ hoursBefore, policy }) {
  const rules = policy?.refund || [
    { min_hours: 24, percent: 100 },
    { min_hours: 4, percent: 50 },
    { min_hours: 0, percent: 0 },
  ];
  const sorted = [...rules].sort((a, b) => b.min_hours - a.min_hours);
  const rule = sorted.find((r) => hoursBefore >= r.min_hours) || { percent: 0 };
  return rule.percent;
}

/** Estimativa de espera na fila: minutos restantes dos atendimentos em andamento + atrasos */
export function estimateWait({ inService = [], waiting = 0, avgServiceMin = 30 }) {
  const remaining = inService.reduce((acc, appt) => {
    const left = Math.max(0, minutesBetween(appt.now, appt.end_at));
    return acc + left;
  }, 0);
  return Math.max(0, Math.round(remaining + waiting * avgServiceMin));
}

/** Aplica cupom a um subtotal */
export function applyCoupon(subtotalCents, coupon) {
  if (!coupon) return { discount: 0, total: subtotalCents };
  if (coupon.min_cents && subtotalCents < coupon.min_cents) return { discount: 0, total: subtotalCents, error: 'valor mínimo' };
  const raw = coupon.type === 'fixed' ? coupon.value : Math.round((subtotalCents * coupon.value) / 100);
  const discount = Math.min(subtotalCents, Math.max(0, raw));
  return { discount, total: subtotalCents - discount };
}

export const appointmentCode = (rand = Math.random) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(rand() * alphabet.length)];
  return `NV-${out}`;
};
