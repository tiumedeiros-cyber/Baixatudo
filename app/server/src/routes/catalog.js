import { Router } from 'express';
import { all, get, parseJson, getSetting } from '../db.js';
import { appointmentAvailability, professionalWorkingHours } from '../lib/availability.js';
import { weekdayName } from '../lib/availability.js';

const router = Router();

const mapService = (row) => ({ ...row, active: !!row.active });
const mapPro = (row) => ({
  ...row,
  active: !!row.active,
  specialties: parseJson(row.specialties, []),
  rating: Number(row.rating || 0),
});

router.get('/branches', (_req, res) => {
  res.json(
    all('SELECT * FROM branches WHERE active = 1 ORDER BY name').map((b) => ({
      ...b,
      settings: parseJson(b.settings, {}),
    }))
  );
});

router.get('/branches/:id', (req, res) => {
  const branch = get('SELECT * FROM branches WHERE id = ? OR slug = ?', req.params.id, req.params.id);
  if (!branch) return res.status(404).json({ error: 'unidade não encontrada' });
  res.json({ ...branch, settings: parseJson(branch.settings, {}) });
});

router.get('/services', (req, res) => {
  const { branch, category } = req.query;
  const rows = all(
    `SELECT * FROM services WHERE active = 1
       AND (? IS NULL OR branch_id = ?)
       AND (? IS NULL OR category = ?)
     ORDER BY category, name`,
    branch || null,
    branch || null,
    category || null,
    category || null
  );
  res.json(rows.map(mapService));
});

router.get('/services/:id', (req, res) => {
  const row = get('SELECT * FROM services WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'serviço não encontrado' });
  const professionals = all(
    `SELECT p.*, u.name, u.avatar_url FROM professionals p
     JOIN users u ON u.id = p.user_id
     JOIN professional_services ps ON ps.professional_id = p.id
     WHERE ps.service_id = ? AND p.active = 1`,
    row.id
  ).map(mapPro);
  res.json({ ...mapService(row), professionals });
});

router.get('/professionals', (req, res) => {
  const { branch, service } = req.query;
  const rows = all(
    `SELECT p.*, u.name, u.avatar_url, u.email,
            (SELECT COUNT(*) FROM appointments a WHERE a.professional_id = p.id AND a.status = 'concluido') AS atendimentos,
            (SELECT AVG(rating) FROM reviews r WHERE r.professional_id = p.id) AS avg_rating
     FROM professionals p
     JOIN users u ON u.id = p.user_id
     WHERE p.active = 1
       AND (? IS NULL OR p.branch_id = ?)
       AND (? IS NULL OR EXISTS (SELECT 1 FROM professional_services ps WHERE ps.professional_id = p.id AND ps.service_id = ?))
     ORDER BY u.name`,
    branch || null,
    branch || null,
    service || null,
    service || null
  );
  res.json(
    rows.map((row) => ({
      ...mapPro(row),
      avg_rating: row.avg_rating ? Number(row.avg_rating.toFixed(1)) : Number(row.rating || 5),
      services: all('SELECT service_id FROM professional_services WHERE professional_id = ?', row.id).map((r) => r.service_id),
    }))
  );
});

router.get('/professionals/:id', (req, res) => {
  const row = get(
    `SELECT p.*, u.name, u.avatar_url, u.email FROM professionals p JOIN users u ON u.id = p.user_id WHERE p.id = ?`,
    req.params.id
  );
  if (!row) return res.status(404).json({ error: 'profissional não encontrado' });
  const services = all(
    'SELECT s.* FROM services s JOIN professional_services ps ON ps.service_id = s.id WHERE ps.professional_id = ? AND s.active = 1',
    row.id
  ).map(mapService);
  const reviews = all(
    `SELECT r.*, u.name AS client_name FROM reviews r JOIN users u ON u.id = r.client_id
     WHERE r.professional_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    row.id
  );
  res.json({ ...mapPro(row), services, reviews });
});

router.get('/professionals/:id/agenda', (req, res) => {
  const { date } = req.query;
  const pro = get('SELECT * FROM professionals WHERE id = ?', req.params.id);
  if (!pro) return res.status(404).json({ error: 'profissional não encontrado' });
  const appts = all(
    `SELECT a.*, u.name AS client_name, u.phone AS client_phone
     FROM appointments a JOIN users u ON u.id = a.client_id
     WHERE a.professional_id = ? AND a.start_at LIKE ? AND a.status NOT IN ('cancelado')
     ORDER BY a.start_at`,
    pro.id,
    `${date}%`
  );
  const items = all(
    `SELECT ai.* FROM appointment_items ai WHERE ai.appointment_id IN (${appts.map(() => '?').join(',') || 'NULL'})`,
    ...appts.map((a) => a.id)
  );
  res.json({
    date,
    professional_id: pro.id,
    working_hours: professionalWorkingHours(pro.id, date),
    appointments: appts.map((a) => ({ ...a, items: items.filter((i) => i.appointment_id === a.id) })),
    time_off: all('SELECT * FROM time_off WHERE professional_id = ? AND start_at < ? AND end_at > ?', pro.id, `${date}T23:59`, `${date}T00:00`),
  });
});

router.get('/availability', (req, res) => {
  const { date, professional, services, branch } = req.query;
  if (!date || !services) return res.status(400).json({ error: 'informe date e services' });
  const serviceIds = String(services)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const result = appointmentAvailability({
    date,
    professionalId: professional || 'any',
    serviceIds,
    branchId: branch || get('SELECT id FROM branches ORDER BY created_at LIMIT 1')?.id,
  });
  res.json(result);
});

router.get('/plans', (_req, res) => {
  res.json(
    all('SELECT * FROM plans WHERE active = 1').map((p) => ({ ...p, perks: parseJson(p.perks, []) }))
  );
});

router.get('/reviews', (req, res) => {
  const limit = Number(req.query.limit || 12);
  res.json(
    all(
      `SELECT r.*, u.name AS client_name, u.avatar_url, pu.name AS professional_name
       FROM reviews r
       JOIN users u ON u.id = r.client_id
       JOIN professionals p ON p.id = r.professional_id
       JOIN users pu ON pu.id = p.user_id
       ORDER BY r.created_at DESC LIMIT ?`,
      limit
    )
  );
});

router.get('/working-hours', (req, res) => {
  const { professional } = req.query;
  if (!professional) return res.status(400).json({ error: 'informe professional' });
  const rows = all('SELECT * FROM working_hours WHERE professional_id = ? ORDER BY weekday, start_min', professional);
  res.json(
    rows.map((r) => ({
      ...r,
      weekday_label: weekdayName(r.weekday),
    }))
  );
});

/** Configurações públicas da barbearia (políticas, contato, features) */
router.get('/settings/public', (_req, res) => {
  res.json({
    business: getSetting('business', {}),
    policies: getSetting('policies', {}),
    integrations: Object.fromEntries(
      Object.entries(getSetting('integrations', {})).map(([k, v]) => [k, typeof v === 'boolean' ? v : 'configurado'])
    ),
  });
});

export default router;
