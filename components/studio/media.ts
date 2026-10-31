'use client';

export class MediaRegistry {
  videos = new Map<string, HTMLVideoElement>();
  images = new Map<string, HTMLImageElement>();
  audios = new Map<string, HTMLAudioElement>();
  durations = new Map<string, number>();

  getVideo(src: string) {
    let el = this.videos.get(src);
    if (!el) {
      el = document.createElement('video');
      el.crossOrigin = 'anonymous';
      el.src = src;
      el.preload = 'auto';
      el.playsInline = true;
      el.muted = true; // áudio do vídeo é roteado pelo AudioEngine quando habilitado
      el.style.display = 'none';
      document.body.appendChild(el);
      el.addEventListener('loadedmetadata', () => {
        this.durations.set(src, el!.duration || 0);
      });
      this.videos.set(src, el);
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

  peekDuration(src: string) {
    return this.durations.get(src) ?? 0;
  }

  destroy() {
    this.videos.forEach((v) => v.remove());
    this.videos.clear();
    this.images.clear();
    this.audios.clear();
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
