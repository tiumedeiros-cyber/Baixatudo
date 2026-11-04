import type { Repo } from "@/lib/repo/types";
import type { Account } from "./accounts";
import type { AutomationConfig } from "./config";
import { ownerOf, type Roster } from "./roster";
import type { Message } from "./types";

/**
 * O aviso de "fila parada": um número que tem mensagem aprovada com a hora já vencida e não está enviando. É o que acontece
 * quando o WhatsApp restringe ou desconecta um número: o worker só devolve "offline" (nada sai, nada falha) e a fila fica
 * esperando sem ninguém ver. Só lê o que o banco já guarda, então cabe em toda página sem chamar o GOWA.
 */

/** Quanto uma aprovada pode passar da hora sem ser aviso. O intervalo máximo entre envios é 9 min; com folga, 15. */
export const STUCK_GRACE_MIN = 15;
/** Sem volta do worker há mais que isto, o robô de envio está parado (ele repete a cada ~20 s). */
export const WORKER_STALE_MIN = 5;

const PROSPECTING = ["opening", "followup"] as const;

/**
 * Por que a fila não anda:
 * - `paused`: o número está pausado (pelo dono ou pela parada automática).
 * - `worker`: o robô de envio não deu volta nenhuma há alguns minutos.
 * - `offline`: o robô roda, mas este número não envia (desconectado, restringido ou sem aparelho).
 * - `hung`: não há fila vencida, mas uma mensagem ficou presa em "enviando" (o robô a pegou e não terminou).
 */
export type StuckCause = "paused" | "worker" | "offline" | "hung";

export interface StuckQueue {
  accountId: string;
  name: string;
  cause: StuckCause;
  /** O motivo da pausa, quando `cause` é "paused". */
  reason: string | null;
  /** Aprovadas com a hora vencida há mais que a folga. */
  overdue: number;
  /** Presas em "enviando": com a hora marcada para antes da folga, o robô pegou e não terminou. */
  sending: number;
  /** Há quantos minutos venceu a mais antiga (das aprovadas; sem nenhuma, das presas em "enviando"). */
  lateMin: number;
  /** Existe outro número ativo para onde dá para passar a fila. */
  canMove: boolean;
}

export interface StuckInput {
  roster: Roster;
  /** Aprovadas de prospecção com hora marcada até `now` menos a folga. */
  overdue: Message[];
  /** Mensagens de prospecção em "enviando" (as recentes são o envio normal em andamento e não contam). */
  sending: Message[];
  automation: Pick<AutomationConfig, "paused">;
  /** A última volta do worker (estado geral da automação). */
  lastTickAt: string | null;
  now: Date;
}

function causeOf(account: Account, workerDown: boolean, late: number): StuckCause {
  if (late === 0) return "hung";
  if (account.paused) return "paused";
  return workerDown ? "worker" : "offline";
}

/** A regra, sem banco: devolve um item por número com fila vencida ou mensagem presa, o mais atrasado primeiro. */
export function detectStuckQueues({ roster, overdue, sending, automation, lastTickAt, now }: StuckInput): StuckQueue[] {
  // Pausa geral é decisão do dono e já aparece no menu ("Pausada"): não é queda de número.
  if (automation.paused) return [];

  const at = now.getTime();
  const graceAt = at - STUCK_GRACE_MIN * 60_000;
  const workerDown = !lastTickAt || at - new Date(lastTickAt).getTime() > WORKER_STALE_MIN * 60_000;
  const scheduled = (m: Message) => (m.scheduledFor ? new Date(m.scheduledFor).getTime() : at);
  const groups = new Map<string, { account: Account; late: Message[]; hung: Message[] }>();
  const group = (m: Message) => {
    const account = ownerOf(roster, m.accountId);
    // número aposentado ou desconhecido: a fila dele já foi cancelada ou não é de ninguém
    if (!account || account.retired) return null;
    let g = groups.get(account.id);
    if (!g) groups.set(account.id, (g = { account, late: [], hung: [] }));
    return g;
  };
  for (const m of overdue) group(m)?.late.push(m);
  // "enviando" com a hora marcada há pouco é o envio normal (o robô espera alguns segundos digitando); só o velho está preso
  for (const m of sending) if (scheduled(m) <= graceAt) group(m)?.hung.push(m);

  const out: StuckQueue[] = [];
  for (const { account, late, hung } of groups.values()) {
    if (late.length === 0 && hung.length === 0) continue;
    const oldest = Math.min(...(late.length > 0 ? late : hung).map(scheduled));
    out.push({
      accountId: account.id,
      name: account.name,
      cause: causeOf(account, workerDown, late.length),
      reason: account.paused ? account.pausedReason : null,
      overdue: late.length,
      sending: hung.length,
      lateMin: Math.max(0, Math.floor((at - oldest) / 60_000)),
      canMove: roster.active.some((a) => a.id !== account.id),
    });
  }
  return out.sort((a, b) => b.lateMin - a.lateMin);
}

/** Lê o que a regra precisa e a aplica. Uma consulta por tipo, para todos os números de uma vez. */
export async function loadStuckQueues(repo: Repo, roster: Roster, automation: Pick<AutomationConfig, "paused">, now: Date): Promise<StuckQueue[]> {
  if (roster.active.length === 0 || automation.paused) return [];
  const limit = new Date(now.getTime() - STUCK_GRACE_MIN * 60_000).toISOString();
  const [overdue, sending, state] = await Promise.all([
    repo.listMessages({ kinds: [...PROSPECTING], direction: "out", statuses: ["approved"], scheduledUntil: limit, order: "asc", limit: 500 }),
    repo.listMessages({ kinds: [...PROSPECTING], direction: "out", statuses: ["sending"], scheduledUntil: limit, order: "asc", limit: 100 }),
    repo.getAutomationState(),
  ]);
  return detectStuckQueues({ roster, overdue, sending, automation, lastTickAt: state.lastTickAt, now });
}

/** "3 h 12 min", "47 min": quanto tempo a fila está parada, em palavras curtas. */
export function lateText(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A frase do aviso para um número. */
export function describeStuck(q: StuckQueue): string {
  const msgs = `${q.overdue} ${q.overdue === 1 ? "mensagem atrasada" : "mensagens atrasadas"}`;
  const since = `a mais antiga há ${lateText(q.lateMin)}`;
  if (q.cause === "hung") {
    const n = q.sending === 1 ? "1 mensagem presa" : `${q.sending} mensagens presas`;
    return `${q.name} tem ${n} em "enviando" (marcada${q.sending === 1 ? "" : "s"} para há ${lateText(q.lateMin)}): o robô pegou e não terminou. Confira no chat do celular se saiu e, se não saiu, cancele na Fila.`;
  }
  const hung = q.sending > 0 ? ` Também há ${q.sending} presa${q.sending === 1 ? "" : "s"} em "enviando": confira no celular se saiu.` : "";
  if (q.cause === "paused") {
    return `${q.name} está pausado e tem ${msgs} na fila (${since}).${q.reason ? ` Motivo: ${q.reason}` : ""}${hung}`;
  }
  if (q.cause === "worker") {
    return `O robô de envio não deu volta nenhuma há alguns minutos, e ${q.name} tem ${msgs} (${since}).${hung}`;
  }
  return `${q.name} não está enviando: ${msgs} (${since}). O robô está rodando, então o número provavelmente caiu ou foi restringido.${hung}`;
}
