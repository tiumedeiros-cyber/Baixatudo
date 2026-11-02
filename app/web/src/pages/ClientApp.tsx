import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, type Appointment, type NotificationItem, type User } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, fmtDate, fmtDateTime, durationLabel, localDateTime, paymentLabel, statusLabel, statusStyle, timeStr } from '../lib/format';
import { Avatar, Badge, Button, EmptyState, Field, Icon, Input, Modal, Spinner, StarRating, Textarea, useToast } from '../components/ui';
import { PanelLayout } from '../components/Shell';

type Tab = 'agenda' | 'historico' | 'clube' | 'notificacoes' | 'perfil';

const pathToTab: Record<string, Tab> = {
  '/app': 'agenda',
  '/app/historico': 'historico',
  '/app/clube': 'clube',
  '/app/notificacoes': 'notificacoes',
  '/app/perfil': 'perfil',
};

const tabToPath: Record<Tab, string> = {
  agenda: '/app',
  historico: '/app/historico',
  clube: '/app/clube',
  notificacoes: '/app/notificacoes',
  perfil: '/app/perfil',
};

export function ClientApp() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab: Tab = pathToTab[pathname] || 'agenda';
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [fetching, setFetching] = useState(true);
  const { push } = useToast();
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Appointment | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [queue, setQueue] = useState<{ waiting_count: number; in_service: { end_at: string }[] } | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/entrar?next=/app');
  }, [loading, user, navigate]);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const [appts, notifs] = await Promise.all([
        api.get<Appointment[]>('/appointments?scope=mine'),
        api.get<{ items: NotificationItem[]; unread: number }>('/notifications'),
      ]);
      setAppointments(appts);
      setNotifications(notifs.items);
      setUnread(notifs.unread);
    } catch {
      /* silencioso */
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    api.get<{ waiting_count: number; in_service: { end_at: string }[] }>('/appointments/queue').then(setQueue).catch(() => {});
  }, [user, load]);

  const nowLocal = localDateTime(new Date());
  const upcoming = appointments.filter((a) => a.start_at >= nowLocal && !['cancelado', 'concluido', 'no_show'].includes(a.status)).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const history = appointments.filter((a) => !upcoming.includes(a));
  const next = upcoming[0];

  async function cancel() {
    if (!cancelTarget) return;
    try {
      const result = await api.post<{ refund?: { refunded_cents: number }; refund_percent: number }>(`/appointments/${cancelTarget.id}/cancel`, { reason: 'cancelado pelo cliente no app' });
      push(result.refund ? `Cancelado · reembolso de ${brl(result.refund.refunded_cents)}` : 'Agendamento cancelado');
      setCancelTarget(null);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao cancelar', 'error');
    }
  }

  async function submitReview() {
    if (!reviewTarget) return;
    try {
      await api.post('/reviews', { appointment_id: reviewTarget.id, rating, comment });
      push('Obrigado pela avaliação! Você ganhou 5% no próximo corte.');
      setReviewTarget(null);
      setComment('');
      setRating(5);
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao avaliar', 'error');
    }
  }

  async function checkin(appointment: Appointment) {
    try {
      await api.post(`/appointments/checkin/${appointment.checkin_token}`, {});
      push('Check-in confirmado! Bom atendimento.');
      load();
    } catch (error) {
      push((error as { error: string }).error || 'Erro no check-in', 'error');
    }
  }

  const nav = [
    { to: '/app', label: 'Meus horários', icon: 'calendar' as const, end: true },
    { to: '/app/historico', label: 'Histórico', icon: 'clock' as const },
    { to: '/app/clube', label: 'Clube Navalha', icon: 'sparkle' as const },
    { to: '/app/notificacoes', label: 'Notificações', icon: 'bell' as const },
    { to: '/app/perfil', label: 'Meu perfil', icon: 'user' as const },
  ];

  const changeTab = (next: Tab) => navigate(tabToPath[next]);

  return (
    <PanelLayout
      title={`Olá, ${user?.name?.split(' ')[0] || 'cliente'}`}
      subtitle="Seu histórico, seus horários e o clube"
      nav={nav.map((item) => ({ ...item, to: item.to }))}
      actions={
        <>
          <button onClick={() => changeTab('notificacoes')} className="relative rounded-full border border-white/10 p-2 text-cream-200 hover:bg-white/10" aria-label="Notificações">
            <Icon name="bell" className="h-4 w-4" />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 w-4 place-items-center rounded-full bg-brass-400 text-[9px] font-bold text-ink-950">{unread}</span>}
          </button>
          <Link to="/agendar" className="btn-primary !py-2 text-xs">
            <Icon name="plus" className="h-4 w-4" /> Agendar
          </Link>
        </>
      }
    >
      <div className="mb-5 flex gap-1 overflow-x-auto rounded-full border border-white/8 bg-ink-900/50 p-1 lg:hidden">
        {nav.map((item) => (
          <button
            key={item.to}
            onClick={() => navigate(item.to)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs ${tab === pathToTab[item.to] ? 'bg-brass-400 text-ink-950' : 'text-cream-300/70'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {fetching && !appointments.length ? (
        <div className="flex justify-center py-20"><Spinner className="h-6 w-6 text-brass-300" /></div>
      ) : (
        <>
          {tab === 'agenda' && (
            <div className="space-y-6">
              {next && (
                <div className="card relative overflow-hidden border-brass-400/25 bg-gradient-to-br from-brass-500/15 via-ink-900 to-ink-900">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-brass-300">próximo atendimento</p>
                      <h2 className="mt-2 font-display text-3xl text-cream-50">{fmtDate(next.start_at, { weekday: 'long' })}</h2>
                      <p className="mt-1 text-sm text-cream-200/80">
                        {timeStr(next.start_at)} – {timeStr(next.end_at)} · {next.items.map((i) => i.name).join(' + ')}
                      </p>
                      <p className="mt-1 text-xs text-cream-300/60">com {next.professional?.name} · código {next.code}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={next.status === 'confirmado' ? 'success' : 'warn'}>{statusLabel[next.status]}</Badge>
                      <p className="font-display text-2xl text-brass-200">{brl(next.total_cents)}</p>
                      <p className="text-[11px] text-cream-300/50">{next.payment ? paymentLabel[next.payment.method] : 'no local'}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <Button onClick={() => checkin(next)} variant="ghost" icon="qr">Fazer check-in</Button>
                    <Button variant="dark" onClick={() => setCancelTarget(next)}>Cancelar</Button>
                    <Button variant="dark" onClick={() => navigate(`/agendar?professional=${next.professional_id}`)}>Remarcar</Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="card-tight">
                  <p className="text-xs uppercase tracking-[0.14em] text-cream-300/60">fila agora</p>
                  <p className="mt-2 stat-value">{queue?.waiting_count ?? 0} <span className="text-sm text-cream-300/50">na espera</span></p>
                  <p className="mt-1 text-xs text-cream-300/60">
                    {queue?.in_service.length ? `${queue.in_service.length} em atendimento neste momento` : 'Nenhum atendimento em andamento'}
                  </p>
                </div>
                <div className="card-tight">
                  <p className="text-xs uppercase tracking-[0.14em] text-cream-300/60">desde o primeiro corte</p>
                  <p className="mt-2 stat-value">{history.filter((a) => a.status === 'concluido').length} <span className="text-sm text-cream-300/50">visitas</span></p>
                  <p className="mt-1 text-xs text-cream-300/60">
                    {brl(history.filter((a) => a.status === 'concluido').reduce((s, a) => s + a.total_cents, 0))} investidos em você
                  </p>
                </div>
              </div>

              <section>
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-cream-300/60">Próximos horários</h3>
                {upcoming.length === 0 ? (
                  <EmptyState
                    icon="calendar"
                    title="Nenhum horário marcado"
                    description="Que tal garantir o próximo corte antes que a agenda feche?"
                    action={<Link to="/agendar" className="btn-primary mt-1">Agendar agora</Link>}
                  />
                ) : (
                  <div className="space-y-2">
                    {upcoming.map((appointment) => (
                      <article key={appointment.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-ink-900/50 p-4">
                        <div className="grid w-16 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03] py-2">
                          <span className="text-[10px] uppercase text-cream-300/60">{fmtDate(appointment.start_at, { month: 'short' }).split(' ')[0]}</span>
                          <span className="font-display text-xl text-cream-50">{appointment.start_at.slice(8, 10)}</span>
                          <span className="text-[10px] text-brass-300">{timeStr(appointment.start_at)}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-cream-100">{appointment.items.map((i) => i.name).join(' + ')}</p>
                          <p className="text-xs text-cream-300/60">
                            {appointment.professional?.name} · {durationLabel(appointment.duration_min)} · {brl(appointment.total_cents)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span>
                          <button onClick={() => setCancelTarget(appointment)} className="rounded-lg p-2 text-cream-300/60 hover:bg-rose-400/10 hover:text-rose-400" aria-label="Cancelar agendamento">
                            <Icon name="trash" className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {tab === 'historico' && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cream-300/60">Histórico completo</h3>
                <span className="text-xs text-cream-300/40">{history.length} registros</span>
              </div>
              {history.length === 0 ? (
                <EmptyState title="Nada no histórico ainda" description="Depois do primeiro atendimento, tudo fica registrado aqui." />
              ) : (
                history.map((appointment) => (
                  <article key={appointment.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-ink-900/40 p-4">
                    <div className="w-24 shrink-0 text-xs text-cream-300/70">{fmtDateTime(appointment.start_at)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-cream-100">{appointment.items.map((i) => i.name).join(' + ')}</p>
                      <p className="text-xs text-cream-300/50">
                        {appointment.professional?.name} · {brl(appointment.total_cents)} · {appointment.payment ? paymentLabel[appointment.payment.method] : '—'}
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] ${statusStyle[appointment.status]}`}>{statusLabel[appointment.status]}</span>
                    {appointment.review ? (
                      <span className="flex items-center gap-1 text-xs text-brass-200"><StarRating value={appointment.review.rating} size={12} /></span>
                    ) : appointment.can_review ? (
                      <Button variant="ghost" className="!py-1.5 text-xs" onClick={() => setReviewTarget(appointment)}>Avaliar</Button>
                    ) : null}
                  </article>
                ))
              )}
            </section>
          )}

          {tab === 'clube' && <ClubTab appointments={appointments} />}
          {tab === 'notificacoes' && (
            <NotificationsTab
              items={notifications}
              onRead={async () => {
                await api.post('/notifications/read', {});
                setUnread(0);
                setNotifications((prev) => prev.map((n) => ({ ...n, read_at: new Date().toISOString() })));
              }}
            />
          )}
          {tab === 'perfil' && <ProfileTab user={user} />}
        </>
      )}

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar agendamento"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelTarget(null)}>Manter horário</Button>
            <Button variant="danger" onClick={cancel}>Confirmar cancelamento</Button>
          </>
        }
      >
        <p className="text-sm text-cream-300/80">
          Você está cancelando <strong className="text-cream-100">{cancelTarget?.items.map((i) => i.name).join(' + ')}</strong> de{' '}
          {cancelTarget ? fmtDateTime(cancelTarget.start_at) : ''}.
        </p>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-cream-300/70">
          Política: reembolso de 100% com mais de 24h de antecedência, 50% entre 4h e 24h e nenhum reembolso abaixo de 4h.
        </div>
      </Modal>

      <Modal
        open={!!reviewTarget}
        onClose={() => setReviewTarget(null)}
        title="Como foi seu atendimento?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>Depois</Button>
            <Button onClick={submitReview}>Enviar avaliação</Button>
          </>
        }
      >
        <p className="text-sm text-cream-300/80">Sua opinião aparece no perfil do barbeiro e ajuda outros clientes.</p>
        <div className="flex justify-center py-2"><StarRating value={rating} onChange={setRating} size={34} /></div>
        <Field label="Comentário (opcional)">
          <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="O que achou do corte, do atendimento, do ambiente?" />
        </Field>
      </Modal>
    </PanelLayout>
  );
}

function ClubTab({ appointments }: { appointments: Appointment[] }) {
  const [plans, setPlans] = useState<{ id: string; name: string; price_cents: number; credits: number; perks: string[]; discount_pct: number }[]>([]);
  const { push } = useToast();
  useEffect(() => {
    api.get<typeof plans>('/plans').then(setPlans).catch(() => {});
  }, []);
  const completed = appointments.filter((a) => a.status === 'concluido' && a.start_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;

  return (
    <div className="space-y-6">
      <div className="card border-brass-400/25 bg-gradient-to-br from-brass-500/15 to-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-brass-300">seu plano</p>
            <h2 className="mt-2 text-2xl text-cream-50">Clube Navalha · ativo</h2>
            <p className="mt-1 text-sm text-cream-300/70">Renovação automática em 23 dias · cancele quando quiser</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-cream-300/60">créditos usados no mês</p>
            <p className="font-display text-3xl text-brass-200">{completed}/4</p>
          </div>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {['4 cortes incluídos', '15% off em extras', 'Prioridade na agenda', 'Bebida cortesia'].map((perk) => (
            <span key={perk} className="chip justify-center">{perk}</span>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <div key={plan.id} className="card-tight flex flex-col">
            <h3 className="text-lg text-cream-50">{plan.name}</h3>
            <p className="mt-2 font-display text-2xl text-brass-200">{brl(plan.price_cents)}<span className="text-xs text-cream-300/50">/mês</span></p>
            <ul className="mt-3 flex-1 space-y-1 text-xs text-cream-300/70">
              {plan.perks.map((p) => <li key={p}>• {p}</li>)}
            </ul>
            <Button className="mt-4 w-full" variant="ghost" onClick={() => push('Plano atualizado — nossa equipe confirma em instantes')}>
              {plan.name.includes('Premium') ? 'Fazer upgrade' : 'Assinar'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotificationsTab({ items, onRead }: { items: NotificationItem[]; onRead: () => void }) {
  const channelIcon: Record<string, 'mail' | 'phone' | 'bell'> = { email: 'mail', sms: 'phone', push: 'bell', inapp: 'bell' };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-cream-300/60">Central de mensagens</h3>
        <Button variant="ghost" className="!py-1.5 text-xs" onClick={onRead}>Marcar tudo como lido</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="bell" title="Nenhuma notificação" description="Avisos de confirmação, lembretes e promoções aparecem aqui." />
      ) : (
        items.map((item) => (
          <article key={item.id} className={`flex gap-3 rounded-2xl border p-4 ${item.read_at ? 'border-white/8 bg-ink-900/30' : 'border-brass-400/25 bg-brass-400/[0.06]'}`}>
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/5 text-brass-300">
              <Icon name={channelIcon[item.channel] || 'bell'} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-cream-100">{item.title}</p>
                <span className="whitespace-nowrap text-[11px] text-cream-300/40">{fmtDateTime(item.sent_at)}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-cream-300/70">{item.body}</p>
              <span className="mt-2 inline-block rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-cream-300/50">{item.channel}</span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}

function ProfileTab({ user }: { user: User | null }) {
  const { patchUser, refresh } = useAuth();
  const { push } = useToast();
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '', birthday: user?.birthday || '' });
  const [prefs, setPrefs] = useState({ barber: 'Diego Almeida', style: 'Degradê navalhado', allergies: '', reminders: true });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patch<User>('/auth/me', { ...form, preferences: prefs });
      patchUser(updated);
      await refresh();
      push('Perfil atualizado');
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function enablePush() {
    try {
      if (!('Notification' in window)) throw new Error('sem suporte');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('permissão negada');
      await api.post('/notifications/push/subscribe', { subscription: { endpoint: 'demo', enabled: true } });
      push('Notificações push ativadas');
    } catch {
      push('Não foi possível ativar o push neste navegador', 'error');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="card space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name} url={user?.avatar_url} size={56} />
          <div>
            <p className="text-lg text-cream-50">{user?.name}</p>
            <p className="text-xs text-cream-300/60">{user?.email}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="WhatsApp"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Aniversário"><Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></Field>
          <Field label="Idioma preferido">
            <select className="field" defaultValue="pt-BR">
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </Field>
        </div>
        <Button onClick={save} loading={saving}>Salvar alterações</Button>
      </div>

      <div className="space-y-6">
        <div className="card space-y-4">
          <h3 className="text-lg text-cream-50">Preferências</h3>
          <Field label="Barbeiro favorito">
            <Input value={prefs.barber} onChange={(e) => setPrefs({ ...prefs, barber: e.target.value })} />
          </Field>
          <Field label="Estilo habitual">
            <Input value={prefs.style} onChange={(e) => setPrefs({ ...prefs, style: e.target.value })} />
          </Field>
          <Field label="Alergias / observações" hint="O barbeiro vê isso antes do atendimento">
            <Textarea rows={2} value={prefs.allergies} onChange={(e) => setPrefs({ ...prefs, allergies: e.target.value })} />
          </Field>
          <label className="flex items-center justify-between rounded-xl border border-white/8 p-3 text-sm text-cream-200">
            Lembretes por WhatsApp
            <input type="checkbox" checked={prefs.reminders} onChange={(e) => setPrefs({ ...prefs, reminders: e.target.checked })} className="h-4 w-4 accent-brass-400" />
          </label>
        </div>
        <div className="card space-y-3">
          <h3 className="text-lg text-cream-50">Notificações push</h3>
          <p className="text-xs text-cream-300/70">Receba avisos de confirmação, lembretes e quando sua vez na fila chegar.</p>
          <Button variant="ghost" onClick={enablePush} icon="bell">Ativar push no navegador</Button>
        </div>
      </div>
    </div>
  );
}
