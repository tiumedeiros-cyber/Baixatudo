import type { AutomationConfig } from "./config";
import type { MessageCounts } from "./types";

/**
 * Regras que protegem o número: horário, teto diário com aquecimento, intervalos humanos
 * e parada automática. Tudo função pura, com relógio e aleatoriedade injetados (testável).
 */

export interface LocalParts {
  /** AAAA-MM-DD no fuso informado. */
  ymd: string;
  /** 1 = segunda … 7 = domingo. */
  weekday: number;
  hour: number;
  minute: number;
  /** Minutos desde 00:00 local. */
  minutes: number;
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function localParts(date: Date, timeZone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY[parts.weekday] ?? 1,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

export function parseHHMM(text: string): number {
  const [h, m] = text.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return js === 0 ? 7 : js;
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** O instante UTC em que o relógio local de `timeZone` marca `ymd` às `minutes`. */
export function zonedToUtc(ymd: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wanted = Date.UTC(y, m - 1, d, 0, 0) + minutes * 60_000;
  let guess = wanted;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(guess), timeZone);
    const [py, pm, pd] = p.ymd.split("-").map(Number);
    const got = Date.UTC(py, pm - 1, pd, p.hour, p.minute);
    const diff = wanted - got;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

function sortedWindows(cfg: AutomationConfig) {
  return cfg.windows
    .map((w) => ({ from: parseHHMM(w.from), to: parseHHMM(w.to) }))
    .filter((w) => w.to > w.from)
    .sort((a, b) => a.from - b.from);
}

/** Dia de envio: um dos dias da semana escolhidos e que o dono não marcou como "sem envio". */
export function isAllowedDay(ymd: string, cfg: AutomationConfig): boolean {
  return cfg.weekdays.includes(weekdayOf(ymd)) && !cfg.skipDates.includes(ymd);
}

export function inWindow(now: Date, cfg: AutomationConfig): boolean {
  const p = localParts(now, cfg.timezone);
  if (!cfg.weekdays.includes(p.weekday) || cfg.skipDates.includes(p.ymd)) return false;
  return sortedWindows(cfg).some((w) => p.minutes >= w.from && p.minutes < w.to);
}

/** O primeiro instante a partir de `from` em que o envio é permitido (pode ser o próprio `from`). */
export function nextOpening(from: Date, cfg: AutomationConfig): Date {
  if (inWindow(from, cfg)) return from;
  const windows = sortedWindows(cfg);
  if (windows.length === 0 || cfg.weekdays.length === 0) return from;
  const start = localParts(from, cfg.timezone);
  for (let offset = 0; offset < 15; offset++) {
    const ymd = addDays(start.ymd, offset);
    if (!isAllowedDay(ymd, cfg)) continue;
    for (const w of windows) {
      const at = zonedToUtc(ymd, w.from, cfg.timezone);
      if (at.getTime() > from.getTime()) return at;
    }
  }
  return from;
}

/**
 * Teto de abordagens novas para o dia `ymd`, conforme a semana de aquecimento. A rampa é opcional: semana 1 ou 2 em branco
 * usa o teto da próxima, e sem as duas só vale o teto normal.
 */
export function dailyCapFor(ymd: string, cfg: AutomationConfig): number {
  const { steady } = cfg.caps;
  const week2 = cfg.caps.week2 ?? steady;
  const week1 = cfg.caps.week1 ?? week2;
  if (!cfg.warmupStart) return week1;
  const days = daysBetween(cfg.warmupStart, ymd);
  if (days < 7) return week1;
  if (days < 14) return week2;
  return steady;
}

export function gapMs(rng: () => number, cfg: AutomationConfig): number {
  const min = cfg.gapMinSec * 1000;
  const max = Math.max(min, cfg.gapMaxSec * 1000);
  return Math.round(min + rng() * (max - min));
}

/** Tempo de "digitando…" proporcional ao tamanho da mensagem, com variação. */
export function typingMs(text: string, rng: () => number, cfg: AutomationConfig): number {
  const base = cfg.typingMinMs + text.length * 18;
  const jitter = 0.85 + rng() * 0.3;
  return Math.round(Math.min(cfg.typingMaxMs, Math.max(cfg.typingMinMs, base * jitter)));
}

export interface StopDecision {
  stop: boolean;
  reason?: string;
}

/** Pausa sozinho se muita gente foi abordada e quase ninguém respondeu (sinal de mensagem ruim ou de bloqueio). */
export function evaluateStop(counts: MessageCounts, cfg: AutomationConfig): StopDecision {
  if (counts.prospectingSent < cfg.stopMinSample) return { stop: false };
  const rate = counts.conversationsReplied / counts.prospectingSent;
  if (rate >= cfg.stopMinReplyRate) return { stop: false };
  const pct = (rate * 100).toFixed(1).replace(".", ",");
  return {
    stop: true,
    reason: `Só ${pct}% responderam depois de ${counts.prospectingSent} envios (mínimo ${(cfg.stopMinReplyRate * 100).toFixed(0)}%). Revise a mensagem antes de continuar.`,
  };
}

/** Início do dia local de `now`, em UTC (para contar o que já saiu hoje). */
export function startOfLocalDay(now: Date, cfg: AutomationConfig): Date {
  return zonedToUtc(localParts(now, cfg.timezone).ymd, 0, cfg.timezone);
}
