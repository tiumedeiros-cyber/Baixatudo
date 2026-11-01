import { SUPABASE_URL } from '@/lib/env';
import { EDGE_FALLBACK, edgeSynthesize } from '@/lib/edge-tts';
import { VOICES, voiceById } from '@/lib/catalog/voices';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_CHUNK = 190;

/** Nenhuma fonte de voz pode travar a requisição indefinidamente. */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'voz'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: tempo esgotado`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function chunkText(text: string, max = MAX_CHUNK) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?;:])\s+/);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (sentence.length > max) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += max) chunks.push(sentence.slice(i, i + max));
      continue;
    }
    if ((current + ' ' + sentence).trim().length > max) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}


/* ----------------------------- Microsoft Edge (neural) ----------------------------- */

/**
 * Vozes neurais que dão timbre próprio a cada idioma do catálogo (84 idiomas).
 * Sem isso, todo idioma cairia na mesma voz padrão.
 */
const EDGE_BY_LANG: Record<string, string> = {
  ...EDGE_FALLBACK,
  'pt-BR': 'pt-BR-FranciscaNeural',
  'en-AU': 'en-AU-NatashaNeural',
  'en-CA': 'en-CA-ClaraNeural',
  'en-IN': 'en-IN-NeerjaNeural',
  'es-MX': 'es-MX-DaliaNeural',
  'es-AR': 'es-AR-ElenaNeural',
  'es-CO': 'es-CO-SalomeNeural',
  'fr-CA': 'fr-CA-SylvieNeural',
  'de-AT': 'de-AT-IngridNeural',
  'de-CH': 'de-CH-JanNeural',
  'it-IT': 'it-IT-ElsaNeural',
  'nl-NL': 'nl-NL-ColetteNeural',
  'pl-PL': 'pl-PL-AgnieszkaNeural',
  'ru-RU': 'ru-RU-SvetlanaNeural',
  'tr-TR': 'tr-TR-EmelNeural',
  'ja-JP': 'ja-JP-NanamiNeural',
  'ko-KR': 'ko-KR-SunHiNeural',
  'zh-CN': 'zh-CN-XiaoxiaoNeural',
  'zh-TW': 'zh-TW-HsiaoChenNeural',
  'hi-IN': 'hi-IN-SwaraNeural',
  'ar-SA': 'ar-SA-ZariyahNeural',
  'id-ID': 'id-ID-GadisNeural',
  'vi-VN': 'vi-VN-HoaiMyNeural',
  'th-TH': 'th-TH-PremwadeeNeural',
  'sv-SE': 'sv-SE-SofieNeural',
  'da-DK': 'da-DK-ChristelNeural',
  'fi-FI': 'fi-FI-NooraNeural',
  'nb-NO': 'nb-NO-PernilleNeural',
  'cs-CZ': 'cs-CZ-VlastaNeural',
  'sk-SK': 'sk-SK-ViktoriaNeural',
  'hu-HU': 'hu-HU-NoemiNeural',
  'ro-RO': 'ro-RO-AlinaNeural',
  'el-GR': 'el-GR-AthinaNeural',
  'he-IL': 'he-IL-HilaNeural',
  'uk-UA': 'uk-UA-PolinaNeural',
  'bg-BG': 'bg-BG-KalinaNeural',
  'hr-HR': 'hr-HR-GabrijelaNeural',
  'sr-RS': 'sr-RS-SophieNeural',
  'ca-ES': 'ca-ES-JoanaNeural',
  'lt-LT': 'lt-LT-OnaNeural',
  'lv-LV': 'lv-LV-EveritaNeural',
  'et-EE': 'et-EE-AnuNeural',
  'sl-SI': 'sl-SI-PetraNeural',
};

/**
 * Vozes neurais do Microsoft Edge — sem chave de API, qualidade de estúdio.
 * Motor principal quando não há ElevenLabs/OpenAI configurados.
 */
async function edgeTts(text: string, lang: string, voice?: string) {
  const chosen = voice && /^[a-z]{2,3}-[A-Z]{2}-\w+Neural$/.test(voice) ? voice : EDGE_BY_LANG[lang] ?? EDGE_BY_LANG['pt-BR'];
  const buffer = await edgeSynthesize({ text, voice: chosen, timeoutMs: 12_000 });
  if (buffer.length < 500) throw new Error('Voz neural devolveu áudio vazio');
  return buffer;
}

/** Catálogo público de vozes (usado pela API e pela interface). */
export const CATALOG = VOICES;

export const TTS_VOICES: { id: string; label: string; lang: string }[] = [
  // Português (Brasil) — timbres realmente diferentes
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca · feminina adulta (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-ThalitaMultilingualNeural', label: 'Thalita · jovem (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-BrendaNeural', label: 'Brenda · feminina suave (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-ElzaNeural', label: 'Elza · feminina madura (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-GiovannaNeural', label: 'Giovanna · feminina expressiva (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-ManuelaNeural', label: 'Manuela · feminina calorosa (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-AntonioNeural', label: 'Antônio · masculina adulta (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-DonatoNeural', label: 'Donato · masculina grave (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-FabioNeural', label: 'Fábio · masculina jovem (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-HumbertoNeural', label: 'Humberto · masculina madura (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-JulioNeural', label: 'Júlio · masculina firme (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-NicolauNeural', label: 'Nicolau · masculina séria (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-ValerioNeural', label: 'Valério · masculina profunda (Brasil)', lang: 'pt-BR' },
  // Português (Portugal)
  { id: 'pt-PT-RaquelNeural', label: 'Raquel · feminina (Portugal)', lang: 'pt-PT' },
  { id: 'pt-PT-DuarteNeural', label: 'Duarte · masculina (Portugal)', lang: 'pt-PT' },
  // Inglês
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava · feminina (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-EmmaMultilingualNeural', label: 'Emma · feminina jovem (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-AriaNeural', label: 'Aria · feminina expressiva (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-JennyNeural', label: 'Jenny · feminina neutra (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew · masculina (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-BrianMultilingualNeural', label: 'Brian · masculina profunda (inglês EUA)', lang: 'en-US' },
  { id: 'en-US-GuyNeural', label: 'Guy · masculina animada (inglês EUA)', lang: 'en-US' },
  { id: 'en-GB-SoniaNeural', label: 'Sonia · feminina (inglês UK)', lang: 'en-GB' },
  { id: 'en-GB-RyanNeural', label: 'Ryan · masculina (inglês UK)', lang: 'en-GB' },
  // Outros idiomas
  { id: 'es-ES-ElviraNeural', label: 'Elvira · feminina (espanhol)', lang: 'es-ES' },
  { id: 'es-MX-DaliaNeural', label: 'Dalia · feminina (espanhol MX)', lang: 'es-MX' },
  { id: 'fr-FR-DeniseNeural', label: 'Denise · feminina (francês)', lang: 'fr-FR' },
  { id: 'de-DE-KatjaNeural', label: 'Katja · feminina (alemão)', lang: 'de-DE' },
  { id: 'it-IT-ElsaNeural', label: 'Elsa · feminina (italiano)', lang: 'it-IT' },
  { id: 'ja-JP-NanamiNeural', label: 'Nanami · feminina (japonês)', lang: 'ja-JP' },
  { id: 'ko-KR-SunHiNeural', label: 'SunHi · feminina (coreano)', lang: 'ko-KR' },
];

async function googleTts(text: string, lang: string, speed?: string) {
  const rate = speed === '0.24' || speed === 'lenta' ? '0.24' : '1';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&ttsspeed=${rate}&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Referer: 'https://translate.google.com/',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`TTS indisponível (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 500) throw new Error('TTS devolveu áudio vazio');
  return buffer;
}

