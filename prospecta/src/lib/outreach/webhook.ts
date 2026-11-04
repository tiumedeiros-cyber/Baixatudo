import { createHmac, timingSafeEqual } from "node:crypto";
import type { InboundMedia } from "./classify";
import { phoneFromJid } from "./provider";

/** Confere o cabeçalho X-Hub-Signature-256 ("sha256=<hex>") do GOWA, em tempo constante. */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header || !secret) return false;
  const received = header.replace(/^sha256=/i, "").trim();
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

export type WebhookEvent =
  | {
      kind: "message";
      providerMessageId: string;
      phoneE164: string;
      /** A mensagem saiu da própria conta (ex.: o dono respondeu pelo celular). */
      fromMe: boolean;
      text: string | null;
      media: InboundMedia | null;
      timestamp: string | null;
      /** O aparelho (número) em que a mensagem chegou: o `device_id` do GOWA. Ausente se o GOWA não disse. */
      deviceId?: string;
    }
  | { kind: "ack"; providerMessageIds: string[]; receipt: "delivered" | "read"; deviceId?: string }
  | { kind: "ignored"; reason: string };

const MEDIA_KEYS: InboundMedia[] = ["audio", "image", "video", "document", "sticker", "contact", "location"];

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Procura, nos campos de texto do evento (sem entrar no corpo da mensagem), um endereço de número. */
function findPhoneJid(payload: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(payload)) {
    if (key === "body" || typeof value !== "string") continue;
    // o GOWA escreve "quem in chat" em alguns campos: testa cada lado
    for (const part of value.split(" in ")) {
      const phone = phoneFromJid(part);
      if (phone) return phone;
    }
  }
  return null;
}

/**
 * Resumo SEM conteúdo para diagnóstico: o nome de cada campo e, nos que parecem endereço, só o tipo
 * ("@lid", "@s.whatsapp.net"). Nunca o texto da mensagem nem o número.
 */
export function shapeOf(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([key]) => key !== "body")
    .map(([key, value]) => {
      const kind = typeof value === "string" ? /@(lid|s\.whatsapp\.net|g\.us|newsletter|broadcast)\b/.exec(value)?.[1] : null;
      return kind ? `${key}=@${kind}` : key;
    })
    .slice(0, 24)
    .join(", ");
}

/** Traduz o JSON do webhook do GOWA. Qualquer coisa que não interessa vira "ignored". */
export function parseWebhook(body: unknown): WebhookEvent {
  if (!body || typeof body !== "object") return { kind: "ignored", reason: "corpo inválido" };
  const root = body as { event?: unknown; payload?: unknown; device_id?: unknown };
  const payload = root.payload && typeof root.payload === "object" ? (root.payload as Record<string, unknown>) : null;
  const event = str(root.event);
  const deviceId = str(root.device_id) ?? (payload ? str(payload.device_id) : null);
  if (!event || !payload) return { kind: "ignored", reason: "sem evento" };

  if (event === "message.ack") {
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is string => typeof x === "string") : [];
    const receipt = payload.receipt_type === "read" || payload.receipt_type === "played" ? "read" : payload.receipt_type === "delivered" ? "delivered" : null;
    if (ids.length === 0 || !receipt) return { kind: "ignored", reason: "recibo sem id ou tipo" };
    return { kind: "ack", providerMessageIds: ids, receipt, ...(deviceId ? { deviceId } : {}) };
  }

  if (event !== "message") return { kind: "ignored", reason: `evento ${event}` };

  const chatId = str(payload.chat_id);
  if (chatId?.endsWith("@g.us") || chatId?.endsWith("@newsletter") || chatId === "status@broadcast") {
    return { kind: "ignored", reason: "grupo, canal ou status" };
  }
  // O chat vem como número; se vier como @lid, tenta o campo "from" e, por fim, qualquer campo do
  // evento que traga o número ("…@s.whatsapp.net"), que é como o GOWA entrega o telefone quando o
  // chat vem escondido atrás do @lid.
  const phone = phoneFromJid(chatId) ?? phoneFromJid(str(payload.from)) ?? findPhoneJid(payload);
  const id = str(payload.id);
  if (!phone || !id) return { kind: "ignored", reason: `sem telefone ou id (campos: ${shapeOf(payload)})` };

  const media = MEDIA_KEYS.find((k) => payload[k] !== undefined && payload[k] !== null && payload[k] !== "") ?? null;
  // "poll", "reaction" etc. não são resposta de texto
  if (payload.poll || payload.reaction) return { kind: "ignored", reason: "enquete ou reação" };

  return {
    kind: "message",
    providerMessageId: id,
    phoneE164: phone,
    fromMe: payload.is_from_me === true,
    text: str(payload.body),
    media,
    timestamp: str(payload.timestamp),
    ...(deviceId ? { deviceId } : {}),
  };
}
