import type { ProposalPatch, ProposalStatus } from "./types";

/**
 * Para onde uma proposta pode ir. O dono marca cada passo na mão (Pix cai na conta dele, não no
 * painel). Depois que o sinal entrou, só avança para "paga": cancelar com dinheiro recebido some
 * com o caixa, então isso fica fora do painel (use as anotações para registrar um reembolso).
 */
const NEXT: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "entry_paid", "paid", "cancelled"],
  accepted: ["entry_paid", "paid", "cancelled"],
  entry_paid: ["paid"],
  paid: [],
  cancelled: ["draft"],
};

export function allowedNext(from: ProposalStatus): ProposalStatus[] {
  return NEXT[from];
}

export function canTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return NEXT[from].includes(to);
}

export const isPaymentStatus = (s: ProposalStatus) => s === "entry_paid" || s === "paid";

/**
 * Carimbos de data de cada passo. Pular um passo (ex.: ir direto de enviada para paga) preenche
 * os anteriores com a mesma data, para a linha do tempo nunca ficar com buraco.
 */
export function stampsFor(
  to: ProposalStatus,
  current: { sentAt: string | null; acceptedAt: string | null; entryPaidAt: string | null },
  nowIso: string,
): ProposalPatch {
  const patch: ProposalPatch = { status: to };
  if (to === "sent") patch.sentAt = nowIso;
  if (to === "accepted" || to === "entry_paid" || to === "paid") {
    patch.sentAt = current.sentAt ?? nowIso;
  }
  if (to === "accepted") patch.acceptedAt = nowIso;
  if (to === "entry_paid" || to === "paid") patch.acceptedAt = current.acceptedAt ?? nowIso;
  if (to === "entry_paid") patch.entryPaidAt = nowIso;
  if (to === "paid") patch.paidAt = nowIso;
  return patch;
}
