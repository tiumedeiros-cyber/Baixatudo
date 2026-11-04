import { localParts } from "./guardrails";

/**
 * O cumprimento certo na hora do envio. A abertura é escrita (e aprovada) de madrugada e sai de manhã ou de tarde; "Bom dia"
 * numa mensagem das 15h denuncia texto pronto. Por isso, na hora de enviar, o "Bom dia" / "Boa tarde" / "Boa noite" que já
 * está no começo do texto é trocado pelo do horário local, e o texto guardado passa a ser o que saiu. O rascunho já nasce com o
 * cumprimento do horário em que foi escrito.
 */

export type DayPeriod = "bom dia" | "boa tarde" | "boa noite";

/** Até 11h59 é manhã; até 17h59, tarde; depois, noite. */
export function dayPeriod(now: Date, timeZone: string): DayPeriod {
  const hour = localParts(now, timeZone).hour;
  if (hour < 12) return "bom dia";
  if (hour < 18) return "boa tarde";
  return "boa noite";
}

/** Só olha o começo do texto (o cumprimento vem logo no início), sem tocar em "bom dia" no meio de uma frase. */
const HEAD = 48;
const TIME_GREETING = /\b(bom dia|boa tarde|boa noite)\b/i;

export function adaptGreeting(body: string, now: Date, timeZone: string): string {
  const head = body.slice(0, HEAD);
  const m = TIME_GREETING.exec(head);
  if (!m) return body;
  const right = dayPeriod(now, timeZone);
  if (m[1].toLowerCase() === right) return body;
  const word = m[1][0] === m[1][0].toUpperCase() ? `${right[0].toUpperCase()}${right.slice(1)}` : right;
  return `${body.slice(0, m.index)}${word}${body.slice(m.index + m[1].length)}`;
}