const SE_VOICES: Record<string, string> = {
  'pt-BR': 'pt-BR-Wavenet-A',
  'pt-PT': 'pt-PT-Wavenet-A',
  'en-US': 'en-US-Wavenet-D',
  'en-GB': 'en-GB-Wavenet-A',
  'es-ES': 'es-ES-Wavenet-B',
  'fr-FR': 'fr-FR-Wavenet-A',
  'de-DE': 'de-DE-Wavenet-A',
  'it-IT': 'it-IT-Wavenet-A',
};

/** Fonte alternativa sem chave (StreamElements/Google WaveNet) para quando o translate_tts nega. */
async function streamElementsTts(text: string, lang: string) {
  const voice = SE_VOICES[lang] ?? 'pt-BR-Wavenet-A';
  const res = await fetch(`https://api.streamelements.com/kappa/v2/speech?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Voz alternativa indisponível (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 500) throw new Error('Voz alternativa devolveu áudio vazio');
  return buffer;
}

// Se a voz neural falhar neste ambiente, não insistimos em cada frase.
let edgeCooldownUntil = 0;
let edgeFailures = 0;

/** Memória curta: a mesma frase com a mesma voz não é sintetizada duas vezes. */
const audioCache = new Map<string, { audio: Buffer; engine: string }>();
function cacheKey(text: string, voice: string) {
  return `${voice}|${text.length}|${text.slice(0, 24)}|${text.slice(-24)}`;
}

async function freeTts(text: string, lang: string, voice?: string, speed?: string) {
  const warnings: string[] = [];
  const key = cacheKey(text, voice ?? lang);
  const cached = audioCache.get(key);
  if (cached) return { audio: cached.audio, engine: cached.engine, warnings };

  // 1) Voz neural do Edge — é o único motor que dá um timbre diferente por voz.
  if (Date.now() > edgeCooldownUntil) {
    try {
      const audio = await edgeTts(text, lang, voice);
      if (audioCache.size > 60) audioCache.clear();
      audioCache.set(key, { audio, engine: 'edge' });
      edgeFailures = 0;
      return { audio, engine: 'edge', warnings };
    } catch (err) {
      edgeFailures += 1;
      // 1 falha isolada = pausa curta; 3 falhas seguidas = pausa longa
      edgeCooldownUntil = Date.now() + (edgeFailures >= 3 ? 10 * 60_000 : 20_000);
      warnings.push(`voz neural indisponível (${err instanceof Error ? err.message : 'erro'})`);
    }
  }

  // 2) Google translate_tts — rápido e estável (um timbre por idioma).
  try {
    const audio = await withTimeout(googleTts(text, lang, speed), 10_000, 'voz Google');
    if (audioCache.size > 60) audioCache.clear();
    audioCache.set(key, { audio, engine: 'google' });
    return { audio, engine: 'google', warnings };
  } catch (err) {
    warnings.push(`voz Google indisponível (${err instanceof Error ? err.message : 'erro'})`);
  }

  // 3) Última alternativa pública.
  return { audio: await withTimeout(streamElementsTts(text, lang), 10_000, 'voz alternativa'), engine: 'streamelements', warnings };
}

async function elevenLabsTts(text: string, voiceId: string, apiKey: string) {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function openAiTts(text: string, voice: string, apiKey: string) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice, input: text, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`OpenAI TTS ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}


/* ----------------------------- Duração real do MP3 ----------------------------- */

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

/**
 * Lê os frames MPEG do áudio para saber a duração exata.
 * Evita “esticar” a narração na timeline com estimativa por caracteres.
 */
export function mp3Duration(buffer: Buffer): number {
  let offset = 0;
  if (buffer.length > 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    const size = ((buffer[6] & 0x7f) << 21) | ((buffer[7] & 0x7f) << 14) | ((buffer[8] & 0x7f) << 7) | (buffer[9] & 0x7f);
    offset = 10 + size;
  }
  let duration = 0;
  let frames = 0;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const versionBits = (buffer[offset + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
    const layerBits = (buffer[offset + 1] >> 1) & 0x03; // 1 = Layer III
    if (layerBits !== 1) {
      offset += 1;
      continue;
    }
    const bitrateIndex = (buffer[offset + 2] >> 4) & 0x0f;
    const rateIndex = (buffer[offset + 2] >> 2) & 0x03;
    const padding = (buffer[offset + 2] >> 1) & 0x01;
    const table = versionBits === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3;
    const bitrate = table[bitrateIndex] * 1000;
    const sampleRate = SAMPLE_RATES[versionBits]?.[rateIndex];
    if (!bitrate || !sampleRate) {
      offset += 1;
      continue;
    }
    const samplesPerFrame = versionBits === 3 ? 1152 : 576;
    duration += samplesPerFrame / sampleRate;
    frames += 1;
    const frameLength = Math.floor(((samplesPerFrame / 8) * bitrate) / sampleRate) + padding;
    offset += Math.max(1, frameLength);
  }
  return frames > 0 ? Number(duration.toFixed(3)) : 0;
}

export type TtsSegment = { url: string; text: string; duration: number };

export async function synthesizeToStorage(opts: {
  userId: string;
  projectId?: string | null;
  text: string;
  lang?: string;
  voice?: string;
  speed?: string;
}): Promise<{ segments: TtsSegment[]; engine: string; warnings: string[] }> {
  // voz do catálogo (g:pt-BR etc.) define idioma e ritmo
  const catalogVoice = opts.voice && (opts.voice.startsWith('g:') || VOICES.some((v) => v.id === opts.voice || v.lang === opts.voice))
    ? voiceById(opts.voice)
    : null;
  const lang = catalogVoice?.lang || opts.lang || 'pt-BR';
  const speed = catalogVoice ? undefined : opts.speed;
  const openAiVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'coral', 'sage'];
  const voice = opts.voice || 'nova';
  const chunks = chunkText(opts.text);
  if (chunks.length === 0) throw new Error('Texto vazio');

  const admin = createAdminClient();
  const engine = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.OPENAI_API_KEY ? 'openai' : 'edge';
  let usedEngine = engine;
  const segments: TtsSegment[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let audio: Buffer | null = null;
    try {
      if (process.env.ELEVENLABS_API_KEY) {
        audio = await elevenLabsTts(chunk, voice, process.env.ELEVENLABS_API_KEY);
      } else if (process.env.OPENAI_API_KEY) {
        audio = await openAiTts(chunk, openAiVoices.includes(voice) ? voice : 'nova', process.env.OPENAI_API_KEY);
      } else {
        const free = await freeTts(chunk, lang, catalogVoice?.id ?? opts.voice, speed);
        audio = free.audio;
        usedEngine = free.engine;
        if (free.warnings.length) warnings.push(...free.warnings);
      }
    } catch (err) {
      if (i === 0) throw err;
      warnings.push(`Segmento ${i + 1} falhou: ${err instanceof Error ? err.message : 'erro'}`);
      continue;
    }

    // duração exata a partir dos frames do MP3 (fallback: ~13 caracteres/segundo)
    const exact = mp3Duration(audio);
    const path = `${opts.userId}/tts/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp3`;
    const { error } = await admin.storage.from('media').upload(path, audio, { contentType: 'audio/mpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from('media').getPublicUrl(path);
    const duration = exact > 0 ? exact : Math.max(1.2, chunk.length / 13);
    segments.push({ url: data.publicUrl, text: chunk, duration: Number(duration.toFixed(2)) });
  }

  if (segments.length) {
    await admin.from('es_conversions').insert({
      user_id: opts.userId,
      project_id: opts.projectId ?? null,
      type: 'tts',
      input_text: opts.text.slice(0, 5000),
      output_url: segments[0].url,
      voice,
      language: lang,
      engine: usedEngine,
      status: 'done',
      metadata: { segments: segments.length, urls: segments.map((s) => s.url) },
    });
  }

  return { segments, engine: usedEngine, warnings };
}

export function publicUrlFor(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}
