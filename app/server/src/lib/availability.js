import { all, get } from '../db.js';
import {
  generateSlots,
  totalDuration,
  weekdayOf,
  toLocal,
  addMinutesLocal,
  parseLocal,
} from './scheduling.js';

const BLOCKING_STATUSES = ['pendente', 'confirmado', 'em_atendimento', 'concluido'];

export const getServices = (ids = []) => {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = all(`SELECT * FROM services WHERE id IN (${placeholders}) AND active = 1`, ...ids);
  // mantém a ordem escolhida pelo cliente
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
};

export const professionalWorkingHours = (professionalId, dateStr) =>
  all(
    'SELECT * FROM working_hours WHERE professional_id = ? AND weekday = ? ORDER BY start_min',
    professionalId,
    weekdayOf(dateStr)
  );

export const busyIntervals = (professionalId, dateStr) => {
  const dayStart = `${dateStr}T00:00`;
  const dayEnd = `${dateStr}T23:59`;

  const appointments = all(
    `SELECT start_at, end_at FROM appointments
     WHERE professional_id = ? AND start_at < ? AND end_at > ?
       AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})`,
    professionalId,
    dayEnd,
    dayStart,
    ...BLOCKING_STATUSES
  ).map((row) => {
    // aplica o buffer padrão de 5min após cada atendimento
    return { start_at: row.start_at, end_at: addMinutesLocal(row.end_at, 5) };
  });

  const offs = all(
    `SELECT start_at, end_at FROM time_off
     WHERE professional_id = ? AND start_at < ? AND end_at > ?`,
    professionalId,
    dayEnd,
    dayStart
  );

  return [...appointments, ...offs];
};

export const appointmentAvailability = ({ date, professionalId, serviceIds, branchId }) => {
  const services = getServices(serviceIds);
  if (!services.length) return { slots: [], duration_min: 0, services: [] };

  const branch = get('SELECT * FROM branches WHERE id = ?', branchId);
  const policy = {
    min_lead_minutes: Number(branch?.settings ? JSON.parse(branch.settings).min_lead_minutes ?? 60 : 60),
    max_advance_days: Number(branch?.settings ? JSON.parse(branch.settings).max_advance_days ?? 60 : 60),
    buffer_min: Number(branch?.settings ? JSON.parse(branch.settings).buffer_min ?? 5 : 5),
    day_capacity: Number(branch?.settings ? JSON.parse(branch.settings).day_capacity ?? 0 : 0),
  };

  const duration = totalDuration(services, policy.buffer_min);

  let professionals = [];
  if (professionalId && professionalId !== 'any') {
    const pro = get('SELECT * FROM professionals WHERE id = ? AND active = 1', professionalId);
    if (pro) professionals = [pro];
  } else {
    professionals = all(
      `SELECT DISTINCT p.* FROM professionals p
       JOIN professional_services ps ON ps.professional_id = p.id
       WHERE p.active = 1 AND (? IS NULL OR p.branch_id = ?)
         AND ps.service_id IN (${serviceIds.map(() => '?').join(',')})`,
      branchId || null,
      branchId || null,
      ...serviceIds
    );
  }

  const now = toLocal(new Date());
  const dayBooked = get(
    `SELECT COUNT(*) AS total FROM appointments WHERE branch_id = ? AND start_at LIKE ? AND status IN ('pendente','confirmado','em_atendimento','concluido')`,
    branchId,
    `${date}%`
  )?.total || 0;

  const slots = [];
  for (const pro of professionals) {
    const wh = professionalWorkingHours(pro.id, date);
    if (!wh.length) continue;
    const busy = busyIntervals(pro.id, date);
    const found = generateSlots({
      date,
      professionalId: pro.id,
      workingHours: wh,
      busy,
      durationMin: duration,
      bufferMin: policy.buffer_min,
      now,
      minLeadMinutes: policy.min_lead_minutes,
      maxAdvanceDays: policy.max_advance_days,
      dayCapacity: policy.day_capacity,
      dayBooked,
    });
    slots.push(...found);
  }

  const seen = new Set();
  const unique = slots
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .filter((slot) => {
      const key = `${slot.start_at}-${slot.professional_id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return {
    date,
    duration_min: duration,
    buffer_min: policy.buffer_min,
    min_lead_minutes: policy.min_lead_minutes,
    services,
    slots: unique,
  };
};

export const hasConflict = (professionalId, startAt, endAt, ignoreId = null) => {
  const padded = { start_at: startAt, end_at: addMinutesLocal(endAt, 5) };
  const rows = all(
    `SELECT id FROM appointments
     WHERE professional_id = ? AND id != ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
       AND start_at < ? AND end_at > ?`,
    professionalId,
    ignoreId || '',
    ...BLOCKING_STATUSES,
    padded.end_at,
    startAt
  );
  const offs = all(
    'SELECT id FROM time_off WHERE professional_id = ? AND start_at < ? AND end_at > ?',
    professionalId,
    padded.end_at,
    startAt
  );
  return rows.length > 0 || offs.length > 0;
};

export const weekdayName = (weekday, locale = 'pt-BR') => {
  const map = {
    'pt-BR': ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  };
  return (map[locale] || map['pt-BR'])[weekday];
};

export const hoursUntil = (startAt, now = toLocal(new Date())) =>
  Math.round((parseLocal(startAt).getTime() - parseLocal(now).getTime()) / 3600000);
