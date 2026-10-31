'use client';

/** Síntese procedural de efeitos e trilhas — funciona offline e na exportação. */
function noise(i: number) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

const PRESETS: Record<string, { duration: number; gen: (t: number, i: number, sr: number) => number }> = {
  click: {
    duration: 0.18,
    gen: (t, i) => {
      const env = Math.exp(-t * 60);
      return (noise(i) * 0.35 + Math.sin(2 * Math.PI * 2200 * t) * 0.35) * env;
    },
  },
  whoosh: {
    duration: 0.9,
    gen: (t, i) => {
      const env = Math.exp(-Math.pow((t - 0.35) / 0.22, 2));
      const n = noise(i);
      return n * 0.55 * env * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3 * t));
    },
  },
  riser: {
    duration: 2.6,
    gen: (t, i, sr) => {
      const f = 180 + 1500 * Math.pow(t / 2.6, 2);
      const env = Math.pow(t / 2.6, 1.5);
      const ph = (f * t) % 1;
      return (Math.sin(2 * Math.PI * f * t) * 0.25 + noise(i) * 0.18 * env) * env * (1 - Math.pow(t / 2.6, 6));
    },
  },
  impact: {
    duration: 1.4,
    gen: (t, i) => {
      const env = Math.exp(-t * 3.2);
      const sub = Math.sin(2 * Math.PI * (110 * Math.exp(-t * 1.6)) * t) * 0.75;
      const crack = noise(i) * Math.exp(-t * 26) * 0.7;
      return (sub + crack) * env;
    },
  },
  bell: {
    duration: 2,
    gen: (t) => {
      const env = Math.exp(-t * 2.4);
      return (
        (Math.sin(2 * Math.PI * 880 * t) * 0.4 +
          Math.sin(2 * Math.PI * 1320 * t) * 0.22 +
          Math.sin(2 * Math.PI * 1760 * t) * 0.12) *
        env
      );
    },
  },
  lofi: {
    duration: 20,
    gen: (t) => {
      const chords = [
        [220, 261.63, 329.63],
        [174.61, 220, 261.63],
        [196, 246.94, 293.66],
        [164.81, 207.65, 246.94],
      ];
      const bar = Math.floor(t / 5) % chords.length;
      const note = chords[bar];
      const local = t % 5;
      const env = Math.min(1, local * 3) * Math.max(0, 1 - local / 6);
      let v = 0;
      note.forEach((f) => {
        v += Math.sin(2 * Math.PI * f * t) * 0.12 + Math.sin(2 * Math.PI * f * 2 * t) * 0.04;
      });
      const beat = Math.exp(-((t % 0.5) * 14)) * Math.sin(2 * Math.PI * 70 * t) * 0.25;
      return (v + beat) * env * 0.9;
    },
  },
  cinematic: {
    duration: 20,
    gen: (t) => {
      const pulse = Math.exp(-((t % 0.75) * 9)) * Math.sin(2 * Math.PI * 55 * t) * 0.5;
      const pad =
        (Math.sin(2 * Math.PI * 110 * t) + Math.sin(2 * Math.PI * 164.81 * t) * 0.6 + Math.sin(2 * Math.PI * 220 * t) * 0.4) * 0.12;
      const arp = Math.sin(2 * Math.PI * (330 + 110 * (Math.floor(t * 4) % 4)) * t) * 0.05 * Math.exp(-((t % 0.25) * 16));
      const fade = Math.min(1, t / 1.2) * Math.min(1, (20 - t) / 1.5);
      return (pulse + pad + arp) * Math.max(0, fade);
    },
  },
};

export function presetDuration(preset: string) {
  return PRESETS[preset]?.duration ?? 1;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private gains = new WeakMap<HTMLMediaElement, GainNode>();
  private sources: AudioBufferSourceNode[] = [];
  private buffers = new Map<string, AudioBuffer>();
  exportDest: MediaStreamAudioDestinationNode | null = null;
  master: GainNode | null = null;

  ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Conecta um elemento de mídia ao grafo (para volume e mixagem). */
  attach(el: HTMLMediaElement, volume = 1) {
    const ctx = this.ensure();
    let gain = this.gains.get(el);
    if (!gain) {
      const node = ctx.createMediaElementSource(el);
      gain = ctx.createGain();
      node.connect(gain);
      gain.connect(this.master!);
      this.gains.set(el, gain);
    }
    gain.gain.value = volume;
    return gain;
  }

  getBuffer(preset: string) {
    const key = preset.replace('builtin:', '');
    const cached = this.buffers.get(key);
    if (cached) return cached;
    const ctx = this.ensure();
    const spec = PRESETS[key] ?? PRESETS.click;
    const sr = ctx.sampleRate;
    const length = Math.ceil(spec.duration * sr);
    const buffer = ctx.createBuffer(1, length, sr);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.max(-1, Math.min(1, spec.gen(i / sr, i, sr)));
    }
    this.buffers.set(key, buffer);
    return buffer;
  }

  playBuiltin(preset: string, delaySec: number, volume: number, offset = 0) {
    const ctx = this.ensure();
    const buffer = this.getBuffer(preset);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(this.master!);
    if (this.exportDest) gain.connect(this.exportDest);
    const start = ctx.currentTime + Math.max(0, delaySec);
    src.start(start, Math.max(0, Math.min(offset, buffer.duration - 0.01)));
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
    return src;
  }

  stopAll() {
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* noop */
      }
    });
    this.sources = [];
  }

  startExportCapture() {
    const ctx = this.ensure();
    this.exportDest = ctx.createMediaStreamDestination();
    this.master!.connect(this.exportDest);
    this.gains = this.gains; // mantém
    return this.exportDest;
  }

  stopExportCapture() {
    if (this.exportDest && this.master) {
      try {
        this.master.disconnect(this.exportDest);
      } catch {
        /* noop */
      }
    }
    this.exportDest = null;
  }

  setVolume(el: HTMLMediaElement, volume: number) {
    const gain = this.gains.get(el);
    if (gain) gain.gain.value = volume;
  }

  resume() {
    void this.ctx?.resume();
  }
}

export const audioEngine = new AudioEngine();
