import { isCustom } from "./discovery";
import type { AgentContext, AgentOutput } from "./types";

/**
 * O portfólio como prova antes de fechar. O dono escreve em Configurações a resposta "Exemplos e portfólio" (com o endereço).
 * Quando o agente passa o valor da oferta, ou avisa que vai analisar um sistema ou uma automação, ele junta, UMA vez por
 * conversa, o convite para ver os trabalhos antes de fechar: quem vê que o negócio é sério fecha com mais confiança. Quem PEDE
 * para ver o trabalho recebe só o portfólio (regra em `rules.ts`), sem pergunta nenhuma por cima.
 */

const URL = /https?:\/\/[^\s]+/i;

/** O primeiro endereço da resposta "Exemplos e portfólio" das Configurações, sem a pontuação do fim. */
export function portfolioUrl(text: string | null | undefined): string | null {
  const m = URL.exec(text ?? "");
  return m ? m[0].replace(/[.,;:!?)]+$/, "") : null;
}

const bare = (url: string) => url.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();

/** O endereço do portfólio já foi mandado nesta conversa (enviado ou na fila)? */
export function portfolioSent(messages: AgentContext["messages"], url: string): boolean {
  const key = bare(url);
  return messages.some((m) => m.direction === "out" && ["sent", "delivered", "read", "approved", "simulated"].includes(m.status) && m.body.toLowerCase().includes(key));
}

export const portfolioLine = (url: string) => `Se quiser, dá uma olhada nos meus trabalhos antes de fechar: ${url}`;

/**
 * Junta o convite a ver o portfólio à resposta que passa o valor (oferta, preço) ou que anuncia a análise de um sistema ou
 * automação. Só no fluxo "qualificar", só com o endereço cadastrado, só uma vez, e nunca depois de a proposta existir (a essa
 * altura a conversa é de fechar, não de convencer).
 */
export function attachPortfolio(ctx: AgentContext, out: AgentOutput): AgentOutput {
  if (!out.reply || ctx.facts.flow !== "qualificar") return out;
  const url = portfolioUrl(ctx.facts.policies.portfolio);
  if (!url || out.reply.toLowerCase().includes(bare(url)) || portfolioSent(ctx.messages, url)) return out;
  const proposalLive = !!ctx.proposal && ctx.proposal.status !== "cancelled" && ctx.proposal.status !== "draft";
  if (proposalLive) return out;
  const showsPrice = /R\$/.test(out.reply) && out.topic !== "payment";
  const announcesAnalysis = out.queued === true && isCustom(ctx.ficha.product);
  if (!showsPrice && !announcesAnalysis) return out;
  return {
    ...out,
    reply: `${out.reply}\n\n${portfolioLine(url)}`,
    notes: [...out.notes, "Juntei o link do portfólio para o lead ver o seu trabalho antes de fechar."],
  };
}
