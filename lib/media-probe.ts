/**
 * Sondagem de mídia — módulo isolado, sem dependência de estado global.
 *
 * Bug corrigido: ao adicionar um vídeo baixado (Baixa Tudo) na timeline, o clipe
 * recebia uma duração fixa (6 s) porque o arquivo salvo no storage não guarda a
 * duração nos metadados. A barra ficava menor que o vídeo e o preview parava no
 * meio ("vídeo pela metade").
 *
 * Aqui lemos a duração REAL do arquivo com um <video>/<audio> oculto, cacheamos
 * por URL e devolvemos sempre um número seguro. Se o arquivo não responder em
 * tempo, devolvemos `null` e o chamador usa o valor antigo (nada quebra).
 */

export type MediaKind = 'video' | 'audio' | 'image';

const cache = new Map<string, number>();
const pending = new Map<string, Promise<number | null>>();

function clampDuration(value: number | null | undefined): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(value, 4 * 60 * 60);
}

/** Duração já conhecida (sem I/O). */
export function cachedDuration(src: string): number | null {
  return clampDuration(cache.get(src));
}

export function rememberDuration(src: string, seconds: number) {
  const value = clampDuration(seconds);
  if (value) cache.set(src, value);
}

/**
 * Lê a duração real do arquivo. Espera `loadedmetadata` (que é o que garante a
 * duração total) e tem timeout curto para nunca travar a UI.
 */
export function probeMediaDuration(src: string, kind: MediaKind = 'video', timeoutMs = 9000): Promise<number | null> {
  if (!src) return Promise.resolve(null);
  const known = cachedDuration(src);
  if (known) return Promise.resolve(known);
  if (kind === 'image') return Promise.resolve(null);

  const existing = pending.get(src);
  if (existing) return existing;

  const task = new Promise<number | null>((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const el = document.createElement(kind === 'audio' ? 'audio' : 'video') as HTMLMediaElement;
    let settled = false;

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      el.removeAttribute('src');
      try {
        el.load();
      } catch {
        /* ignore */
      }
      const safe = clampDuration(value);
      if (safe) {
        cache.set(src, safe);
        resolve(safe);
      } else {
        resolve(null);
      }
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    el.preload = 'metadata';
    el.muted = true;
    // metadata não precisa de CORS; deixar anônimo quebraria links sem header
    el.addEventListener('loadedmetadata', () => finish(el.duration), { once: true });
    el.addEventListener('durationchange', () => {
      if (el.duration && Number.isFinite(el.duration)) finish(el.duration);
    });
    el.addEventListener('error', () => finish(null), { once: true });
    el.src = src;
    try {
      el.load();
    } catch {
      finish(null);
    }
  }).finally(() => {
    pending.delete(src);
  });

  pending.set(src, task);
  return task;
}

/**
 * Onde um novo clipe deve entrar (bug 2: tudo caía no meio/fim da régua).
 *
 * Regra pedida: início absoluto (0) ou o tempo atual da agulha. Se a agulha
 * estiver parada depois do último clipe (área vazia, o caso que gerava o
 * "vai pro fim"), começamos do zero em vez de jogar o elemento lá na frente.
 */
export function resolveInsertStart(state: { playhead: number; clips: { start: number; duration: number }[] }): number {
  const playhead = Number(state.playhead) || 0;
  if (playhead <= 0.05) return 0;
  const end = state.clips.reduce((acc, clip) => Math.max(acc, clip.start + clip.duration), 0);
  if (end <= 0) return 0;
  if (playhead > end + 0.5) return 0;
  return Math.max(0, Math.min(playhead, end));
}
