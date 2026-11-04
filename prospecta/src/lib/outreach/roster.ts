import type { Repo } from "@/lib/repo/types";
import { isAutoReplyMessage } from "./autoreply";
import { activeAccounts, defaultAccount, type Account } from "./accounts";
import type { MessageCounts, MessageStatus } from "./types";

/**
 * O elenco de números. Com o número original sozinho (ou nenhum cadastrado, como nos testes e antes da migração) o painel
 * inteiro se comporta como sempre: `multi` é falso e nenhuma consulta leva filtro de número. Em qualquer outro caso `multi`
 * é verdadeiro e cada número passa a ter fila, teto, intervalo e pausa próprios: com mais de um número ativo; com um só
 * número ativo que não é o original (o original foi aposentado: cada número usa o aparelho dele, nunca o padrão do GOWA); e
 * com todos aposentados (nada envia).
 */
export interface Roster {
  /** Todos, inclusive os aposentados. */
  all: Account[];
  /** Os que recebem leads e enviam, na ordem das abas. */
  active: Account[];
  byId: Map<string, Account>;
  /** O número que cuida do que não tem número escolhido. */
  defaultId: string | null;
  multi: boolean;
}

export function makeRoster(all: Account[]): Roster {
  const active = activeAccounts(all);
  // "Como sempre foi": nenhum número cadastrado, ou só o original ativo.
  const single = all.length === 0 || (active.length === 1 && active[0].legacy);
  return {
    all,
    active,
    byId: new Map(all.map((a) => [a.id, a])),
    defaultId: defaultAccount(all)?.id ?? null,
    multi: !single,
  };
}

export async function loadRoster(repo: Repo): Promise<Roster> {
  return makeRoster(await repo.listAccounts());
}

/** O número de uma conversa ou mensagem; sem número guardado, o original. */
export function ownerOf(roster: Roster, accountId: string | null | undefined): Account | null {
  const id = accountId ?? roster.defaultId;
  return id ? (roster.byId.get(id) ?? null) : null;
}

const PROSPECTING = ["opening", "followup"] as const;
const REAL_SENT: MessageStatus[] = ["sent", "delivered", "read"];

/**
 * Os contadores de um número só (o `messageCounts` do repositório é do sistema inteiro). A pausa por taxa de resposta baixa
 * de um número usa isto: um número com mensagem ruim não pausa os outros. Olha os últimos 1000 envios e respostas.
 */
export async function accountCounts(repo: Repo, accountId: string): Promise<MessageCounts> {
  const out = await repo.listMessages({ accountId, direction: "out", order: "desc", limit: 1000 });
  const sent = out.filter((m) => (PROSPECTING as readonly string[]).includes(m.kind) && REAL_SENT.includes(m.status));
  const contacted = new Set(sent.map((m) => m.conversationId));
  const inbound = contacted.size > 0 ? await repo.listMessages({ accountId, direction: "in", order: "desc", limit: 1000 }) : [];
  const replied = new Set(inbound.filter((m) => !isAutoReplyMessage(m) && contacted.has(m.conversationId)).map((m) => m.conversationId));
  const count = (s: MessageStatus) => out.filter((m) => m.status === s).length;
  return {
    prospectingSent: sent.length,
    conversationsReplied: replied.size,
    draft: count("draft"),
    approved: count("approved"),
    simulated: count("simulated"),
    failed: count("failed"),
  };
}
