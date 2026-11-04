/** DDDs válidos no Brasil. Qualquer outro prefixo invalida o número. */
const VALID_DDD = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export interface PhoneInfo {
  /** Formato internacional sem espaços, ex.: +5585991234567. Null se inválido. */
  e164: string | null;
  isMobile: boolean;
  ddd: string | null;
  /** Ex.: (85) 99123-4567 */
  display: string | null;
  /** Número antigo de 8 dígitos que ganhou o 9 na frente. */
  addedNinthDigit: boolean;
}

const INVALID: PhoneInfo = {
  e164: null,
  isMobile: false,
  ddd: null,
  display: null,
  addedNinthDigit: false,
};

/**
 * Normaliza telefone brasileiro vindo do Google Maps ou de planilha.
 * Aceita "(85) 99123-4567", "+55 85 99123-4567", "085991234567", "8533221100"…
 */
export function parsePhoneBR(raw: string | null | undefined): PhoneInfo {
  if (!raw) return INVALID;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return INVALID;

  if (d.startsWith("00")) d = d.slice(2);
  // Código do país só vale com 12 ou 13 dígitos; "55…" com 10/11 é o DDD 55 (RS).
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  // Prefixo de operadora/zero à esquerda: 085…
  if (d.startsWith("0") && (d.length === 11 || d.length === 12)) d = d.slice(1);

  let addedNinthDigit = false;
  // Celular antigo (DDD + 8 dígitos começando em 6–9): ganhou o 9 na frente.
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) {
    d = d.slice(0, 2) + "9" + d.slice(2);
    addedNinthDigit = true;
  }

  if (d.length !== 10 && d.length !== 11) return INVALID;
  const ddd = d.slice(0, 2);
  if (!VALID_DDD.has(ddd)) return INVALID;

  const subscriber = d.slice(2);
  const isMobile = subscriber.length === 9 && subscriber[0] === "9";
  if (subscriber.length === 9 && !isMobile) return INVALID;
  if (subscriber.length === 8 && !/^[2-5]/.test(subscriber)) return INVALID;

  const display =
    subscriber.length === 9
      ? `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
      : `(${ddd}) ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  return { e164: `+55${d}`, isMobile, ddd, display, addedNinthDigit };
}

/** Link de conversa manual no WhatsApp (só para o dono abrir na mão). */
export function waLink(e164: string | null, text?: string): string | null {
  if (!e164) return null;
  const digits = e164.replace(/\D/g, "");
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
