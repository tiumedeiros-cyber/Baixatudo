/**
 * Testes de regras de negócio da agenda.
 * Rodar com: npm test  (node --test server/tests/)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateSlots,
  totalDuration,
  applyCoupon,
  refundPolicy,
  estimateWait,
  hasConflictOverlap,
  appointmentCode,
  addMinutesLocal,
  minutesBetween,
  weekdayOf,
} from '../src/lib/scheduling.js';

test('totalDuration soma os serviços e aplica buffer entre eles', () => {
  const services = [{ duration_min: 30 }, { duration_min: 45 }, { duration_min: 15 }];
  assert.equal(totalDuration(services, 5), 100); // 90 + 2*5
  assert.equal(totalDuration([], 5), 0);
  assert.equal(totalDuration([{ duration_min: 30 }], 5), 30);
});

test('generateSlots respeita grade, almoço e duração', () => {
  const slots = generateSlots({
    date: '2026-03-10',
    workingHours: [{ start_min: 540, end_min: 720 }],
    busy: [],
    durationMin: 45,
    step: 15,
  });
  assert.equal(slots[0].start_at, '2026-03-10T09:00');
  assert.equal(slots[0].end_at, '2026-03-10T09:45');
  // último slot possível dentro de 540–720 com 45min
  assert.equal(slots.at(-1).start_at, '2026-03-10T11:15');
  assert.ok(slots.every((s) => s.end_at <= '2026-03-10T12:00'));
});

test('generateSlots evita sobreposição com atendimentos existentes', () => {
  const slots = generateSlots({
    date: '2026-03-10',
    workingHours: [{ start_min: 540, end_min: 720 }],
    busy: [{ start_at: '2026-03-10T10:00', end_at: '2026-03-10T11:00' }],
    durationMin: 30,
    step: 30,
  });
  const starts = slots.map((s) => s.start_at.slice(11));
  assert.deepEqual(starts, ['09:00', '09:30', '11:00', '11:30']);
});

test('generateSlots respeita almoço (break) e divide os blocos', () => {
  const slots = generateSlots({
    date: '2026-03-10',
    workingHours: [{ start_min: 540, end_min: 780, break_start: 600, break_end: 660 }],
    busy: [],
    durationMin: 30,
    step: 30,
  });
  const starts = slots.map((s) => s.start_at.slice(11));
  assert.ok(!starts.includes('10:00'));
  assert.ok(!starts.includes('10:30'));
  assert.ok(starts.includes('09:30'));
  assert.ok(starts.includes('11:00'));
});

test('generateSlots aplica antecedência mínima', () => {
  const slots = generateSlots({
    date: '2026-03-10',
    workingHours: [{ start_min: 540, end_min: 720 }],
    busy: [],
    durationMin: 30,
    step: 60,
    now: '2026-03-10T09:10',
    minLeadMinutes: 60,
  });
  // 09:00 e 10:00 já não respeitam 60min de antecedência
  assert.ok(slots.every((s) => s.start_at >= '2026-03-10T10:10'));
});

test('generateSlots bloqueia quando a capacidade do dia foi atingida', () => {
  const slots = generateSlots({
    date: '2026-03-10',
    workingHours: [{ start_min: 540, end_min: 720 }],
    busy: [],
    durationMin: 30,
    dayCapacity: 10,
    dayBooked: 10,
  });
  assert.deepEqual(slots, []);
});

test('generateSlots não retorna datas fora da janela máxima', () => {
  const slots = generateSlots({
    date: '2026-09-01',
    workingHours: [{ start_min: 540, end_min: 720 }],
    busy: [],
    durationMin: 30,
    now: '2026-03-10T09:00',
    maxAdvanceDays: 30,
  });
  assert.deepEqual(slots, []);
});

test('applyCoupon calcula percentual, valor fixo e respeita mínimo', () => {
  assert.deepEqual(applyCoupon(10000, { type: 'percent', value: 10 }), { discount: 1000, total: 9000 });
  assert.deepEqual(applyCoupon(10000, { type: 'fixed', value: 2500 }), { discount: 2500, total: 7500 });
  const withMin = applyCoupon(3000, { type: 'percent', value: 20, min_cents: 5000 });
  assert.equal(withMin.total, 3000);
  assert.equal(withMin.error, 'valor mínimo');
  // desconto nunca ultrapassa o subtotal
  assert.equal(applyCoupon(1000, { type: 'fixed', value: 9999 }).total, 0);
});

test('refundPolicy aplica faixas de antecedência', () => {
  assert.equal(refundPolicy({ hoursBefore: 48 }), 100);
  assert.equal(refundPolicy({ hoursBefore: 24 }), 100);
  assert.equal(refundPolicy({ hoursBefore: 10 }), 50);
  assert.equal(refundPolicy({ hoursBefore: 1 }), 0);
  assert.equal(
    refundPolicy({ hoursBefore: 5, policy: { refund: [{ min_hours: 6, percent: 80 }, { min_hours: 0, percent: 20 }] } }),
    20
  );
});

test('estimateWait soma o restante dos atendimentos e a fila', () => {
  const wait = estimateWait({
    inService: [
      { now: '2026-03-10T10:00', end_at: '2026-03-10T10:20' },
      { now: '2026-03-10T10:00', end_at: '2026-03-10T10:10' },
    ],
    waiting: 2,
    avgServiceMin: 30,
  });
  assert.equal(wait, 90); // 30 restantes + 2*30
});

test('helpers de data local', () => {
  assert.equal(addMinutesLocal('2026-03-10T09:30', 75), '2026-03-10T10:45');
  assert.equal(minutesBetween('2026-03-10T09:00', '2026-03-10T10:15'), 75);
  assert.equal(weekdayOf('2026-03-10'), 2);
});

test('hasConflictOverlap detecta sobreposição pura', () => {
  assert.equal(hasConflictOverlap('10:00', '11:00', '10:30', '11:30'), true);
  assert.equal(hasConflictOverlap('10:00', '11:00', '11:00', '12:00'), false);
});

test('appointmentCode gera códigos legíveis e únicos', () => {
  const codes = new Set(Array.from({ length: 500 }, () => appointmentCode()));
  const sample = appointmentCode();
  assert.match(sample, /^NV-[A-Z2-9]{6}$/);
  assert.ok(codes.size > 490);
});
