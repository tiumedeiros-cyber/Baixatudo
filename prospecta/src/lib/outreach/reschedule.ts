import type { Repo } from "@/lib/repo/types";
import { effectiveConfig } from "./accounts";
import type { AutomationConfig } from "./config";
import { dailyCapFor, inWindow, localParts } from "./guardrails";
import { loadRoster, ownerOf } from "./roster";
import type { Message } from "./types";

/**
 * Reorganizar a fila quando o dono muda as regras de envio (janelas, dias, tetos por dia, intervalo entre mensagens).
 *
 * Cada mensagem aprovada guarda o horário em que vai sair, marcado com as regras DO DIA em que foi aprovada. Se o dono muda o
 * horário depois ("agora só das 8 às 20"), a fila continua com horários velhos (madrugada, dia proibido, dia lotado) e o worker
 * só os empurra um por vez, na hora de enviar, amontoados na abertura da próxima janela. Aqui a fila inteira é planejada de novo,
 * de uma vez, com as regras de agora, e a mesma regra de quando se aprova (follow-ups antes das aberturas, intervalo aleatório,
 * teto do dia).
 *
 * Só mexe em abertura e follow-up APROVADOS que ainda não saíram. Quem está "enviando", o que já saiu, os rascunhos e as respostas
 * do agente (que saem em segundos) ficam como estão. Nada é apagado nem enviado aqui.
 */

const PROSPECTING = ["opening", "followup"] as const;
const REAL_SENT: Message["status"][] = ["sent", "delivered", "read"];

/** Só os campos que mudam QUANDO as mensagens saem. Mudar o nome, por exemplo, não reorganiza nada. */
export function scheduleSignature(
  cfg: Pick<AutomationConfig, "windows" | "weekdays" | "caps" | "gapMinSec" | "gapMaxSec" | "timezone"> & { skipDates?: string[] },
): string {
  return JSON.stringify([cfg.windows, [...cfg.weekdays].sort((a, b) => a - b), cfg.caps, cfg.gapMinSec, cfg.gapMaxSec, cfg.timezone, [...(cfg.skipDates ?? [])].sort()]);
}

export interface QueueCheck {
  /** Aberturas e follow-ups aprovados esperando a hora. */
  total: number;
  /** Os que estão marcados para um horário que as regras de agora não permitem (madrugada, dia sem envio). */
  outsideWindow: number;
  /** Quantas passam do teto do dia, somando o que já saiu hoje. */
  overCap: number;
}

/** Como a fila aprovada está em relação às regras de agora. Só leitura. */
export async function checkQueue(repo: Repo, cfg: AutomationConfig, now: Date): Promise<QueueCheck> {
  const approved = await repo.listMessages({ kinds: [...PROSPECTING], statuses: ["approved"], direction: "out", limit: 1000 });
  const scheduled = approved.filter((m) => !!m.scheduledFor);
  const outsideWindow = scheduled.filter((m) => !inWindow(new Date(m.scheduledFor!), cfg)).length;

  const today = localParts(now, cfg.timezone).ymd;
  const sentSince = new Date(now.getTime() - 36 * 3_600_000).toISOString();
  const sent = await repo.listMessages({ kinds: [...PROSPECTING], statuses: REAL_SENT, direction: "out", sentSince, limit: 1000 });

  // O teto é de cada número: com vários, a fila de cada um é conferida contra o teto dele. Com um só há um grupo só.
  const roster = await loadRoster(repo);
  const byAccount = (list: Message[]) => {
    const groups = new Map<string, Message[]>();
    for (const m of list) {
      const key = roster.multi ? (ownerOf(roster, m.accountId)?.id ?? "") : "";
      groups.set(key, [...(groups.get(key) ?? []), m]);
    }
    return groups;
  };
  const sentBy = byAccount(sent);

  let overCap = 0;
  for (const [key, list] of byAccount(scheduled)) {
    const owner = key ? roster.byId.get(key) : null;
    const acfg = owner ? effectiveConfig(owner, cfg) : cfg;
    const perDay = new Map<string, number>();
    for (const m of list) {
      const ymd = localParts(new Date(m.scheduledFor!), cfg.timezone).ymd;
      perDay.set(ymd, (perDay.get(ymd) ?? 0) + 1);
    }
    const sentToday = (sentBy.get(key) ?? []).filter((m) => m.sentAt && localParts(new Date(m.sentAt), cfg.timezone).ymd === today).length;
    for (const [ymd, n] of perDay) overCap += Math.max(0, n + (ymd === today ? sentToday : 0) - dailyCapFor(ymd, acfg));
  }
  return { total: approved.length, outsideWindow, overCap };
}

export interface RescheduleResult {
  rescheduled: number;
  firstAt: string | null;
  lastAt: string | null;
}

/**
 * Planeja de novo todas as aberturas e follow-ups aprovados. `approve` é a função do motor que aprova rascunhos e marca horário
 * (vem de fora para este módulo não depender do motor). Cada mensagem volta a rascunho por um instante e é aprovada de novo; se
 * algo falhar no meio, o que ficou como rascunho volta ao horário que tinha, para nada se perder.
 */
export async function rescheduleQueue(
  repo: Repo,
  approve: (ids: string[]) => Promise<{ approved: number; firstAt: string | null; lastAt: string | null }>,
): Promise<RescheduleResult> {
  const approved = await repo.listMessages({ kinds: [...PROSPECTING], statuses: ["approved"], direction: "out", limit: 1000 });
  if (approved.length === 0) return { rescheduled: 0, firstAt: null, lastAt: null };

  const ids = approved.map((m) => m.id);
  const before = new Map(approved.map((m) => [m.id, { scheduledFor: m.scheduledFor, approvedAt: m.approvedAt }]));
  // só vira rascunho quem ainda estava aprovado: o que o worker acabou de pegar para enviar fica de fora
  await repo.bulkUpdateMessages(ids, ["approved"], { status: "draft" });
  try {
    const r = await approve(ids);
    return { rescheduled: r.approved, firstAt: r.firstAt, lastAt: r.lastAt };
  } catch (error) {
    for (const id of ids) {
      const m = await repo.getMessage(id);
      const old = before.get(id);
      if (m && old && m.status === "draft") await repo.updateMessage(id, { status: "approved", scheduledFor: old.scheduledFor, approvedAt: old.approvedAt, error: null });
    }
    throw error;
  }
}
