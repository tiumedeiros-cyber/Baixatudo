import type { AutomationConfig } from "@/lib/outreach/config";
import type { Message } from "@/lib/outreach/types";
import { guardReply } from "./guard";
import { parseAgentVariant } from "./variant";
import type { AgentContext, AgentOutput, Topic } from "./types";

/**
 * Nível 3 (semi-automático): quando o agente pode mandar a resposta SOZINHO, sem esperar o "Aprovar".
 *
 * A regra é uma lista curta e explícita. Entra o que só usa fatos que o dono cadastrou (quem é, como funciona,
 * prazo, o valor do site simples, política de pagamento) e o que é só conversa (cumprimento, "vou pensar", "agora
 * não", pergunta de descoberta). Fica sempre com o dono: agressão, áudio e imagem, garantia, contrato, domínio e
 * mensalidade, pedido de exemplos, ajuste na prévia, achou caro, e qualquer assunto fora do roteiro.
 * Dinheiro (oferta de fechamento, sinal, Pix) só com \`autoClose\` ligado.
 *
 * PARE, janela de horário, tetos de abordagem e pausa geral continuam no motor de envio e não passam por aqui.
 */

export const AUTO_TOPICS: readonly Topic[] = [
  "greeting",
  "thanks",
  "who",
  "source_of_contact",
  "status_check",
  "how_works",
  "timeline",
  "price",
  "payment",
  "yes",
  "answer",
  "think",
  "busy",
  "not_now",
  "not_interested",
  "has_provider",
  "no_need_site",
  "has_site",
  "gatekeeper",
  "compliment",
  "wants_site",
  // pede por escrito o que o agente não consegue ler; o dono continua avisado (ficha)
  "audio",
  "media",
];

/** Só saem sozinhos quando o dono escreveu a resposta dele em Configurações (`out.authorized`). */
export const AUTHORIZABLE_TOPICS: readonly Topic[] = ["guarantee", "domain_hosting", "payment", "send_info", "too_expensive"];

/** O quadro "Confira" do rascunho não impede estes: o aviso é para o dono, a resposta em si é segura. */
const IGNORE_HANDOFF: readonly Topic[] = ["price", "has_site", "audio", "media"];

/** Frase que o dono digita para ligar o atendimento sozinho (ou o fechamento sozinho). Desligar é sempre um clique. */
export const AUTONOMY_CONFIRM = "ATENDER SOZINHO";

/** Mensagem longa do lead costuma ser reclamação, contrato ou texto colado: o dono lê. */
const MAX_INBOUND_CHARS = 600;

export interface AutoInput {
  cfg: Pick<AutomationConfig, "autonomy" | "autoClose" | "autoFreeform" | "autoMaxPerConversation" | "autoMaxPerDay" | "paused">;
  out: Pick<AgentOutput, "reply" | "topic" | "commits" | "handoff" | "missing" | "authorized" | "freeform" | "aiAskedHuman" | "queued" | "discovery">;
  humanTakenOver: boolean;
  blocked: boolean;
  inboundText: string | null;
  /** Respostas que o agente já mandou sozinho nesta conversa e hoje. */
  autoInConversation: number;
  autoToday: number;
}

export interface AutoDecision {
  auto: boolean;
  /** Por que NÃO foi sozinho (ou "ok"). Aparece para o dono. */
  reason: string;
  /** Saiu sozinho, mas o dono ainda precisa olhar (áudio, "vou confirmar e já te respondo"): a conversa segue em "Precisa de você". */
  notifyOwner?: boolean;
}

export function decideAuto(i: AutoInput): AutoDecision {
  const no = (reason: string): AutoDecision => ({ auto: false, reason });
  if (i.cfg.autonomy !== "semi") return no("modo assistido");
  if (!i.out.reply) return no("sem resposta para mandar");
  if (i.blocked) return no("número bloqueado");
  if (i.humanTakenOver) return no("você assumiu esta conversa");
  if (i.cfg.paused) return no("a automação está pausada");
  const listed = AUTO_TOPICS.includes(i.out.topic);
  const authorized = !!i.out.authorized && AUTHORIZABLE_TOPICS.includes(i.out.topic);
  const freeform = !!i.out.freeform;
  // entrega à fila do dono (prévia pedida, sistema para orçar): um aviso curto ao lead, e a conversa segue com o dono
  const queued = !!i.out.queued;
  // pergunta do roteiro de qualificação: sai sozinha e a conversa ainda não precisa do dono
  const discovery = !!i.out.discovery;
  if (freeform && !i.cfg.autoFreeform) return no("respostas livres da IA estão desligadas");
  if (!listed && !authorized && !freeform && !queued && !discovery) return no("assunto que só você responde: escreva a sua resposta em Configurações para o agente poder dar");
  if (i.out.missing === "pix_key") return no("falta a sua chave Pix em Configurações");
  if (i.out.commits && !i.cfg.autoClose) return no("envolve valor e Pix: o fechamento sozinho está desligado");
  if (i.out.handoff.needed && !IGNORE_HANDOFF.includes(i.out.topic) && !i.out.commits && !freeform && !authorized && !queued && !discovery) {
    return no(i.out.handoff.reason ?? "pede a sua conferência");
  }
  if ((i.inboundText ?? "").length > MAX_INBOUND_CHARS) return no("mensagem longa do lead");
  if (i.autoInConversation >= i.cfg.autoMaxPerConversation) return no(`já respondi ${i.autoInConversation} vezes sozinho nesta conversa`);
  if (i.autoToday >= i.cfg.autoMaxPerDay) return no(`teto de ${i.cfg.autoMaxPerDay} respostas sozinho por dia`);
  const notifyOwner = queued || (discovery ? false : freeform ? !!i.out.aiAskedHuman : i.out.handoff.needed && !i.out.commits && i.out.topic !== "price");
  return { auto: true, reason: "ok", notifyOwner };
}

/**
 * Última checagem antes de sair sozinho. As regras já passam nos testes; a resposta da IA já passou na trava.
 * Repetimos a trava de fatos em TODA resposta automática, inclusive a das regras: é o que impede um erro de
 * configuração (preço ou prazo trocados) de sair para um cliente sem ninguém olhar.
 */
export function finalCheck(
  reply: string,
  ctx: Pick<AgentContext, "facts" | "proposal" | "demoUrl">,
  opts: { trusted?: boolean } = {},
): { ok: boolean; reasons: string[] } {
  const g = guardReply(reply, ctx, opts);
  return { ok: g.ok, reasons: g.reasons };
}

/**
 * O agente já fez a oferta de fechamento (valor, sinal e Pix) nesta conversa? Só então um "pode" do lead vale como aceite
 * e a proposta é criada sozinha: o lead precisa ter visto o valor antes de receber a chave.
 */
export function madeClosingOffer(messages: Pick<Message, "direction" | "status" | "variant" | "body">[]): boolean {
  return messages.some(
    (m) =>
      m.direction === "out" &&
      ["sent", "delivered", "read", "approved", "simulated"].includes(m.status) &&
      ["compliment", "yes", "answer", "wants_site", "price"].includes(parseAgentVariant(m.variant)?.topic ?? "") &&
      /R\$/.test(m.body) &&
      /\bPix\b/.test(m.body),
  );
}
