/**
 * Integrações de vídeo por IA (Kling Motion Control via Kie AI) e publicação
 * social (Postiz). As chaves vêm do painel do admin (criptografadas) ou do
 * ambiente — nunca do navegador.
 *
 * Fluxo: imagem do personagem + vídeo de referência → Kling anima a imagem
 * seguindo os movimentos → o MP4 volta para a biblioteca e pode ser publicado.
 */

const KIE_BASE = 'https://api.kie.ai/api/v1/jobs';
const POSTIZ_BASE = 'https://api.postiz.com/public/v1';

export type MotionMode = '720p' | '1080p';

async function jsonFetch(url: string, init: RequestInit, timeoutMs = 45_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text.slice(0, 400) };
    }
    return { ok: res.ok, status: res.status, data: data as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: { msg: err instanceof Error ? err.message : 'falha de rede' } as Record<string, unknown>,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Cria a tarefa de motion control. Devolve o taskId. */
export async function kieCreateTask(opts: {
  key: string;
  imageUrl: string;
  videoUrl: string;
  prompt?: string;
  mode?: MotionMode;
  callbackUrl?: string;
}) {
  const body = {
    model: 'kling-2.6/motion-control',
    ...(opts.callbackUrl ? { callBackUrl: opts.callbackUrl } : {}),
    input: {
      prompt:
        opts.prompt?.trim() ||
        'Make the character in the image follow the movements of the character in the video.',
      input_urls: [opts.imageUrl],
      video_urls: [opts.videoUrl],
      character_orientation: 'video',
      mode: opts.mode ?? '720p',
    },
  };
  const res = await jsonFetch(`${KIE_BASE}/createTask`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (res.data?.data ?? {}) as { taskId?: string };
  const message = String((res.data?.msg as string) ?? '');
  if (!res.ok || !data.taskId) {
    return { error: message || `Kie AI respondeu ${res.status}. Confira a chave e os créditos.` };
  }
  return { taskId: data.taskId };
}

/** Consulta o estado da tarefa. */
export async function kieGetTask(opts: { key: string; taskId: string }) {
  const res = await jsonFetch(`${KIE_BASE}/recordInfo?taskId=${encodeURIComponent(opts.taskId)}`, {
    headers: { Authorization: `Bearer ${opts.key}` },
  });
  const data = (res.data?.data ?? {}) as { state?: string; resultJson?: string; failMsg?: string };
  const state = String(data.state ?? 'processing').toLowerCase();
  let resultUrl = '';
  if (data.resultJson) {
    try {
      const parsed = JSON.parse(data.resultJson) as { resultUrls?: string[] };
      resultUrl = parsed.resultUrls?.[0] ?? '';
    } catch {
      resultUrl = '';
    }
  }
  return { state, resultUrl, failMsg: data.failMsg ?? '', httpOk: res.ok };
}

/** Sobe um arquivo para a Postiz e devolve { id, path }. */
export async function postizUpload(opts: {
  key: string;
  buffer: Buffer;
  filename: string;
  contentType: string;
}) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(opts.buffer)], { type: opts.contentType }), opts.filename);
  const res = await jsonFetch(`${POSTIZ_BASE}/upload`, {
    method: 'POST',
    headers: { Authorization: opts.key },
    body: form,
  }, 120_000);
  const data = res.data as { id?: string; path?: string; message?: string };
  if (!res.ok || !data?.path) {
    return { error: data?.message || `Postiz respondeu ${res.status}. Confira a API key.` };
  }
  return { id: String(data.id ?? ''), path: String(data.path) };
}

/** Cria o post (TikTok) com o vídeo já enviado. */
export async function postizPublish(opts: {
  key: string;
  integrationId: string;
  mediaId: string;
  mediaPath: string;
  caption: string;
}) {
  const now = new Date().toISOString();
  const body = {
    type: 'now',
    date: now,
    shortLink: true,
    posts: [
      {
        integration: { id: opts.integrationId },
        value: [
          {
            content: opts.caption.slice(0, 2000),
            image: [{ id: opts.mediaId, path: opts.mediaPath }],
          },
        ],
      },
    ],
  };
  const res = await jsonFetch(`${POSTIZ_BASE}/posts`, {
    method: 'POST',
    headers: { Authorization: opts.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = String((res.data?.message as string) ?? `Postiz respondeu ${res.status}.`);
    return { error: msg };
  }
  return { ok: true };
}
