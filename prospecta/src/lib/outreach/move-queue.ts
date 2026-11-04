import type { Repo } from "@/lib/repo/types";
import type { Account } from "./accounts";
import { approveMessages } from "./engine";
import { loadRoster, ownerOf } from "./roster";
import type { Conversation } from "./types";

/**
 * Passar a fila de um número para outro. Serve para quando um número cai, é restringido ou vai descansar e o dono não quer deixar
 * as aberturas que ainda não saíram paradas esperando por ele. Só mexe no que NUNCA saiu: nada é enviado, nada é apagado.
 */

const PROSPECTING = ["opening", "followup"] as const;

export interface MoveQueueResult {
  from: Account;
  to: Account;
  /** Aberturas que mudaram de número (aprovadas + rascunhos). */
  moved: number;
  /** Das aprovadas, quantas ganharam horário novo no fim da fila do destino. */
  rescheduled: number;
  /** Rascunhos que mudaram de número e continuam esperando o OK do dono. */
  drafts: number;
  firstAt: string | null;
  lastAt: string | null;
  timezone: string;
  /** O destino está pausado: elas só saem quando o dono liberar o envio dele. */
  toPaused: boolean;
  /** O que ficou no número de origem, e por quê. */
  stayed: {
    /** Cutucadas: são de uma conversa que já existe naquele número, e o lead conhece o número que abordou. */
    followups: number;
    /** O worker pegou e não terminou: só o dono sabe se saiu (confira no celular) e cancela na Fila. */
    sending: number;
    /** A conversa já tem mensagem enviada ou recebida: o lead já fala com o número de origem. */
    talking: number;
  };
}

/**
 * Passa as aberturas que ainda não saíram (aprovadas e rascunhos) do número `fromId` para o `toId`, junto com a conversa de cada
 * uma. As aprovadas ganham horário novo no fim da fila do destino, com o teto, a janela e o intervalo dele; os rascunhos seguem
 * como rascunho. Cutucadas, mensagens "enviando" e conversas que já aconteceram NÃO se mexem. Pode repetir: na segunda vez não
 * sobra nada para passar.
 */
