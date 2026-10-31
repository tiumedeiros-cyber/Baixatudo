import { Check, Clock, CreditCard, Hourglass, Sparkles, TriangleAlert } from 'lucide-react';
import { TimeCreditBar } from '@/components/time/TimeCreditBar';
import { HOUR_PACKS } from '@/lib/hour-packs';
import { getActiveSubscription, requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, ButtonLink, Card } from '@/components/ui';
import { brl, formatDate } from '@/lib/utils';
import { cancelSubscription, reactivateSubscription } from '@/app/dashboard/actions';
import type { Payment, Plan } from '@/lib/types';

export const dynamic = 'force-dynamic';

const statusLabel: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'brand' }> = {
  approved: { label: 'Aprovado', tone: 'success' },
  pending: { label: 'Pendente', tone: 'warning' },
  refused: { label: 'Recusado', tone: 'danger' },
  refunded: { label: 'Reembolsado', tone: 'brand' },
};

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ semTempo?: string; horas?: string }> }) {
  const { user } = await requireUser();
  const { semTempo, horas } = await searchParams;
  const sub = await getActiveSubscription();
  const supabase = await createSupabaseServerClient();
  const [{ data: payments }, { data: plans }] = await Promise.all([
    supabase.from('es_payments').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(20),
    supabase.from('es_plans').select('*').eq('is_active', true).order('sort_order'),
  ]);
  const plan = sub?.plans ?? null;
  const allPlans = (plans ?? []) as unknown as Plan[];
  const history = (payments ?? []) as unknown as Payment[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Assinatura</h1>
        <p className="mt-1 text-sm text-slate-400">Gerencie plano, renovação e histórico de pagamentos.</p>
      </div>

      {semTempo ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-100">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Seu tempo de edição acabou. Compre horas avulsas ou assine um plano para abrir o editor novamente — seus projetos
            continuam salvos.
          </span>
        </div>
      ) : null}
      {horas === 'aprovado' ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100">
          <Check className="h-4 w-4" /> Pagamento aprovado! Suas horas já estão disponíveis no saldo abaixo.
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
        <TimeCreditBar />
        <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-200">Plano atual</p>
              <h2 className="mt-1 font-display text-3xl font-extrabold text-white">{plan?.name ?? 'Sem plano'}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {plan ? brl(plan.price_monthly) + ' /mês' : 'Escolha um plano para liberar o editor'}
              </p>
            </div>
            <Badge tone={sub?.status === 'active' ? 'success' : sub?.status === 'trial' ? 'brand' : 'warning'}>
              {sub?.status ?? 'inativo'}
            </Badge>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Início</dt>
              <dd className="text-white">{formatDate(sub?.current_period_start)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">
                {sub?.cancel_at_period_end ? 'Acesso até' : 'Próxima renovação'}
              </dt>
              <dd className="text-white">{formatDate(sub?.current_period_end)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Ciclo</dt>
              <dd className="text-white">{sub?.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wide text-slate-500">Gateway</dt>
              <dd className="capitalize text-white">{sub?.gateway ?? '—'}</dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-2">
            {sub && !sub.cancel_at_period_end ? (
              <form action={cancelSubscription}>
                <button className="h-10 rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200 hover:bg-rose-500/20">
                  Cancelar renovação
                </button>
              </form>
            ) : sub ? (
              <form action={reactivateSubscription}>
                <button className="h-10 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white">
                  Reativar assinatura
                </button>
              </form>
            ) : null}
            <ButtonLink href="/checkout/pro" variant="secondary">Mudar de plano</ButtonLink>
          </div>
          {sub?.cancel_at_period_end ? (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-300">
              <TriangleAlert className="h-3.5 w-3.5" /> Cancelamento agendado — acesso mantido até {formatDate(sub.current_period_end)}.
            </p>
          ) : null}
        </Card>
        </div>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-white">Limites do plano</h3>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
            {[
              ['Projetos', plan?.limits?.projects ?? '—'],
              ['Armazenamento', `${plan?.limits?.storage_gb ?? '—'} GB`],
              ['Qualidade máx.', `${plan?.limits?.max_quality ?? '—'}p`],
              ['Exportar 4K', plan?.limits?.export_4k ? 'Sim' : 'Não'],
              ['Biblioteca premium', plan?.limits?.premium_library ? 'Sim' : 'Não'],
              ['Narração TTS', `${plan?.limits?.tts_minutes ?? '—'} min/mês`],
            ].map(([k, v]) => (
              <li key={String(k)} className="flex items-center justify-between border-b border-white/5 pb-2 last:border-0">
                <span className="text-slate-400">{k}</span>
                <span className="font-medium text-white">{String(v)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {allPlans.map((p) => (
          <Card key={p.id} className={p.slug === plan?.slug ? 'border-brand-400/40 p-5' : 'p-5'}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">{p.name}</h3>
              {p.slug === plan?.slug ? <Badge tone="brand">atual</Badge> : null}
            </div>
            <p className="mt-1 text-2xl font-extrabold text-white">{brl(p.price_monthly)}<span className="text-xs font-normal text-slate-400">/mês</span></p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-slate-400">
              {(p.features ?? []).slice(0, 4).map((f) => (
                <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 text-emerald-400" /> {f}</li>
              ))}
            </ul>
            <ButtonLink href={`/checkout/${p.slug}`} variant={p.slug === plan?.slug ? 'secondary' : 'primary'} size="sm" className="mt-4 w-full">
              {p.slug === plan?.slug ? 'Renovar' : 'Assinar'} <Sparkles className="h-3.5 w-3.5" />
            </ButtonLink>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Hourglass className="h-4 w-4 text-brand-300" /> Plano por hora
            </h3>
            <p className="mt-1 text-xs text-slate-400">Compre horas avulsas: não expiram e o cronômetro só corre com o editor aberto.</p>
          </div>
          <ButtonLink href="/checkout/hora" size="sm">Comprar horas</ButtonLink>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {HOUR_PACKS.map((pack) => (
            <div key={pack.slug} className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                <Clock className="h-3 w-3" /> {pack.label}
              </p>
              <p className="mt-0.5 text-sm font-bold text-white">{brl(pack.price)}</p>
              <p className="text-[10px] text-slate-500">{brl(pack.perHour)}/hora</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/5 px-5 py-4">
          <CreditCard className="h-4 w-4 text-brand-300" />
          <h3 className="text-sm font-semibold text-white">Histórico de pagamentos</h3>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">Nenhum pagamento registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-left text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3">Valor</th>
                  <th className="px-5 py-3">Gateway</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 text-slate-300">{formatDate(p.created_at)}</td>
                    <td className="px-5 py-3 font-medium text-white">{brl(p.amount)}</td>
                    <td className="px-5 py-3 capitalize text-slate-400">{p.gateway}</td>
                    <td className="px-5 py-3">
                      <Badge tone={statusLabel[p.status]?.tone ?? 'neutral'}>{statusLabel[p.status]?.label ?? p.status}</Badge>
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{p.id.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
