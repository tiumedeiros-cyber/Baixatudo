'use client';

/**
 * SubscriptionContext — um único lugar para saber se o usuário é Free ou Pro.
 *
 * Fica isolado em `components/billing` para não acoplar nada ao core do
 * editor: qualquer painel (biblioteca, exportação, downloads) consegue ler
 * `useSubscription()` e abrir o mesmo modal de upgrade.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { FREE_STATE, subscriptionService, type BillingCycle, type SubscriptionState } from '@/lib/subscription-service';

type UpgradeRequest = { item?: string; type?: string } | null;

type SubscriptionContextValue = {
  state: SubscriptionState;
  loading: boolean;
  /** pedido de upgrade em aberto (quem abriu e qual item) */
  upgrade: UpgradeRequest;
  openUpgrade: (request?: { item?: string; type?: string }) => void;
  closeUpgrade: () => void;
  refresh: (fresh?: boolean) => Promise<void>;
  isPro: boolean;
  cycle: BillingCycle;
  setCycle: (cycle: BillingCycle) => void;
  /** assina o plano recomendado/ativo e devolve o resultado */
  startCheckout: (planSlug?: string) => Promise<{ activated?: boolean; url?: string; pending?: boolean; manual?: import('@/lib/subscription-service').ManualPayment; error?: string }>;
};

const noop = () => undefined;
const SubscriptionContext = createContext<SubscriptionContextValue>({
  state: FREE_STATE,
  loading: false,
  upgrade: null,
  openUpgrade: noop,
  closeUpgrade: noop,
  refresh: async () => undefined,
  isPro: false,
  cycle: 'monthly',
  setCycle: noop,
  startCheckout: async () => ({ error: 'Indisponível' }),
});

export function SubscriptionProvider({
  children,
  initial,
}: {
  children: React.ReactNode;
  initial?: SubscriptionState | null;
}) {
  const [state, setState] = useState<SubscriptionState>(initial ?? FREE_STATE);
  const [loading, setLoading] = useState(!initial);
  const [upgrade, setUpgrade] = useState<UpgradeRequest>(null);
  const [cycle, setCycle] = useState<BillingCycle>(initial?.cycle ?? 'monthly');

  const refresh = useCallback(async (fresh = true) => {
    setLoading(true);
    try {
      const next = await subscriptionService.status(fresh);
      setState(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initial) return;
    let alive = true;
    subscriptionService.status().then((next) => {
      if (alive) {
        setState(next);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [initial]);

  const value = useMemo<SubscriptionContextValue>(
    () => ({
      state,
      loading,
      upgrade,
      openUpgrade: (request) => setUpgrade(request ?? {}),
      closeUpgrade: () => setUpgrade(null),
      refresh,
      isPro: state.isPro,
      cycle,
      setCycle,
      startCheckout: async (planSlug) => {
        const target =
          planSlug ??
          state.plans.find((plan) => plan.flags.premiumLibrary && plan.featured)?.slug ??
          state.plans.find((plan) => plan.flags.premiumLibrary)?.slug ??
          state.plans[0]?.slug ??
          'pro';
        return subscriptionService.checkout({ planSlug: target, cycle });
      },
    }),
    [state, loading, upgrade, refresh, cycle],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}

/**
 * Atalho para o caso de uso do cadeado:
 *   const requirePro = useProGate();
 *   if (!requirePro(asset)) return;  // já abriu o modal
 */
export function useProGate() {
  const { isPro, openUpgrade } = useSubscription();
  return useCallback(
    (item: { name?: string; type?: string; premium?: boolean }, allowed?: boolean) => {
      const hasAccess = allowed ?? isPro;
      if (hasAccess) return true;
      openUpgrade({ item: item.name, type: item.type });
      return false;
    },
    [isPro, openUpgrade],
  );
}
