import crypto from 'node:crypto';
import { APP_SECRET, DOWNLOAD_ENGINE_URL } from '@/lib/env';
import type { DownloadItem } from '@/lib/types';

/** Serviços reconhecidos (mesma lista da extensão Baixa Tudo) */
const SITES: { test: RegExp; name: string }[] = [
  { test: /(^|\.)youtube\.com$|^youtu\.be$/, name: 'YouTube' },
  { test: /(^|\.)(x|twitter)\.com$/, name: 'X (Twitter)' },
  { test: /(^|\.)instagram\.com$/, name: 'Instagram' },
  { test: /(^|\.)tiktok\.com$|^v[mt]\./, name: 'TikTok' },
  { test: /(^|\.)(facebook\.com|fb\.watch)$/, name: 'Facebook' },
  { test: /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/, name: 'Pinterest' },
  { test: /(^|\.)(reddit\.com|redd\.it)$/, name: 'Reddit' },
  { test: /(^|\.)vimeo\.com$/, name: 'Vimeo' },
  { test: /(^|\.)twitch\.tv$/, name: 'Twitch' },
  { test: /(^|\.)soundcloud\.com$/, name: 'SoundCloud' },
  { test: /(^|\.)bsky\.app$/, name: 'Bluesky' },
  { test: /(^|\.)(dailymotion\.com|dai\.ly)$/, name: 'Dailymotion' },
  { test: /(^|\.)(threads\.net)$/, name: 'Threads' },
  { test: /(^|\.)(streamable\.com|tumblr\.com|vk\.com|ok\.ru|loom\.com|bilibili\.com|snapchat\.com)$/, name: 'Vídeo' },
];

export function detectService(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|mobile)\./, '');
    return SITES.find((s) => s.test.test(host))?.name ?? null;
  } catch {
    return null;
  }
}

export function isSupportedUrl(value: string) {
  try {
    const u = new URL(value);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

const ERROS: Record<string, string> = {
  'error.api.link.invalid': 'Esse link não parece válido. Confira e tente de novo.',
  'error.api.link.unsupported': 'Esse site não é aceito pelo motor.',
  'error.api.service.unsupported': 'Esse site não é aceito pelo motor.',
  'error.api.service.disabled': 'Esse site está desligado no motor.',
  'error.api.fetch.empty': 'Não encontramos nada para baixar nesse link. Ele é público?',
  'error.api.fetch.fail': 'O site não permitiu que o motor pegasse esse arquivo.',
  'error.api.fetch.critical': 'O site respondeu de forma inesperada. Tente em instantes.',
  'error.api.content.too_long': 'Esse vídeo é longo demais.',
  'error.api.content.video.unavailable': 'Esse vídeo não está disponível.',
  'error.api.content.video.private': 'Esse vídeo é privado.',
  'error.api.content.video.age': 'Esse vídeo tem trava de idade.',
  'error.api.content.video.live': 'Não é possível baixar transmissão ao vivo.',
  'error.api.content.post.private': 'Esse post é privado.',
  'error.api.content.post.age': 'Esse post tem trava de idade.',
  'error.api.rate_exceeded': 'Muitos pedidos seguidos. Aguarde um minuto.',
  'error.api.invalid_body': 'O motor não entendeu o pedido.',
};

export function friendlyError(code?: string) {
  if (!code) return 'Não foi possível concluir o download.';
  return ERROS[code] ?? `Falha no motor (${code}).`;
}

export type EngineResult =
  | { ok: true; status: string; filename?: string; items: DownloadItem[]; tunnels: string[]; raw: Record<string, unknown> }
  | { ok: false; error: string };

export async function requestDownload(
  url: string,
  opts: { audio?: boolean; quality?: string },
): Promise<EngineResult> {
  const body: Record<string, unknown> = {
    url,
    downloadMode: opts.audio ? 'audio' : 'auto',
    filenameStyle: 'pretty',
  };
  if (opts.audio) body.audioFormat = 'mp3';
  else body.videoQuality = opts.quality || '1080';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  let data: Record<string, unknown>;
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    // instâncias cobalt podem exigir a chave do motor
    if (process.env.DOWNLOAD_ENGINE_KEY) headers.Authorization = `Api-Key ${process.env.DOWNLOAD_ENGINE_KEY}`;
    const res = await fetch(`${DOWNLOAD_ENGINE_URL}/api/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    });
    const text = await res.text();
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      if (res.status === 401 || res.status === 403) {
        return { ok: false, error: 'O motor de download pediu uma chave de acesso. Configure DOWNLOAD_ENGINE_KEY.' };
      }
      return { ok: false, error: `O motor respondeu ${res.status} sem JSON.` };
    }
    if (!data.status && (res.status === 401 || res.status === 403)) {
      return { ok: false, error: 'O motor de download pediu uma chave de acesso. Configure DOWNLOAD_ENGINE_KEY.' };
    }
  } catch {
    return { ok: false, error: 'Não foi possível falar com o motor de download. Tente novamente em instantes.' };
  } finally {
    clearTimeout(timer);
  }

  if (!data || !data.status) return { ok: false, error: 'Resposta inesperada do motor de download.' };
  if (data.status === 'error') {
    const err = data.error as { code?: string } | undefined;
    return { ok: false, error: friendlyError(err?.code) };
  }

  const items: DownloadItem[] = [];
  const tunnelField = data.tunnel;
  const tunnels = Array.isArray(tunnelField)
    ? (tunnelField as string[]).filter(Boolean)
    : typeof tunnelField === 'string' && tunnelField
      ? [tunnelField]
      : [];
  const mediaType = opts.audio ? 'audio' : 'video';

  // O túnel do motor é um proxy público: funciona de qualquer IP (inclusive do
  // servidor da Vercel), então vem primeiro. O link direto fica como alternativa.
  if (tunnels.length) items.push({ url: tunnels[0], type: mediaType });

  const picker = (data.picker as DownloadItem[] | undefined) ?? [];
  if (Array.isArray(picker)) items.push(...picker.filter((p) => p?.url));
  if (typeof data.url === 'string' && data.url) items.push({ url: data.url, type: mediaType });
  if (typeof data.audio === 'string' && data.audio) items.push({ url: data.audio, type: 'audio' });
  for (const t of tunnels) items.push({ url: t, type: mediaType });

  // sem duplicatas (mesma URL não entra duas vezes)
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  return {
    ok: true,
    status: String(data.status),
    filename: data.filename as string | undefined,
    items: unique,
    tunnels,
    raw: data,
  };
}

/* ----------------------------- URLs assinadas ----------------------------- */
export function signUrl(url: string) {
  const payload = Buffer.from(url).toString('base64url');
  const sig = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
  return { payload, sig };
}

export function verifySignedUrl(payload: string, sig: string) {
  const expected = crypto.createHmac('sha256', APP_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const url = Buffer.from(payload, 'base64url').toString('utf8');
    return isSupportedUrl(url) ? url : null;
  } catch {
    return null;
  }
}

export function proxyUrl(url: string, name?: string, type?: string) {
  const { payload, sig } = signUrl(url);
  const params = new URLSearchParams({ u: payload, s: sig });
  if (name) params.set('n', name);
  if (type) params.set('t', type);
  return `/api/downloads/stream?${params.toString()}`;
}
