import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type Professional, type Service, type Slot } from '../lib/api';
import { useAuth } from '../lib/auth';
import { brl, dateStr, durationLabel, monthMatrix, timeStr } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { Badge, Button, EmptyState, Field, Icon, Input, Modal, Spinner, Textarea, useToast } from '../components/ui';

const categoryOrder = ['cabelo', 'barba', 'combo', 'coloracao', 'estetica', 'tratamento'];
const categoryLabel: Record<string, string> = {
  cabelo: 'Cabelo',
  barba: 'Barba',
  combo: 'Combos',
  coloracao: 'Coloração',
  estetica: 'Estética',
  tratamento: 'Tratamento',
};

type Quote = { subtotal_cents: number; discount_cents: number; total_cents: number; duration_min: number; error: string | null; coupon?: { code: string } | null };

const paymentOptions = [
  { id: 'onsite', label: 'Pagar no local', hint: 'Dinheiro, débito ou crédito na barbearia', icon: 'money' as const },
  { id: 'pix', label: 'Pix', hint: 'QR Code gerado na confirmação', icon: 'qr' as const },
  { id: 'card', label: 'Cartão de crédito', hint: 'Cobrança imediata com segurança', icon: 'card' as const },
  { id: 'preauth', label: 'Pré-autorizar cartão', hint: 'Garante a reserva, cobra só no fim', icon: 'shield' as const },
];

