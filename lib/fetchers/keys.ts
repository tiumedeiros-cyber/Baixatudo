/**
 * Chaves dos bancos gratuitos.
 *
 * Precedência (mesma regra das chaves de IA, sem conflito de cota):
 *   1. a chave do próprio usuário (criptografada em es_user_integrations);
 *   2. a chave compartilhada da plataforma (Admin → Configurações → Integrações);
 *   3. variável de ambiente do deploy.
 *
 * Todas as APIs são gratuitas — a chave só identifica quem está chamando.
 */
import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { effectiveStock } from '@/lib/settings';

export type StockProvider = 'pexels' | 'unsplash' | 'pixabay' | 'freesound';

export const STOCK_SIGNUP: Record<StockProvider, string> = {
  pexels: 'https://www.pexels.com/api/',
  unsplash: 'https://unsplash.com/developers',
  pixabay: 'https://pixabay.com/api/docs/',
  freesound: 'https://freesound.org/apiv2/apply/',
};

const COLUMN: Record<StockProvider, string> = {
  pexels: 'pexels_key',
  unsplash: 'unsplash_key',
  pixabay: 'pixabay_key',
  freesound: 'freesound_key',
};

const ENV: Record<StockProvider, string> = {
  pexels: 'PEXELS_API_KEY',
  unsplash: 'UNSPLASH_ACCESS_KEY',
  pixabay: 'PIXABAY_API_KEY',
  freesound: 'FREESOUND_API_KEY',
};

export type StockKeyInfo = { key: string; source: 'user' | 'shared' | 'off' };

/** Chave efetiva para o usuário (ou `off` quando ninguém configurou). */
export async function resolveStockKey(userId: string | null, provider: StockProvider): Promise<StockKeyInfo> {
  if (userId) {
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from('es_user_integrations')
        .select(COLUMN[provider])
        .eq('user_id', userId)
        .maybeSingle();
      const raw = (data as Record<string, string | null> | null)?.[COLUMN[provider]];
      const key = raw ? decryptSecret(raw) : '';
      if (key) return { key, source: 'user' };
    } catch {
      /* tabela sem a coluna ainda → segue para a chave compartilhada */
    }
  }

  const shared = await effectiveStock();
  const sharedKey = shared[provider] ?? '';
  if (sharedKey) return { key: sharedKey, source: 'shared' };

  const env = process.env[ENV[provider]] ?? '';
  if (env) return { key: env, source: 'shared' };

  return { key: '', source: 'off' };
}

/** Salva/troca/remove a chave do usuário para um provedor. */
export async function saveStockKey(
  userId: string,
  provider: StockProvider,
  key: string,
): Promise<{ ok: true } | { error: string }> {
  const admin = createAdminClient();
  const column = COLUMN[provider];
  const value = key.trim();
  const { error } = await admin
    .from('es_user_integrations')
    .upsert(
      {
        user_id: userId,
        [column]: value ? encryptSecret(value) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    );
  return error ? { error: error.message } : { ok: true };
}

/** Estado das quatro chaves para a tela de integrações. */
export async function stockKeyStatus(userId: string) {
  const entries = await Promise.all(
    (Object.keys(COLUMN) as StockProvider[]).map(async (provider) => {
      const info = await resolveStockKey(userId, provider);
      return [provider, { configured: Boolean(info.key), source: info.source, signup: STOCK_SIGNUP[provider] }] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<
    StockProvider,
    { configured: boolean; source: 'user' | 'shared' | 'off'; signup: string }
  >;
}
