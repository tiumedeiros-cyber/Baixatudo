import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformSettings } from '@/lib/settings';
import { formatBytes } from '@/lib/quota';

/**
 * Teto físico do provedor de storage.
 *
 * O plano vendido ao cliente (10 GB, 150 GB…) é lógico; o Supabase tem um
 * limite contratado. Se o total de todos os usuários passar disso, os uploads
 * começam a falhar com erro genérico do provedor. Aqui checamos antes.
 */
export async function storageTotals(admin: SupabaseClient) {
  const { data } = await admin.from('es_profiles').select('storage_used_bytes').limit(20000);
  const usedBytes = (data ?? []).reduce((acc, row) => acc + Number((row as { storage_used_bytes: number }).storage_used_bytes || 0), 0);
  return { usedBytes };
}

export async function providerRoom(admin: SupabaseClient, settings: PlatformSettings, addBytes: number) {
  const external = settings.storage?.mode === 's3';
  const capacityBytes = Math.max(1, Number(settings.general.storage_capacity_gb) || 1) * 1024 ** 3;
  // com storage externo o teto do Supabase deixa de ser o gargalo
  if (external) {
    const { usedBytes } = await storageTotals(admin);
    const freeBytes = Math.max(0, capacityBytes - usedBytes);
    return { ok: true, freeBytes, capacityBytes, usedBytes, message: '' };
  }
  const { usedBytes } = await storageTotals(admin);
  const freeBytes = Math.max(0, capacityBytes - usedBytes);
  return {
    ok: addBytes <= freeBytes,
    freeBytes,
    capacityBytes,
    usedBytes,
    message: `O servidor de arquivos está com ${formatBytes(usedBytes)} de ${formatBytes(capacityBytes)} usados. Peça ao administrador para ampliar o armazenamento.`,
  };
}

/**
 * Limite efetivo por arquivo.
 * Com storage externo ligado o teto do Supabase não vale mais — sobra o limite
 * do sistema. Sem ele, vale o menor entre sistema e provedor.
 */
export function effectiveFileLimitBytes(settings: PlatformSettings) {
  const app = Number(settings.general.max_upload_mb) || 500;
  const external = settings.storage?.mode === 's3' && Boolean(settings.storage?.endpoint && settings.storage?.bucket);
  if (external) return Math.max(app, 1) * 1024 * 1024;
  const provider = Number(settings.general.provider_file_limit_mb) || 50;
  return Math.min(app, provider) * 1024 * 1024;
}
