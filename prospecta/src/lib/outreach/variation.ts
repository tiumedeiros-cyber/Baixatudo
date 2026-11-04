import { norm } from "@/lib/utils";
import { parseOpeningVariant } from "./metrics";
import { isShortVariant, parseStyleCode, STYLE_SIZES, STYLE_SIZES_SHORT, type OpeningMode, type OpeningStyle } from "./style";
import { ANGLES, availableShortAngles, buildOpening, openingGroup, type TemplateContext, type TemplateLead } from "./templates";

/**
 * Variação das aberturas. O WhatsApp derruba conta que manda o mesmo texto, com a mesma apresentação, para muita gente
 * que não a conhece. Por isso cada abertura escolhe uma combinação de saudação, apresentação, pergunta final e ângulo que
 * foi usada FAZ MAIS TEMPO (a menos usada ganha, com sorteio entre as mais antigas), olhando as aberturas recentes de TODOS
 * os números. Depois confere a semelhança do texto pronto com as últimas: se for parecido demais, tenta outra combinação.
 * Nada aqui envia nem escreve em banco: só escolhe.
 */

/** O que já saiu de cada peça, da mais antiga para a mais recente. */
export interface StyleHistory {
  greet: number[];
  intro: number[];
  ask: number[];
  role: number[];
  angle: string[];
}

export function emptyHistory(): StyleHistory {
  return { greet: [], intro: [], ask: [], role: [], angle: [] };
}

/**
 * Monta o histórico a partir das variantes das aberturas recentes, da mais antiga para a mais recente. Com `mode`, só entram as
 * aberturas do mesmo modo: o "número da saudação" da curta e o da completa não são a mesma tabela.
 */
export function historyFrom(variants: (string | null | undefined)[], mode?: OpeningMode): StyleHistory {
  const h = emptyHistory();
  for (const variant of variants) {
    const parsed = parseOpeningVariant(variant);
    if (!parsed) continue;
    if (mode && isShortVariant(variant) !== (mode === "curta")) continue;
    if (!/^\d+$/.test(parsed.angle)) h.angle.push(parsed.angle);
    const style = parseStyleCode(variant);
    if (!style) continue;
    h.greet.push(style.greet);
    h.intro.push(style.intro);
    h.ask.push(style.ask);
    if (style.role !== undefined) h.role.push(style.role);
  }
  return h;
}

/**
 * Escolhe, entre `size` opções, uma das usadas há mais tempo (as nunca usadas vêm primeiro). O sorteio entre a metade mais
 * antiga evita uma sequência fixa que um padrão de envio poderia revelar.
 */
export function lruPick(size: number, used: number[], rng: () => number): number {
  const order = lruOrder(size, used);
  const pool = order.slice(0, Math.max(1, Math.ceil(size / 2)));
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** As opções da mais antiga (ou nunca usada) para a usada mais recentemente. */
export function lruOrder(size: number, used: number[]): number[] {
  const last = new Array<number>(size).fill(-1);
  used.forEach((u, position) => {
    if (u >= 0 && u < size) last[u] = position;
  });
  return [...last.keys()].sort((a, b) => last[a] - last[b] || a - b);
}

/** Palavras do texto sem acento nem número: a "impressão digital" para comparar duas aberturas. */
function words(text: string): string[] {
  return norm(text)
    .replace(/\d+/g, " ")
    .split(/[^a-z]+/)
    .filter(Boolean);
}

function shingles(text: string): Set<string> {
  const w = words(text);
  const set = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) set.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return set;
}

/** De 0 (nada em comum) a 1 (o mesmo texto): trechos de três palavras em comum sobre o total de trechos dos dois. */
export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let both = 0;
  for (const x of sa) if (sb.has(x)) both++;
  return both / (sa.size + sb.size - both);
}

/** Parecido demais com uma das recentes: o WhatsApp tende a ver como o mesmo texto. */
export const MAX_SIMILARITY = 0.6;
const TRIES = 8;

export interface StyleChoice {
  style: OpeningStyle;
  /** O texto-modelo que esse estilo gera (serve de base para a IA e de plano B). */
  body: string;
  /** Quão parecido com a mais parecida das recentes (0 a 1). */
  similarity: number;
}

/**
 * Escolhe o estilo de UMA abertura. `history` e `recentBodies` são das aberturas recentes (qualquer número); quem chama os
 * atualiza com `remember` a cada abertura escolhida, para a próxima do mesmo lote já enxergar esta. Fora do fluxo
 * "qualificar" (o antigo, sem essas peças) devolve nulo.
 */
export function chooseOpeningStyle(args: {
  lead: TemplateLead;
  ctx: TemplateContext;
  history: StyleHistory;
  recentBodies: string[];
  rng: () => number;
}): StyleChoice | null {
  const { lead, ctx, history, recentBodies, rng } = args;
  if (ctx.flow !== "qualificar") return null;
  const short = ctx.mode === "curta";
  const angleIds = (short ? availableShortAngles(lead) : ANGLES[openingGroup(lead.websiteKind)]).map((a) => a.id);
  const angleUsed = history.angle.map((a) => angleIds.indexOf(a));
  const angleOrder = lruOrder(angleIds.length, angleUsed);
  // a abertura curta tem as suas tabelas (saudação, apresentação e jeito de perguntar) e não tem "o que faz"
  const sizes = short ? STYLE_SIZES_SHORT : STYLE_SIZES;

  let best: StyleChoice | null = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    // A primeira tentativa segue a regra do "usado há mais tempo". Se o texto sair parecido demais com um recente, as seguintes
    // passam pelos outros ângulos (o que mais separa dois textos), do menos ao mais recente, e sorteiam o resto.
    const free = attempt > 0;
    const style: OpeningStyle = {
      greet: free ? Math.floor(rng() * sizes.greet) : lruPick(sizes.greet, history.greet, rng),
      intro: free ? Math.floor(rng() * sizes.intro) : lruPick(sizes.intro, history.intro, rng),
      ask: free ? Math.floor(rng() * sizes.ask) : lruPick(sizes.ask, history.ask, rng),
      ...(short ? {} : { role: free ? Math.floor(rng() * STYLE_SIZES.role) : lruPick(STYLE_SIZES.role, history.role, rng) }),
      angle: angleIds[free ? angleOrder[attempt % angleOrder.length] : lruPick(angleIds.length, angleUsed, rng)],
    };
    const body = buildOpening(lead, { ...ctx, style }).body;
    const worst = recentBodies.reduce((m, r) => Math.max(m, similarity(body, r)), 0);
    if (!best || worst < best.similarity) best = { style, body, similarity: worst };
    if (worst < MAX_SIMILARITY) break;
  }
  return best;
}

/** Registra a abertura escolhida no histórico (para a próxima do lote). */
export function remember(history: StyleHistory, recentBodies: string[], choice: StyleChoice, finalBody: string): void {
  history.greet.push(choice.style.greet);
  history.intro.push(choice.style.intro);
  history.ask.push(choice.style.ask);
  if (choice.style.role !== undefined) history.role.push(choice.style.role);
  if (choice.style.angle) history.angle.push(choice.style.angle);
  recentBodies.push(finalBody);
}
