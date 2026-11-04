export type MessageDirection = "out" | "in";

/**
 * - opening / followup: prospecção (passa por janela, teto diário e aquecimento);
 * - reply: resposta a quem escreveu (sem janela nem teto);
 * - manual: o dono escreveu ou respondeu pelo celular.
 */
export type MessageKind = "opening" | "followup" | "reply" | "manual";

export type MessageStatus =
  | "draft" // escrito, esperando o OK do dono
  | "approved" // aprovado, esperando a hora de sair
  | "sending" // o worker está enviando agora
  | "sent"
  | "delivered"
  | "read"
  | "simulated" // o worker rodou em simulação: nada saiu do computador
  | "failed"
  | "cancelled"
  | "received"; // mensagem que chegou do lead

export type Intent =
  | "optout"
  | "interested"
  | "price"
  | "question"
  | "not_interested"
  | "audio"
  | "media"
  | "other";

export const INTENT_LABEL: Record<Intent, string> = {
  optout: "Pediu para parar",
  interested: "Interessado",
  price: "Perguntou preço",
  question: "Dúvida",
  not_interested: "Sem interesse",
  audio: "Áudio",
  media: "Mídia",
  other: "Outro",
};

/** Rótulo curto de uma mensagem nas telas. Fica aqui (não num componente de cliente) para o servidor poder usar. */
export function kindLabel(kind: MessageKind, step: number): string {
  if (kind === "opening") return "Abertura";
  if (kind === "followup") return `Follow-up ${step}`;
  if (kind === "reply") return "Resposta";
  return "Manual";
}

export type ConversationStatus =
  | "active" // só nós falamos, ou conversa em andamento normal
  | "awaiting_human" // o lead respondeu e precisa do dono
  | "closed" // encerrada (sem interesse)
  | "opted_out"; // pediu para não receber mais

export interface Conversation {
  id: string;
  leadId: string;
  phoneE164: string;
  /** O número de WhatsApp dono da conversa. Nulo = o número original (único até haver mais de um). Depois de criada, não muda. */
  accountId: string | null;
  status: ConversationStatus;
  /** O dono respondeu pelo celular ou assumiu: a automação não escreve mais aqui. */
  humanTakenOver: boolean;
  /** Mensagens de prospecção já enviadas (abertura + follow-ups). */
  touches: number;
  unread: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ConversationPatch = Partial<
  Pick<Conversation, "status" | "humanTakenOver" | "touches" | "unread" | "lastInboundAt" | "lastOutboundAt" | "accountId">
>;

export interface Message {
  id: string;
  conversationId: string;
  leadId: string;
  /** O número que envia (copiado da conversa). */
  accountId: string | null;
  direction: MessageDirection;
  kind: MessageKind;
  /** 0 = abertura, 1 = 1º follow-up, 2 = 2º follow-up. */
  step: number;
  body: string;
  status: MessageStatus;
  variant: string | null;
  intent: Intent | null;
  scheduledFor: string | null;
  approvedAt: string | null;
  sentAt: string | null;
  providerMessageId: string | null;
  attempts: number;
  error: string | null;
  createdBy: "system" | "user" | "lead";
  /** Dia (AAAA-MM-DD) do lote em que nasceu. */
  batchDay: string | null;
  createdAt: string;
}

export type NewMessage = Pick<Message, "conversationId" | "leadId" | "direction" | "kind" | "body" | "status" | "createdBy"> &
  Partial<
    Pick<
      Message,
      | "step"
      | "variant"
      | "intent"
      | "scheduledFor"
      | "approvedAt"
      | "sentAt"
      | "providerMessageId"
      | "batchDay"
    >
  >;

export type MessagePatch = Partial<
  Pick<
    Message,
    "body" | "status" | "scheduledFor" | "approvedAt" | "sentAt" | "providerMessageId" | "attempts" | "error" | "intent" | "variant" | "accountId"
  >
>;

export interface MessageQuery {
  conversationId?: string;
  leadId?: string;
  /** Só as mensagens deste número (o número original inclui as sem número). */
  accountId?: string;
  statuses?: MessageStatus[];
  kinds?: MessageKind[];
  direction?: MessageDirection;
  /** Só mensagens enviadas a partir deste instante. */
  sentSince?: string;
  /** Só mensagens com horário marcado até este instante. */
  scheduledUntil?: string;
  batchDay?: string;
  providerMessageId?: string;
  order?: "asc" | "desc";
  limit: number;
}

export interface MessageCounts {
  /** Mensagens de prospecção que realmente saíram (enviada, entregue, lida). */
  prospectingSent: number;
  /** Leads que responderam depois de receber prospecção. */
  conversationsReplied: number;
  draft: number;
  approved: number;
  simulated: number;
  failed: number;
}
