/**
 * Sincronia labial por visemas (padrão Oculus/Meta de 15 visemas).
 *
 * O problema do sistema antigo: a boca abria e fechava só pelo volume do áudio
 * (`mouth` era um número 0..1). Isso faz a boca "bater no compasso", mas não
 * forma as letras — não se vê a diferença entre "pá", "fi" e "u".
 *
 * Agora o texto de cada narração é convertido em fonemas de português e depois
 * nos 15 visemas, com a duração de cada sílaba distribuída dentro do tempo real
 * do áudio. O resultado é uma trilha `VisemeEvent[]` gravada no clip e usada no
 * render (prévia, timeline e exportação saem iguais).
 *
 * Recursos usados aqui (mesmos da literatura de animação facial):
 *   • regras de grafema → fonema para pt-BR (dígrafos, nasais, cê/ci, gu/qu…);
 *   • alinhador "naive" por peso silábico (não precisa de modelo treinado);
 *   • coarticulação de Cohen–Massaro: a boca nunca troca de forma de um quadro
 *     para o outro, ela mistura as formas vizinhas (~60 ms antes e depois);
 *   • a amplitude real do áudio (envelope) continua entrando como intensidade
 *     da mandíbula, então o volume e o formato se somam.
 */

export type VisemeId = 'sil' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS' | 'nn' | 'RR' | 'aa' | 'E' | 'I' | 'O' | 'U';

/** Um visema com início (s) e duração (s) absolutos dentro do clip. */
export type VisemeEvent = { t: number; d: number; v: VisemeId };

/** Forma da boca pronta para desenhar. Tudo normalizado em 0..1. */
export type MouthShape = {
  /** abertura vertical (mandíbula) */
  jaw: number;
  /** abertura horizontal (sorriso/largo) */
  wide: number;
  /** arredondamento dos lábios (u, o) */
  round: number;
  /** lábios pressionados (p, b, m) */
  press: number;
  /** dentes aparecendo */
  teeth: number;
  /** língua aparecendo (th, l, d, t) */
  tongue: number;
  /** canto da boca levantado (sorriso) */
  smile: number;
  /** visema dominante (para depuração/legenda) */
  viseme: VisemeId;
};

const SHAPES: Record<VisemeId, Omit<MouthShape, 'viseme'>> = {
  sil: { jaw: 0.04, wide: 0.5, round: 0.1, press: 0.35, teeth: 0, tongue: 0, smile: 0 },
  PP: { jaw: 0.02, wide: 0.44, round: 0.08, press: 1, teeth: 0, tongue: 0, smile: 0 },
  FF: { jaw: 0.13, wide: 0.56, round: 0.04, press: 0.3, teeth: 0.9, tongue: 0, smile: 0 },
  TH: { jaw: 0.22, wide: 0.5, round: 0.1, press: 0, teeth: 0.5, tongue: 0.65, smile: 0 },
  DD: { jaw: 0.2, wide: 0.55, round: 0.05, press: 0.05, teeth: 0.45, tongue: 0.35, smile: 0 },
  kk: { jaw: 0.27, wide: 0.5, round: 0.14, press: 0, teeth: 0.3, tongue: 0, smile: 0 },
  CH: { jaw: 0.2, wide: 0.34, round: 0.85, press: 0.12, teeth: 0.2, tongue: 0, smile: 0 },
  SS: { jaw: 0.09, wide: 0.82, round: 0.02, press: 0.15, teeth: 0.85, tongue: 0, smile: 0 },
  nn: { jaw: 0.09, wide: 0.46, round: 0.1, press: 0.4, teeth: 0.18, tongue: 0.2, smile: 0 },
  RR: { jaw: 0.17, wide: 0.46, round: 0.34, press: 0.05, teeth: 0.2, tongue: 0.15, smile: 0 },
  aa: { jaw: 0.95, wide: 0.6, round: 0.05, press: 0, teeth: 0.35, tongue: 0.12, smile: 0 },
  E: { jaw: 0.48, wide: 0.86, round: 0, press: 0, teeth: 0.45, tongue: 0.05, smile: 0.1 },
  I: { jaw: 0.26, wide: 1, round: 0, press: 0, teeth: 0.55, tongue: 0.05, smile: 0.15 },
  O: { jaw: 0.7, wide: 0.24, round: 0.92, press: 0, teeth: 0.2, tongue: 0, smile: 0 },
  U: { jaw: 0.36, wide: 0.14, round: 1, press: 0.12, teeth: 0.1, tongue: 0, smile: 0 },
};

