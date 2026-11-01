'use client';

/**
 * caption-presets — templates de legenda animada (estilo CapCut / TikTok).
 *
 * Módulo isolado: só descreve os estilos e devolve um `Partial<TextProps>`
 * pronto para qualquer clipe de texto. O desenho fica no render
 * (`components/studio/render.ts`: karaoke / popup / banner).
 */

import type { Clip, TextProps, WordTiming } from '@/lib/types';

export type CaptionTemplateId = 'karaoke' | 'popup' | 'banner';

export type CaptionTemplate = {
  id: CaptionTemplateId;
  name: string;
  hint: string;
  /** prévia em CSS (a mesma ideia do canvas) */
  previewClass: string;
  text: Partial<TextProps>;
};

export const CAPTION_TEMPLATES: CaptionTemplate[] = [
  {
    id: 'karaoke',
    name: 'Karaokê',
    hint: 'a palavra acende no ritmo da fala',
    previewClass: 'bg-black/70 text-white [word-spacing:2px]',
    text: {
      animation: 'karaoke',
      color: '#f8fafc',
      highlight: '#facc15',
      stroke: 6,
      strokeColor: '#0b0d13',
      weight: 900,
      fontFamily: 'Montserrat',
      fontSize: 58,
      background: '',
      shadow: false,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
  },
  {
    id: 'popup',
    name: 'Pop-up Dinâmico',
    hint: 'cada palavra entra com impacto (TikTok)',
    previewClass: 'text-white font-black uppercase tracking-tight',
    text: {
      animation: 'popup',
      color: '#ffffff',
      stroke: 9,
      strokeColor: '#000000',
      weight: 900,
      fontFamily: 'Anton',
      fontSize: 74,
      background: '',
      wordBackground: '',
      shadow: false,
      lineHeight: 1.1,
      letterSpacing: 0.5,
    },
  },
  {
    id: 'banner',
    name: 'Impacto Banner',
    hint: 'faixa deslizante com destaque',
    previewClass: 'bg-yellow-400 text-black font-black uppercase',
    text: {
      animation: 'banner',
      color: '#ffffff',
      highlight: '#facc15',
      stroke: 0,
      strokeColor: '#000000',
      weight: 900,
      fontFamily: 'Bebas Neue',
      fontSize: 88,
      background: 'rgba(12,14,20,0.86)',
      shadow: false,
      lineHeight: 1.05,
      letterSpacing: 1.5,
    },
  },
];

export function findCaptionTemplate(id: CaptionTemplateId | string | null | undefined) {
  return CAPTION_TEMPLATES.find((item) => item.id === id);
}

/**
 * Gera os tempos por palavra a partir de um texto.
 * Se o Whisper/ditado já entregou tempos reais, `timings` manda.
 */
export function buildWordTimings(content: string, duration: number, timings?: WordTiming[]): WordTiming[] {
  const words = content.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (timings && timings.length === words.length) return timings;
  const total = words.reduce((acc, w) => acc + Math.max(1, w.length), 0) || 1;
  const safeDuration = Math.max(0.4, duration);
  let cursor = 0;
  return words.map((w) => {
    const span = (Math.max(1, w.length) / total) * safeDuration;
    const item: WordTiming = { w, s: cursor, e: cursor + span };
    cursor += span;
    return item;
  });
}

/** Aplica um template a um clipe de texto (não mexe em mais nada do clipe). */
export function applyCaptionTemplate(
  clip: Pick<Clip, 'text' | 'duration'>,
  id: CaptionTemplateId,
  timings?: WordTiming[],
): Partial<TextProps> {
  const template = findCaptionTemplate(id);
  if (!template || !clip.text) return {};
  const merged: TextProps = { ...clip.text, ...template.text } as TextProps;
  return {
    ...template.text,
    words: buildWordTimings(merged.content ?? '', clip.duration, timings),
  };
}
