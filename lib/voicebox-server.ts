import { sanitizeVoiceboxBase } from './voicebox';

/**
 * Resolve a URL do servidor Voicebox configurada pelo admin (settings) ou por
 * variável de ambiente. Fica num arquivo separado porque `lib/settings` é
 * server-only — assim o componente do editor pode importar `lib/voicebox`
 * sem puxar `node:crypto` para o bundle do navegador.
 */
export async function resolveVoiceboxBase(): Promise<{ base: string; source: 'admin' | 'env' } | null> {
  try {
    const { getSettings } = await import('@/lib/settings');
    const settings = await getSettings();
    const fromAdmin = sanitizeVoiceboxBase((settings.integrations as unknown as Record<string, string>).voicebox_url);
    if (fromAdmin) return { base: fromAdmin, source: 'admin' };
  } catch {
    /* settings indisponível: segue para o env */
  }
  const fromEnv = sanitizeVoiceboxBase(process.env.VOICEBOX_URL);
  if (fromEnv) return { base: fromEnv, source: 'env' };
  return null;
}