export const VISEME_SHAPES = SHAPES;

/** Peso de cada visema (quanto tempo ele ocupa). Vogal dura mais que plosiva. */
const WEIGHT: Record<VisemeId, number> = {
  sil: 1,
  PP: 0.55,
  FF: 0.85,
  TH: 0.7,
  DD: 0.6,
  kk: 0.65,
  CH: 0.8,
  SS: 0.95,
  nn: 0.65,
  RR: 0.7,
  aa: 1.5,
  E: 1.4,
  I: 1.25,
  O: 1.4,
  U: 1.2,
};

/* -------------------------------------------------------------------------- */
/*                        grafema → visema (português)                        */
/* -------------------------------------------------------------------------- */

const VOWEL: Record<string, VisemeId> = {
  a: 'aa', á: 'aa', à: 'aa', â: 'aa', ã: 'aa', ä: 'aa',
  e: 'E', é: 'E', è: 'E', ê: 'E', ë: 'E',
  i: 'I', í: 'I', ì: 'I', î: 'I', ï: 'I', y: 'I', ý: 'I',
  o: 'O', ó: 'O', ò: 'O', ô: 'O', õ: 'O', ö: 'O',
  u: 'U', ú: 'U', ù: 'U', û: 'U', ü: 'U', w: 'U',
};

const NASAL = new Set(['ã', 'õ', 'ẽ', 'ĩ', 'ũ']);