export async function moveQueue(repo: Repo, fromId: string, toId: string, now: Date, rng: () => number): Promise<MoveQueueResult> {
  const roster = await loadRoster(repo);
  const from = roster.byId.get(fromId);
  const to = roster.byId.get(toId);
  if (!from || from.retired) throw new Error("Esse número não existe mais.");
  if (!to || to.retired) throw new Error("O número de destino não existe mais.");
  if (from.id === to.id) throw new Error("Escolha outro número para receber a fila.");

  const pending = await repo.listMessages({
    accountId: from.id,
    direction: "out",
    kinds: [...PROSPECTING],
    statuses: ["draft", "approved", "sending"],
    order: "asc",
    limit: 1000,
  });

  const stayed = { followups: 0, sending: 0, talking: 0 };
  const movable: { id: string; conversationId: string; wasApproved: boolean }[] = [];
  const conversations = new Map<string, Conversation | null>();
  for (const m of pending) {
    if (m.status === "sending") {
      stayed.sending++;
      continue;
    }
    if (m.kind !== "opening") {
      stayed.followups++;
      continue;
    }
    if (!conversations.has(m.conversationId)) conversations.set(m.conversationId, await repo.getConversation(m.conversationId));
    const conv = conversations.get(m.conversationId);
    // só abertura de quem ainda não foi contatado nem escreveu: o lead não conhece nenhum número ainda
    if (!conv || conv.touches > 0 || conv.lastOutboundAt || conv.lastInboundAt || ownerOf(roster, conv.accountId)?.id !== from.id) {
      stayed.talking++;
      continue;
    }
    movable.push({ id: m.id, conversationId: m.conversationId, wasApproved: m.status === "approved" });
  }

  // 1º as mensagens: se algo falhar no meio, a abertura sai pelo destino (nunca por um número que o dono quis tirar da jogada).
  // O filtro de status garante que uma que o worker pegou entre a listagem e agora não seja tocada.
  if (movable.length > 0) {
    await repo.bulkUpdateMessages(
      movable.map((m) => m.id),
      ["draft", "approved"],
      { accountId: to.id, status: "draft", approvedAt: null, scheduledFor: null },
    );
  }
  const moved: typeof movable = [];
  for (const m of movable) {
    const fresh = await repo.getMessage(m.id);
    if (fresh && fresh.status === "draft" && fresh.accountId === to.id) moved.push(m);
    else stayed.sending++;
  }

  for (const conversationId of new Set(moved.map((m) => m.conversationId))) {
    await repo.updateConversation(conversationId, { accountId: to.id });
  }

  // as que estavam aprovadas voltam à fila já no fim da fila do destino, com as regras dele
  const reapprove = moved.filter((m) => m.wasApproved).map((m) => m.id);
  const approved = reapprove.length > 0 ? await approveMessages(repo, reapprove, now, rng) : { approved: 0, firstAt: null, lastAt: null };

  const timezone = (await repo.getSettings()).automation.timezone;
  const result: MoveQueueResult = {
    from,
    to,
    moved: moved.length,
    rescheduled: approved.approved,
    drafts: moved.length - approved.approved,
    firstAt: approved.firstAt,
    lastAt: approved.lastAt,
    timezone,
    toPaused: to.paused,
    stayed,
  };
  if (moved.length > 0) {
    await repo.addEvents([
      { leadId: null, type: "automacao", payload: { text: `${moved.length} aberturas passadas de ${from.name} para ${to.name} (${approved.approved} aprovadas com horário novo, ${result.drafts} rascunhos)` } },
    ]);
  }
  return result;
}

const stamp = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** O que o dono lê depois de passar a fila: o que mudou de número, quando sai, o que ficou e por quê. */
export function describeMove(r: MoveQueueResult): { ok: boolean; message: string } {
  const left: string[] = [];
  if (r.stayed.sending > 0) left.push(`${n(r.stayed.sending, "ficou travada em “enviando” (confira no celular se saiu e, se não saiu, cancele na Fila)", "ficaram travadas em “enviando” (confira no celular se saíram e, se não saíram, cancele na Fila)")}`);
  if (r.stayed.followups > 0) left.push(`${n(r.stayed.followups, "cutucada", "cutucadas")} (o lead já conhece o ${r.from.name})`);
  if (r.stayed.talking > 0) left.push(`${n(r.stayed.talking, "abertura de conversa que já aconteceu", "aberturas de conversas que já aconteceram")}`);
  const stayed = left.length ? ` Ficaram no ${r.from.name}: ${left.join("; ")}.` : "";

  if (r.moved === 0) {
    return { ok: false, message: `Nada para passar: o ${r.from.name} não tem abertura esperando que ainda não tenha saído.${stayed}` };
  }
  const when =
    r.rescheduled > 0 && r.firstAt && r.lastAt
      ? ` ${n(r.rescheduled, "aprovada ganhou", "aprovadas ganharam")} horário novo no fim da fila dele, de ${stamp(r.firstAt, r.timezone)} a ${stamp(r.lastAt, r.timezone)}, com o teto, a janela e o intervalo dele.`
      : "";
  const drafts = r.drafts > 0 ? ` ${n(r.drafts, "rascunho segue", "rascunhos seguem")} esperando o seu OK na Fila.` : "";
  const paused = r.toPaused ? ` Atenção: o ${r.to.name} está pausado, então elas só saem quando você liberar o envio dele.` : "";
  return {
    ok: true,
    message: `${n(r.moved, "abertura passada", "aberturas passadas")} do ${r.from.name} para o ${r.to.name}, junto com as conversas.${when}${drafts}${paused} Nada foi enviado agora.${stayed}`,
  };
}
