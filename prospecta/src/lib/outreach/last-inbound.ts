import type { Repo } from "@/lib/repo/types";
import { isAutoReplyMessage } from "./autoreply";
import type { Message } from "./types";

/** A última mensagem que o LEAD escreveu: a resposta automática do negócio (aviso de ausência, menu) não conta. */
export async function lastLeadMessage(repo: Repo, conversationId: string): Promise<Message | null> {
  const recent = await repo.listMessages({ conversationId, direction: "in", order: "desc", limit: 12 });
  return recent.find((m) => !isAutoReplyMessage(m)) ?? null;
}
