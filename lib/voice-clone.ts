/**
 * Clonagem de voz grátis, direto do celular — sem computador, sem chave, sem custo.
 *
 * Como funciona: o Voicebox (voicebox.sh) é um app **de desktop** — não existe
 * API hospedada dele, então não dá para usar de um celular. Para ter clonagem
 * de voz funcionando no navegador do telefone, usamos o XTTS-v2 rodando em
 * Spaces públicos e gratuitos do Hugging Face: nosso servidor chama a API
 * Gradio do Space, recebe o áudio e guarda no storage do usuário.
 *
 * Nada é inventado: se o Space estiver dormindo/ocupado, devolvemos o erro
 * real e o editor continua funcionando (o usuário ainda pode gravar a própria
 * voz pelo microfone do celular).
 */

export type CloneSpace = {
  id: string;
  host: string;
  api: string;
  /** preencher os 19 campos na ordem que o Space espera */
  build: (input: { text: string; referenceUrl: string; language: string; speed: number }) => unknown[];
};

/** Idiomas expostos por esses Spaces (XTTS-v2). */
export const CLONE_LANGUAGES = [
  { id: 'Portuguese', label: 'Português' },
  { id: 'English', label: 'Inglês' },
  { id: 'Spanish', label: 'Espanhol' },
  { id: 'French', label: 'Francês' },
  { id: 'German', label: 'Alemão' },
  { id: 'Italian', label: 'Italiano' },
  { id: 'Japanese', label: 'Japonês' },
  { id: 'Korean', label: 'Coreano' },
  { id: 'Chinese', label: 'Chinês' },
  { id: 'Hindi', label: 'Hindi' },
  { id: 'Russian', label: 'Russo' },
  { id: 'Polish', label: 'Polonês' },
  { id: 'Dutch', label: 'Holandês' },
  { id: 'Turkish', label: 'Turco' },
  { id: 'Arabic', label: 'Árabe' },
  { id: 'Czech', label: 'Tcheco' },
  { id: 'Hungarian', label: 'Húngaro' },
];

/** Spaces públicos verificados (o áudio de referência entra por URL). */
export const CLONE_SPACES: CloneSpace[] = [
  {
    id: 'hasanbasbunar/Voice-Cloning-XTTS-v2',
    host: 'hasanbasbunar-voice-cloning-xtts-v2.hf.space',
    api: 'voice_clone_synthesis',
    build: ({ text, referenceUrl, language, speed }) => [
      text,
      referenceUrl,
      'audio_1.wav',
      language,
      0.75, // temperature
      speed,
      true, // do_sample
      5, // repetition_penalty
      1, // length_penalty
      30, // gpt_cond_len
      50, // top_k
      0.85, // top_p
      true, // remove_silence
      -45, // silence_threshold
      300, // min_silence_len
      100, // keep_silence
      'Native XTTS splitting',
      250, // max_chars_per_segment
      false, // enable_preprocessing
    ],
  },
];

export type ProbeResult = { id: string; ok: boolean; ms: number; error?: string };

