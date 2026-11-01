'use client';

/**
 * Calcula o envelope de volume do áudio (0..1 a cada 50 ms).
 * É o que faz a boca do avatar abrir e fechar junto com a narração.
 */
/** Resolução do envelope (20 ms = 50 quadros por segundo: boca acompanha a fala). */
export const ENVELOPE_STEP = 0.02;

export async function computeEnvelope(urls: string[], step = ENVELOPE_STEP): Promise<number[]> {
  if (typeof window === 'undefined') return [];
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return [];
  const ctx = new AudioCtx();
  const out: number[] = [];
  try {
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buffer = await res.arrayBuffer();
      const audio = await ctx.decodeAudioData(buffer.slice(0));
      const data = audio.getChannelData(0);
      const per = Math.max(1, Math.floor(audio.sampleRate * step));
      const frames = Math.floor(data.length / per);
      const raw: number[] = [];
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        const start = i * per;
        for (let j = 0; j < per; j += 4) {
          const v = data[start + j];
          sum += v * v;
        }
        raw.push(Math.sqrt(sum / (per / 4)));
      }
      // normaliza pelo pico para a boca usar toda a faixa 0..1
      const peak = raw.reduce((a, b) => Math.max(a, b), 0.0001);
      // curva com ataque rápido: sílaba fraca abre pouco, sílaba forte abre quase tudo
      raw.forEach((v) => out.push(Math.min(1, Math.pow(v / peak, 0.55))));
    }
  } catch {
    /* sem WebAudio: o avatar anima sozinho */
  } finally {
    void ctx.close().catch(() => undefined);
  }
  return out;
}
