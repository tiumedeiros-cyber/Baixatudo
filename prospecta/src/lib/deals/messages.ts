import { shortName } from "@/lib/outreach/templates";
import { entryCents, formatCents, remainingCents } from "./money";
import type { Proposal } from "./types";

export interface PixInfo {
  key: string;
  holder: string;
}

/** Mensagem que leva o link da prévia. Vira rascunho: o dono lê e aprova antes de sair. */
export function demoLinkMessage(opts: { leadName: string; url: string }): string {
  const nome = shortName(opts.leadName);
  return `Pronto! Montei uma prévia do site da ${nome}: ${opts.url}\nOs textos e os serviços são exemplos, só para você visualizar. O que mudaria?`;
}

/**
 * Mensagem com o valor e como pagar. Sem chave Pix cadastrada ela não inventa nada: avisa que
 * a chave vem depois da confirmação.
 */
export function proposalMessage(
  p: Pick<Proposal, "title" | "amountCents" | "entryPct" | "deliveryDays">,
  opts: { leadName: string; pix: PixInfo | null },
): string {
  // "o seu site", não "o site da {nome do Google}": quem fecha pode estar falando de outro negócio ou de uma marca nova
  const total = formatCents(p.amountCents);
  const head = `O seu site fica em ${total}, com entrega em até ${p.deliveryDays} dias depois de começarmos.`;
  const pixText = opts.pix
    ? `por Pix, chave ${opts.pix.key}${opts.pix.holder ? ` (${opts.pix.holder})` : ""}`
    : "por Pix (te passo a chave assim que você confirmar)";

  if (p.entryPct <= 0) {
    return `${head} O pagamento de ${total} é só na entrega. Pode ser?`;
  }
  if (p.entryPct >= 100) {
    return `${head} O pagamento é à vista, ${pixText}. Pode ser?`;
  }
  const entry = formatCents(entryCents(p));
  const rest = formatCents(remainingCents(p));
  return `${head} O sinal é de ${entry} (${p.entryPct}%), ${pixText}, e o restante, ${rest}, na entrega. Pode ser?`;
}
