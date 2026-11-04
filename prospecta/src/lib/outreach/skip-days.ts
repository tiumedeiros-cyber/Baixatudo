import type { Repo } from "@/lib/repo/types";
import { syncQueueWithRules, type SyncQueueResult } from "./engine";
import { addDays, localParts, weekdayOf } from "./guardrails";

/**
 * "Dias sem envio": o dono segura um dia (folga, feriado, número em revisão) sem pausar a automação. Nenhuma prospecção sai nesse
 * dia; a fila aprovada é planejada de novo pelo mesmo caminho de quando se mudam as regras de envio (`syncQueueWithRules`),
 * em ordem, respeitando janelas, teto de cada número e intervalo. Ao tirar a marca, a fila volta a andar. As respostas do agente a
 * quem escreveu não são afetadas (diferente de pausar, que para tudo). A marca vale só de hoje em diante e some sozinha depois.
 */

export const MAX_SKIP_DATES = 60;

const WEEKDAY_SHORT = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** "hoje", "amanhã" ou "qua, 28/10". */
export function dayLabel(ymd: string, today: string): string {
  if (ymd === today) return "hoje";
  if (ymd === addDays(today, 1)) return "amanhã";
  const [, m, d] = ymd.split("-");
  return `${WEEKDAY_SHORT[weekdayOf(ymd) - 1]}, ${d}/${m}`;
}

/** "amanhã (qua, 28/10)" para o botão; "qua, 28/10" quando não é hoje nem amanhã. */
export function dayLabelLong(ymd: string, today: string): string {
  const [, m, d] = ymd.split("-");
  const base = `${WEEKDAY_SHORT[weekdayOf(ymd) - 1]}, ${d}/${m}`;
  const short = dayLabel(ymd, today);
  return short === base ? base : `${short} (${base})`;
}

export type SkipDayResult =
  | { ok: true; changed: boolean; skipDates: string[]; sync: SyncQueueResult | null; weekdayAlreadyOff: boolean }
  | { ok: false; reason: string };

/** Marca (ou desmarca) um dia como sem envio e reorganiza a fila. Não envia nada. */
export async function applySkipDay(repo: Repo, ymd: string, skip: boolean, now: Date, rng: () => number): Promise<SkipDayResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || addDays(ymd, 0) !== ymd) return { ok: false, reason: "Data inválida." };
  const cfg = (await repo.getSettings()).automation;
  const today = localParts(now, cfg.timezone).ymd;
  if (ymd < today) return { ok: false, reason: "Esse dia já passou." };

  // só importa de hoje em diante: o que passou sai da lista
  const current = cfg.skipDates.filter((d) => d >= today);
  const next = skip ? [...new Set([...current, ymd])].sort() : current.filter((d) => d !== ymd);
  if (next.length > MAX_SKIP_DATES) return { ok: false, reason: `No máximo ${MAX_SKIP_DATES} dias sem envio de uma vez.` };

  const weekdayAlreadyOff = skip && !cfg.weekdays.includes(weekdayOf(ymd));
  if (JSON.stringify(next) === JSON.stringify(cfg.skipDates)) {
    return { ok: true, changed: false, skipDates: next, sync: null, weekdayAlreadyOff };
  }
  // A fila só é mexida quando a marca a afeta: marcar um dia em que há fila, ou desmarcar um dia de envio quando há fila depois dele
  // (que pode voltar). Marcar um dia sem nada agendado não sorteia horários novos à toa. O worker é seguro de qualquer jeito: fora de
  // um dia de envio ele adia a abordagem sozinho.
  const queue = await queueDays(repo, now);
  const total = queue.days.reduce((n, d) => n + d.count, 0);
  const affected = skip
    ? queue.days.some((d) => d.ymd === ymd)
    : cfg.weekdays.includes(weekdayOf(ymd)) && queue.days.some((d) => d.ymd > ymd);

  const saved = await repo.saveAutomation({ skipDates: next });
  const date = ymd.split("-").reverse().join("/");
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: skip ? `dia sem envio marcado: ${date}` : `dia sem envio desmarcado: ${date}` } }]);
  if (!affected) {
    const idle: SyncQueueResult = { reorganized: false, queue: total, changed: true, outOfRules: false, rescheduled: 0, firstAt: null, lastAt: null };
    return { ok: true, changed: true, skipDates: next, sync: idle, weekdayAlreadyOff };
  }
  // a fila aprovada é planejada de novo com a regra nova (veja reschedule.ts)
  const sync = await syncQueueWithRules(repo, cfg, saved.automation, now, rng);
  return { ok: true, changed: true, skipDates: next, sync, weekdayAlreadyOff };
}

export interface QueueDay {
  ymd: string;
  count: number;
}

/** Em quais dias a fila aprovada de abordagens está marcada para sair (do primeiro para o último). */
export async function queueDays(repo: Repo, now: Date): Promise<{ days: QueueDay[]; today: string; skipDates: string[] }> {
  const cfg = (await repo.getSettings()).automation;
  const today = localParts(now, cfg.timezone).ymd;
  const approved = await repo.listMessages({ kinds: ["opening", "followup"], statuses: ["approved"], direction: "out", limit: 1000 });
  const perDay = new Map<string, number>();
  for (const m of approved) {
    if (!m.scheduledFor) continue;
    const ymd = localParts(new Date(m.scheduledFor), cfg.timezone).ymd;
    // o que está atrasado (dia que já passou) sai assim que o worker puder: conta como hoje
    const key = ymd < today ? today : ymd;
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const days = [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([ymd, count]) => ({ ymd, count }));
  return { days, today, skipDates: cfg.skipDates.filter((d) => d >= today) };
}
