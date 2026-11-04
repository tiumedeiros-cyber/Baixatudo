import { norm } from "@/lib/utils";

/**
 * Quando o negócio atende. A resposta automática costuma dizer ("atendimento de segunda à sexta-feira, das 08h às 19h, e aos sábados
 * das 08h às 12h"). Quem só recebeu o robô ganha uma segunda tentativa no dia seguinte, mas só em dia em que o negócio atende: mandar
 * no domingo para uma clínica que fecha no sábado é falar com o robô de novo.
 */

const DAY_INDEX: Record<string, number> = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };
const DAY = "(seg\\w*|ter\\w*|qua\\w*|qui\\w*|sex\\w*|sab\\w*|dom\\w*)";
const RANGE = new RegExp(`${DAY}(?:-?feira)?s?,?\\s*(?:a|ate)\\s*${DAY}(?:-?feira)?`, "g");
const ALL_DAYS = /\b(todos os dias|diariamente|todo dia|24 ?h(?:oras)?|sete dias)\b/;
const CLOSED_WORD = /\bfech\w+\b/;

const indexOf = (word: string): number | null => DAY_INDEX[word.slice(0, 3)] ?? null;

/**
 * Os dias da semana (0 = domingo … 6 = sábado) em que o texto diz que atende, ou nulo se não diz. "Segunda a sexta" e "aos sábados"
 * somam. Texto que fala de "fechado" não é lido: "fechamos aos domingos" não é horário de atendimento.
 */
export function openDays(text: string | null | undefined): Set<number> | null {
  const t = norm(text ?? "").replace(/[^a-z0-9\s,-]/g, " ").replace(/\s+/g, " ");
  if (!t) return null;
  if (ALL_DAYS.test(t)) return new Set([0, 1, 2, 3, 4, 5, 6]);
  const days = new Set<number>();
  for (const m of t.matchAll(RANGE)) {
    const from = indexOf(m[1]);
    const to = indexOf(m[2]);
    if (from === null || to === null) continue;
    for (let d = from; ; d = (d + 1) % 7) {
      days.add(d);
      if (d === to) break;
    }
  }
  // dia solto: "aos sábados", "e domingos"; fica de fora o que já entrou numa faixa e o texto de fechamento
  if (!CLOSED_WORD.test(t)) {
    for (const m of t.matchAll(/\b(?:aos|nos|no|ao|e|,)\s+(sabados?|domingos?)\b/g)) {
      const d = indexOf(m[1]);
      if (d !== null) days.add(d);
    }
    for (const m of t.matchAll(/\b(sabados?|domingos?)\s+(?:das?|de|ate|a partir|\d)/g)) {
      const d = indexOf(m[1]);
      if (d !== null) days.add(d);
    }
  }
  return days.size > 0 ? days : null;
}

/** Hoje é um dia em que o negócio atende? Sem horário conhecido, sim: vale o dia de qualquer jeito. */
export function opensOn(text: string | null | undefined, weekday: number): boolean {
  const days = openDays(text);
  return days === null || days.has(weekday);
}
