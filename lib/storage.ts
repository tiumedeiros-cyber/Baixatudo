import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlatformSettings } from '@/lib/settings';
import { effectiveStorage } from '@/lib/settings';
import { s3Delete, s3Put, s3PublicUrl, s3Ready, type S3Config } from '@/lib/s3';

/**
 * Storage unificado: Supabase (padrão) ou S3-compatível (R2/B2/MinIO).
 *
 * O admin escolhe em Configurações → Armazenamento externo. Quando ligado,
 * todo upload novo (biblioteca, importação, Baixa Tudo, IA, recursos grátis)
 * vai para o bucket externo e a URL pública entra no banco como sempre.
 */

export type StoredFile = { url: string; path: string; external: boolean };

export function storageS3Config(settings: PlatformSettings): S3Config | null {
  const cfg = effectiveStorage(settings);
  const config: S3Config = {
    endpoint: cfg.endpoint,
    region: cfg.region,
    bucket: cfg.bucket,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    publicBase: cfg.publicBase,
  };
  return cfg.enabled && s3Ready(config) ? config : null;
}

export async function storeFile(
  admin: SupabaseClient,
  settings: PlatformSettings,
  path: string,
  body: Buffer,
  contentType: string,
): Promise<StoredFile | { error: string }> {
  const s3 = storageS3Config(settings);
  if (s3) {
    const put = await s3Put(s3, path, body, contentType);
    if ('error' in put && put.error) return { error: put.error };
    return { url: s3PublicUrl(s3, path), path, external: true };
  }

  const { error } = await admin.storage.from('media').upload(path, body, { contentType, upsert: false });
  if (error) return { error: error.message };
  const { data } = admin.storage.from('media').getPublicUrl(path);
  return { url: data.publicUrl, path, external: false };
}

/** Remove nos dois backends — assim arquivos antigos (Supabase) e novos (S3) somem. */
export async function removeFile(admin: SupabaseClient, settings: PlatformSettings, path: string) {
  const s3 = storageS3Config(settings);
  if (s3) await s3Delete(s3, path);
  await admin.storage.from('media').remove([path]);
  return true;
}

/** URL pública de um arquivo já salvo (não muda o que está no banco). */
export function filePublicUrl(settings: PlatformSettings, path: string) {
  const s3 = storageS3Config(settings);
  if (s3) return s3PublicUrl(s3, path);
  return '';
}
