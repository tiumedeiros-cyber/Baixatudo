import type { AutomationConfig } from "./config";
import { dailyCapFor, gapMs, isAllowedDay, localParts, nextOpening, zonedToUtc, addDays } from "./guardrails";

export interface PlanOptions {
  count: number;
  now: Date;
  cfg: AutomationConfig;
  rng: () => number;
  /** Abordagens que já saíram ou já estão marcadas para hoje. Contam contra o teto do dia. */
  usedToday: number;
}

/**
 * Distribui `count` abordagens em horários humanos: só dentro das janelas, só em dias úteis,
 * com intervalo aleatório entre elas e respeitando o teto diário da fase de aquecimento.
 * O que não couber hoje vai para o próximo dia permitido.
 */
export function planSchedule({ count, now, cfg, rng, usedToday }: PlanOptions): Date[] {
  const out: Date[] = [];
  if (count <= 0) return out;

  const used = new Map<string, number>([[localParts(now, cfg.timezone).ymd, usedToday]]);
  let cursor = nextOpening(new Date(now.getTime() + 60_000), cfg);
  let guard = count * 50 + 200;

  while (out.length < count && guard-- > 0) {
    // fora de janela (ou depois do fim dela): vai para a próxima abertura, com um respiro aleatório
    if (nextOpening(cursor, cfg).getTime() !== cursor.getTime()) {
      cursor = new Date(nextOpening(cursor, cfg).getTime() + Math.round(rng() * cfg.gapMinSec * 1000));
      continue;
    }

    const ymd = localParts(cursor, cfg.timezone).ymd;
    const done = used.get(ymd) ?? 0;
    if (!isAllowedDay(ymd, cfg) || done >= dailyCapFor(ymd, cfg)) {
      // dia cheio ou proibido: recomeça no primeiro horário do próximo dia
      const next = zonedToUtc(addDays(ymd, 1), 0, cfg.timezone);
      cursor = nextOpening(next, cfg);
      cursor = new Date(cursor.getTime() + Math.round(rng() * cfg.gapMinSec * 1000));
      continue;
    }

    out.push(cursor);
    used.set(ymd, done + 1);
    cursor = new Date(cursor.getTime() + gapMs(rng, cfg));
  }
  return out;
}