const isVowelChar = (c: string) => Boolean(VOWEL[c]);
const isNasalChar = (c: string) => NASAL.has(c);
const isWordChar = (c: string) => /[a-záàâãäéèêëíìîïóòôõöúùûüçñ']/.test(c);

/**
 * Converte uma palavra em visemas. Regras pensadas no português do Brasil:
 * dígrafos (ch, lh, nh, rr, ss, qu, gu, sc, xc), c/g brandos, ç, x,
 * "m"/"n" no fim da sílaba (nasaliza a vogal) e as reduções de vogal final
 * ("leite" → "leiti", "gato" → "gatu"), que é como o TTS brasileiro fala.
 */
export function wordVisemes(rawWord: string): VisemeId[] {
  const w = rawWord
    .toLowerCase()
    .replace(/[^a-záàâãäéèêëíìîïóòôõöúùûüçñ']/g, '')
    .trim();
  if (!w) return [];
  const out: VisemeId[] = [];
  const n = w.length;
  let i = 0;

  const vowelAt = (idx: number) => (idx >= 0 && idx < n ? VOWEL[w[idx]] : undefined);

  while (i < n) {
    const c = w[i];
    const next = w[i + 1] ?? '';
    const next2 = w[i + 2] ?? '';

    // vogal (com nasalização)
    if (isVowelChar(c)) {
      const v = VOWEL[c];
      out.push(v);
      if (isNasalChar(c)) out.push('nn');
      // "am", "an", "em", "en", "õe" no fim de sílaba → ressonância nasal
      if ((next === 'm' || next === 'n') && !isVowelChar(next2)) {
        out.push('nn');
        i += 2;
        continue;
      }
      i += 1;
      continue;
    }

    // dígrafos
    const pair = c + next;
    if (pair === 'ch') { out.push('CH'); i += 2; continue; }
    if (pair === 'lh') { out.push('DD'); i += 2; continue; }
    if (pair === 'nh') { out.push('nn'); i += 2; continue; }
    if (pair === 'rr') { out.push('RR'); i += 2; continue; }
    if (pair === 'ss') { out.push('SS'); i += 2; continue; }
    if (pair === 'sc' || pair === 'xc') { out.push('SS'); i += 2; continue; }
    if (pair === 'ph') { out.push('FF'); i += 2; continue; }
    if (pair === 'qu') {
      out.push('kk');
      // "qu" + e/i = só o k ("quero" → kero)
      i += isVowelChar(next2) ? 2 : 1;
      continue;
    }
    if (pair === 'gu' && (next2 === 'e' || next2 === 'i')) { out.push('kk'); i += 2; continue; }
    if (pair === 'ou' || pair === 'ai' || pair === 'ei' || pair === 'oi') {
      // ditongos: vogal + semivogal, rápido
      out.push(VOWEL[c]);
      out.push(VOWEL[next]);
      i += 2;
      continue;
    }

    switch (c) {
      case 'b':
      case 'p':
      case 'm':
        out.push('PP');
        i += 1;
        continue;
      case 'f':
      case 'v':
        out.push('FF');
        i += 1;
        continue;
      case 't':
      case 'd':
        out.push('DD');
        i += 1;
        continue;
      case 'l':
        out.push('DD');
        i += 1;
        continue;
      case 'n':
        out.push('nn');
        i += 1;
        continue;
      case 'r':
        out.push('RR');
        i += 1;
        continue;
      case 's':
        out.push('SS');
        i += 1;
        continue;
      case 'z':
        out.push('SS');
        i += 1;
        continue;
      case 'c':
        out.push(next === 'e' || next === 'i' || next === 'é' || next === 'ê' || next === 'í' ? 'SS' : 'kk');
        i += 1;
        continue;
      case 'ç':
        out.push('SS');
        i += 1;
        continue;
      case 'g':
        out.push(next === 'e' || next === 'i' || next === 'é' || next === 'ê' || next === 'í' ? 'CH' : 'kk');
        i += 1;
        continue;
      case 'j':
        out.push('CH');
        i += 1;
        continue;
      case 'x':
        // "x" no começo soa /ʃ/ (chocolate não, xícara sim); no meio, /s/ ou /ks/
        out.push(i === 0 ? 'CH' : 'SS');
        if (i > 0 && isVowelChar(next)) out.push('kk');
        i += 1;
        continue;
      case 'k':
        out.push('kk');
        i += 1;
        continue;
      case 'q':
        out.push('kk');
        i += 1;
        continue;
      case 'h':
        i += 1; // mudo
        continue;
      case 'ñ':
        out.push('nn');
        out.push('I');
        i += 1;
        continue;
      default:
        i += 1;
        continue;
    }
  }

  // vogal final átona do pt-BR: "leite"→"leiti", "gato"→"gatu"
  const last = out[out.length - 1];
  if (out.length > 1) {
    if (last === 'E') out[out.length - 1] = 'I';
    else if (last === 'O') out[out.length - 1] = 'U';
  }
  return out;
}

type Timed = { v: VisemeId; weight: number };

/** Texto → lista de visemas com peso, incluindo pausas de pontuação. */
export function textVisemes(text: string): Timed[] {
  const out: Timed[] = [];
  const tokens = String(text || '').match(/[\p{L}\p{M}']+|[.,;:!?…]+|\s+/gu) ?? [];
  for (const token of tokens) {
    if (/^[.,;:!?…]+$/.test(token)) {
      const long = /[.!?…]/.test(token);
      out.push({ v: 'sil', weight: long ? 4.2 : 2.2 });
      continue;
    }
    if (/^\s+$/.test(token)) {
      // espaço entre palavras: pausa curta (não corta a coarticulação)
      if (out.length && out[out.length - 1].v !== 'sil') out.push({ v: 'sil', weight: 0.5 });
      continue;
    }
    const visemes = wordVisemes(token);
    visemes.forEach((v, idx) => {
      // leve aceleração no meio da palavra: fala natural não é metronômica
      const accent = idx === 0 ? 1.08 : idx === visemes.length - 1 ? 0.92 : 1;
      out.push({ v, weight: WEIGHT[v] * accent });
    });
    // pequeno repouso no fim da palavra (articulação)
    if (visemes.length) out.push({ v: 'sil', weight: 0.28 });
  }
  return out;
}

/**
 * Monta a trilha de visemas de uma narração.
 * `segments` traz, para cada trecho, o texto e a duração real do áudio gerado.
 */
export function buildVisemeTrack(
  segments: { text: string; duration: number; start?: number }[],
  opts: { max?: number } = {},
): VisemeEvent[] {
  const max = opts.max ?? 4000;
  const track: VisemeEvent[] = [];
  let cursor = 0;

  for (const segment of segments) {
    const duration = Number(segment.duration);
    const start = Number.isFinite(segment.start) ? Number(segment.start) : cursor;
    cursor = start + Math.max(0, duration);
    if (!(duration > 0.05)) continue;
    const timed = textVisemes(segment.text || '');
    if (!timed.length) continue;

    const totalWeight = timed.reduce((acc, t) => acc + t.weight, 0) || 1;
    // 2% de respiro no começo e 4% no fim (o TTS sempre deixa silêncio)
    const lead = duration * 0.02;
    const body = duration - lead - duration * 0.04;
    const scale = body / totalWeight;
    let t = start + lead;

    for (const item of timed) {
      const d = Math.max(0.02, item.weight * scale);
      const last = track[track.length - 1];
      if (last && last.v === item.v && Math.abs(last.t + last.d - t) < 0.03) {
        last.d += d; // funde repetições (boca não pisca em "aaa")
      } else {
        track.push({ t: Number(t.toFixed(4)), d: Number(d.toFixed(4)), v: item.v });
      }
      t += d;
      if (track.length >= max) return track;
    }
  }
  return track;
}

/* -------------------------------------------------------------------------- */
/*                             leitura da trilha                              */
/* -------------------------------------------------------------------------- */

const BLEND = 0.055; // ±55 ms de coarticulação

/**
 * Forma da boca no instante `time` (segundos). Mistura os visemas vizinhos com
 * peso pela sobreposição, o que gera transições suaves (Cohen–Massaro).
 */
export function shapeAt(track: VisemeEvent[] | undefined | null, time: number): MouthShape {
  const fallback: MouthShape = { ...SHAPES.sil, viseme: 'sil' };
  if (!track || !track.length) return fallback;

  // busca binária do primeiro evento que termina depois de time - BLEND
  const from = time - BLEND;
  const to = time + BLEND;
  let lo = 0;
  let hi = track.length - 1;
  let startIdx = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const e = track[mid];
    if (e.t + e.d < from) lo = mid + 1;
    else {
      startIdx = mid;
      hi = mid - 1;
    }
  }

  let jaw = 0;
  let wide = 0;
  let round = 0;
  let press = 0;
  let teeth = 0;
  let tongue = 0;
  let smile = 0;
  let sum = 0;
  let best = 0;
  let bestV: VisemeId = 'sil';

  for (let i = startIdx; i < track.length; i++) {
    const e = track[i];
    if (e.t > to) break;
    const overlap = Math.min(e.t + e.d, to) - Math.max(e.t, from);
    if (overlap <= 0) continue;
    // visema "atual" tem prioridade sobre o vizinho (peso decrescente)
    const center = e.t + e.d / 2;
    const near = 1 - Math.min(1, Math.abs(center - time) / (e.d / 2 + BLEND));
    const w = overlap * (0.55 + 0.45 * near);
    const s = SHAPES[e.v];
    jaw += s.jaw * w;
    wide += s.wide * w;
    round += s.round * w;
    press += s.press * w;
    teeth += s.teeth * w;
    tongue += s.tongue * w;
    smile += s.smile * w;
    sum += w;
    if (w > best) {
      best = w;
      bestV = e.v;
    }
  }

  if (sum <= 0) return shapeAt(track, time + BLEND * 0.5);
  return {
    jaw: jaw / sum,
    wide: wide / sum,
    round: round / sum,
    press: press / sum,
    teeth: teeth / sum,
    tongue: tongue / sum,
    smile: smile / sum,
    viseme: bestV,
  };
}

/** Forma derivada só do volume (usada quando o clip não tem texto/visemas). */
export function shapeFromAmplitude(amp: number): MouthShape {
  const a = Math.max(0, Math.min(1, amp));
  return {
    jaw: 0.03 + a * 0.75,
    wide: 0.55 + a * 0.1,
    round: 0.12,
    press: Math.max(0, 0.4 - a),
    teeth: a * 0.35,
    tongue: 0,
    smile: 0,
    viseme: a > 0.12 ? 'aa' : 'sil',
  };
}

/**
 * Junta as duas fontes: o visema define o formato; o envelope define a força.
 * Assim a boca respeita a letra da palavra E o volume real da voz.
 */
export function blendWithAmplitude(shape: MouthShape, amp?: number | null): MouthShape {
  if (amp === null || amp === undefined || !Number.isFinite(amp)) return shape;
  const a = Math.max(0, Math.min(1, Number(amp)));
  if (shape.viseme === 'sil' && a < 0.06) return { ...shape, jaw: Math.min(shape.jaw, 0.05) };
  const strength = 0.62 + 0.38 * a;
  return {
    ...shape,
    jaw: Math.min(1, shape.jaw * strength),
    teeth: shape.teeth * (0.7 + 0.3 * a),
    press: shape.press * (1 - 0.25 * a),
  };
}

/** Quantos visemas diferentes a fala realmente usa (indicador de qualidade). */
export function visemeStats(track: VisemeEvent[]) {
  const counts: Partial<Record<VisemeId, number>> = {};
  let duration = 0;
  for (const e of track) {
    counts[e.v] = (counts[e.v] ?? 0) + e.d;
    duration += e.d;
  }
  return { total: Number(duration.toFixed(2)), distinct: Object.keys(counts).length, counts };
}
