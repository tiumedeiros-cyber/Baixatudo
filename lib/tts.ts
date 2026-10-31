import { SUPABASE_URL } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';

const MAX_CHUNK = 190;

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

export type TtsSegment = { url: string; text: string; duration: number };

export async function synthesizeToStorage(opts: {
  userId: string;
  projectId?: string | null;
  text: string;
  lang?: string;
  voice?: string;
}): Promise<{ segments: TtsSegment[]; engine: string; warnings: string[] }> {
  const lang = opts.lang || 'pt-BR';
  const voice = opts.voice || 'pt-BR';
  const chunks = chunkText(opts.text);
  if (chunks.length === 0) throw new Error('Texto vazio');

  const admin = createAdminClient();
  const engine = process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.OPENAI_API_KEY ? 'openai' : 'google';
  const segments: TtsSegment[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    let audio: Buffer | null = null;
    try {
      if (process.env.ELEVENLABS_API_KEY) {
        audio = await elevenLabsTts(chunk, voice, process.env.ELEVENLABS_API_KEY);
      } else if (process.env.OPENAI_API_KEY) {
        audio = await openAiTts(chunk, 'nova', process.env.OPENAI_API_KEY);
      } else {
        audio = await googleTts(chunk, lang);
      }
    } catch (err) {
      if (i === 0) throw err;
      warnings.push(`Segmento ${i + 1} falhou: ${err instanceof Error ? err.message : 'erro'}`);
      continue;
    }

    const path = `${opts.userId}/tts/${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}.mp3`;
    const { error } = await admin.storage.from('media').upload(path, audio, { contentType: 'audio/mpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from('media').getPublicUrl(path);
    // ~13 caracteres por segundo em português falado
    const duration = Math.max(1.2, chunk.length / 13);
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
      engine,
      status: 'done',
      metadata: { segments: segments.length, urls: segments.map((s) => s.url) },
    });
  }

  return { segments, engine, warnings };
}

export function publicUrlFor(path: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}
