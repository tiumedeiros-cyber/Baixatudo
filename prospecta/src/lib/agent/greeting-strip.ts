/**
 * A conversa já começou com um cumprimento (a abertura) e o lead respondeu: quem responde "Oi!" ou "Bom dia!" de novo na mensagem
 * seguinte soa como texto pronto. Tira o cumprimento do começo da resposta e guarda só o nome de quem lê, se houver:
 * "Oi! Sou o Jonathan…" → "Sou o Jonathan…"; "Oi, Dra. Liane! Sou…" → "Dra. Liane, sou…"; "Bom dia, tudo bem!" não perde o "tudo bem".
 * Texto que só tem o cumprimento fica como está.
 */

const GREET = String.raw`(?:[Oo]i+|[Oo]l[áa]|[Oo]pa|[Bb]om dia|[Bb]oa tarde|[Bb]oa noite)`;
// cumprimento(s) + (vírgula + nome de quem lê, com título) + pontuação
const LEADING = new RegExp(String.raw`^\s*${GREET}(?:\s*,?\s*${GREET})*\s*(?:,\s*((?:Dr[a]?\.\s*)?\p{Lu}\p{L}+(?:\s\p{Lu}\p{L}+)?))?\s*[!.,]\s*`, "u");

export function dropRepeatedGreeting(text: string): string {
  const m = LEADING.exec(text);
  if (!m) return text;
  const rest = text.slice(m[0].length);
  if (rest.trim().length < 3) return text;
  const lower = (s: string) => `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
  const upper = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
  return m[1] ? `${m[1]}, ${lower(rest)}` : upper(rest);
}