export function Booking() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [step, setStep] = useState(1);
  const [services, setServices] = useState<Service[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [selected, setSelected] = useState<string[]>(params.get('service') ? [params.get('service')!] : []);
  const [professionalId, setProfessionalId] = useState<string>(params.get('professional') || 'any');
  const [month, setMonth] = useState(() => new Date());
  const [date, setDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return dateStr(d);
  });
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<string | null>(null);
  const [coupon, setCoupon] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [method, setMethod] = useState('onsite');
  const [notes, setNotes] = useState('');
  const [guest, setGuest] = useState({ name: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ code: string; start_at: string; id: string; payment?: { id: string; method: string; status: string } | null } | null>(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    Promise.all([api.get<Service[]>('/services?branch=brn_centro'), api.get<Professional[]>('/professionals')])
      .then(([s, p]) => {
        setServices(s);
        setProfessionals(p);
      })
      .catch(() => push('Não foi possível carregar os serviços', 'error'));
  }, [push]);

  const chosen = useMemo(() => services.filter((s) => selected.includes(s.id)), [services, selected]);
  const duration = chosen.reduce((sum, s) => sum + s.duration_min, 0);
  const qualifiedPros = useMemo(() => {
    if (!selected.length) return professionals;
    return professionals.filter((p) => selected.every((sid) => (p.services || []).includes(sid)));
  }, [professionals, selected]);

  useEffect(() => {
    if (professionalId !== 'any' && !qualifiedPros.some((p) => p.id === professionalId)) setProfessionalId('any');
  }, [qualifiedPros, professionalId]);

  useEffect(() => {
    if (!selected.length) {
      setSlots([]);
      return;
    }
    setLoadingSlots(true);
    setSlot(null);
    api
      .get<{ slots: Slot[] }>(`/availability?date=${date}&professional=${professionalId}&services=${selected.join(',')}&branch=brn_centro`)
      .then((data) => setSlots(data.slots))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [date, professionalId, selected]);

  useEffect(() => {
    if (!selected.length) {
      setQuote(null);
      return;
    }
    api
      .post<Quote>('/appointments/quote', { service_ids: selected, coupon_code: coupon || undefined })
      .then(setQuote)
      .catch(() => {});
  }, [selected, coupon]);

  const groupedSlots = useMemo(() => {
    const groups: Record<string, Slot[]> = { manhã: [], tarde: [], noite: [] };
    for (const s of slots) {
      const hour = Number(s.start_at.slice(11, 13));
      const key = hour < 12 ? 'manhã' : hour < 18 ? 'tarde' : 'noite';
      groups[key].push(s);
    }
    return groups;
  }, [slots]);

  const toggleService = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  };

  const days = monthMatrix(month);
  const todayStr = dateStr(new Date());
  const maxDate = dateStr(new Date(Date.now() + 60 * 86400000));

  async function submit() {
    if (!user) {
      setShowAuth(true);
      return;
    }
    if (!slot) return push('Escolha um horário', 'error');
    setSubmitting(true);
    try {
      const result = await api.post<{ appointment: { id: string; code: string; start_at: string }; payment: { id: string; method: string; status: string } | null }>(
        '/appointments',
        {
          service_ids: selected,
          professional_id: slot ? slotProfessionalId : professionalId,
          start_at: slot,
          branch_id: 'brn_centro',
          coupon_code: coupon || undefined,
          payment_method: method,
          notes: notes || undefined,
          client: user.role === 'CLIENT' ? { name: guest.name || user.name, phone: guest.phone || user.phone } : undefined,
        }
      );
      setSuccess({ code: result.appointment.code, start_at: result.appointment.start_at, id: result.appointment.id, payment: result.payment });
      await refresh();
    } catch (error) {
      push((error as { error: string }).error || 'Erro ao agendar', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const slotProfessionalId = useMemo(() => {
    const found = slots.find((s) => s.start_at === slot);
    return found?.professional_id || (professionalId === 'any' ? '' : professionalId);
  }, [slots, slot, professionalId]);

  if (success) {
    return <SuccessCard success={success} onDone={() => navigate('/app')} />;
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brass-300">agendamento online</p>
          <h1 className="mt-2 text-3xl text-cream-50 sm:text-4xl">{t('booking.title')}</h1>
          <p className="mt-2 text-sm text-cream-300/70">Escolha os serviços, o barbeiro e o horário. Confirmação imediata.</p>
        </header>

        <ol className="mb-8 grid grid-cols-3 gap-2 text-xs">
          {[t('booking.step1'), t('booking.step2'), t('booking.step3')].map((label, index) => (
            <li
              key={label}
              className={`rounded-xl border px-3 py-2.5 transition ${step === index + 1 ? 'border-brass-400/50 bg-brass-400/10 text-brass-100' : step > index + 1 ? 'border-moss-400/25 bg-moss-400/5 text-cream-200' : 'border-white/8 text-cream-300/50'}`}
            >
              <span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full border border-current/30 text-[10px]">
                {step > index + 1 ? '✓' : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>

        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="space-y-6">
            {step === 1 && (
              <div className="card space-y-6">
                <div>
                  <h2 className="text-xl text-cream-50">1. O que você vai fazer hoje?</h2>
                  <p className="mt-1 text-sm text-cream-300/60">Selecione um ou mais serviços — a duração é somada automaticamente.</p>
                </div>
                {categoryOrder
                  .filter((category) => services.some((s) => s.category === category))
                  .map((category) => (
                    <div key={category}>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brass-300/80">{categoryLabel[category]}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {services
                          .filter((s) => s.category === category)
                          .map((service) => {
                            const active = selected.includes(service.id);
                            return (
                              <button
                                key={service.id}
                                onClick={() => toggleService(service.id)}
                                className={`flex items-start justify-between gap-3 rounded-xl border p-3 text-left transition ${active ? 'border-brass-400/60 bg-brass-400/10' : 'border-white/8 bg-white/[0.02] hover:border-white/20'}`}
                                aria-pressed={active}
                              >
                                <span>
                                  <span className="block text-sm font-medium text-cream-100">{service.name}</span>
                                  <span className="mt-0.5 block text-[11px] text-cream-300/60">{durationLabel(service.duration_min)}</span>
                                </span>
                                <span className="text-right">
                                  <span className="block text-sm text-brass-200">{brl(service.price_cents)}</span>
                                  <span className={`mt-1 inline-grid h-5 w-5 place-items-center rounded-full border ${active ? 'border-brass-400 bg-brass-400 text-ink-950' : 'border-white/20'}`}>
                                    {active && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
                                  </span>
                                </span>
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                <div className="flex items-center justify-between border-t border-white/8 pt-4">
                  <p className="text-sm text-cream-300/70">
                    {chosen.length ? `${chosen.length} serviço(s) · ${durationLabel(duration)}` : 'Nenhum serviço selecionado'}
                  </p>
                  <Button onClick={() => setStep(2)} disabled={!selected.length}>
                    {t('common.next')} <Icon name="arrow-right" className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div className="card">
                  <h2 className="text-xl text-cream-50">2. Escolha o barbeiro</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={() => setProfessionalId('any')}
                      className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${professionalId === 'any' ? 'border-brass-400/60 bg-brass-400/10' : 'border-white/8 hover:border-white/20'}`}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-full border border-brass-400/30 bg-brass-400/10 text-brass-300">
                        <Icon name="sparkle" className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium text-cream-100">{t('booking.any')}</span>
                        <span className="text-[11px] text-cream-300/60">mais horários disponíveis</span>
                      </span>
                    </button>
                    {qualifiedPros.map((pro) => (
                      <button
                        key={pro.id}
                        onClick={() => setProfessionalId(pro.id)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${professionalId === pro.id ? 'border-brass-400/60 bg-brass-400/10' : 'border-white/8 hover:border-white/20'}`}
                      >
                        <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(pro.name)}&backgroundColor=e0a45c`} alt="" className="h-10 w-10 rounded-full bg-brass-400/20" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-cream-100">{pro.name}</span>
                          <span className="text-[11px] text-cream-300/60">
                            ★ {Number(pro.avg_rating ?? pro.rating).toFixed(1)} · {(pro.specialties || []).slice(0, 2).join(', ')}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl text-cream-50">3. Escolha a data</h2>
                    <div className="flex gap-1">
                      <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-full p-2 hover:bg-white/10" aria-label="Mês anterior">
                        <Icon name="chevron-left" className="h-4 w-4" />
                      </button>
                      <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-full p-2 hover:bg-white/10" aria-label="Próximo mês">
                        <Icon name="chevron-right" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-sm capitalize text-cream-300/70">
                    {new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month)}
                  </p>
                  <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wider text-cream-300/50">
                    {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => <span key={d}>{d}</span>)}
                  </div>
                  <div className="mt-1 grid grid-cols-7 gap-1">
                    {days.map((day) => {
                      const value = dateStr(day);
                      const inMonth = day.getMonth() === month.getMonth();
                      const disabled = value < todayStr || value > maxDate;
                      const active = value === date;
                      return (
                        <button
                          key={value}
                          disabled={disabled}
                          onClick={() => setDate(value)}
                          className={`aspect-square rounded-lg text-sm transition ${
                            active
                              ? 'bg-brass-400 font-semibold text-ink-950'
                              : disabled
                                ? 'text-cream-300/20'
                                : inMonth
                                  ? 'text-cream-100 hover:bg-white/10'
                                  : 'text-cream-300/30 hover:bg-white/5'
                          }`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl text-cream-50">{t('booking.pickSlot')}</h2>
                    {loadingSlots && <Spinner className="h-4 w-4 text-brass-300" />}
                  </div>
                  {!slots.length && !loadingSlots ? (
                    <div className="mt-4">
                      <EmptyState
                        icon="calendar"
                        title="Nenhum horário livre nesta data"
                        description="Tente outro dia, escolha 'qualquer barbeiro' ou remova um serviço para reduzir a duração."
                      />
                    </div>
                  ) : (
                    <div className="mt-4 space-y-4">
                      {Object.entries(groupedSlots).map(([period, list]) =>
                        list.length ? (
                          <div key={period}>
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-cream-300/50">{period}</p>
                            <div className="flex flex-wrap gap-2">
                              {list.map((item) => (
                                <button
                                  key={`${item.start_at}-${item.professional_id}`}
                                  onClick={() => setSlot(item.start_at)}
                                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                                    slot === item.start_at ? 'border-brass-400 bg-brass-400 text-ink-950' : 'border-white/10 text-cream-100 hover:border-brass-400/50 hover:bg-white/5'
                                  }`}
                                >
                                  {timeStr(item.start_at)}
                                  {professionalId === 'any' && (
                                    <span className={`ml-1.5 text-[10px] ${slot === item.start_at ? 'text-ink-950/70' : 'text-cream-300/50'}`}>
                                      {professionals.find((p) => p.id === item.professional_id)?.name.split(' ')[0]}
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                  <div className="mt-6 flex justify-between border-t border-white/8 pt-4">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      <Icon name="arrow-left" className="h-4 w-4" /> {t('common.back')}
                    </Button>
                    <Button onClick={() => setStep(3)} disabled={!slot}>
                      {t('common.next')} <Icon name="arrow-right" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div className="card">
                  <h2 className="text-xl text-cream-50">4. Seus dados</h2>
                  {user ? (
                    <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-brass-400/15 text-brass-200">
                        {user.name.charAt(0)}
                      </span>
                      <div className="text-sm">
                        <p className="text-cream-100">{user.name}</p>
                        <p className="text-cream-300/60">{user.email} · {user.phone || 'sem telefone'}</p>
                      </div>
                      <Badge tone="success">logado</Badge>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Field label="Nome completo">
                        <Input value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} placeholder="Seu nome" />
                      </Field>
                      <Field label="WhatsApp">
                        <Input value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} placeholder="(49) 99999-0000" inputMode="tel" />
                      </Field>
                      <Field label="E-mail" className="sm:col-span-2">
                        <Input value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} placeholder="voce@email.com" type="email" />
                      </Field>
                      <p className="text-xs text-cream-300/60 sm:col-span-2">
                        Vamos precisar de uma conta para guardar seu histórico. Ao continuar, você entra ou cria sua conta em um clique.
                      </p>
                    </div>
                  )}
                  <Field label="Observações (opcional)" className="mt-4">
                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: máquina 0.5 nas laterais, alergia a pó finalizador…" />
                  </Field>
                </div>

                <div className="card">
                  <h2 className="text-xl text-cream-50">5. Pagamento</h2>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {paymentOptions.map((option) => (
                      <button
                        key={option.id}
                        onClick={() => setMethod(option.id)}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${method === option.id ? 'border-brass-400/60 bg-brass-400/10' : 'border-white/8 hover:border-white/20'}`}
                      >
                        <Icon name={option.icon} className="mt-0.5 h-5 w-5 text-brass-300" />
                        <span>
                          <span className="block text-sm font-medium text-cream-100">{option.label}</span>
                          <span className="text-[11px] text-cream-300/60">{option.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Input value={coupon} onChange={(e) => setCoupon(e.target.value.toUpperCase())} placeholder="Cupom de desconto" />
                    <Button variant="ghost" onClick={() => api.post<Quote>('/appointments/quote', { service_ids: selected, coupon_code: coupon }).then(setQuote)}>
                      Aplicar
                    </Button>
                  </div>
                  {quote?.error && <p className="mt-2 text-xs text-rose-400">{quote.error}</p>}
                  <div className="mt-6 flex justify-between border-t border-white/8 pt-4">
                    <Button variant="ghost" onClick={() => setStep(2)}>
                      <Icon name="arrow-left" className="h-4 w-4" /> {t('common.back')}
                    </Button>
                    <Button onClick={submit} loading={submitting}>
                      {t('booking.confirm')} <Icon name="check" className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RESUMO */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg text-cream-50">{t('booking.summary')}</h3>
                <Badge>{durationLabel(duration)}</Badge>
              </div>
              <ul className="space-y-2 text-sm">
                {chosen.length ? (
                  chosen.map((service) => (
                    <li key={service.id} className="flex items-start justify-between gap-3">
                      <span className="text-cream-200/90">{service.name}</span>
                      <span className="whitespace-nowrap text-cream-300/70">{brl(service.price_cents)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-cream-300/50">Nenhum serviço ainda</li>
                )}
              </ul>
              <div className="space-y-1.5 border-t border-white/8 pt-3 text-sm">
                <div className="flex justify-between text-cream-300/70">
                  <span>Barbeiro</span>
                  <span className="text-cream-100">
                    {professionalId === 'any' ? t('booking.any') : professionals.find((p) => p.id === professionalId)?.name}
                  </span>
                </div>
                <div className="flex justify-between text-cream-300/70">
                  <span>Data</span>
                  <span className="text-cream-100">{date.split('-').reverse().join('/')}</span>
                </div>
                <div className="flex justify-between text-cream-300/70">
                  <span>Horário</span>
                  <span className="text-cream-100">{slot ? timeStr(slot) : '—'}</span>
                </div>
              </div>
              <div className="space-y-1.5 border-t border-white/8 pt-3 text-sm">
                <div className="flex justify-between text-cream-300/70">
                  <span>Subtotal</span>
                  <span>{brl(quote?.subtotal_cents || chosen.reduce((s, c) => s + c.price_cents, 0))}</span>
                </div>
                {!!quote?.discount_cents && (
                  <div className="flex justify-between text-moss-400">
                    <span>Desconto {quote.coupon?.code ? `(${quote.coupon.code})` : ''}</span>
                    <span>− {brl(quote.discount_cents)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/8 pt-2 font-semibold text-cream-50">
                  <span>Total</span>
                  <span className="text-brass-200">{brl(quote?.total_cents ?? chosen.reduce((s, c) => s + c.price_cents, 0))}</span>
                </div>
              </div>
              <p className="rounded-xl bg-white/[0.03] p-3 text-[11px] leading-relaxed text-cream-300/60">
                Cancelamento grátis até 24h antes. Entre 4h e 24h, reembolso de 50%. O lembrete chega por e-mail, SMS e push.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <Modal open={showAuth} onClose={() => setShowAuth(false)} title="Entre para concluir">
        <p className="text-sm text-cream-300/80">
          Para guardar seu histórico, gerenciar cancelamentos e enviar lembretes, precisamos da sua conta. É rápido.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => navigate('/entrar?next=/agendar')}>Entrar / criar conta</Button>
          <Button variant="ghost" onClick={() => setShowAuth(false)}>Continuar vendo</Button>
        </div>
      </Modal>
    </div>
  );
}

function SuccessCard({ success, onDone }: { success: { code: string; start_at: string; id: string; payment?: { method: string; status: string } | null }; onDone: () => void }) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    import('qrcode').then((QR) =>
      QR.toDataURL(`/checkin-token/${success.code}`, { width: 240, margin: 1, color: { dark: '#0e0f12', light: '#f4f1ea' } })
        .then((url) => active && setQr(url))
        .catch(() => {})
    );
    return () => {
      active = false;
    };
  }, [success.code]);

  return (
    <div className="container-page flex min-h-[70vh] items-center justify-center py-16">
      <div className="card w-full max-w-lg animate-rise text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-moss-400/15 text-moss-400">
          <Icon name="check" className="h-8 w-8" strokeWidth={2.5} />
        </span>
        <h1 className="mt-5 text-2xl text-cream-50">Agendamento confirmado!</h1>
        <p className="mt-2 text-sm text-cream-300/80">
          {success.start_at.replace('T', ' às ')} · código <span className="font-mono text-brass-200">{success.code}</span>
        </p>
        {qr && <img src={qr} alt="QR code de check-in" className="mx-auto mt-6 h-40 w-40 rounded-xl" />}
        <p className="mt-3 text-xs text-cream-300/60">Apresente este QR code na recepção para fazer check-in.</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={onDone} className="w-full">Ver meus agendamentos</Button>
          <Button variant="ghost" onClick={() => window.location.reload()} className="w-full">Agendar outro</Button>
        </div>
      </div>
    </div>
  );
}
