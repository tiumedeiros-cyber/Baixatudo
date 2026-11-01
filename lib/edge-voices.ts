import { SEC_MS_GEC_TOKEN } from './ms-gec';

/**
 * Lista real de vozes neurais do serviço (sem chave de API).
 *
 * Vem do próprio servidor da Microsoft: assim o catálogo mostra só vozes que
 * existem de verdade, em vez de nomes fixos que podem sair do ar.
 */

export type NeuralVoice = { id: string; label: string; lang: string; gender: 'Feminina' | 'Masculina' };

type RawVoice = {
  ShortName?: string;
  Gender?: string;
  Locale?: string;
  LocaleName?: string;
  FriendlyName?: string;
};

/** Locales com prioridade na interface (português primeiro). */
const PRIORITY = ['pt-BR', 'pt-PT', 'en-US', 'en-GB', 'es-ES', 'es-MX', 'es-AR', 'fr-FR', 'de-DE', 'it-IT'];

const WANTED = new Set(PRIORITY);

let cache: { at: number; voices: NeuralVoice[] } | null = null;

export async function edgeVoiceList(): Promise<NeuralVoice[]> {
  if (cache && Date.now() - cache.at < 12 * 60 * 60_000) return cache.voices;

  const res = await fetch(
    `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${SEC_MS_GEC_TOKEN}`,
    {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/143.0 Safari/537.36 Edg/143.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(9_000),
    },
  );
  if (!res.ok) throw new Error(`lista de vozes indisponível (${res.status})`);

  const raw = (await res.json()) as RawVoice[];
  const voices: NeuralVoice[] = [];
  for (const item of raw) {
    const id = item.ShortName;
    if (!id || !/^[a-z]{2,3}-[A-Z]{2}-\w+Neural$/.test(id)) continue;
    const locale = item.Locale ?? id.slice(0, 5);
    const gender = item.Gender === 'Male' ? 'Masculina' : 'Feminina';
    // "Microsoft Francisca Online (Natural) - Portuguese (Brazil)" → "Francisca"
    const short =
      item.FriendlyName?.match(/Microsoft\s+(.+?)\s+Online/i)?.[1] ?? id.split('-').slice(2).join('-').replace(/Neural$/, '');
    voices.push({
      id,
      label: `${short} · ${gender.toLowerCase()} (${item.LocaleName ?? locale})`,
      lang: locale,
      gender,
    });
  }

  voices.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.lang);
    const pb = PRIORITY.indexOf(b.lang);
    if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
    return a.label.localeCompare(b.label);
  });

  const preferred = voices.filter((voice) => WANTED.has(voice.lang));
  const result = preferred.length ? preferred : voices;
  cache = { at: Date.now(), voices: result };
  return result;
}
