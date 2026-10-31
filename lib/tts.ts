import { SUPABASE_URL } from '@/lib/env';
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

const EDGE_VOICES: Record<string, string> = {
  'pt-BR': 'pt-BR-FranciscaNeural',
  'pt-PT': 'pt-PT-RaquelNeural',
  'en-US': 'en-US-AvaMultilingualNeural',
  'en-GB': 'en-GB-SoniaNeural',
  'es-ES': 'es-ES-ElviraNeural',
  'fr-FR': 'fr-FR-DeniseNeural',
  'de-DE': 'de-DE-KatjaNeural',
  'it-IT': 'it-IT-ElsaNeural',
};

/**
 * Vozes neurais do Microsoft Edge — sem chave de API, qualidade de estúdio.
 * É o motor principal quando não há ElevenLabs/OpenAI configurados.
 */
async function edgeTts(text: string, lang: string, voice?: string) {
  const chosen = voice && /^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(voice) ? voice : EDGE_VOICES[lang] ?? EDGE_VOICES['pt-BR'];
  const { EdgeTTS } = await import('edge-tts-universal');
  const tts = new EdgeTTS(text, chosen, { rate: '+0%', volume: '+0%', pitch: '+0Hz' });
  const result = await withTimeout(tts.synthesize(), 6_000, 'voz neural');
  const buffer = Buffer.from(await result.audio.arrayBuffer());
  if (buffer.length < 500) throw new Error('Voz neural devolveu áudio vazio');
  return buffer;
}

export const TTS_VOICES: { id: string; label: string; lang: string }[] = [
  { id: 'pt-BR-FranciscaNeural', label: 'Francisca · feminina (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-AntonioNeural', label: 'Antônio · masculina (Brasil)', lang: 'pt-BR' },
  { id: 'pt-BR-ThalitaMultilingualNeural', label: 'Thalita · jovem (Brasil)', lang: 'pt-BR' },
  { id: 'en-US-AvaMultilingualNeural', label: 'Ava · feminina (inglês)', lang: 'en-US' },
  { id: 'en-US-AndrewMultilingualNeural', label: 'Andrew · masculina (inglês)', lang: 'en-US' },
  { id: 'es-ES-ElviraNeural', label: 'Elvira · feminina (espanhol)', lang: 'es-ES' },
  { id: 'fr-FR-DeniseNeural', label: 'Denise · feminina (francês)', lang: 'fr-FR' },
  { id: 'de-DE-KatjaNeural', label: 'Katja · feminina (alemão)', lang: 'de-DE' },
  { id: 'it-IT-ElsaNeural', label: 'Elsa · feminina (italiano)', lang: 'it-IT' },
];

async function googleTts(text: string, lang: string) {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
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

async function freeTts(text: string, lang: string, voice?: string) {
  const warnings: string[] = [];

  // 1) Google translate_tts: resposta em ~120 ms e sempre disponível em produção.
  try {
    return { audio: await withTimeout(googleTts(text, lang), 10_000, 'voz Google'), engine: 'google', warnings };
  } catch (err) {
    warnings.push(`voz Google indisponível (${err instanceof Error ? err.message : 'erro'})`);
  }

  // 2) Voz neural Microsoft — quando o ambiente permite WebSocket.
  if (Date.now() > edgeCooldownUntil) {
    try {
      return { audio: await edgeTts(text, lang, voice), engine: 'edge', warnings };
    } catch (err) {
      edgeCooldownUntil = Date.now() + 10 * 60_000;
      warnings.push(`voz neural indisponível (${err instanceof Error ? err.message : 'erro'})`);
    }
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
}): Promise<{ segments: TtsSegment[]; engine: string; warnings: string[] }> {
  const lang = opts.lang || 'pt-BR';
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
        const free = await freeTts(chunk, lang, opts.voice);
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
