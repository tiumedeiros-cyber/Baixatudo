import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Appointment, type Professional, type Service } from '../../lib/api';
import { brl, compactBrl, dateStr, durationLabel, fmtDate, fmtDateTime, paymentLabel, paymentStatusLabel, statusLabel, statusStyle, timeStr } from '../../lib/format';
import { Avatar, Badge, BarChart, Button, EmptyState, Field, Icon, Input, Modal, Select, Spinner, StatCard, Textarea, Toggle, useToast } from '../../components/ui';

/* ================================ CLIENTES ============================== */
type ClientRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  client_id: string;
  visits: number;
  total_spent_cents: number;
  no_shows: number;
  last_visit?: string;
  next_visit?: string;
  tags: string[];
  notes: { id: string; author: string; body: string; created_at: string; photo_url?: string | null }[];
};

type ClientDetail = ClientRow & {
  user: { id: string; name: string; email: string; phone: string; birthday?: string; preferences: Record<string, unknown> };
  appointments: (Appointment & { professional_name: string })[];
  payments: { id: string; method: string; status: string; amount_cents: number; created_at: string }[];
};

export function AdminClients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState('todos');
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const { push } = useToast();

  const load = useCallback(() => {
    setLoading(true);
    api.get<ClientRow[]>('/admin/clients').then(setClients).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const filtered = clients.filter((client) => {
    const matchesSearch = !search || [client.name, client.email, client.phone].some((v) => v?.toLowerCase().includes(search.toLowerCase()));
    const matchesSegment =
      segment === 'todos' ||
      (segment === 'vip' && client.total_spent_cents > 60000) ||
      (segment === 'inativos' && (!client.last_visit || client.last_visit < dateStr(new Date(Date.now() - 45 * 86400000)))) ||
      (segment === 'novos' && client.visits <= 2);
    return matchesSearch && matchesSegment;
  });

  async function openDetail(row: ClientRow) {
    try {
      setDetail(await api.get<ClientDetail>(`/admin/clients/${row.client_id}`));
    } catch {
      push('Não foi possível abrir a ficha', 'error');
    }
  }

  async function addNote() {
    if (!detail || !note.trim()) return;
    try {
      await api.post(`/admin/clients/${detail.id}/notes`, { body: note });
      setNote('');
      setDetail(await api.get<ClientDetail>(`/admin/clients/${detail.id}`));
      push('Nota adicionada');
      load();
    } catch {
      push('Erro ao salvar nota', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-cream-300/40" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou telefone" className="!pl-9" />
        </div>
        <Select value={segment} onChange={(e) => setSegment(e.target.value)} className="!w-auto">
          <option value="todos">Todos os clientes</option>
          <option value="vip">VIP (acima de R$ 600)</option>
          <option value="inativos">Inativos (45+ dias)</option>
          <option value="novos">Novos (até 2 visitas)</option>
        </Select>
        <span className="chip">{filtered.length} clientes</span>
        <Button variant="ghost" icon="download" onClick={() => exportCsv(filtered, 'clientes')} className="!py-2 text-xs">Exportar CSV</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Cliente</th><th>Contato</th><th>Visitas</th><th>Total gasto</th><th>Última visita</th><th>Tags</th><th /></tr>
            </thead>
            <tbody>
              {filtered.map((client) => (
                <tr key={client.id} className="cursor-pointer" onClick={() => openDetail(client)}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={client.name} size={32} />
                      <span>{client.name}</span>
                    </div>
                  </td>
                  <td className="text-xs">
                    <span className="block">{client.phone || '—'}</span>
                    <span className="text-cream-300/40">{client.email}</span>
                  </td>
                  <td>{client.visits}</td>
                  <td className="whitespace-nowrap text-brass-200">{brl(client.total_spent_cents)}</td>
                  <td className="whitespace-nowrap text-xs text-cream-300/60">{client.last_visit ? fmtDate(client.last_visit) : '—'}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {client.tags.map((tag) => (
                        <span key={tag} className={`rounded-full px-2 py-0.5 text-[10px] ${tag === 'vip' ? 'bg-brass-400/20 text-brass-200' : 'bg-white/8 text-cream-300/70'}`}>{tag}</span>
                      ))}
                    </div>
                  </td>
                  <td><Icon name="chevron-right" className="h-4 w-4 text-cream-300/40" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="p-6"><EmptyState icon="users" title="Nenhum cliente encontrado" description="Tente outro termo de busca ou segmento." /></div>}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.name || 'Ficha do cliente'} width="max-w-3xl">
        {detail && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">visitas</p><p className="mt-1 text-xl text-cream-50">{detail.visits}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">total gasto</p><p className="mt-1 text-xl text-brass-200">{brl(detail.total_spent_cents)}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">no-shows</p><p className="mt-1 text-xl text-cream-50">{detail.no_shows}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">contato</p><p className="mt-1 text-xs text-cream-100">{detail.phone}</p><p className="text-[10px] text-cream-300/50">{detail.email}</p></div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-cream-300/50">Notas do barbeiro</p>
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: prefere máquina 0.5, alérgico a pó…" />
                <Button onClick={addNote} icon="plus">Adicionar</Button>
              </div>
              <ul className="mt-2 space-y-2">
                {(detail.notes || []).map((n) => (
                  <li key={n.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs">
                    <p className="text-cream-200">{n.body}</p>
                    <p className="mt-1 text-[10px] text-cream-300/40">{n.author} · {fmtDateTime(n.created_at)}</p>
                  </li>
                ))}
                {!detail.notes?.length && <p className="text-xs text-cream-300/40">Nenhuma nota registrada.</p>}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-widest text-cream-300/50">Últimos atendimentos</p>
              <div className="max-h-52 overflow-y-auto">
                <table className="table">
                  <tbody>
                    {detail.appointments.slice(0, 12).map((appointment) => (
                      <tr key={appointment.id}>
                        <td className="whitespace-nowrap text-xs">{fmtDateTime(appointment.start_at)}</td>
                        <td className="text-xs">{appointment.professional_name}</td>
                        <td className="text-xs">{brl(appointment.total_cents)}</td>
                        <td><span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function exportCsv(rows: Record<string, unknown>[], filename: string) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]).filter((k) => typeof rows[0][k] !== 'object');
  const csv = [headers.join(';'), ...rows.map((row) => headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}-${dateStr(new Date())}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ================================ SERVIÇOS ============================== */
export function AdminServices() {
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  const load = useCallback(() => {
    api.get<Service[]>('/admin/services').then(setServices).catch(() => {});
    api.get<Professional[]>('/admin/professionals').then(setProfessionals).catch(() => {});
  }, []);

  useEffect(load, [load]);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const payload = {
        name: editing.name,
        description: editing.description,
        category: editing.category,
        duration_min: Number(editing.duration_min),
        price_cents: Number(editing.price_cents),
        active: editing.active ?? true,
      };
      if (editing.id) await api.put(`/admin/services/${editing.id}`, payload);
      else await api.post('/admin/services', payload);
      push('Serviço salvo');
      setEditing(null);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggle(service: Service) {
    await api.put(`/admin/services/${service.id}`, { active: !service.active });
    load();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream-300/60">{services.filter((s) => s.active).length} ativos de {services.length} serviços</p>
        <Button onClick={() => setEditing({ name: '', description: '', category: 'cabelo', duration_min: 30, price_cents: 5000, active: true })} icon="plus">Novo serviço</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {services.map((service) => (
          <div key={service.id} className={`card-tight ${service.active ? '' : 'opacity-60'}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-cream-100">{service.name}</p>
                <p className="text-[11px] text-cream-300/50">{service.branch_id === 'brn_norte' ? 'Zona Norte' : 'Centro'} · {service.category}</p>
              </div>
              <Toggle checked={!!service.active} onChange={() => toggle(service)} label="Ativo" />
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-cream-300/60">{service.description}</p>
            <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-3">
              <span className="text-sm text-brass-200">{brl(service.price_cents)}</span>
              <span className="text-[11px] text-cream-300/50">{durationLabel(service.duration_min)}</span>
              <button onClick={() => setEditing(service)} className="rounded p-1.5 text-cream-300/60 hover:bg-white/10 hover:text-cream-100" aria-label="Editar">
                <Icon name="edit" className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Editar serviço' : 'Novo serviço'}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></>}
      >
        {editing && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome" className="sm:col-span-2"><Input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Descrição" className="sm:col-span-2"><Textarea rows={2} value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Categoria">
              <Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                {['cabelo', 'barba', 'combo', 'coloracao', 'estetica', 'tratamento'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Duração (min)"><Input type="number" value={editing.duration_min || 30} onChange={(e) => setEditing({ ...editing, duration_min: Number(e.target.value) })} /></Field>
            <Field label="Preço (centavos)" hint={brl(editing.price_cents || 0)}><Input type="number" value={editing.price_cents || 0} onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} /></Field>
            <div className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm">
              Ativo para agendamento
              <Toggle checked={editing.active ?? true} onChange={(v) => setEditing({ ...editing, active: v })} />
            </div>
            <p className="text-[11px] text-cream-300/50 sm:col-span-2">{professionals.length} profissionais disponíveis para vincular a este serviço.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================= EQUIPE =============================== */
type TeamMember = Professional & {
  email: string;
  phone: string;
  working_hours: { id: string; weekday: number; start_min: number; end_min: number; break_start?: number; break_end?: number }[];
  time_off: { id: string; start_at: string; end_at: string; reason: string; kind: string }[];
  services: string[];
};

const weekdayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export function AdminTeam() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [saving, setSaving] = useState(false);
  const [newPro, setNewPro] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', specialties: '', commission_pct: 40, bio: '' });
  const [timeOff, setTimeOff] = useState<{ pro: string; start: string; end: string; reason: string } | null>(null);
  const { push } = useToast();

  const load = useCallback(() => {
    api.get<TeamMember[]>('/admin/professionals').then(setTeam).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function create() {
    setSaving(true);
    try {
      await api.post('/admin/professionals', {
        ...form,
        specialties: form.specialties.split(',').map((s) => s.trim()).filter(Boolean),
        password: '123456',
      });
      push('Profissional criado com senha padrão 123456');
      setNewPro(false);
      setForm({ name: '', email: '', phone: '', specialties: '', commission_pct: 40, bio: '' });
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao criar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleDay(pro: TeamMember, weekday: number) {
    const existing = pro.working_hours.filter((h) => h.weekday === weekday);
    let hours = pro.working_hours.map((h) => ({ weekday: h.weekday, start_min: h.start_min, end_min: h.end_min, break_start: h.break_start, break_end: h.break_end }));
    if (existing.length) {
      hours = hours.filter((h) => h.weekday !== weekday);
    } else {
      hours.push({ weekday, start_min: 540, end_min: 1200, break_start: 720, break_end: 780 });
    }
    try {
      await api.put(`/admin/professionals/${pro.id}/working-hours`, { working_hours: hours });
      load();
    } catch {
      push('Erro ao atualizar escala', 'error');
    }
  }

  async function toggleActive(pro: TeamMember) {
    await api.put(`/admin/professionals/${pro.id}`, { active: !pro.active });
    load();
  }

  async function addTimeOff() {
    if (!timeOff) return;
    try {
      const result = await api.post<{ affected_appointments: number }>(`/admin/professionals/${timeOff.pro}/time-off`, {
        start_at: timeOff.start,
        end_at: timeOff.end,
        reason: timeOff.reason,
        kind: 'bloqueio',
      });
      push(`Bloqueio criado · ${result.affected_appointments} cliente(s) notificado(s)`);
      setTimeOff(null);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao bloquear', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-cream-300/60">{team.filter((p) => p.active).length} profissionais ativos</p>
        <Button onClick={() => setNewPro(true)} icon="plus">Novo profissional</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {team.map((pro) => (
          <div key={pro.id} className="card space-y-4">
            <div className="flex items-start gap-3">
              <Avatar name={pro.name} url={pro.avatar_url} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-cream-50">{pro.name}</p>
                  <Badge tone={pro.active ? 'success' : 'danger'}>{pro.active ? 'ativo' : 'inativo'}</Badge>
                </div>
                <p className="text-xs text-cream-300/50">{pro.email} · {pro.phone}</p>
                <p className="mt-1 text-[11px] text-cream-300/40">comissão {pro.commission_pct}% · {pro.services?.length || 0} serviços</p>
              </div>
              <Toggle checked={!!pro.active} onChange={() => toggleActive(pro)} label="Ativo" />
            </div>

            <div>
              <p className="mb-2 text-[11px] uppercase tracking-widest text-cream-300/50">Escala recorrente</p>
              <div className="flex flex-wrap gap-1">
                {weekdayLabels.map((label, weekday) => {
                  const active = pro.working_hours.some((h) => h.weekday === weekday);
                  return (
                    <button
                      key={weekday}
                      onClick={() => toggleDay(pro, weekday)}
                      className={`h-8 w-10 rounded-lg border text-[11px] transition ${active ? 'border-moss-400/40 bg-moss-400/15 text-moss-400' : 'border-white/10 text-cream-300/40 hover:bg-white/5'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] text-cream-300/40">
                {pro.working_hours.length
                  ? pro.working_hours.map((h) => `${weekdayLabels[h.weekday]} ${timeStr(`2000-01-01T${String(Math.floor(h.start_min / 60)).padStart(2, '0')}:${String(h.start_min % 60).padStart(2, '0')}`)}–${String(Math.floor(h.end_min / 60)).padStart(2, '0')}h`).join(' · ')
                  : 'Sem dias configurados'}
              </p>
            </div>

            {pro.time_off.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] uppercase tracking-widest text-cream-300/50">Bloqueios futuros</p>
                <ul className="space-y-1 text-[11px] text-cream-300/70">
                  {pro.time_off.map((off) => (
                    <li key={off.id} className="flex items-center justify-between gap-2">
                      <span>{fmtDate(off.start_at)} → {fmtDate(off.end_at)} · {off.reason}</span>
                      <button onClick={() => api.del(`/admin/time-off/${off.id}`).then(load)} className="text-rose-400/70 hover:text-rose-400" aria-label="Remover bloqueio">
                        <Icon name="x" className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setTimeOff({ pro: pro.id, start: `${dateStr(new Date())}T09:00`, end: `${dateStr(new Date())}T18:00`, reason: 'Compromisso pessoal' })}>
              <Icon name="calendar" className="h-3.5 w-3.5" /> Bloquear período
            </Button>
          </div>
        ))}
      </div>

      <Modal
        open={newPro}
        onClose={() => setNewPro(false)}
        title="Novo profissional"
        footer={<><Button variant="ghost" onClick={() => setNewPro(false)}>Cancelar</Button><Button onClick={create} loading={saving}>Criar</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Comissão (%)"><Input type="number" value={form.commission_pct} onChange={(e) => setForm({ ...form, commission_pct: Number(e.target.value) })} /></Field>
          <Field label="Especialidades" hint="separe por vírgula" className="sm:col-span-2"><Input value={form.specialties} onChange={(e) => setForm({ ...form, specialties: e.target.value })} placeholder="Degradê, Barba, Colorimetria" /></Field>
          <Field label="Bio" className="sm:col-span-2"><Textarea rows={2} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></Field>
        </div>
        <p className="text-xs text-cream-300/50">A senha inicial é 123456 e a escala padrão é terça a sábado, 09h–19h.</p>
      </Modal>

      <Modal
        open={!!timeOff}
        onClose={() => setTimeOff(null)}
        title="Bloquear agenda"
        footer={<><Button variant="ghost" onClick={() => setTimeOff(null)}>Cancelar</Button><Button onClick={addTimeOff}>Criar bloqueio</Button></>}
      >
        {timeOff && (
          <div className="space-y-3">
            <Field label="Início"><Input type="datetime-local" value={timeOff.start} onChange={(e) => setTimeOff({ ...timeOff, start: e.target.value })} /></Field>
            <Field label="Fim"><Input type="datetime-local" value={timeOff.end} onChange={(e) => setTimeOff({ ...timeOff, end: e.target.value })} /></Field>
            <Field label="Motivo"><Input value={timeOff.reason} onChange={(e) => setTimeOff({ ...timeOff, reason: e.target.value })} /></Field>
            <p className="text-xs text-cream-300/60">Clientes com horário nesse intervalo recebem um SMS pedindo para remarcar.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================ FINANCEIRO ============================ */
export function AdminFinance() {
  const [data, setData] = useState<{ gross_cents: number; discounts_cents: number; refunded_cents: number; daily: { day: string; gross: number; appointments: number }[]; by_method: { method: string; total: number; qty: number }[]; commissions: { name: string; revenue: number; commission: number; commission_pct: number }[] } | null>(null);
  const [payments, setPayments] = useState<{ id: string; client_name: string; method: string; status: string; amount_cents: number; appointment_code: string; created_at: string; refunded_cents: number }[]>([]);
  const [coupons, setCoupons] = useState<{ id: string; code: string; type: string; value: number; used_count: number; usage_limit: number; active: number; expires_at?: string }[]>([]);
  const [newCoupon, setNewCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: '', type: 'percent', value: 10, min_cents: 0, usage_limit: 100 });
  const { push } = useToast();

  const load = useCallback(() => {
    api.get<typeof data>('/reports/finance').then(setData).catch(() => {});
    api.get<typeof payments>('/payments').then(setPayments).catch(() => {});
    api.get<typeof coupons>('/admin/coupons').then(setCoupons).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function createCoupon() {
    try {
      await api.post('/admin/coupons', couponForm);
      push('Cupom criado');
      setNewCoupon(false);
      setCouponForm({ code: '', type: 'percent', value: 10, min_cents: 0, usage_limit: 100 });
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao criar cupom', 'error');
    }
  }

  async function refund(paymentId: string) {
    if (!window.confirm('Reembolsar 100% deste pagamento?')) return;
    try {
      await api.post(`/payments/${paymentId}/refund`, { percent: 100, reason: 'solicitação administrativa' });
      push('Reembolso processado');
      load();
    } catch {
      push('Erro no reembolso', 'error');
    }
  }

  if (!data) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Receita bruta (30d)" value={compactBrl(data.gross_cents)} icon="money" />
        <StatCard label="Descontos" value={compactBrl(data.discounts_cents)} hint="cupons e promoções" icon="tag" />
        <StatCard label="Reembolsos" value={compactBrl(data.refunded_cents)} hint="cancelamentos" icon="arrow-left" />
        <StatCard label="Ticket médio" value={brl(Math.round(data.gross_cents / Math.max(1, data.daily.reduce((s, d) => s + d.appointments, 0))))} icon="chart" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card">
          <h3 className="text-lg text-cream-50">Fechamento diário</h3>
          <div className="mt-4 max-h-72 overflow-y-auto">
            <table className="table">
              <thead><tr><th>Dia</th><th>Atendimentos</th><th>Receita</th></tr></thead>
              <tbody>
                {[...data.daily].reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="text-xs">{row.day.split('-').reverse().join('/')}</td>
                    <td>{row.appointments}</td>
                    <td className="text-brass-200">{brl(row.gross)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button variant="ghost" className="mt-3 !py-1.5 text-xs" icon="download" onClick={() => exportCsv(data.daily, 'fechamento')}>Exportar CSV</Button>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg text-cream-50">Comissões da equipe</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {data.commissions.map((pro) => (
                <li key={pro.name} className="flex items-center justify-between border-b border-white/6 pb-2 last:border-0">
                  <span className="text-cream-200">{pro.name} <span className="text-[10px] text-cream-300/40">{pro.commission_pct}%</span></span>
                  <span className="text-right">
                    <span className="block text-brass-200">{brl(pro.commission)}</span>
                    <span className="text-[10px] text-cream-300/40">de {compactBrl(pro.revenue)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="text-sm uppercase tracking-widest text-cream-300/50">Recebimento por método</h3>
            <div className="mt-3"><BarChart items={data.by_method.map((m) => ({ label: paymentLabel[m.method] || m.method, value: m.total }))} format={brl} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="text-lg text-cream-50">Últimas transações</h3>
          <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setNewCoupon(true)} icon="plus">Novo cupom</Button>
        </div>
        <div className="mt-4 table-wrap">
          <table className="table">
            <thead><tr><th>Cliente</th><th>Agendamento</th><th>Método</th><th>Valor</th><th>Status</th><th /></tr></thead>
            <tbody>
              {payments.slice(0, 15).map((payment) => (
                <tr key={payment.id}>
                  <td>{payment.client_name || '—'}</td>
                  <td className="font-mono text-xs">{payment.appointment_code || '—'}</td>
                  <td className="text-xs">{paymentLabel[payment.method] || payment.method}</td>
                  <td className="whitespace-nowrap">{brl(payment.amount_cents)}</td>
                  <td>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] ${payment.status === 'pago' ? 'bg-moss-400/15 text-moss-400' : payment.status === 'reembolsado' ? 'bg-rose-400/15 text-rose-400' : 'bg-white/8 text-cream-300/70'}`}>
                      {paymentStatusLabel[payment.status] || payment.status}
                    </span>
                  </td>
                  <td>{['pago', 'autorizado'].includes(payment.status) && <Button variant="ghost" className="!px-2 !py-1 text-[10px]" onClick={() => refund(payment.id)}>Reembolsar</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg text-cream-50">Cupons ativos</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {coupons.map((coupon) => (
            <div key={coupon.id} className={`rounded-xl border p-3 ${coupon.active ? 'border-white/10' : 'border-white/5 opacity-50'}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm text-brass-200">{coupon.code}</span>
                <Toggle checked={!!coupon.active} onChange={() => api.put(`/admin/coupons/${coupon.id}`, { active: !coupon.active }).then(load)} />
              </div>
              <p className="mt-1 text-[11px] text-cream-300/60">
                {coupon.type === 'percent' ? `${coupon.value}% off` : `${brl(coupon.value)} off`} · {coupon.used_count}/{coupon.usage_limit} usos
              </p>
            </div>
          ))}
        </div>
      </div>

      <Modal
        open={newCoupon}
        onClose={() => setNewCoupon(false)}
        title="Novo cupom de desconto"
        footer={<><Button variant="ghost" onClick={() => setNewCoupon(false)}>Cancelar</Button><Button onClick={createCoupon}>Criar cupom</Button></>}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Código"><Input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="OUTONO20" /></Field>
          <Field label="Tipo">
            <Select value={couponForm.type} onChange={(e) => setCouponForm({ ...couponForm, type: e.target.value })}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo (centavos)</option>
            </Select>
          </Field>
          <Field label={couponForm.type === 'percent' ? 'Desconto (%)' : 'Desconto (centavos)'}>
            <Input type="number" value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: Number(e.target.value) })} />
          </Field>
          <Field label="Valor mínimo (centavos)"><Input type="number" value={couponForm.min_cents} onChange={(e) => setCouponForm({ ...couponForm, min_cents: Number(e.target.value) })} /></Field>
          <Field label="Limite de usos"><Input type="number" value={couponForm.usage_limit} onChange={(e) => setCouponForm({ ...couponForm, usage_limit: Number(e.target.value) })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

/* ================================ MARKETING ============================= */
export function AdminMarketing() {
  const [campaigns, setCampaigns] = useState<{ id: string; name: string; channel: string; segment: string; recipients: number; created_at: string; body: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; key: string; channel: string; subject?: string; body: string; active: number }[]>([]);
  const [form, setForm] = useState({ name: '', channel: 'email', segment: 'todos', body: '' });
  const [saving, setSaving] = useState(false);
  const [editTemplate, setEditTemplate] = useState<typeof templates[number] | null>(null);
  const { push } = useToast();

  const load = useCallback(() => {
    api.get<typeof campaigns>('/admin/campaigns').then(setCampaigns).catch(() => {});
    api.get<typeof templates>('/admin/notification-templates').then(setTemplates).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function send() {
    if (!form.name || !form.body) return push('Preencha nome e mensagem', 'error');
    setSaving(true);
    try {
      const result = await api.post<{ recipients: number }>('/admin/campaigns', form);
      push(`Campanha enviada para ${result.recipients} clientes`);
      setForm({ name: '', channel: 'email', segment: 'todos', body: '' });
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao enviar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveTemplate() {
    if (!editTemplate) return;
    await api.put(`/admin/notification-templates/${editTemplate.id}`, { subject: editTemplate.subject, body: editTemplate.body, active: !!editTemplate.active });
    push('Template atualizado');
    setEditTemplate(null);
    load();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <div className="card space-y-3">
          <h3 className="text-lg text-cream-50">Nova campanha</h3>
          <Field label="Nome da campanha"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Combo de inverno" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Canal">
              <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                <option value="email">E-mail</option>
                <option value="sms">SMS</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="push">Push</option>
              </Select>
            </Field>
            <Field label="Segmento">
              <Select value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>
                <option value="todos">Todos os clientes</option>
                <option value="inativos">Inativos (45+ dias)</option>
                <option value="vip">VIP (alto ticket)</option>
                <option value="aniversariantes">Aniversariantes do mês</option>
              </Select>
            </Field>
          </div>
          <Field label="Mensagem" hint="Use {{nome}} para personalizar">
            <Textarea rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Olá {{nome}}, semana do degradê com 20% off…" />
          </Field>
          <Button onClick={send} loading={saving} icon="message">Enviar campanha</Button>
        </div>

        <div className="card">
          <h3 className="text-lg text-cream-50">Histórico de campanhas</h3>
          <ul className="mt-3 space-y-2">
            {campaigns.map((campaign) => (
              <li key={campaign.id} className="rounded-xl border border-white/8 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-cream-100">{campaign.name}</p>
                  <Badge tone="success">{campaign.recipients} envios</Badge>
                </div>
                <p className="mt-1 text-[11px] text-cream-300/50">{campaign.channel} · {campaign.segment} · {fmtDateTime(campaign.created_at)}</p>
                <p className="mt-1 line-clamp-2 text-xs text-cream-300/70">{campaign.body}</p>
              </li>
            ))}
            {!campaigns.length && <EmptyState title="Nenhuma campanha ainda" description="Crie a primeira e veja os envios registrados aqui." />}
          </ul>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg text-cream-50">Templates de mensagem</h3>
        <p className="text-xs text-cream-300/50">Personalize o texto de cada evento e canal.</p>
        <div className="mt-4 space-y-2">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => setEditTemplate(template)}
              className="flex w-full items-start justify-between gap-3 rounded-xl border border-white/8 p-3 text-left transition hover:border-brass-400/40"
            >
              <div className="min-w-0">
                <p className="text-sm text-cream-100">{template.subject || template.key}</p>
                <p className="truncate text-[11px] text-cream-300/50">{template.body}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase ${template.channel === 'email' ? 'bg-sky-400/15 text-sky-300' : template.channel === 'sms' ? 'bg-brass-400/15 text-brass-200' : 'bg-white/8 text-cream-300/70'}`}>
                {template.channel}
              </span>
            </button>
          ))}
        </div>
      </div>

      <Modal
        open={!!editTemplate}
        onClose={() => setEditTemplate(null)}
        title="Editar template"
        footer={<><Button variant="ghost" onClick={() => setEditTemplate(null)}>Cancelar</Button><Button onClick={saveTemplate}>Salvar</Button></>}
      >
        {editTemplate && (
          <div className="space-y-3">
            <Field label="Assunto"><Input value={editTemplate.subject || ''} onChange={(e) => setEditTemplate({ ...editTemplate, subject: e.target.value })} /></Field>
            <Field label="Mensagem" hint="Variáveis: {{nome}}, {{data}}, {{hora}}, {{profissional}}, {{codigo}}">
              <Textarea rows={5} value={editTemplate.body} onChange={(e) => setEditTemplate({ ...editTemplate, body: e.target.value })} />
            </Field>
            <label className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm">
              Template ativo
              <Toggle checked={!!editTemplate.active} onChange={(v) => setEditTemplate({ ...editTemplate, active: v ? 1 : 0 })} />
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================================ RELATÓRIOS ============================ */
export function AdminReports() {
  const [occupancy, setOccupancy] = useState<{ id: string; name: string; appointments: number; done: number; canceled: number; no_shows: number; occupancy_pct: number }[]>([]);
  const [reviews, setReviews] = useState<{ id: string; rating: number; comment: string; client_name: string; professional_name: string; created_at: string }[]>([]);

  useEffect(() => {
    api.get<typeof occupancy>('/reports/occupancy').then(setOccupancy).catch(() => {});
    api.get<typeof reviews>('/reviews?limit=12').then(setReviews).catch(() => {});
  }, []);

  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Avaliação média" value={avg.toFixed(2)} hint={`${reviews.length} avaliações recentes`} icon="star" />
        <StatCard label="Cancelamentos" value={`${occupancy.reduce((s, o) => s + o.canceled, 0)}`} hint="nos últimos 30 dias" icon="x" />
        <StatCard label="No-shows" value={`${occupancy.reduce((s, o) => s + o.no_shows, 0)}`} hint="política de taxa aplicável" icon="shield" />
      </div>

      <div className="card">
        <h3 className="text-lg text-cream-50">Ocupação por profissional</h3>
        <div className="mt-4 space-y-3">
          {occupancy.map((pro) => (
            <div key={pro.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cream-100">{pro.name}</span>
                <span className="text-cream-300/60">{pro.done} concluídos · {pro.canceled} cancel. · {pro.no_shows} no-show</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/8">
                <div className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300" style={{ width: `${pro.occupancy_pct}%` }} />
              </div>
              <p className="mt-1 text-[10px] text-cream-300/40">{pro.occupancy_pct}% de ocupação estimada</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg text-cream-50">Avaliações recentes</h3>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-xl border border-white/8 p-3">
              <div className="flex items-center justify-between">
                <span className="text-brass-300">{'★'.repeat(review.rating)}<span className="text-white/15">{'★'.repeat(5 - review.rating)}</span></span>
                <span className="text-[10px] text-cream-300/40">{fmtDate(review.created_at)}</span>
              </div>
              <p className="mt-2 text-xs text-cream-200/90">“{review.comment}”</p>
              <p className="mt-1 text-[10px] text-cream-300/40">{review.client_name} · {review.professional_name}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* =============================== CONFIGURAÇÕES ========================== */
type Settings = {
  business: Record<string, string>;
  policies: { min_lead_minutes?: number; max_advance_days?: number; buffer_min?: number; no_show_fee_pct?: number; terms?: string; refund?: { min_hours: number; percent: number }[] };
  integrations: Record<string, boolean>;
  users: { id: string; name: string; email: string; role: string }[];
};

const integrationMeta: { key: string; label: string; desc: string }[] = [
  { key: 'google_calendar', label: 'Google Calendar', desc: 'Espelha os atendimentos no calendário do profissional' },
  { key: 'outlook', label: 'Outlook 365', desc: 'Sincronização bidirecional com o calendário corporativo' },
  { key: 'stripe', label: 'Stripe', desc: 'Cartões internacionais e assinaturas recorrentes' },
  { key: 'mercadopago', label: 'Mercado Pago', desc: 'Pix, boleto e cartões com settlement em D+1' },
  { key: 'pagseguro', label: 'PagSeguro', desc: 'Checkout transparente e parcelamento' },
  { key: 'mailchimp', label: 'Mailchimp', desc: 'Exporta segmentos e automações de e-mail' },
  { key: 'whatsapp', label: 'WhatsApp Business', desc: 'Lembretes e confirmações com dois toques' },
  { key: 'pos_local', label: 'POS / ERP local', desc: 'Integração com PDV da loja e estoque' },
  { key: 'email_enabled', label: 'E-mails transacionais', desc: 'Confirmações, recibos e lembretes' },
  { key: 'sms_enabled', label: 'SMS (Twilio)', desc: 'Lembretes 24h antes do atendimento' },
  { key: 'push_enabled', label: 'Web Push', desc: 'Notificações no navegador e no PWA' },
];

export function AdminSettings() {
  const [data, setData] = useState<Settings | null>(null);
  const [branches, setBranches] = useState<{ id: string; name: string; address: string; settings: { min_lead_minutes?: number; max_advance_days?: number; buffer_min?: number; day_capacity?: number }; active: number }[]>([]);
  const [logs, setLogs] = useState<{ id: string; actor_name: string; action: string; entity: string; created_at: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const { push } = useToast();

  const load = useCallback(() => {
    api.get<Settings>('/admin/settings').then(setData).catch(() => {});
    api.get<typeof branches>('/admin/branches').then(setBranches).catch(() => {});
    api.get<typeof logs>('/admin/audit-logs?limit=15').then(setLogs).catch(() => {});
  }, []);
  useEffect(load, [load]);

  async function save(patch: Record<string, unknown>) {
    setSaving(true);
    try {
      await api.put('/admin/settings', patch);
      push('Configurações salvas');
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function saveBranch(id: string, settings: Record<string, number>) {
    await api.put(`/admin/branches/${id}`, { settings });
    push('Regras da unidade atualizadas');
    load();
  }

  if (!data) return <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card space-y-3">
          <h3 className="text-lg text-cream-50">Dados do negócio</h3>
          {['name', 'legal_name', 'cnpj', 'email', 'phone', 'instagram'].map((field) => (
            <Field key={field} label={field.replace('_', ' ')}>
              <Input
                value={data.business[field] || ''}
                onChange={(e) => setData({ ...data, business: { ...data.business, [field]: e.target.value } })}
              />
            </Field>
          ))}
          <Button onClick={() => save({ business: data.business })} loading={saving}>Salvar dados</Button>
        </div>

        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="text-lg text-cream-50">Políticas de agenda</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Antecedência mínima (min)">
                <Input type="number" value={data.policies.min_lead_minutes ?? 60} onChange={(e) => setData({ ...data, policies: { ...data.policies, min_lead_minutes: Number(e.target.value) } })} />
              </Field>
              <Field label="Janela máxima (dias)">
                <Input type="number" value={data.policies.max_advance_days ?? 60} onChange={(e) => setData({ ...data, policies: { ...data.policies, max_advance_days: Number(e.target.value) } })} />
              </Field>
              <Field label="Buffer entre atendimentos (min)">
                <Input type="number" value={data.policies.buffer_min ?? 5} onChange={(e) => setData({ ...data, policies: { ...data.policies, buffer_min: Number(e.target.value) } })} />
              </Field>
              <Field label="Taxa de no-show (%)">
                <Input type="number" value={data.policies.no_show_fee_pct ?? 50} onChange={(e) => setData({ ...data, policies: { ...data.policies, no_show_fee_pct: Number(e.target.value) } })} />
              </Field>
            </div>
            <Field label="Termos de cancelamento">
              <Textarea rows={3} value={data.policies.terms || ''} onChange={(e) => setData({ ...data, policies: { ...data.policies, terms: e.target.value } })} />
            </Field>
            <Button onClick={() => save({ policies: data.policies })} loading={saving}>Salvar políticas</Button>
          </div>

          <div className="card">
            <h3 className="text-lg text-cream-50">Unidades</h3>
            <div className="mt-3 space-y-3">
              {branches.map((branch) => (
                <div key={branch.id} className="rounded-xl border border-white/8 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-cream-100">{branch.name}</p>
                    <Badge tone={branch.active ? 'success' : 'danger'}>{branch.active ? 'aberta' : 'fechada'}</Badge>
                  </div>
                  <p className="text-[11px] text-cream-300/50">{branch.address}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <label className="text-cream-300/60">
                      lead (min)
                      <Input type="number" className="!py-1 !text-xs" defaultValue={branch.settings.min_lead_minutes ?? 60} onBlur={(e) => saveBranch(branch.id, { ...branch.settings, min_lead_minutes: Number(e.target.value) })} />
                    </label>
                    <label className="text-cream-300/60">
                      janela (dias)
                      <Input type="number" className="!py-1 !text-xs" defaultValue={branch.settings.max_advance_days ?? 60} onBlur={(e) => saveBranch(branch.id, { ...branch.settings, max_advance_days: Number(e.target.value) })} />
                    </label>
                    <label className="text-cream-300/60">
                      vagas/dia
                      <Input type="number" className="!py-1 !text-xs" defaultValue={branch.settings.day_capacity ?? 0} onBlur={(e) => saveBranch(branch.id, { ...branch.settings, day_capacity: Number(e.target.value) })} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg text-cream-50">Integrações</h3>
        <p className="text-xs text-cream-300/50">Ative os canais e serviços conectados. As chaves de API ficam em variáveis de ambiente do servidor.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {integrationMeta.map((integration) => (
            <div key={integration.key} className="flex items-start justify-between gap-3 rounded-xl border border-white/8 p-3">
              <div>
                <p className="text-sm text-cream-100">{integration.label}</p>
                <p className="text-[11px] text-cream-300/50">{integration.desc}</p>
              </div>
              <Toggle
                checked={!!data.integrations[integration.key]}
                onChange={(value) => save({ integrations: { ...data.integrations, [integration.key]: value } })}
                label={integration.label}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="card">
          <h3 className="text-lg text-cream-50">Usuários com acesso</h3>
          <ul className="mt-3 space-y-2">
            {data.users.map((user) => (
              <li key={user.id} className="flex items-center justify-between rounded-lg border border-white/8 px-3 py-2 text-sm">
                <span className="text-cream-100">{user.name}</span>
                <span className="text-[11px] uppercase tracking-wider text-brass-300/70">{user.role}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h3 className="text-lg text-cream-50">Trilha de auditoria</h3>
          <ul className="mt-3 space-y-1.5 text-xs">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-2 border-b border-white/6 pb-1.5 last:border-0">
                <span className="text-cream-300/70"><span className="text-cream-100">{log.actor_name}</span> · {log.action}</span>
                <span className="whitespace-nowrap text-[10px] text-cream-300/30">{fmtDateTime(log.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
