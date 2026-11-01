/**
 * Serviço de assinatura (isolado, client-side).
 *
 * Nada de lógica de pagamento aqui: quem cria a cobrança é a server action
 * `createCheckout` (Stripe / Mercado Pago / PIX manual), que já existe em
 * `app/checkout/actions.ts`. Este arquivo só:
 *   1. lê o estado do plano (Free/Pro) em `/api/billing/status`;
 *   2. dispara o checkout do plano escolhido;
 *   3. traduz os limites do plano em "o que o usuário pode usar".
 *
 * Assim, trocar de gateway no futuro não encosta em nenhum componente.
 */

export type BillingCycle = 'monthly' | 'yearly';

export type PlanFeatureFlags = {
  premiumLibrary: boolean;
  export4k: boolean;
  maxQuality: number;
  projects: number;
  storageGb: number;
  unlimited: boolean;
};

export type PlanSummary = {
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  features: string[];
  flags: PlanFeatureFlags;
  /** plano recomendado na vitrine (o mais caro ativo não é sempre o certo) */
  featured: boolean;
};

export type SubscriptionState = {
  signedIn: boolean;
  /** plano ativo agora (Free quando não há assinatura válida) */
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired' | 'none';
  planSlug: string;
  planName: string;
  /** libera os itens com cadeado */
  isPro: boolean;
  cycle: BillingCycle | null;
  renewsAt: string | null;
  flags: PlanFeatureFlags;
  plans: PlanSummary[];
  /** gateway configurado pelo admin: muda o texto do modal */
  gateway: 'stripe' | 'mercadopago' | 'manual' | 'off';
};

export type CheckoutResult = {
  /** já ativado (modo demonstração / admin) */
  activated?: boolean;
  /** para onde o navegador deve ir (Stripe / Mercado Pago) */
  url?: string;
  error?: string;
};

const FREE_FLAGS: PlanFeatureFlags = {
  premiumLibrary: false,
  export4k: false,
  maxQuality: 1080,
  projects: 3,
  storageGb: 1,
  unlimited: false,
};

export const FREE_STATE: SubscriptionState = {
  signedIn: false,
  status: 'none',
  planSlug: 'free',
  planName: 'Free',
  isPro: false,
  cycle: null,
  renewsAt: null,
  flags: FREE_FLAGS,
  plans: [],
  gateway: 'manual',
};

/** Cache em memória: o editor não fica batendo no servidor a cada abertura de painel. */
let cached: { at: number; value: SubscriptionState } | null = null;
const CACHE_MS = 30_000;

export const subscriptionService = {
  /** Estado do plano. `fresh` ignora o cache (usado depois de pagar). */
  async status(fresh = false): Promise<SubscriptionState> {
    if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    try {
      const res = await fetch('/api/billing/status', { cache: 'no-store' });
      if (!res.ok) return cached?.value ?? FREE_STATE;
      const data = (await res.json()) as SubscriptionState;
      const value: SubscriptionState = { ...FREE_STATE, ...data };
      cached = { at: Date.now(), value };
      return value;
    } catch {
      return cached?.value ?? FREE_STATE;
    }
  },

  /**
   * Cria o checkout do plano. Devolve `url` (gateway) ou `activated: true`
   * (quando o admin roda em modo manual/demo) — nunca lança para a UI.
   */
  async checkout(input: { planSlug: string; cycle: BillingCycle; method?: 'card' | 'pix' }): Promise<CheckoutResult> {
    try {
      const { createCheckout } = await import('@/app/checkout/actions');
      const result = await createCheckout({
        planSlug: input.planSlug,
        cycle: input.cycle,
        method: input.method ?? 'card',
      });
      if (result?.error) return { error: result.error };
      if (result?.url) return { url: result.url };
      cached = null;
      return { activated: true };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Não foi possível abrir o checkout.' };
    }
  },

  /** Preço formatado para o modal (sem depender do util do servidor). */
  price(plan: PlanSummary | null, cycle: BillingCycle) {
    if (!plan) return '—';
    const value = cycle === 'yearly' ? plan.priceYearly : plan.priceMonthly;
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  /** Texto curto do gateway, para o rodapé do modal. */
  gatewayLabel(gateway: SubscriptionState['gateway']) {
    if (gateway === 'stripe') return 'Cartão de crédito · Stripe';
    if (gateway === 'mercadopago') return 'PIX ou cartão · Mercado Pago';
    if (gateway === 'manual') return 'PIX manual com liberação pelo suporte';
    return 'Pagamento ainda não configurado pelo administrador';
  },

  clearCache() {
    cached = null;
  },
};
