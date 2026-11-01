import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Cota de armazenamento.
 *
 * O contador vive em `es_profiles.storage_used_bytes` e é mantido por trigger
 * no banco (migration 0007). Assim a checagem é uma leitura de uma linha —
 * não um `sum()` na tabela de arquivos — e escala com muitos usuários.
 *
 * O conteúdo do sistema (catálogo de assets, cenas, vozes e fontes)
 * NÃO fica no Supabase: está no código do app. Só o que o usuário envia ocupa
 * storage, e quando ele apaga o arquivo o contador volta sozinho.
 */
export type QuotaInfo = {
  usedBytes: number;
  limitBytes: number;
  freeBytes: number;
  percent: number;
  planGb: number;
};

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index <= 1 ? Math.round(size) : size.toFixed(1)} ${units[index]}`;
}

export async function getQuota(
  admin: SupabaseClient,
  userId: string,
  planGb: number,
): Promise<QuotaInfo> {
  const limitBytes = Math.max(1, planGb) * 1024 ** 3;
  let usedBytes = 0;

  const { data: profile } = await admin
    .from('es_profiles')
    .select('storage_used_bytes')
    .eq('id', userId)
    .maybeSingle();

  if (profile && typeof profile.storage_used_bytes === 'number') {
    usedBytes = profile.storage_used_bytes;
  } else {
    // fallback (banco sem a migration 0007): soma direta
    const { data } = await admin.from('es_user_assets').select('size_bytes').eq('user_id', userId);
    usedBytes = (data ?? []).reduce((acc, row) => acc + Number((row as { size_bytes: number }).size_bytes || 0), 0);
  }

  const freeBytes = Math.max(0, limitBytes - usedBytes);
  return {
    usedBytes,
    limitBytes,
    freeBytes,
    percent: Math.min(100, (usedBytes / limitBytes) * 100),
    planGb,
  };
}

/** true quando o arquivo cabe na cota restante. */
export function fits(quota: QuotaInfo, addBytes: number) {
  return addBytes <= quota.freeBytes;
}
