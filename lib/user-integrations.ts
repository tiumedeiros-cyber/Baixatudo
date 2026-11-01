import { createAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { effectiveIntegrations, getSettingsFresh, type PlatformSettings } from '@/lib/settings';

/**
 * Chaves de IA por usuário.
 *
 * Regra de precedência (sem conflito de créditos):
 *   1. a chave do próprio cliente, se o admin permitir e ele tiver cadastrado;
 *   2. a chave da plataforma, se o admin permitir que ela seja compartilhada;
 *   3. desligado — a tela explica como liberar.
 * As chaves ficam criptografadas no banco e nunca voltam para o navegador.
 */
export type KeySource = 'user' | 'shared' | 'off';

export type ResolvedAi = {
  kieKey: string;
  postizKey: string;
  postizTiktok: string;
  kieSource: KeySource;
  postizSource: KeySource;
};

export type UserIntegrationRow = {
  kie_key: string | null;
  postiz_key: string | null;
  postiz_tiktok: string | null;
};

export async function getUserIntegrationRow(userId: string): Promise<UserIntegrationRow> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('es_user_integrations')
    .select('kie_key,postiz_key,postiz_tiktok')
    .eq('user_id', userId)
    .maybeSingle();
  return {
    kie_key: (data as UserIntegrationRow | null)?.kie_key ?? null,
    postiz_key: (data as UserIntegrationRow | null)?.postiz_key ?? null,
    postiz_tiktok: (data as UserIntegrationRow | null)?.postiz_tiktok ?? null,
  };
}

export function resolveAi(
  settings: PlatformSettings,
  row: UserIntegrationRow | null,
): ResolvedAi {
  const shared = effectiveIntegrations(settings);
  const cfg = settings.integrations;
  const userKie = decryptSecret(row?.kie_key);
  const userPostiz = decryptSecret(row?.postiz_key);

  const useUserKie = Boolean(cfg.allow_user_kie && userKie);
  const useSharedKie = Boolean(cfg.admin_kie_enabled && shared.kieKey);
  const useUserPostiz = Boolean(cfg.allow_user_postiz && userPostiz);
  const useSharedPostiz = Boolean(cfg.admin_postiz_enabled && shared.postizKey);

  return {
    kieKey: useUserKie ? userKie : useSharedKie ? shared.kieKey : '',
    postizKey: useUserPostiz ? userPostiz : useSharedPostiz ? shared.postizKey : '',
    postizTiktok:
      (cfg.allow_user_postiz ? row?.postiz_tiktok ?? '' : '') ||
      (cfg.admin_postiz_enabled ? shared.postizTikTok : ''),
    kieSource: useUserKie ? 'user' : useSharedKie ? 'shared' : 'off',
    postizSource: useUserPostiz ? 'user' : useSharedPostiz ? 'shared' : 'off',
  };
}

/** Resolve as chaves que o usuário logado pode usar agora. */
export async function resolveAiForUser(userId: string, settings?: PlatformSettings) {
  const cfg = settings ?? (await getSettingsFresh());
  const row = await getUserIntegrationRow(userId);
  return resolveAi(cfg, row);
}

/** Metadados seguros para a tela: nunca devolve a chave, só o suficiente para exibir. */
export async function userIntegrationState(userId: string) {
  const settings = await getSettingsFresh();
  const row = await getUserIntegrationRow(userId);
  const resolved = resolveAi(settings, row);
  return {
    settings,
    resolved,
    hasOwnKie: Boolean(decryptSecret(row.kie_key)),
    hasOwnPostiz: Boolean(decryptSecret(row.postiz_key)),
    postizTiktok: row.postiz_tiktok ?? '',
    canOwnKie: settings.integrations.allow_user_kie,
    canOwnPostiz: settings.integrations.allow_user_postiz,
    sharedKie: Boolean(effectiveIntegrations(settings).kieKey) && settings.integrations.admin_kie_enabled,
    sharedPostiz: Boolean(effectiveIntegrations(settings).postizKey) && settings.integrations.admin_postiz_enabled,
    sharedTiktok: settings.integrations.postiz_tiktok,
  };
}

/** Salva/troca/remove as chaves do usuário. */
export async function saveUserIntegrations(
  userId: string,
  input: { kie?: string; postiz?: string; tiktok?: string; clearKie?: boolean; clearPostiz?: boolean },
) {
  const admin = createAdminClient();
  const current = await getUserIntegrationRow(userId);
  const value = {
    user_id: userId,
    kie_key: input.clearKie ? null : input.kie ? encryptSecret(input.kie) : current.kie_key,
    postiz_key: input.clearPostiz ? null : input.postiz ? encryptSecret(input.postiz) : current.postiz_key,
    postiz_tiktok: input.clearPostiz ? null : (input.tiktok ?? current.postiz_tiktok ?? '') || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from('es_user_integrations').upsert(value, { onConflict: 'user_id' });
  return error ? { error: error.message } : { ok: true as const };
}
