/** Datas da conversa: agrupar as mensagens por dia e dar a cada dia um rótulo curto ("Hoje", "Ontem", "seg, 26/10"). */

function parts(iso: string | number | Date, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const formatted = new Intl.DateTimeFormat("pt-BR", { timeZone, hourCycle: "h23", ...options }).formatToParts(new Date(iso));
  return Object.fromEntries(formatted.map((p) => [p.type, p.value]));
}

/** O dia da mensagem no fuso do painel, como "2026-10-26". Serve de chave para agrupar. */
export function dayKey(iso: string | number | Date, timeZone: string): string {
  const p = parts(iso, timeZone, { year: "numeric", month: "2-digit", day: "2-digit" });
  return `${p.year}-${p.month}-${p.day}`;
}

/** A hora da mensagem no fuso do painel, como "08:43". */
export function clock(iso: string | number | Date, timeZone: string): string {
  const p = parts(iso, timeZone, { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Hoje", "Ontem" ou "seg, 26/10" para o dia `key`, olhando de `now`. */
export function dayLabel(key: string, now: Date, timeZone: string): string {
  if (key === dayKey(now, timeZone)) return "Hoje";
  if (key === dayKey(now.getTime() - DAY_MS, timeZone)) return "Ontem";
  // o meio-dia em UTC cai no mesmo dia civil em qualquer fuso razoável
  const p = parts(`${key}T12:00:00Z`, "UTC", { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${p.weekday.replace(".", "")}, ${p.day}/${p.month}`;
}

export interface DayGroup<T> {
  key: string;
  label: string;
  items: T[];
}

/** Agrupa por dia, mantendo a ordem de entrada (a lista já vem do mais antigo para o mais novo). */
export function groupByDay<T>(items: T[], whenOf: (item: T) => string, timeZone: string, now: Date): DayGroup<T>[] {
  const groups: DayGroup<T>[] = [];
  for (const item of items) {
    const key = dayKey(whenOf(item), timeZone);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: dayLabel(key, now, timeZone), items: [item] });
  }
  return groups;
}
