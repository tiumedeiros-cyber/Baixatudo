import { isAutoReplyMessage } from "./autoreply";
import type { Message } from "./types";

/** O que a conversa mostra como "última mensagem". Rascunho e agendada não podem parecer enviadas. */
export function previewOf(m: Message): string | null {
  if (isAutoReplyMessage(m)) return `Automática: ${m.body}`;
  if (m.direction === "in") return m.body;
  switch (m.status) {
    case "cancelled":
      return null;
    case "draft":
      return `Rascunho: ${m.body}`;
    case "approved":
    case "sending":
      return `Agendada: ${m.body}`;
    case "failed":
      return `Falhou: ${m.body}`;
    case "simulated":
      return `Simulada: ${m.body}`;
    default:
      return `Você: ${m.body}`;
  }
}
