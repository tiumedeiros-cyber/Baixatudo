'use client';

type Keyed = { id: string; src: string };

function keyOf(item: Keyed) {
  return `${item.id}|${item.src}`;
}

export class MediaRegistry {
  videos = new Map<string, HTMLVideoElement>();
  images = new Map<string, HTMLImageElement>();
  audios = new Map<string, HTMLAudioElement>();
  durations = new Map<string, number>();
  poster = new Map<string, HTMLCanvasElement>();

  private makeVideo(src: string) {
    const el = document.createElement('video');
    el.crossOrigin = 'anonymous';
    el.src = src;
    el.preload = 'auto';
    el.playsInline = true;
    el.muted = true; // áudio do vídeo é roteado pelo AudioEngine quando habilitado
    el.style.display = 'none';
    document.body.appendChild(el);
    el.addEventListener('loadedmetadata', () => {
      this.durations.set(src, el.duration || 0);
    });
    return el;
  }

  /**
   * Cada clipe tem o SEU próprio elemento de vídeo.
   *
   * Antes existia um elemento por `src`: ao cortar um vídeo, os dois clipes
   * disputavam o mesmo <video> e o preview ficava preto (um pausava/rebobinava
   * o outro). Agora o corte não estraga mais a imagem.
   */
  videoFor(clip: Keyed) {
    const key = keyOf(clip);
    let el = this.videos.get(key);
    if (!el) {
      el = this.makeVideo(clip.src);
      this.videos.set(key, el);
    }
    return el;
  }

  /** Compatibilidade: elemento avulso por URL. */
  getVideo(src: string) {
    let el = this.videos.get(src);
    if (!el) {
      el = this.makeVideo(src);
      this.videos.set(src, el);
    }
    return el;
  }

  audioFor(clip: Keyed) {
    const key = keyOf(clip);
    let el = this.audios.get(key);
    if (!el) {
      el = new Audio();
      el.crossOrigin = 'anonymous';
      el.src = clip.src;
      el.preload = 'auto';
      el.style.display = 'none';
      el.addEventListener('loadedmetadata', () => this.durations.set(clip.src, el!.duration || 0));
      this.audios.set(key, el);
    }
    return el;
  }

  getImage(src: string) {
    let el = this.images.get(src);
    if (!el) {
      el = new Image();
      el.crossOrigin = 'anonymous';
      el.src = src;
      this.images.set(src, el);
    }
    return el;
  }

  getAudio(src: string) {
    let el = this.audios.get(src);
    if (!el) {
      el = new Audio();
      el.crossOrigin = 'anonymous';
      el.src = src;
      el.preload = 'auto';
      el.style.display = 'none';
      el.addEventListener('loadedmetadata', () => this.durations.set(src, el!.duration || 0));
      this.audios.set(src, el);
    }
    return el;
  }

  /** Guarda um quadro do vídeo para desenhar enquanto o elemento está buscando (sem tela preta). */
  cachePoster(clipId: string, el: HTMLVideoElement) {
    try {
      const sw = el.videoWidth;
      const sh = el.videoHeight;
      if (!sw || !sh) return;
      const c = document.createElement('canvas');
      const scale = Math.min(1, 192 / Math.max(sw, sh));
      c.width = Math.max(2, Math.round(sw * scale));
      c.height = Math.max(2, Math.round(sh * scale));
      c.getContext('2d')?.drawImage(el, 0, 0, c.width, c.height);
      this.poster.set(clipId, c);
    } catch {
      /* canvas bloqueado por CORS: segue sem poster */
    }
  }

  posterFor(clip: Keyed) {
    return this.poster.get(clip.id);
  }

  /** Libera elementos de clipes que não existem mais (memória do celular agradece). */
  prune(keepClipIds: Set<string>) {
    for (const key of Array.from(this.videos.keys())) {
      const id = key.split('|')[0];
      if (keepClipIds.has(id)) continue;
      const el = this.videos.get(key);
      try {
        el?.pause();
        el?.remove();
      } catch {
        /* noop */
      }
      this.videos.delete(key);
      this.poster.delete(id);
    }
    for (const key of Array.from(this.audios.keys())) {
      const id = key.split('|')[0];
      if (keepClipIds.has(id) || !key.includes('|')) continue;
      try {
        this.audios.get(key)?.pause();
      } catch {
        /* noop */
      }
      this.audios.delete(key);
    }
  }

  peekDuration(src: string) {
    return this.durations.get(src) ?? 0;
  }

  destroy() {
    this.videos.forEach((v) => v.remove());
    this.videos.clear();
    this.images.clear();
    this.audios.clear();
    this.poster.clear();
  }
}

export const media = new MediaRegistry();

export function seekVideo(el: HTMLVideoElement, time: number) {
  const target = Math.max(0, Math.min(time, (el.duration || time) - 0.02));
  if (Math.abs(el.currentTime - target) > 0.12) {
    try {
      el.currentTime = target;
    } catch {
      /* noop */
    }
  }
}

/** Miniatura real do vídeo (quadro em ~0,5 s) — usada na biblioteca e em Meus arquivos. */
export function videoThumbSrc(url: string) {
  if (!url) return url;
  const hash = url.includes('#') ? '' : '#t=0.5';
  return `${url}${hash}`;
}
