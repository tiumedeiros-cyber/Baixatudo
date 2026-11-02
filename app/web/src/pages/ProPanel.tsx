import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Appointment } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dateStr, fmtDate, statusLabel, statusStyle, timeStr } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Field, Icon, Input, Modal, Spinner, StatCard, Textarea, useToast } from '../components/ui';
import { PanelLayout } from '../components/Shell';

export function ProPanel() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [date, setDate] = useState(dateStr(new Date()));
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [fetching, setFetching] = useState(true);
  const [detail, setDetail] = useState<Appointment | null>(null);
  const [note, setNote] = useState('');
  const { push } = useToast();
  const professionalId = user?.professional_id;

  useEffect(() => {
    if (!loading && (!user || user.role !== 'PROFESSIONAL')) navigate('/entrar?next=/pro');
  }, [loading, user, navigate]);

  const load = useCallback(() => {
    if (!professionalId) return;
    setFetching(true);
    api
      .get<{ appointments: Appointment[] }>(`/professionals/${professionalId}/agenda?date=${date}`)
      .then((data) => setAppointments(data.appointments))
      .catch(() => {})
      .finally(() => setFetching(false));
  }, [professionalId, date]);

  useEffect(load, [load]);

  async function changeStatus(appointment: Appointment, status: string) {
    try {
      await api.post(`/appointments/${appointment.id}/status`, { status });
      push(`Atendimento ${statusLabel[status].toLowerCase()}`);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro', 'error');
    }
  }

  async function saveNote() {
    if (!detail) return;
    try {
      await api.patch(`/appointments/${detail.id}`, { internal_notes: note });
      push('Anotação salva na ficha do atendimento');
      setDetail(null);
      setNote('');
      load();
    } catch {
      push('Erro ao salvar', 'error');
    }
  }

  const done = appointments.filter((a) => a.status === 'concluido');
  const revenue = done.reduce((s, a) => s + a.total_cents, 0);
  const inProgress = appointments.filter((a) => a.status === 'em_atendimento');
  const checkedIn = appointments.filter((a) => a.checked_in_at && a.status !== 'concluido');

  const nav = [
    { to: '/pro', label: 'Minha agenda', icon: 'calendar' as const, end: true },
    { to: '/pro/clientes', label: 'Meus clientes', icon: 'users' as const },
  ];

  return (
    <PanelLayout
      title={`Agenda de ${user?.name?.split(' ')[0] || 'barbeiro'}`}
      subtitle={fmtDate(date, { weekday: 'long', year: 'numeric' })}
      nav={nav}
      actions={
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-full border border-white/10 bg-ink-900 px-3 py-2 text-xs text-cream-100" />
          <Button variant="ghost" className="!py-2 text-xs" onClick={load} icon="download">Atualizar</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Atendimentos" value={appointments.length} hint={`${done.length} concluídos`} icon="scissors" />
          <StatCard label="Receita do dia" value={brl(revenue)} hint="serviços concluídos" icon="money" />
          <StatCard label="Check-ins" value={checkedIn.length} hint="clientes já na barbearia" icon="check" />
          <StatCard label="Em atendimento" value={inProgress.length} hint={inProgress[0] ? `até ${timeStr(inProgress[0].end_at)}` : 'nenhum agora'} icon="clock" />
        </div>

        {fetching ? (
          <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>
        ) : appointments.length === 0 ? (
          <EmptyState icon="calendar" title="Nenhum atendimento nesta data" description="Aproveite para descansar — ou confira outro dia." />
        ) : (
          <div className="space-y-2">
            {appointments.map((appointment) => (
              <article key={appointment.id} className={`rounded-2xl border p-4 transition ${appointment.status === 'em_atendimento' ? 'border-sky-400/30 bg-sky-400/[0.05]' : 'border-white/8 bg-ink-900/50'}`}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="w-16 shrink-0 text-center">
                    <p className="font-display text-xl text-cream-50">{timeStr(appointment.start_at)}</p>
                    <p className="text-[10px] text-cream-300/50">{timeStr(appointment.end_at)}</p>
                  </div>
                  <Avatar name={appointment.client?.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-cream-100">{appointment.client?.name}</p>
                    <p className="truncate text-xs text-cream-300/60">
                      {appointment.items.map((i) => i.name).join(' + ')} · {brl(appointment.total_cents)}
                    </p>
                    {appointment.notes && <p className="mt-1 text-[11px] italic text-brass-200/70">“{appointment.notes}”</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {appointment.checked_in_at && <span className="chip !py-0.5 !text-[10px] border-moss-400/30 text-moss-400">check-in {timeStr(appointment.checked_in_at)}</span>}
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span>
                    {appointment.status === 'pendente' && <Button className="!px-3 !py-1 text-[11px]" onClick={() => changeStatus(appointment, 'confirmado')}>Confirmar</Button>}
                    {appointment.status === 'confirmado' && <Button className="!px-3 !py-1 text-[11px]" onClick={() => changeStatus(appointment, 'em_atendimento')}>Iniciar</Button>}
                    {appointment.status === 'em_atendimento' && <Button className="!px-3 !py-1 text-[11px]" onClick={() => changeStatus(appointment, 'concluido')}>Finalizar</Button>}
                    <Button variant="ghost" className="!px-3 !py-1 text-[11px]" onClick={() => { setDetail(appointment); setNote(appointment.internal_notes || ''); }}>
                      Detalhes
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="card">
          <h3 className="text-lg text-cream-50">Fila e check-in de hoje</h3>
          <div className="mt-3 space-y-2">
            {checkedIn.length === 0 && inProgress.length === 0 && <p className="text-sm text-cream-300/50">Nenhum cliente fez check-in ainda.</p>}
            {[...inProgress.map((a) => ({ a, label: 'em atendimento' })), ...checkedIn.filter((a) => a.status !== 'em_atendimento').map((a) => ({ a, label: 'aguardando' }))].map(({ a, label }) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-white/8 px-3 py-2 text-sm">
                <span className="text-cream-100">{a.client?.name}</span>
                <span className="flex items-center gap-2 text-[11px] text-cream-300/50">
                  {label} · {timeStr(a.start_at)}
                  <Badge tone={label === 'aguardando' ? 'warn' : 'info'}>{label}</Badge>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.client?.name || 'Detalhes do atendimento'}
        footer={<><Button variant="ghost" onClick={() => setDetail(null)}>Fechar</Button><Button onClick={saveNote}>Salvar anotação</Button></>}
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">horário</p><p className="mt-1 text-cream-100">{timeStr(detail.start_at)}–{timeStr(detail.end_at)}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">valor</p><p className="mt-1 text-brass-200">{brl(detail.total_cents)}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">telefone</p><p className="mt-1 text-xs text-cream-100">{detail.client?.phone}</p></div>
              <div className="card-tight"><p className="text-[10px] uppercase text-cream-300/50">pagamento</p><p className="mt-1 text-xs text-cream-100">{detail.payment?.method || 'no local'}</p></div>
            </div>
            <Field label="Serviços">
              <ul className="space-y-1 text-sm text-cream-200">
                {detail.items.map((item) => <li key={item.id}>• {item.name} — {brl(item.price_cents)}</li>)}
              </ul>
            </Field>
            {detail.notes && (
              <Field label="Observação do cliente">
                <p className="rounded-xl border border-white/8 p-3 text-sm italic text-brass-200/80">{detail.notes}</p>
              </Field>
            )}
            <Field label="Anotação interna" hint="Visível apenas para a equipe">
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Técnica usada, produtos, preferências…" />
            </Field>
          </div>
        )}
      </Modal>
    </PanelLayout>
  );
}

export function ProClients() {
  const [clients, setClients] = useState<{ id: string; name: string; email: string; phone: string; visits: number; total_spent_cents: number; tags: string[]; notes: { body: string; author: string }[] }[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get<typeof clients>('/notifications/clients').then(setClients).catch(() => {});
  }, []);

  const filtered = clients.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PanelLayout
      title="Meus clientes"
      subtitle={`${clients.length} fichas na unidade`}
      nav={[
        { to: '/pro', label: 'Minha agenda', icon: 'calendar', end: true },
        { to: '/pro/clientes', label: 'Meus clientes', icon: 'users' },
      ]}
      actions={<Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" className="!w-48 !py-2 text-xs" />}
    >
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((client) => (
          <article key={client.id} className="card-tight">
            <div className="flex items-center gap-3">
              <Avatar name={client.name} size={38} />
              <div className="min-w-0">
                <p className="truncate text-sm text-cream-100">{client.name}</p>
                <p className="text-[11px] text-cream-300/50">{client.phone}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-white/8 pt-2 text-[11px] text-cream-300/60">
              <span>{client.visits} visitas</span>
              <span className="text-brass-200">{brl(client.total_spent_cents)}</span>
            </div>
            {client.notes?.[0] && <p className="mt-2 line-clamp-2 text-[11px] italic text-cream-300/50">“{client.notes[0].body}”</p>}
          </article>
        ))}
        {filtered.length === 0 && <div className="md:col-span-2 xl:col-span-3"><EmptyState icon="users" title="Nenhum cliente encontrado" /></div>}
      </div>
    </PanelLayout>
  );
}
