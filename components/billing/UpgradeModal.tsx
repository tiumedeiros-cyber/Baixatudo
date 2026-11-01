'use client';

/**
 * UpgradeModal — o modal conversivo que aparece quando o usuário clica num
 * item com cadeado (transição Pro, som Pro, elemento 3D Pro…).
 *
 * Não insere nada na timeline: só explica o que o Pro libera e abre o checkout
 * real (`subscriptionService.checkout` → Stripe/Mercado Pago/PIX manual).
 */

import { useEffect, useState } from 'react';
import { Check, Crown, Loader2, Lock, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useSubscription } from './SubscriptionContext';
import { subscriptionService, type BillingCycle } from '@/lib/subscription-service';
import { cn } from '@/lib/utils';

const BENEFITS = [
  'Biblioteca Pro: transições, sons, objetos 3D e overlays exclusivos',
  'Exportação em 4K e sem limite de qualidade',
  'Projetos e armazenamento ampliados (avatares e vídeos de IA inclusos)',
  'Todos os recursos novos liberados sem custo extra',
];

export function UpgradeModal() {
  const { upgrade, closeUpgrade, state, cycle, setCycle, refresh } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const open = upgrade !== null;
  const plan =
    state.plans.find((item) => item.flags.premiumLibrary && item.featured) ??
    state.plans.find((item) => item.flags.premiumLibrary) ??
    state.plans[0] ??
    null;

  useEffect(() => {
    if (!open) {
      setError('');
      setDone(false);
      setBusy(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeUpgrade();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      onKey;
    };
  }, [open, closeUpgrade]);

  if (!open) return null;

  const price = subscriptionService.price(plan, cycle);
  const yearlySaving =
    plan && plan.priceYearly > 0 && plan.priceMonthly > 0
      ? Math.max(0, Math.round((1 - plan.priceYearly / (plan.priceMonthly * 12)) * 100))
      : 0;

  async function subscribe() {
    setBusy(true);
    setError('');
    const result = await subscriptionService.checkout({ planSlug: plan?.slug ?? 'pro', cycle });
    if (result.error) {
      setError(result.error);
      setBusy(false);
      return;
    }
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    // modo manual/demo: já liberou — atualiza o contexto e mostra sucesso
    await refresh(true);
    setDone(true);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center">
      <button
        type="button"
        aria-label="Fechar"
        onClick={closeUpgrade}
        className="absolute inset-0 h-full w-full cursor-default"
        tabIndex={-1}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-title"
        className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0d1018] shadow-2xl"
      >
        <div className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-amber-400/20 blur-3xl" />
        <button
          type="button"
          onClick={closeUpgrade}
          className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition hover:bg-white/5 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-5 pb-5 pt-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
            <Lock className="h-3 w-3" />
            {upgrade?.item ? `${upgrade.type === 'transition' ? 'Transição' : upgrade.type === 'sfx' || upgrade.type === 'music' ? 'Áudio' : 'Elemento'} Pro` : 'Recurso Pro'}
          </span>

          <h2 id="upgrade-title" className="mt-3 font-display text-xl font-bold text-white">
            {done ? 'Pro liberado! 🎉' : 'Desbloqueie o Editor Studio Pro'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {done
              ? 'Seu plano já está ativo. Pode fechar e usar o item com cadeado.'
              : upgrade?.item
                ? `“${upgrade.item}” faz parte da biblioteca Pro. Assine e ele entra na timeline na hora.`
                : 'Todo o acervo profissional, 4K e recursos de IA liberados.'}
          </p>

          {!done ? (
            <>
              <ul className="mt-4 space-y-2">
                {BENEFITS.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-xs text-slate-300">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid grid-cols-2 gap-2">
                {(['monthly', 'yearly'] as BillingCycle[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setCycle(option)}
                    className={cn(
                      'rounded-xl border px-3 py-2 text-left transition',
                      cycle === option
                        ? 'border-amber-300/60 bg-amber-400/10 text-white'
                        : 'border-white/10 text-slate-300 hover:border-white/25',
                    )}
                  >
                    <span className="block text-[11px] font-semibold">{option === 'monthly' ? 'Mensal' : 'Anual'}</span>
                    <span className="block text-[10px] text-slate-400">
                      {option === 'yearly'
                        ? yearlySaving > 0
                          ? `${yearlySaving}% de desconto`
                          : 'cobrança única no ano'
                        : 'cancele quando quiser'}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-4 flex items-end justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">{plan?.name ?? 'Pro'}</p>
                  <p className="font-display text-2xl font-bold text-white">{price}</p>
                </div>
                <p className="text-[10px] text-slate-400">{cycle === 'yearly' ? 'por ano' : 'por mês'}</p>
              </div>

              <button
                type="button"
                onClick={subscribe}
                disabled={busy || !plan}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                {cycle === 'yearly' ? 'Assinar o plano anual' : 'Assinar agora'}
              </button>

              {error ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-rose-300">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {error}
                </p>
              ) : null}

              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-500">
                <Sparkles className="h-3 w-3" />
                {subscriptionService.gatewayLabel(state.gateway)}
              </p>
            </>
          ) : (
            <button
              type="button"
              onClick={closeUpgrade}
              className="mt-4 w-full rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
            >
              Continuar editando
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
