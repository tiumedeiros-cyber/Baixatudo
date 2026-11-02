import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type Appointment, type Professional, type Service } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { brl, compactBrl, dateStr, fmtDate, fmtDateTime, paymentLabel, relative, statusLabel, statusStyle, timeStr } from '../../lib/format';
import { Avatar, Badge, BarChart, Button, EmptyState, Field, Icon, Input, Modal, Select, Spinner, Sparkline, StatCard, Textarea, useToast } from '../../components/ui';
import { PanelLayout } from '../../components/Shell';
import { AdminClients, AdminFinance, AdminMarketing, AdminReports, AdminServices, AdminSettings, AdminTeam } from './AdminSections';

const nav = [
  { to: '/admin', label: 'Visão geral', icon: 'grid' as const, end: true },
  { to: '/admin/agenda', label: 'Agenda do dia', icon: 'calendar' as const },
  { to: '/admin/agendamentos', label: 'Agendamentos', icon: 'clock' as const },
  { to: '/admin/clientes', label: 'Clientes (CRM)', icon: 'users' as const },
  { to: '/admin/servicos', label: 'Serviços', icon: 'scissors' as const },
  { to: '/admin/equipe', label: 'Equipe & escala', icon: 'user' as const },
  { to: '/admin/financeiro', label: 'Financeiro', icon: 'money' as const },
  { to: '/admin/marketing', label: 'Marketing', icon: 'message' as const },
  { to: '/admin/relatorios', label: 'Relatórios', icon: 'chart' as const },
  { to: '/admin/configuracoes', label: 'Configurações', icon: 'settings' as const },
];

type Dashboard = {
  revenue_cents: number;
  appointments_done: number;
  appointments_total: number;
  cancel_rate: number;
  no_show_rate: number;
  avg_ticket_cents: number;
  revenue_by_day: { date: string; cents: number }[];
  top_services: { name: string; qty: number; revenue: number }[];
  occupancy: { id: string; name: string; atendimentos: number; revenue: number; rating: number }[];
  payment_methods: { method: string; qty: number; total: number }[];
  clients: { total: number; new: number };
  avg_rating: number;
  today_appointments: Appointment[];
};

export function AdminPanel() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'ADMIN')) navigate('/entrar?next=/admin');
  }, [loading, user, navigate]);

  const path = location.pathname;
  const section = path.replace('/admin', '').replace('/', '') || 'dashboard';

  const titles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Visão geral', subtitle: 'Faturamento, agenda e saúde do negócio' },
    agenda: { title: 'Agenda do dia', subtitle: 'Todos os profissionais, em tempo real' },
    agendamentos: { title: 'Agendamentos', subtitle: 'Filtre, confirme, remarque e finalize' },
    clientes: { title: 'Clientes', subtitle: 'CRM com histórico, notas e segmentos' },
    servicos: { title: 'Serviços', subtitle: 'Catálogo, preços e duração' },
    equipe: { title: 'Equipe & escala', subtitle: 'Profissionais, horários e bloqueios' },
    financeiro: { title: 'Financeiro', subtitle: 'Recebimentos, comissões e cupons' },
    marketing: { title: 'Marketing', subtitle: 'Campanhas e templates de mensagem' },
    relatorios: { title: 'Relatórios', subtitle: 'Ocupação, cancelamentos e avaliações' },
    configuracoes: { title: 'Configurações', subtitle: 'Negócio, políticas, integrações e auditoria' },
  };

  const meta = titles[section] || titles.dashboard;

  return (
    <PanelLayout
      title={meta.title}
      subtitle={meta.subtitle}
      nav={nav}
      actions={
        <>
          <Link to="/" className="hidden rounded-full border border-white/10 px-3 py-2 text-xs text-cream-300 hover:bg-white/10 sm:inline-flex">
            Ver site
          </Link>
          <button onClick={() => navigate('/admin/agendamentos')} className="btn-primary !py-2 text-xs">
            <Icon name="plus" className="h-4 w-4" /> Novo agendamento
          </button>
        </>
      }
    >
      {section === 'dashboard' && <Dashboard />}
      {section === 'agenda' && <Agenda />}
      {section === 'agendamentos' && <AppointmentsList />}
      {section === 'clientes' && <AdminClients />}
      {section === 'servicos' && <AdminServices />}
      {section === 'equipe' && <AdminTeam />}
      {section === 'financeiro' && <AdminFinance />}
      {section === 'marketing' && <AdminMarketing />}
      {section === 'relatorios' && <AdminReports />}
      {section === 'configuracoes' && <AdminSettings />}
    </PanelLayout>
  );
}