/** Confere de verdade se o Space está de pé (GET /gradio_api/info). */
export async function probeCloneSpaces(): Promise<ProbeResult[]> {
  return Promise.all(
    CLONE_SPACES.map(async (space) => {
      const started = Date.now();
      try {
        const res = await fetch(`https://${space.host}/gradio_api/info`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return { id: space.id, ok: false, ms: Date.now() - started, error: `HTTP ${res.status}` };
        const json = (await res.json()) as { named_endpoints?: Record<string, unknown> };
        const ok = Boolean(json.named_endpoints?.[`/${space.api}`]);
        return {
          id: space.id,
          ok,
          ms: Date.now() - started,
          error: ok ? undefined : 'Endpoint de clonagem não exposto agora.',
        };
      } catch (error) {
        return {
          id: space.id,
          ok: false,
          ms: Date.now() - started,
          error: error instanceof Error ? error.message : 'sem resposta',
        };
      }
    }),
  );
}

type FileData = { path?: string; url?: string; mime_type?: string | null };

/** Dispara a chamada Gradio e espera o evento final (SSE). */
async function callGradio(space: CloneSpace, data: unknown[]): Promise<{ ok: true; files: FileData[] } | { ok: false; error: string }> {
  try {
    const start = await fetch(`https://${space.host}/gradio_api/call/${space.api}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    });
    if (!start.ok) {
      const detail = await start.text().catch(() => '');
      return { ok: false, error: `Space respondeu ${start.status}${detail ? `: ${detail.slice(0, 140)}` : ''}` };
    }
    const { event_id: eventId } = (await start.json()) as { event_id?: string };
    if (!eventId) return { ok: false, error: 'O Space não abriu o evento de geração.' };

    const stream = await fetch(`https://${space.host}/gradio_api/call/${space.api}/${eventId}`, {
      signal: AbortSignal.timeout(240_000),
      cache: 'no-store',
    });
    if (!stream.ok || !stream.body) return { ok: false, error: `Falha ao acompanhar a geração (${stream.status}).` };

    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let failure = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        const eventLine = block.split('\n').find((line) => line.startsWith('event:'));
        const dataLine = block.split('\n').find((line) => line.startsWith('data:'));
        const event = eventLine?.slice(6).trim();
        const payload = dataLine?.slice(5).trim() ?? '';
        if (event === 'error') {
          try {
            failure = String((JSON.parse(payload) as { error?: string }).error ?? payload);
          } catch {
            failure = payload || 'erro no Space';
          }
        }
        if (event === 'complete') {
          try {
            const parsed = JSON.parse(payload) as unknown[];
            const files = (Array.isArray(parsed) ? parsed : []).filter(
              (item): item is FileData => Boolean(item && typeof item === 'object'),
            );
            if (!files.length) failure = failure || 'O Space terminou sem devolver áudio.';
            else return { ok: true, files };
          } catch {
            failure = failure || 'Resposta inesperada do Space.';
          }
        }
      }
      if (failure) break;
    }

    return { ok: false, error: failure || 'O Space encerrou sem gerar o áudio.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha de rede com o Space.' };
  }
}

/** Inventa a URL do arquivo gerado quando o Space devolve só o caminho. */
function fileUrl(space: CloneSpace, file: FileData): string | null {
  if (file.url) return file.url.startsWith('http') ? file.url : `https://${space.host}${file.url}`;
  if (file.path) return `https://${space.host}/gradio_api/file=${encodeURIComponent(file.path)}`;
  return null;
}

export type CloneResult = { ok: true; buffer: Buffer; mime: string } | { ok: false; error: string };

/** Gera uma fala clonada a partir do áudio de referência (URL pública). */
export async function cloneVoice(input: {
  text: string;
  referenceUrl: string;
  language?: string;
  speed?: number;
}): Promise<CloneResult> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: 'Texto vazio.' };
  if (!input.referenceUrl) return { ok: false, error: 'Grave ou envie uma amostra da sua voz primeiro.' };

  const errors: string[] = [];
  for (const space of CLONE_SPACES) {
    const called = await callGradio(
      space,
      space.build({
        text,
        referenceUrl: input.referenceUrl,
        language: input.language || 'Portuguese',
        speed: Math.min(2, Math.max(0.5, input.speed ?? 1)),
      }),
    );
    if (!called.ok) {
      errors.push(`${space.id}: ${called.error}`);
      continue;
    }
    const url = fileUrl(space, called.files[0]);
    if (!url) {
      errors.push(`${space.id}: sem URL de áudio na resposta.`);
      continue;
    }
    try {
      const audio = await fetch(url, { signal: AbortSignal.timeout(90_000), cache: 'no-store' });
      if (!audio.ok) {
        errors.push(`${space.id}: áudio respondeu ${audio.status}`);
        continue;
      }
      const buffer = Buffer.from(await audio.arrayBuffer());
      if (buffer.length < 1024) {
        errors.push(`${space.id}: áudio vazio`);
        continue;
      }
      const mime = audio.headers.get('content-type')?.split(';')[0] || 'audio/wav';
      return { ok: true, buffer, mime };
    } catch (error) {
      errors.push(`${space.id}: ${error instanceof Error ? error.message : 'falha ao baixar o áudio'}`);
    }
  }

  return { ok: false, error: errors.join(' · ') || 'Nenhum servidor de clonagem respondeu.' };
}

/** Quebra o roteiro em blocos de até 400 caracteres, cortando em pontuação. */
export function splitForCloning(text: string, max = 400): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const chunks: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? '),
      window.lastIndexOf('; '),
      window.lastIndexOf(', '),
      window.lastIndexOf(' '),
    );
    const take = cut > max * 0.4 ? cut + 1 : max;
    chunks.push(rest.slice(0, take).trim());
    rest = rest.slice(take).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}
