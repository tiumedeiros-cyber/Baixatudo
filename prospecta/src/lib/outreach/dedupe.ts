import { askedQuestion, introducesSelf } from "@/lib/agent/variant";
import type { Repo } from "@/lib/repo/types";
import { norm } from "@/lib/utils";
import type { Message } from "./types";

/**
 * Trava contra mensagem repetida. Quando o lead (ou o robô do negócio dele) manda duas mensagens quase juntas, cada uma
 * dispara uma resposta do agente; como nenhuma "responde" a pergunta, a segunda saía igualzinha à primeira e o lead recebia
 * o mesmo texto duas vezes. Duas barreiras usam esta regra: na hora de CRIAR a resposta (a repetida nem nasce) e na hora de
 * ENVIAR (a repetida é cancelada), porque as duas mensagens podem ser tratadas ao mesmo tempo.
 */

/** Janela em que a mesma frase, ou a mesma pergunta do roteiro, não se repete na mesma conversa. */
export const DUPLICATE_WINDOW_MS = 15 * 60_000;

/** Resposta pendente (rascunho ou aprovada que não saiu) só deixa de contar depois de um dia. */
const PENDING_WINDOW_MS = 24 * 3_600_000;

const LIVE: Message["status"][] = ["draft", "approved", "sending", "sent", "delivered", "read"];

const squash = (text: string) => norm(text).replace(/\s+/g, " ").trim();

/** A mensagem de saída mais recente deste instante que diz o mesmo (mesmo texto, ou a mesma pergunta do roteiro). */
export async function findRecentDuplicate(
  repo: Repo,
  conversationId: string,
  next: { body: string; variant?: string | null; excludeId?: string },
  now: Date,
  opts: { windowMs?: number; statuses?: Message["status"][]; ignore?: ReadonlySet<string> } = {},
): Promise<Message | null> {
  const windowMs = opts.windowMs ?? DUPLICATE_WINDOW_MS;
  const recent = await repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], statuses: opts.statuses ?? LIVE, order: "desc", limit: 20 });
  const body = squash(next.body);
  const question = askedQuestion(next.variant ?? null);
  const introduces = introducesSelf(next.body);
  for (const m of recent) {
    if (m.id === next.excludeId || opts.ignore?.has(m.id)) continue;
    // Resposta que ainda NÃO saiu vale como repetida enquanto estiver na fila, mesmo agendada para a próxima janela de envio
    // (num sábado ela só sai na segunda). A que já saiu vale por 15 minutos, contados do envio.
    const pending = m.status === "draft" || m.status === "approved";
    const at = Date.parse(pending ? m.createdAt : (m.sentAt ?? m.createdAt));
    const limit = pending ? PENDING_WINDOW_MS : windowMs;
    if (Number.isNaN(at) || Math.abs(now.getTime() - at) > limit) continue;
    if (squash(m.body) === body) return m;
    if (question && askedQuestion(m.variant) === question && m.status !== "draft") return m;
    // quem já ouviu "sou o Fulano" (com as palavras das regras, da IA ou do dono) não ouve outra apresentação
    if (m.status !== "draft" && introduces && introducesSelf(m.body)) return m;
  }
  return null;
}