/* ------------------------------ Dashboard ------------------------------ */
function Dashboard() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [range, setRange] = useState(30);
  const [marketing, setMarketing] = useState<{ campaigns: number; coupons: number; templates: number } | null>(null);

  useEffect(() => {
    const to = new Date();
    const from = new Date(Date.now() - range * 86400000);
    api
      .get<Dashboard>(`/reports/dashboard?from=${dateStr(from)}&to=${dateStr(to)}`)
      .then(setData)
      .catch(() => {});
  }, [range]);

  useEffect(() => {
    Promise.all([api.get<unknown[]>('/admin/campaigns'), api.get<unknown[]>('/admin/coupons'), api.get<unknown[]>('/admin/notification-templates')])
      .then(([campaigns, coupons, templates]) => setMarketing({ campaigns: campaigns.length, coupons: coupons.length, templates: templates.length }))
      .catch(() => {});
  }, []);

  if (!data) return <div className="flex justify-center py-24"><Spinner className="h-6 w-6 text-brass-300" /></div>;

  const series = data.revenue_by_day.map((d) => d.cents);
  const last7 = data.revenue_by_day.slice(-7).reduce((s, d) => s + d.cents, 0);
  const prev7 = data.revenue_by_day.slice(-14, -7).reduce((s, d) => s + d.cents, 0);
  const trend = prev7 ? ((last7 - prev7) / prev7) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-white/8 bg-ink-900/60 p-1">
          {[7, 30, 60].map((days) => (
            <button
              key={days}
              onClick={() => setRange(days)}
              className={`rounded-full px-3 py-1.5 text-xs transition ${range === days ? 'bg-brass-400 text-ink-950' : 'text-cream-300/70 hover:text-cream-100'}`}
            >
              {days} dias
            </button>
          ))}
        </div>
        <p className="text-xs text-cream-300/50">Dados atualizados {relative(new Date().toISOString())}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Faturamento" value={compactBrl(data.revenue_cents)} trend={trend} hint="vs. semana anterior" icon="money" />
        <StatCard label="Atendimentos" value={data.appointments_done} hint={`de ${data.appointments_total} agendados`} icon="scissors" />
        <StatCard label="Ticket médio" value={brl(data.avg_ticket_cents)} hint="por atendimento concluído" icon="tag" />
        <StatCard label="Avaliação média" value={data.avg_rating.toFixed(1)} hint={`${data.clients.total} clientes · ${data.clients.new} novos`} icon="star" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg text-cream-50">Receita por dia</h3>
              <p className="text-xs text-cream-300/50">Período de {range} dias</p>
            </div>
            <Badge tone={trend >= 0 ? 'success' : 'danger'}>{trend >= 0 ? '+' : ''}{trend.toFixed(1)}%</Badge>
          </div>
          <div className="mt-6"><Sparkline data={series} height={140} /></div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/8 pt-4 text-center">
            <div><p className="text-xs text-cream-300/50">Cancelamentos</p><p className="mt-1 text-lg text-cream-100">{data.cancel_rate}%</p></div>
            <div><p className="text-xs text-cream-300/50">No-show</p><p className="mt-1 text-lg text-cream-100">{data.no_show_rate}%</p></div>
            <div><p className="text-xs text-cream-300/50">Hoje</p><p className="mt-1 text-lg text-cream-100">{data.today_appointments.length} horários</p></div>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg text-cream-50">Serviços que sustentam o caixa</h3>
          <div className="mt-4">
            <BarChart items={data.top_services.map((s) => ({ label: s.name, value: s.revenue }))} format={(v) => brl(v)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="card">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg text-cream-50">Agenda de hoje</h3>
            <Link to="/admin/agenda" className="text-xs text-brass-300 hover:text-brass-200">abrir agenda →</Link>
          </div>
          {data.today_appointments.length === 0 ? (
            <EmptyState icon="calendar" title="Nenhum atendimento hoje" description="Aproveite para revisar a escala da semana." />
          ) : (
            <ul className="divide-y divide-white/8">
              {data.today_appointments.slice(0, 8).map((appointment) => (
                <li key={appointment.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-12 text-sm text-cream-100">{timeStr(appointment.start_at)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-cream-100">{appointment.client_name}</p>
                    <p className="truncate text-[11px] text-cream-300/50">{appointment.professional_id}</p>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <div className="card">
            <h3 className="text-lg text-cream-50">Desempenho por profissional</h3>
            <ul className="mt-4 space-y-3">
              {data.occupancy.map((pro) => (
                <li key={pro.id}>
                  <div className="flex items-center justify-between text-xs text-cream-300/70">
                    <span className="text-cream-100">{pro.name}</span>
                    <span>{pro.atendimentos} atend. · {compactBrl(pro.revenue)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/8">
                    <div className="h-full rounded-full bg-brass-400" style={{ width: `${Math.min(100, (pro.atendimentos / Math.max(1, ...data.occupancy.map((o) => o.atendimentos))) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="card">
            <h3 className="text-sm uppercase tracking-[0.14em] text-cream-300/60">Formas de pagamento</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              {data.payment_methods.map((method) => (
                <div key={method.method} className="rounded-xl border border-white/8 p-2.5">
                  <p className="text-cream-300/60">{paymentLabel[method.method] || method.method}</p>
                  <p className="mt-1 text-sm text-cream-100">{brl(method.total)}</p>
                  <p className="text-[10px] text-cream-300/40">{method.qty} transações</p>
                </div>
              ))}
            </div>
          </div>
          {marketing && (
            <div className="card-tight flex items-center justify-between text-xs text-cream-300/70">
              <span>{marketing.campaigns} campanhas · {marketing.coupons} cupons</span>
              <Link to="/admin/marketing" className="text-brass-300">gerenciar →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Agenda -------------------------------- */
function Agenda() {
  const [date, setDate] = useState(dateStr(new Date()));
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selectedPro, setSelectedPro] = useState<string>('all');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { push } = useToast();

  useEffect(() => {
    api.get<Professional[]>('/professionals').then(setProfessionals).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Appointment[]>(`/appointments?scope=all&from=${date}T00:00&to=${date}T23:59&limit=200`)
      .then(setAppointments)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  const filtered = selectedPro === 'all' ? appointments : appointments.filter((a) => a.professional_id === selectedPro);
  const byPro = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const appointment of filtered) {
      map[appointment.professional_id] = map[appointment.professional_id] || [];
      map[appointment.professional_id].push(appointment);
    }
    return map;
  }, [filtered]);

  async function changeStatus(appointment: Appointment, status: string) {
    try {
      await api.post(`/appointments/${appointment.id}/status`, { status });
      push(`Atualizado para ${statusLabel[status]}`);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao atualizar', 'error');
    }
  }

  const revenue = filtered.filter((a) => a.status === 'concluido').reduce((s, a) => s + a.total_cents, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-full border border-white/8 bg-ink-900/60 p-1">
          <button onClick={() => setDate(dateStr(new Date(new Date(date).getTime() - 86400000)))} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Dia anterior">
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-transparent px-2 text-sm text-cream-100 outline-none" />
          <button onClick={() => setDate(dateStr(new Date(new Date(date).getTime() + 86400000)))} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Próximo dia">
            <Icon name="chevron-right" className="h-4 w-4" />
          </button>
        </div>
        <Select value={selectedPro} onChange={(e) => setSelectedPro(e.target.value)} className="!w-auto">
          <option value="all">Todos os profissionais</option>
          {professionals.map((pro) => (
            <option key={pro.id} value={pro.id}>{pro.name}</option>
          ))}
        </Select>
        <span className="chip">{filtered.length} agendamentos</span>
        <span className="chip border-moss-400/30 bg-moss-400/10 text-moss-400">{brl(revenue)} concluídos</span>
        <Button variant="ghost" className="ml-auto !py-2 text-xs" onClick={load} icon="download">Atualizar</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="calendar" title="Nenhum agendamento nesta data" description="Escolha outro dia ou ajuste o filtro de profissional." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {Object.entries(byPro).map(([proId, list]) => {
            const pro = professionals.find((p) => p.id === proId);
            return (
              <div key={proId} className="card">
                <div className="flex items-center gap-3 border-b border-white/8 pb-3">
                  <Avatar name={pro?.name} size={40} />
                  <div>
                    <p className="text-sm text-cream-50">{pro?.name || proId}</p>
                    <p className="text-[11px] text-cream-300/50">{list.length} atendimentos · {brl(list.reduce((s, a) => s + a.total_cents, 0))}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {list.map((appointment) => (
                    <li key={appointment.id} className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-cream-100">
                            {timeStr(appointment.start_at)}–{timeStr(appointment.end_at)} · {appointment.client?.name}
                          </p>
                          <p className="truncate text-[11px] text-cream-300/60">{appointment.items.map((i) => i.name).join(' + ')}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {appointment.status === 'pendente' && <Button className="!px-2 !py-1 text-[10px]" onClick={() => changeStatus(appointment, 'confirmado')}>Confirmar</Button>}
                        {appointment.status === 'confirmado' && <Button className="!px-2 !py-1 text-[10px]" onClick={() => changeStatus(appointment, 'em_atendimento')}>Iniciar</Button>}
                        {appointment.status === 'em_atendimento' && <Button className="!px-2 !py-1 text-[10px]" onClick={() => changeStatus(appointment, 'concluido')}>Finalizar</Button>}
                        {['pendente', 'confirmado'].includes(appointment.status) && (
                          <Button variant="dark" className="!px-2 !py-1 text-[10px]" onClick={() => changeStatus(appointment, 'no_show')}>No-show</Button>
                        )}
                        {appointment.checked_in_at && <span className="chip !py-0.5 !text-[10px] border-moss-400/30 text-moss-400">check-in {timeStr(appointment.checked_in_at)}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------- Lista de agendamentos --------------------- */
function AppointmentsList() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState({ from: dateStr(new Date(Date.now() - 7 * 86400000)), to: dateStr(new Date(Date.now() + 30 * 86400000)) });
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [manual, setManual] = useState(false);
  const { push } = useToast();

  const load = useCallback(() => {
    api
      .get<Appointment[]>(`/appointments?scope=all&from=${range.from}T00:00&to=${range.to}T23:59&limit=300${status ? `&status=${status}` : ''}`)
      .then(setItems)
      .catch(() => {});
  }, [range, status]);

  useEffect(load, [load]);
  useEffect(() => {
    api.get<Professional[]>('/professionals').then(setProfessionals).catch(() => {});
    api.get<Service[]>('/services?branch=brn_centro').then(setServices).catch(() => {});
  }, []);

  const filtered = items.filter((item) =>
    !search || item.client?.name?.toLowerCase().includes(search.toLowerCase()) || item.code.toLowerCase().includes(search.toLowerCase())
  );

  async function cancel(appointment: Appointment) {
    if (!window.confirm(`Cancelar o agendamento de ${appointment.client?.name}?`)) return;
    try {
      const result = await api.post<{ refund_percent: number }>(`/appointments/${appointment.id}/cancel`, { reason: 'cancelado pelo painel' });
      push(`Cancelado (reembolso ${result.refund_percent}%)`);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro', 'error');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="De" className="w-40"><Input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
        <Field label="Até" className="w-40"><Input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        <Field label="Status" className="w-44">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Buscar" className="min-w-[200px] flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cliente ou código" />
        </Field>
        <Button onClick={() => setManual(true)} icon="plus">Novo manual</Button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Quando</th><th>Cliente</th><th>Profissional</th><th>Serviços</th><th>Valor</th><th>Pagto</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((appointment) => (
              <tr key={appointment.id}>
                <td className="whitespace-nowrap">
                  <span className="block text-cream-100">{fmtDateTime(appointment.start_at)}</span>
                  <span className="text-[11px] text-cream-300/40">{appointment.code}</span>
                </td>
                <td>
                  <span className="block">{appointment.client?.name}</span>
                  <span className="text-[11px] text-cream-300/40">{appointment.client?.phone}</span>
                </td>
                <td className="whitespace-nowrap">{professionals.find((p) => p.id === appointment.professional_id)?.name || '—'}</td>
                <td className="max-w-[220px]"><span className="line-clamp-2 text-xs">{appointment.items.map((i) => i.name).join(' + ')}</span></td>
                <td className="whitespace-nowrap">{brl(appointment.total_cents)}</td>
                <td className="whitespace-nowrap text-xs">
                  {appointment.payment ? `${paymentLabel[appointment.payment.method]} · ${appointment.payment.status}` : 'No local'}
                </td>
                <td><span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span></td>
                <td>
                  <div className="flex gap-1">
                    {['pendente', 'confirmado'].includes(appointment.status) && (
                      <button onClick={() => cancel(appointment)} className="rounded p-1.5 text-cream-300/50 hover:bg-rose-400/10 hover:text-rose-400" aria-label="Cancelar">
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-6"><EmptyState title="Nenhum resultado" description="Ajuste o período ou os filtros." /></div>}
      </div>

      <ManualAppointment
        open={manual}
        onClose={() => setManual(false)}
        professionals={professionals}
        services={services}
        onCreated={() => {
          setManual(false);
          load();
        }}
      />
    </div>
  );
}

function ManualAppointment({
  open,
  onClose,
  professionals,
  services,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  professionals: Professional[];
  services: Service[];
  onCreated: () => void;
}) {
  const { push } = useToast();
  const [form, setForm] = useState({ client: '', phone: '', professional: professionals[0]?.id || '', date: dateStr(new Date()), time: '10:00', serviceIds: [] as string[], notes: '' });
  const [saving, setSaving] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);

  const total = services.filter((s) => form.serviceIds.includes(s.id)).reduce((sum, s) => sum + s.price_cents, 0);

  useEffect(() => {
    if (!form.serviceIds.length || !form.professional) return setSlots([]);
    api
      .get<{ slots: { start_at: string }[] }>(`/availability?date=${form.date}&professional=${form.professional}&services=${form.serviceIds.join(',')}`)
      .then((data) => setSlots(data.slots.map((s) => s.start_at.slice(11, 16))))
      .catch(() => setSlots([]));
  }, [form.date, form.professional, form.serviceIds]);

  async function create() {
    setSaving(true);
    try {
      await api.post('/appointments/manual', {
        client_name: form.client,
        client_phone: form.phone,
        professional_id: form.professional,
        start_at: `${form.date}T${form.time}`,
        service_ids: form.serviceIds,
        notes: form.notes,
      });
      push('Agendamento criado e cliente notificado');
      onCreated();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao criar', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo agendamento manual"
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={create} loading={saving} disabled={!form.client || !form.serviceIds.length}>Criar agendamento</Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Cliente"><Input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} placeholder="Nome do cliente" /></Field>
        <Field label="Telefone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(49) 99999-0000" /></Field>
        <Field label="Profissional">
          <Select value={form.professional} onChange={(e) => setForm({ ...form, professional: e.target.value })}>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Data"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
      </div>
      <Field label="Serviços">
        <div className="grid max-h-40 gap-1 overflow-y-auto rounded-xl border border-white/10 p-2 sm:grid-cols-2">
          {services.map((service) => (
            <label key={service.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white/5">
              <input
                type="checkbox"
                checked={form.serviceIds.includes(service.id)}
                onChange={(e) => setForm({ ...form, serviceIds: e.target.checked ? [...form.serviceIds, service.id] : form.serviceIds.filter((s) => s !== service.id) })}
                className="h-3.5 w-3.5 accent-brass-400"
              />
              <span className="flex-1 text-cream-200">{service.name}</span>
              <span className="text-cream-300/50">{brl(service.price_cents)}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="Horário" hint={slots.length ? 'Horários livres para este profissional' : 'Sem grade carregada — digite manualmente'}>
        <div className="flex flex-wrap gap-1.5">
          {(slots.length ? slots : ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00']).map((time) => (
            <button
              key={time}
              onClick={() => setForm({ ...form, time })}
              className={`rounded-lg border px-2.5 py-1 text-xs ${form.time === time ? 'border-brass-400 bg-brass-400 text-ink-950' : 'border-white/10 text-cream-200 hover:bg-white/5'}`}
            >
              {time}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Observações"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      <p className="text-xs text-cream-300/60">Total previsto: <span className="text-brass-200">{brl(total)}</span> · o cliente recebe e-mail de confirmação.</p>
    </Modal>
  );
}
