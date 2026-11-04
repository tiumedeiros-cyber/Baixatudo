import type { Repo } from "@/lib/repo/types";
import { localParts } from "./guardrails";
import type { Message } from "./types";

/**
 * Retomar a automação depois de uma pausa (a noite, um fim de semana, o PC desligado). Enquanto ela está pausada nada sai,
 * mas o resto continua: o agente segue escrevendo respostas e as mensagens aprovadas ficam esperando. Ao retomar, em vez de
 * soltar tudo de uma vez com horários velhos, o painel:
 *  - reagenda o que o dono JÁ aprovou e não saiu (aberturas, follow-ups e respostas recentes) a partir de agora, respeitando
 *    janela, teto do dia e intervalo, com a mesma regra de quando se aprova;
 *  - devolve para rascunho as respostas do agente que ficaram velhas demais (o lead escreveu há horas): quem decide é o dono;
 *  - deixa os rascunhos de dias anteriores como estão, avisando que existem.
 * Nada é apagado nem enviado aqui.
 */

/** Resposta aprovada que esperou mais que isso deixa de sair sozinha: volta para o dono conferir. */
export const STALE_REPLY_MS = 3 * 3_600_000;

export interface ResumePlan {
  /** Aberturas e follow-ups aprovados cujo horário já passou. */
  overdueProspecting: number;
  /** Respostas do agente aprovadas e vencidas há pouco: saem em instantes. */
  freshReplies: number;
  /** Respostas do agente vencidas há mais de `STALE_REPLY_MS`: voltam como rascunho. */
  staleReplies: number;
  /** Rascunhos de dias anteriores esperando aprovação. */
  oldDrafts: number;
}

export interface ResumeResult extends ResumePlan {
  /** Quantas mensagens ganharam horário novo. */
  rescheduled: number;
  firstAt: string | null;
  lastAt: string | null;
}

const isProspecting = (m: Message) => m.kind === "opening" || m.kind === "followup";

function dueAt(m: Message): number {
  return Date.parse(m.scheduledFor ?? m.approvedAt ?? m.createdAt);
}

async function classify(repo: Repo, now: Date) {
  const settings = await repo.getSettings();
  const today = localParts(now, settings.automation.timezone).ymd;
  const [approved, drafts] = await Promise.all([
    repo.listMessages({ statuses: ["approved"], direction: "out", limit: 1000 }),
    repo.listMessages({ statuses: ["draft"], direction: "out", limit: 1000 }),
  ]);
  const overdue = approved.filter((m) => !m.scheduledFor || Date.parse(m.scheduledFor) <= now.getTime());
  const prospecting = overdue.filter(isProspecting);
  const replies = overdue.filter((m) => !isProspecting(m));
  const stale = replies.filter((m) => now.getTime() - dueAt(m) > STALE_REPLY_MS);
  const fresh = replies.filter((m) => !stale.includes(m));
  const oldDrafts = drafts.filter((m) => localParts(new Date(m.createdAt), settings.automation.timezone).ymd < today);
  return { prospecting, fresh, stale, oldDrafts };
}

/** O que vai acontecer se o dono retomar agora. Só leitura. */
export async function getResumePlan(repo: Repo, now: Date): Promise<ResumePlan> {
  const c = await classify(repo, now);
  return { overdueProspecting: c.prospecting.length, freshReplies: c.fresh.length, staleReplies: c.stale.length, oldDrafts: c.oldDrafts.length };
}

function hoursText(ms: number): string {
  const h = Math.max(1, Math.round(ms / 3_600_000));
  return h >= 48 ? `${Math.round(h / 24)} dias` : `${h} h`;
}

/**
 * Retoma a automação reorganizando o que ficou parado (veja o comentário do módulo). `approve` é a função do motor que
 * aprova rascunhos e marca horário; vem de fora para este módulo não depender do motor (e o motor poder importá-lo).
 */
export async function resumeAutomation(
  repo: Repo,
  now: Date,
  approve: (ids: string[]) => Promise<{ approved: number; firstAt: string | null; lastAt: string | null }>,
): Promise<ResumeResult> {
  const c = await classify(repo, now);
  const plan: ResumePlan = { overdueProspecting: c.prospecting.length, freshReplies: c.fresh.length, staleReplies: c.stale.length, oldDrafts: c.oldDrafts.length };

  // respostas velhas: voltam para o dono, e a conversa aparece em "Intervir" no quadro de Conversas
  for (const m of c.stale) {
    await repo.updateMessage(m.id, {
      status: "draft",
      scheduledFor: null,
      approvedAt: null,
      error: `Resposta de há ${hoursText(now.getTime() - dueAt(m))}, de quando a automação estava pausada. Confira se ainda faz sentido antes de aprovar.`,
    });
    const conv = await repo.getConversation(m.conversationId);
    if (conv && conv.status === "active") await repo.updateConversation(conv.id, { status: "awaiting_human" });
  }

  // o que já estava aprovado ganha horário novo: volta a rascunho por um instante e é aprovado de novo, na ordem de sempre
  const redo = [...c.prospecting, ...c.fresh];
  let rescheduled = 0;
  let firstAt: string | null = null;
  let lastAt: string | null = null;
  if (redo.length > 0) {
    await repo.bulkUpdateMessages(redo.map((m) => m.id), ["approved"], { status: "draft" });
    const r = await approve(redo.map((m) => m.id));
    rescheduled = r.approved;
    firstAt = r.firstAt;
    lastAt = r.lastAt;
  }

  await repo.saveAutomation({ paused: false, pausedReason: null });
  const parts = [
    rescheduled > 0 ? `${rescheduled} mensagens aprovadas ganharam horário novo` : null,
    plan.staleReplies > 0 ? `${plan.staleReplies} respostas antigas voltaram como rascunho` : null,
    plan.oldDrafts > 0 ? `${plan.oldDrafts} rascunhos de dias anteriores esperam você` : null,
  ].filter(Boolean);
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `retomada pelo dono${parts.length > 0 ? `: ${parts.join(", ")}` : ""}` } }]);

  return { ...plan, rescheduled, firstAt, lastAt };
}
