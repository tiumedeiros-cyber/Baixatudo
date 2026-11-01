/**
 * Serviço de sincronização labial por IA (SadTalker em Space público do
 * Hugging Face), via `@gradio/client`.
 *
 * Fica 100% isolado: quem chama recebe `{ ok, videoUrl }` ou `{ ok:false }` e
 * decide o que fazer. Nada aqui mexe na timeline, no player ou no layout — se o
 * Space estiver dormindo, sem GPU ou fora do ar, o app continua funcionando com
 * o motor de visemas que já existe (`lib/visemes.ts`).
 *
 * Configuração (tudo opcional, por ambiente):
 *   AVATAR_LIPSYNC_SPACE   → "usuario/space" preferido (ex.: meu/SadTalker)
 *   HUGGINGFACE_TOKEN (ou HF_TOKEN) → token, para Space privado/ZeroGPU
 *   AVATAR_LIPSYNC_ENABLED = "false" → desliga sem tirar o código
 */

const DEFAULT_SPACES = [
  'akin23/SadTalker-API',
  'John6666/SadTalker',
  'kevinwang676/SadTalker',
];

const CONNECT_TIMEOUT = 30_000;

/** Limite de segurança para não estourar memória/tempo da função. */
const MAX_ASSET_BYTES = 14 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'video/mp4': 'mp4',
};

export type LipSyncResult =
  | { ok: true; videoUrl: string; space: string; ms: number; endpoint: string }
  | { ok: false; error: string; tried: { space: string; error: string }[] };

export type LipSyncOptions = {
  /** imagem estática do avatar (URL pública ou data URL) */
  imageUrl: string;
  /** áudio da narração (URL pública) */
  audioUrl: string;
  /** força um Space específico */
  space?: string;
  /** coloca a foto sobre fundo #00FF00 (padrão: true) para o chroma key do editor */
  greenScreen?: boolean;
  /** orçamento total em ms (padrão: 240 s) */
  budgetMs?: number;
  /** recebe mensagens de andamento para a UI */
  onStatus?: (message: string) => void;
};

function unique(list: (string | undefined | null)[]) {
  const out: string[] = [];
  for (const item of list) {
    const value = (item ?? '').trim();
    if (!value || out.includes(value)) continue;
    out.push(value);
  }
  return out;
}

function hfToken() {
  return process.env.HUGGINGFACE_TOKEN || process.env.HF_TOKEN || '';
}

