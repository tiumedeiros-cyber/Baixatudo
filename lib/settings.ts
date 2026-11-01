import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret } from '@/lib/crypto';

export type SupportMode = 'both' | 'email' | 'whatsapp' | 'none';
export type PaymentMode = 'manual' | 'stripe' | 'mercadopago' | 'demo';

export type GeneralSettings = {
  site_name: string;
  support_email: string;
  whatsapp: string;
  support_mode: SupportMode;
  whatsapp_message: string;
  max_upload_mb: number;
};

export type PaymentsSettings = {
  mode: PaymentMode;
  currency: string;
  manual_instructions: string;
  pix_key: string;
  pix_holder: string;
  receipt_whatsapp: string;
  stripe_public: string;
  stripe_secret: string;
  mp_public: string;
  mp_token: string;
  diligence_note: string;
};

export type LandingSettings = {
  headline: string;
  subheadline: string;
  cta_label: string;
  announcement: string;
  show_pricing: boolean;
  show_support: boolean;
};

export type IntegrationSettings = {
  /** chave da Kie AI (Kling) — criptografada */
  kie_key: string;
  /** chave da Postiz (publicação social) — criptografada */
  postiz_key: string;
  /** integration id do canal TikTok dentro da Postiz */
  postiz_tiktok: string;
};

export type PlatformSettings = {
  general: GeneralSettings;
  payments: PaymentsSettings;
  landing: LandingSettings;
  integrations: IntegrationSettings;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  general: {
    site_name: 'Editor Studio',
    support_email: 'suporte@editorstudio.app',
    whatsapp: '',
    support_mode: 'email',
    whatsapp_message: 'Olá! Preciso de ajuda com o Editor Studio.',
    max_upload_mb: 500,
  },
  payments: {
    mode: 'manual',
    currency: 'BRL',
    manual_instructions:
      'Faça um PIX para a chave abaixo e envie o comprovante no WhatsApp. Liberamos o acesso assim que o pagamento for conferido (normalmente em minutos).',
    pix_key: '',
    pix_holder: '',
    receipt_whatsapp: '',
    stripe_public: '',
    stripe_secret: '',
    mp_public: '',
    mp_token: '',
    diligence_note: '',
  },
  landing: {
    headline: 'Edição profissional de vídeo e imagem direto no navegador',
    subheadline:
      'Timeline com régua, corte por frame, objetos 3D, avatares falantes, biblioteca de assets, narração por IA e o Baixa Tudo integrado.',
    cta_label: 'Criar minha conta',
    announcement: '',
    show_pricing: true,
    show_support: true,
  },
  integrations: {
    kie_key: '',
    postiz_key: '',
    postiz_tiktok: '',
  },
};

function merge<T extends Record<string, unknown>>(defaults: T, value: unknown): T {
  if (!value || typeof value !== 'object') return defaults;
  return { ...defaults, ...(value as Partial<T>) };
}

async function readSettings(): Promise<PlatformSettings> {
  try {
    const admin = createAdminClient();
    const { data } = await admin.from('es_settings').select('key,value');
    const map = new Map((data ?? []).map((row) => [row.key as string, row.value]));
    return {
      general: merge(DEFAULT_SETTINGS.general, map.get('general')),
      payments: merge(DEFAULT_SETTINGS.payments, map.get('payments')),
      landing: merge(DEFAULT_SETTINGS.landing, map.get('landing')),
      integrations: merge(DEFAULT_SETTINGS.integrations, map.get('integrations')),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Configurações da plataforma (cacheadas: mudou no admin → aparece em segundos). */
export const getSettings = unstable_cache(readSettings, ['platform_settings'], { revalidate: 30, tags: ['settings'] });

/** Versão sem cache — usada nas telas de administração. */
export const getSettingsFresh = readSettings;

export function supportLink(settings: PlatformSettings) {
  const { support_mode: mode, whatsapp, support_email, whatsapp_message } = settings.general;
  const digits = whatsapp.replace(/\D/g, '');
  const wa = digits ? `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}?text=${encodeURIComponent(whatsapp_message)}` : '';
  const mail = support_email ? `mailto:${support_email}` : '';
  return {
    mode,
    whatsapp: wa,
    email: mail,
    showWhatsapp: (mode === 'both' || mode === 'whatsapp') && Boolean(wa),
    showEmail: (mode === 'both' || mode === 'email') && Boolean(mail),
  };
}

/** Link de comprovante: WhatsApp de pagamentos com mensagem pronta. */
export function receiptLink(settings: PlatformSettings, message: string) {
  const digits = (settings.payments.receipt_whatsapp || settings.general.whatsapp).replace(/\D/g, '');
  if (!digits) return '';
  const full = digits.startsWith('55') ? digits : `55${digits}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(message)}`;
}

/** Chaves das integrações de IA/publicação: painel primeiro, ambiente como reserva. */
export function effectiveIntegrations(settings: PlatformSettings) {
  return {
    kieKey: decryptSecret(settings.integrations.kie_key) || process.env.KIE_API_KEY || '',
    postizKey: decryptSecret(settings.integrations.postiz_key) || process.env.POSTIZ_API_KEY || '',
    postizTikTok:
      settings.integrations.postiz_tiktok || process.env.POSTIZ_TIKTOK_INTEGRATION_ID || '',
  };
}

/** Config de pagamento efetiva: painel primeiro, ambiente como reserva. */
export function effectivePayments(settings: PlatformSettings) {
  const stripeSecret = decryptSecret(settings.payments.stripe_secret) || process.env.STRIPE_SECRET_KEY || '';
  const mpToken = decryptSecret(settings.payments.mp_token) || process.env.MERCADOPAGO_ACCESS_TOKEN || '';
  const configured = settings.payments.mode;
  const mode: PaymentMode =
    configured === 'stripe' && stripeSecret
      ? 'stripe'
      : configured === 'mercadopago' && mpToken
        ? 'mercadopago'
        : configured === 'demo'
          ? 'demo'
          : 'manual';
  return {
    mode,
    stripeSecret,
    mpToken,
    stripePublic: settings.payments.stripe_public || process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || '',
    manual: settings.payments.mode === 'manual' || mode === 'manual',
  };
}
