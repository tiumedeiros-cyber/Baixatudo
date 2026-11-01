/**
 * Voicebox (voicebox.sh) — cliente modular, sem chave e sem custo.
 *
 * O Voicebox é um app desktop open-source (MIT) que roda 100% na máquina do
 * usuário e sobe uma API REST local em `http://127.0.0.1:17493`. Não existe
 * nuvem paga nem limite de uso: é a máquina de quem usa que faz o trabalho.
 *
 * Dois modos de uso, tratados por este módulo + `app/api/voice/voicebox`:
 *   • LOCAL   — o navegador fala direto com 127.0.0.1:17493 (precisa do app
 *               aberto e da origem liberada em VOICEBOX_CORS_ORIGINS).
 *   • REMOTO  — um servidor Voicebox próprio (ex.: `--host 0.0.0.0` num PC ou
 *               VPS) configurado pelo admin; nosso servidor faz o proxy, então
 *               não há CORS e o cliente final não instala nada.
 *
 * Nada aqui é obrigatório: se o Voicebox não estiver disponível, o editor
 * continua usando as vozes que já existem (edge-tts / voz do navegador).
 */

export type VoiceboxEngine = { id: string; label: string; note: string };

/** Engines reais expostas por `POST /v1/audio/speech` (campo `model`). */
export const VOICEBOX_ENGINES: VoiceboxEngine[] = [
  { id: 'qwen', label: 'Qwen3-TTS (clonagem)', note: 'Melhor qualidade e aceita instruções de estilo.' },
  { id: 'chatterbox', label: 'Chatterbox (23 idiomas)', note: 'Clonagem zero-shot do Resemble AI.' },
  { id: 'chatterbox_turbo', label: 'Chatterbox Turbo', note: 'Rápido, aceita [laugh]/[sigh] no texto.' },
  { id: 'luxtts', label: 'LuxTTS (rápido no CPU)', note: '48 kHz, ótimo para rascunhos.' },
  { id: 'kokoro', label: 'Kokoro 82M', note: 'Vozes prontas, leve, roda no CPU.' },
  { id: 'qwen_custom_voice', label: 'Qwen CustomVoice', note: '9 locutores prontos com estilo.' },
  { id: 'tada', label: 'TADA (Hume)', note: 'Áudio longo sem perder coerência.' },
];

export type VoiceboxProfile = {
  id: string;
  name: string;
  language?: string;
  voice_type?: string;
  default_engine?: string | null;
  sample_count?: number;
};

export type VoiceboxHealth = {
  status?: string;
  model_loaded?: boolean;
  gpu_available?: boolean;
  gpu_type?: string | null;
  backend_type?: string | null;
};

export const LOCAL_VOICEBOX = 'http://127.0.0.1:17493';

/**
 * Aceita apenas http(s) absoluto; devolve sem barra final.
 * Usado para evitar que um valor salvo vire um proxy arbitrário.
 */
export function sanitizeVoiceboxBase(input: unknown): string | null {
  const raw = String(input ?? '').trim().replace(/\/+$/, '');
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

async function call(base: string, path: string, init?: RequestInit & { timeoutMs?: number }) {
  const { timeoutMs = 6000, ...rest } = init ?? {};
  return fetch(`${base}${path}`, {
    ...rest,
    cache: 'no-store',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

export async function voiceboxHealth(
  base: string,
): Promise<{ ok: true; health: VoiceboxHealth } | { ok: false; error: string }> {
  try {
    const res = await call(base, '/health', { timeoutMs: 5000 });
    if (!res.ok) return { ok: false, error: `O servidor respondeu ${res.status}.` };
    const health = (await res.json()) as VoiceboxHealth;
    return { ok: true, health };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sem resposta.' };
  }
}

export async function voiceboxProfiles(
  base: string,
): Promise<{ ok: true; profiles: VoiceboxProfile[] } | { ok: false; error: string }> {
  try {
    const res = await call(base, '/profiles', { timeoutMs: 8000 });
    if (!res.ok) return { ok: false, error: `O servidor respondeu ${res.status}.` };
    const data = (await res.json()) as VoiceboxProfile[];
    return { ok: true, profiles: Array.isArray(data) ? data : [] };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Sem resposta.' };
  }
}

export type SpeechRequest = {
  text: string;
  /** nome ou id do perfil de voz no Voicebox */
  voice?: string;
  engine?: string;
  instructions?: string;
  format?: 'mp3' | 'wav';
};

export type SpeechResult =
  | { ok: true; buffer: Buffer; mime: string; format: string }
  | { ok: false; error: string };

/**
 * Gera a fala via API compatível com OpenAI (`POST /v1/audio/speech`), que
 * devolve os BYTES do áudio — diferente de `/generate`, que devolve só um
 * caminho local. Assim conseguimos guardar o arquivo no storage do usuário.
 */
export async function voiceboxSpeech(base: string, request: SpeechRequest): Promise<SpeechResult> {
  const text = request.text.trim();
  if (!text) return { ok: false, error: 'Texto vazio.' };
  if (text.length > 10_000) return { ok: false, error: 'O Voicebox aceita até 10.000 caracteres por geração.' };

  const formats: ('mp3' | 'wav')[] = request.format ? [request.format] : ['mp3', 'wav'];
  let lastError = '';

  for (const format of formats) {
    try {
      const res = await call(base, '/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeoutMs: 240_000,
        body: JSON.stringify({
          model: request.engine || 'qwen',
          input: text,
          voice: request.voice || undefined,
          response_format: format,
          instructions: request.instructions?.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        let message = detail;
        try {
          const parsed = JSON.parse(detail) as { error?: { message?: string }; detail?: string };
          message = parsed.error?.message ?? parsed.detail ?? detail;
        } catch {
          /* corpo não-JSON */
        }
        lastError = `Voicebox: ${message || res.status}`;
        // 400 por formato não suportado → tenta o próximo; outros erros param
        if (format === 'mp3' && /format|support/i.test(lastError)) continue;
        return { ok: false, error: lastError };
      }

      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length) {
        lastError = 'O Voicebox devolveu áudio vazio.';
        continue;
      }
      const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      return { ok: true, buffer, mime, format };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Falha de rede com o Voicebox.';
    }
  }

  return { ok: false, error: lastError || 'Não foi possível gerar com o Voicebox.' };
}

/** Duração exata de um WAV (cabeçalho PCM); devolve null se não for WAV. */
export function wavDurationSeconds(buffer: Buffer): number | null {
  try {
    if (buffer.length < 44) return null;
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') return null;
    let offset = 12;
    let byteRate = 0;
    let dataSize = 0;
    while (offset + 8 <= buffer.length) {
      const id = buffer.toString('ascii', offset, offset + 4);
      const size = buffer.readUInt32LE(offset + 4);
      if (id === 'fmt ') byteRate = buffer.readUInt32LE(offset + 16);
      if (id === 'data') {
        dataSize = size;
        break;
      }
      offset += 8 + size + (size % 2);
    }
    if (!byteRate || !dataSize) return null;
    return Math.max(0.1, dataSize / byteRate);
  } catch {
    return null;
  }
}