/** URL pública de um Space a partir do id ("user/space"). */
export function spaceUrl(space: string) {
  return `https://${space.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.hf.space`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * O Gradio só sabe enviar arquivo de verdade (Blob/File) ou URL `http(s)`.
 * Aqui normalizamos os dois casos que o app usa:
 *   • `data:image/…;base64,…` (foto enviada pelo usuário)
 *   • URL pública do Supabase (áudio do TTS)
 * Sempre devolvemos um `File` com nome/extensão corretos — foi o que fez o
 * SadTalker aceitar a foto em vez de reclamar de caminho inválido.
 */
async function toUploadable(url: string, baseName: string): Promise<File | Blob> {
  const dataMatch = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(url);
  let mime = '';
  let bytes: ArrayBuffer | null = null;

  if (dataMatch) {
    mime = dataMatch[1] || 'application/octet-stream';
    const raw = dataMatch[3] ?? '';
    const buf = dataMatch[2]
      ? Buffer.from(raw, 'base64')
      : Buffer.from(decodeURIComponent(raw), 'utf8');
    bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } else {
    const res = await fetch(url, { signal: AbortSignal.timeout(45_000), cache: 'no-store' });
    if (!res.ok) throw new Error(`não consegui baixar ${baseName} (HTTP ${res.status})`);
    mime = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'application/octet-stream';
    bytes = await res.arrayBuffer();
  }

  if (!bytes.byteLength) throw new Error(`${baseName} está vazio`);
  if (bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`${baseName} é grande demais para o Space gratuito`);

  const ext = EXT_BY_MIME[mime] ?? (mime.startsWith('audio/') ? 'mp3' : 'png');
  const name = `${baseName}.${ext}`;
  if (typeof File === 'undefined') return new Blob([bytes], { type: mime });
  return new File([bytes], name, { type: mime });
}

/**
 * Fundo verde automático: recorta o fundo da foto (mesmo motor do
 * `/api/ai/cutout`) e recompõe sobre #00FF00. Assim o vídeo que volta do Space
 * tem fundo chapado e o chroma key do editor encaixa o avatar no cenário
 * escolhido — sem custo de servidor na prévia.
 */
async function imageForSpace(imageUrl: string, greenScreen: boolean): Promise<File | Blob> {
  const original = await toUploadable(imageUrl, 'avatar');
  if (!greenScreen) return original;
  try {
    const input = Buffer.from(await original.arrayBuffer());
    const { greenScreenImage } = await import('./avatar-greenscreen');
    const { png, removedPercent } = await greenScreenImage(input);
    // fundo praticamente não separável (foto de ambiente): mantém a original
    if (removedPercent < 6) return original;
    const bytes = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer;
    return typeof File === 'undefined'
      ? new Blob([bytes], { type: 'image/png' })
      : new File([bytes], 'avatar.png', { type: 'image/png' });
  } catch {
    // qualquer falha no recorte não impede a geração: vai a foto original
    return original;
  }
}

/** Descobre o endpoint certo do Space (prefere `/predict`, senão o 1º com 2 entradas). */
function pickEndpoint(api: unknown): string | null {
  const named = (api as { named_endpoints?: Record<string, { parameters?: unknown[] }> })?.named_endpoints ?? {};
  if (named['/predict']) return '/predict';
  const candidates = Object.entries(named).filter(
    ([, info]) => Array.isArray(info?.parameters) && (info?.parameters?.length ?? 0) >= 2,
  );
  if (!candidates.length) return null;
  const withFile = candidates.find(([name]) => /talk|generate|sync|run|predict/i.test(name));
  return (withFile ?? candidates[0])[0];
}

/** O retorno do Gradio varia: FileData, VideoData ({video:{url}}) ou string. */
export function extractVideoUrl(data: unknown): string | null {
  const first = Array.isArray(data) ? data[0] : data;
  if (!first) return null;
  if (typeof first === 'string') return /^https?:\/\//.test(first) ? first : null;
  const obj = first as Record<string, unknown>;
  const video = obj.video as Record<string, unknown> | undefined;
  if (video?.url && typeof video.url === 'string') return video.url;
  if (typeof obj.url === 'string' && obj.url) return obj.url;
  if (typeof obj.path === 'string' && /^https?:\/\//.test(obj.path)) return obj.path;
  if (obj.video === undefined && typeof obj.value === 'string') return obj.value;
  return null;
}

/**
 * Gera o vídeo com a boca sincronizada.
 * Tenta o Space preferido e, se falhar, os Spaces de reserva — sempre devolvendo
 * um resultado tratado (nunca uma exceção solta para a UI).
 */
export async function generateLipSyncVideo(options: LipSyncOptions): Promise<LipSyncResult> {
  const started = Date.now();
  if (process.env.AVATAR_LIPSYNC_ENABLED === 'false') {
    return { ok: false, error: 'Sincronização por IA desligada nas configurações.', tried: [] };
  }
  if (!options.imageUrl || !options.audioUrl) {
    return { ok: false, error: 'Envie a imagem do avatar e o áudio da narração.', tried: [] };
  }

  const budget = Math.max(30_000, Math.min(options.budgetMs ?? 240_000, 280_000));
  const spaces = unique([options.space, process.env.AVATAR_LIPSYNC_SPACE, ...DEFAULT_SPACES]);
  const tried: { space: string; error: string }[] = [];

  const status = options.onStatus ?? (() => undefined);

  // Prepara foto + áudio uma única vez e reaproveita em todos os Spaces.
  let media: [File | Blob, File | Blob];
  try {
    status('Preparando a imagem do avatar e a narração…');
    media = await Promise.all([
      imageForSpace(options.imageUrl, options.greenScreen !== false),
      toUploadable(options.audioUrl, 'narracao'),
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      tried: [],
    };
  }

  // import dinâmico: o pacote só carrega quando a função é usada de verdade
  const { Client, handle_file } = await import('@gradio/client');

  for (const space of spaces) {
    const remaining = budget - (Date.now() - started);
    if (remaining < 20_000) {
      tried.push({ space, error: 'tempo esgotado antes de tentar' });
      break;
    }

    status(`Conectando ao Space ${space}…`);
    let client: Awaited<ReturnType<typeof Client.connect>> | null = null;
    try {
      client = await withTimeout(
        Client.connect(space, hfToken() ? { hf_token: hfToken() as `hf_${string}` } : undefined),
        Math.min(CONNECT_TIMEOUT, remaining),
        'o Space não respondeu (pode estar dormindo)',
      );

      const api = await withTimeout(client.view_api(), 15_000, 'não foi possível ler a API do Space');
      const endpoint = pickEndpoint(api);
      if (!endpoint) throw new Error('o Space não expõe um endpoint de imagem + áudio');

      status(`Gerando sincronização labial (isso pode levar alguns minutos)…`);
      const prediction = await withTimeout(
        client.predict(endpoint, [handle_file(media[0]), handle_file(media[1])]),
        budget - (Date.now() - started),
        'a geração passou do tempo limite',
      );

      const videoUrl = extractVideoUrl((prediction as { data?: unknown })?.data ?? prediction);
      if (!videoUrl) throw new Error('o Space respondeu sem vídeo');

      return { ok: true, videoUrl, space, endpoint, ms: Date.now() - started };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      tried.push({ space, error: message.slice(0, 180) });
      status(`Space ${space} indisponível — tentando outra opção…`);
    } finally {
      try {
        client?.close();
      } catch {
        /* noop */
      }
    }
  }

  return {
    ok: false,
    error:
      'Os Spaces gratuitos de sincronização por IA estão fora do ar agora. ' +
      'Você pode gerar o vídeo com o motor interno (instantâneo, sem depender de terceiros).',
    tried,
  };
}

/** Diagnóstico: mostra qual Space está de pé (usado em /api/avatar/lipsync?probe=1). */
export async function probeLipSyncSpaces() {
  const spaces = unique([process.env.AVATAR_LIPSYNC_SPACE, ...DEFAULT_SPACES]);
  const results: Record<string, { ok: boolean; ms: number; endpoint?: string; detail?: string }> = {};

  await Promise.all(
    spaces.map(async (space) => {
      const t0 = Date.now();
      try {
        const res = await fetch(`${spaceUrl(space)}/gradio_api/info`, {
          headers: hfToken() ? { Authorization: `Bearer ${hfToken()}` } : undefined,
          signal: AbortSignal.timeout(12_000),
          cache: 'no-store',
        });
        const text = await res.text();
        if (!res.ok) {
          results[space] = { ok: false, ms: Date.now() - t0, detail: `HTTP ${res.status}: ${text.slice(0, 120)}` };
          return;
        }
        const api = JSON.parse(text) as unknown;
        const endpoint = pickEndpoint(api);
        results[space] = {
          ok: Boolean(endpoint),
          ms: Date.now() - t0,
          endpoint: endpoint ?? undefined,
          detail: endpoint ? 'pronto' : 'sem endpoint de imagem + áudio',
        };
      } catch (error) {
        results[space] = {
          ok: false,
          ms: Date.now() - t0,
          detail: (error instanceof Error ? error.message : String(error)).slice(0, 160),
        };
      }
    }),
  );

  return { spaces: results, ok: Object.values(results).some((r) => r.ok) };
}

/**
 * Diagnóstico "de verdade": conecta com o `@gradio/client` (handshake SSE +
 * leitura da API) sem gerar vídeo. Rápido (segundos) e serve para saber se o
 * caminho que o botão usa está saudável — `?probe=connect`.
 */
export async function probeConnect(space?: string) {
  const target = unique([space, process.env.AVATAR_LIPSYNC_SPACE, ...DEFAULT_SPACES])[0];
  const t0 = Date.now();
  try {
    const { Client } = await import('@gradio/client');
    const client = await withTimeout(
      Client.connect(target, hfToken() ? { hf_token: hfToken() as `hf_${string}` } : undefined),
      CONNECT_TIMEOUT,
      'o Space não respondeu (pode estar dormindo)',
    );
    try {
      const api = await withTimeout(client.view_api(), 20_000, 'não foi possível ler a API do Space');
      const endpoint = pickEndpoint(api);
      return {
        ok: Boolean(endpoint),
        space: target,
        endpoint,
        ms: Date.now() - t0,
        detail: endpoint ? 'cliente conectado e endpoint pronto' : 'o Space não expõe imagem + áudio',
      };
    } finally {
      try {
        client.close();
      } catch {
        /* noop */
      }
    }
  } catch (error) {
    return {
      ok: false,
      space: target,
      endpoint: null,
      ms: Date.now() - t0,
      detail: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    };
  }
}
