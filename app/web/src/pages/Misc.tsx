import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { brl, fmtDateTime, timeStr } from '../lib/format';
import { Badge, Button, Icon, Spinner, useToast } from '../components/ui';
import { Logo, PublicLayout } from '../components/Shell';

/* -------------------------------- Clube -------------------------------- */
type Plan = { id: string; name: string; price_cents: number; credits: number; discount_pct: number; perks: string[]; billing: string };

export function Club() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const { push } = useToast();

  useEffect(() => {
    api.get<Plan[]>('/plans').then(setPlans).catch(() => {});
  }, []);

  return (
    <PublicLayout>
      <section className="container-page py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="chip border-brass-400/30 text-brass-200">assinatura mensal</span>
          <h1 className="mt-5 font-display text-4xl text-cream-50 sm:text-5xl">Clube Navalha</h1>
          <p className="mt-4 text-cream-300/80">
            Cuidar do visual deveria ser hábito, não evento. Assine e mantenha o corte afiado o ano inteiro com prioridade na agenda.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {plans.map((plan, index) => (
            <div key={plan.id} className={`card flex flex-col ${index === 1 ? 'border-brass-400/40 bg-brass-400/[0.06]' : ''}`}>
              <div className="flex items-start justify-between">
                <h2 className="text-2xl text-cream-50">{plan.name}</h2>
                {index === 1 && <Badge tone="warn">melhor valor</Badge>}
              </div>
              <p className="mt-4 font-display text-4xl text-brass-200">
                {brl(plan.price_cents)}<span className="ml-1 font-sans text-sm text-cream-300/50">/{plan.billing}</span>
              </p>
              <p className="mt-2 text-sm text-cream-300/70">{plan.credits} créditos de atendimento por mês</p>
              <ul className="mt-6 flex-1 space-y-2 text-sm text-cream-200/85">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-moss-400" />{perk}</li>
                ))}
                <li className="flex items-start gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-moss-400" />{plan.discount_pct}% de desconto em serviços avulsos</li>
              </ul>
              <Button className="mt-6 w-full" variant={index === 1 ? 'primary' : 'ghost'} onClick={() => push('Assinatura solicitada — nossa equipe confirma em instantes')}>
                Assinar {plan.name.split(' ').pop()}
              </Button>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            ['Cancele quando quiser', 'Sem fidelidade, sem multa. O plano pausa no próximo ciclo.'],
            ['Créditos não acumulam dívida', 'Se não usar, o crédito vale por 30 dias após a renovação.'],
            ['Prioridade real', 'Assinantes entram na frente em horários de pico e emendas.'],
          ].map(([title, desc]) => (
            <div key={title} className="card-tight">
              <p className="text-sm font-medium text-cream-50">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-cream-300/70">{desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link to="/agendar" className="btn-primary">Agendar meu primeiro corte</Link>
        </div>
      </section>
    </PublicLayout>
  );
}

/* ------------------------------- Check-in ------------------------------ */
export function Checkin() {
  const { token } = useParams();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [info, setInfo] = useState<{ client?: { name: string }; start_at?: string; items?: { name: string }[] } | null>(null);

  useEffect(() => {
    if (!token) return;
    api
      .post<typeof info & object>(`/appointments/checkin/${token}`, {})
      .then((data) => {
        setInfo(data);
        setState('ok');
      })
      .catch(() => setState('error'));
  }, [token]);

  return (
    <PublicLayout>
      <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
        <div className="card w-full max-w-md text-center">
          {state === 'loading' && <Spinner className="mx-auto h-8 w-8 text-brass-300" />}
          {state === 'ok' && (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-moss-400/15 text-moss-400"><Icon name="check" className="h-8 w-8" strokeWidth={2.4} /></span>
              <h1 className="mt-5 text-2xl text-cream-50">Check-in confirmado!</h1>
              <p className="mt-2 text-sm text-cream-300/80">
                {info?.client?.name}, seu horário é às {info?.start_at ? timeStr(info.start_at) : ''}. O barbeiro já foi avisado que você chegou.
              </p>
              {info?.items?.length ? <p className="mt-2 text-xs text-brass-200">{info.items.map((i) => i.name).join(' + ')}</p> : null}
              <Link to="/app" className="btn-primary mt-6 w-full">Ver meus agendamentos</Link>
            </>
          )}
          {state === 'error' && (
            <>
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-400/15 text-rose-400"><Icon name="x" className="h-8 w-8" /></span>
              <h1 className="mt-5 text-2xl text-cream-50">Check-in inválido</h1>
              <p className="mt-2 text-sm text-cream-300/80">Este link expirou ou o agendamento foi cancelado. Fale com a recepção.</p>
              <Link to="/" className="btn-ghost mt-6 w-full">Voltar ao site</Link>
            </>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

/* ------------------------------ Pagamento ------------------------------ */
export function PaymentStatus() {
  const { id } = useParams();
  const [payment, setPayment] = useState<{ id: string; method: string; status: string; amount_cents: number; appointment?: { start_at: string; code: string } } | null>(null);
  const { push } = useToast();

  useEffect(() => {
    if (!id) return;
    api.get<typeof payment>(`/payments/${id}`).then(setPayment).catch(() => {});
  }, [id]);

  return (
    <PublicLayout>
      <div className="container-page flex min-h-[60vh] items-center justify-center py-16">
        <div className="card w-full max-w-md">
          <h1 className="text-2xl text-cream-50">Pagamento</h1>
          {!payment ? (
            <div className="mt-6 flex justify-center"><Spinner className="h-6 w-6 text-brass-300" /></div>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-cream-300/60">Valor</span><span className="text-brass-200">{brl(payment.amount_cents)}</span></div>
              <div className="flex items-center justify-between"><span className="text-cream-300/60">Método</span><span className="text-cream-100">{payment.method}</span></div>
              <div className="flex items-center justify-between"><span className="text-cream-300/60">Status</span><Badge tone={payment.status === 'pago' ? 'success' : 'warn'}>{payment.status}</Badge></div>
              {payment.appointment && (
                <div className="flex items-center justify-between"><span className="text-cream-300/60">Agendamento</span><span className="text-cream-100">{payment.appointment.code} · {fmtDateTime(payment.appointment.start_at)}</span></div>
              )}
              {payment.status !== 'pago' && (
                <Button
                  className="mt-3 w-full"
                  onClick={async () => {
                    await api.post(`/payments/${payment.id}/simulate-paid`, {});
                    push('Pagamento confirmado');
                    setPayment(await api.get<typeof payment>(`/payments/${payment.id}`));
                  }}
                >
                  Simular pagamento aprovado
                </Button>
              )}
              <Link to="/app" className="btn-ghost mt-2 w-full">Ir para minha conta</Link>
            </div>
          )}
        </div>
      </div>
    </PublicLayout>
  );
}

/* -------------------------------- 404 ---------------------------------- */
export function NotFound() {
  return (
    <PublicLayout>
      <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <Logo />
        <p className="mt-8 font-display text-6xl text-brass-300">404</p>
        <h1 className="mt-3 text-2xl text-cream-50">Essa página saiu para cortar o cabelo</h1>
        <p className="mt-2 text-sm text-cream-300/70">O link pode ter mudado ou o agendamento foi removido.</p>
        <div className="mt-6 flex gap-2">
          <Link to="/" className="btn-primary">Voltar ao início</Link>
          <Link to="/agendar" className="btn-ghost">Agendar</Link>
        </div>
      </div>
    </PublicLayout>
  );
}
