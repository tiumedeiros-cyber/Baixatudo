import type { Proposal } from "./types";

/** "R$ 1.234,50" a partir de centavos. Sem arredondar para inteiro: centavos aparecem quando existem. */
export function formatCents(cents: number): string {
  const hasCents = cents % 100 !== 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** Lê "800", "800,50", "1.200,00" ou "R$ 1.200" e devolve centavos. Nulo se não for um valor válido. */
export function parseMoneyToCents(input: string): number | null {
  if (input.includes("-")) return null;
  const cleaned = input.replace(/[^\d.,]/g, "").trim();
  if (!cleaned) return null;
  let normalized = cleaned;
  if (cleaned.includes(",")) normalized = cleaned.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, "");
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

/** Valor do sinal, arredondado para o centavo. */
export function entryCents(p: Pick<Proposal, "amountCents" | "entryPct">): number {
  return Math.round((p.amountCents * p.entryPct) / 100);
}

export function remainingCents(p: Pick<Proposal, "amountCents" | "entryPct">): number {
  return p.amountCents - entryCents(p);
}

/** Quanto já entrou no caixa por esta proposta. */
export function receivedCents(p: Pick<Proposal, "amountCents" | "entryPct" | "status">): number {
  if (p.status === "paid") return p.amountCents;
  if (p.status === "entry_paid") return entryCents(p);
  return 0;
}

/** Quanto ainda falta receber de uma proposta viva (enviada, aceita ou com sinal pago). */
export function outstandingCents(p: Pick<Proposal, "amountCents" | "entryPct" | "status">): number {
  if (p.status === "sent" || p.status === "accepted" || p.status === "entry_paid") {
    return p.amountCents - receivedCents(p);
  }
  return 0;
}
