import type { Lead } from "@/lib/leads/types";
import type { Repo } from "@/lib/repo/types";
import { norm } from "@/lib/utils";
import { effectiveConfig, NEW_ACCOUNT_CAPS, type Account, type AccountCaps } from "./accounts";
import { dailyCapFor, localParts, startOfLocalDay } from "./guardrails";
import type { WhatsAppProvider } from "./provider";
import { accountCounts, loadRoster, ownerOf } from "./roster";
import type { MessageStatus } from "./types";

/**
 * A parte de negócio da tela Números: o retrato de cada número, cadastrar, renomear, pausar, aposentar, e os grupos de leads
 * liberados que o dono distribui entre os números. Só conhece `Repo` e o estado do WhatsApp que quem chama entrega.
 */

const PROSPECTING = ["opening", "followup"] as const;
const REAL_SENT: MessageStatus[] = ["sent", "delivered", "read"];
export const MAX_ACCOUNT_NAME = 60;

export interface NumberOverview {
  id: string;
  name: string;
  /** O número original, que existia antes de haver mais de um. */
  legacy: boolean;
  phone: string | null;
  gowaDeviceId: string | null;
  paused: boolean;
  pausedReason: string | null;
  connected: boolean;
  /** O aparelho dele foi apagado no GOWA: precisa de um aparelho novo (a fila e as conversas continuam aqui). */
  deviceMissing: boolean;
  /** O estado do WhatsApp em palavras ("WhatsApp conectado", "desconectado"...). */
  detail: string;
  sentToday: number;
  capToday: number;
  /** Aprovadas esperando a hora de sair. */
  queued: number;
  /** Rascunhos esperando o OK do dono. */
  drafts: number;
  nextAt: string | null;
  sentTotal: number;
  replyRate: number | null;
  lastSendAt: string | null;
  lastResult: string | null;
  failures: number;
  warmupStart: string | null;
  caps: AccountCaps;
}

/** O retrato de cada número ativo. `providerFor` entrega o WhatsApp de cada um (com tempo curto, a tela não pode travar). */
export async function getNumbersOverview(repo: Repo, providerFor: (account: Account) => WhatsAppProvider, now: Date): Promise<NumberOverview[]> {
  const roster = await loadRoster(repo);
  const settings = await repo.getSettings();
  const cfg = settings.automation;
  const day = localParts(now, cfg.timezone).ymd;
  const since = startOfLocalDay(now, cfg).toISOString();

  return Promise.all(
    roster.active.map(async (account): Promise<NumberOverview> => {
      // com um número só nada filtra por número (igual ao painel de sempre)
      const only = roster.multi ? { accountId: account.id } : {};
      const acfg = effectiveConfig(account, cfg);
      const [status, state, counts, sent, upcoming, drafts] = await Promise.all([
        providerFor(account)
          .status()
          .catch((error: unknown) => ({ connected: false, missing: false, detail: error instanceof Error ? error.message : "sem resposta do GOWA" })),
        repo.getAccountState(account.id),
        roster.multi ? accountCounts(repo, account.id) : repo.messageCounts(),
        repo.listMessages({ ...only, kinds: [...PROSPECTING], statuses: [...REAL_SENT, "simulated"], sentSince: since, limit: 500 }),
        repo.listMessages({ ...only, kinds: [...PROSPECTING], statuses: ["approved"], order: "asc", limit: 200 }),
        repo.listMessages({ ...only, kinds: [...PROSPECTING], statuses: ["draft"], limit: 500 }),
      ]);
      const nextAt = upcoming.map((m) => m.scheduledFor).filter((x): x is string => !!x).sort()[0] ?? null;
      return {
        id: account.id,
        name: account.name,
        legacy: account.legacy,
        phone: account.phoneE164,
        gowaDeviceId: account.gowaDeviceId,
        paused: account.paused,
        pausedReason: account.pausedReason,
        connected: status.connected,
        deviceMissing: status.missing === true,
        detail: status.detail,
        sentToday: sent.length,
        capToday: dailyCapFor(day, acfg),
        queued: upcoming.length,
        drafts: drafts.length,
        nextAt,
        sentTotal: counts.prospectingSent,
        replyRate: counts.prospectingSent > 0 ? counts.conversationsReplied / counts.prospectingSent : null,
        lastSendAt: state.lastSendAt,
        lastResult: state.lastResult,
        failures: state.consecutiveFailures,
        warmupStart: acfg.warmupStart,
        caps: acfg.caps,
      };
    }),
  );
}

// ───────────────────────── cadastro ─────────────────────────

/** O nome que o dono dá ao número. Devolve o motivo se não serve. */
export function checkAccountName(name: string, others: Pick<Account, "id" | "name" | "retired">[], selfId?: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim();
  if (clean.length === 0) return "Dê um nome ao número (por exemplo, Número 2).";
  if (clean.length > MAX_ACCOUNT_NAME) return `O nome pode ter no máximo ${MAX_ACCOUNT_NAME} letras.`;
  if (others.some((a) => !a.retired && a.id !== selfId && norm(a.name) === norm(clean))) return "Já existe um número com esse nome.";
  return null;
}

export interface AccountInput {
  name: string;
  gowaDeviceId: string;
  phoneE164?: string | null;
  jid?: string | null;
}

/**
 * Cadastra um número novo. Nasce PAUSADO e com o teto devagar de quem está aquecendo: ele só envia quando o dono tirar a pausa.
 * O aparelho dele no GOWA já deve existir (quem chama o cria antes).
 */
export async function addAccount(repo: Repo, input: AccountInput): Promise<Account> {
  const all = await repo.listAccounts();
  const problem = checkAccountName(input.name, all);
  if (problem) throw new Error(problem);
  const account = await repo.createAccount({
    name: input.name.replace(/\s+/g, " ").trim(),
    gowaDeviceId: input.gowaDeviceId,
    phoneE164: input.phoneE164 ?? null,
    jid: input.jid ?? null,
    paused: true,
    pausedReason: "Número novo: confira a conexão e tire a pausa quando quiser começar.",
    caps: NEW_ACCOUNT_CAPS,
  });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `número cadastrado: ${account.name} (pausado até você liberar)` } }]);
  return account;
}

export async function renameAccount(repo: Repo, id: string, name: string): Promise<Account> {
  const all = await repo.listAccounts();
  if (!all.some((a) => a.id === id)) throw new Error("Esse número não existe mais.");
  const problem = checkAccountName(name, all, id);
  if (problem) throw new Error(problem);
  return repo.updateAccount(id, { name: name.replace(/\s+/g, " ").trim() });
}

/** Pausa ou libera UM número. Os outros seguem como estão. Liberar zera a contagem de falhas dele. */
export async function setAccountPaused(repo: Repo, id: string, paused: boolean, reason?: string): Promise<Account> {
  const account = await repo.getAccount(id);
  if (!account || account.retired) throw new Error("Esse número não existe mais.");
  const updated = await repo.updateAccount(id, { paused, pausedReason: paused ? (reason ?? "Pausado por você.") : null });
  if (!paused) await repo.saveAccountState(id, { consecutiveFailures: 0 });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: paused ? `${account.name} pausado` : `${account.name} liberado para enviar` } }]);
  return updated;
}

/** O teto e o aquecimento próprios do número. */
export async function setAccountCaps(repo: Repo, id: string, caps: AccountCaps): Promise<Account> {
  const account = await repo.getAccount(id);
  if (!account || account.retired) throw new Error("Esse número não existe mais.");
  if (!Number.isInteger(caps.steady) || caps.steady < 1) throw new Error("O teto por dia precisa ser pelo menos 1.");
  for (const v of [caps.week1, caps.week2]) if (v !== null && (!Number.isInteger(v) || v < 1)) throw new Error("O teto das primeiras semanas precisa ser pelo menos 1 (ou em branco).");
  return repo.updateAccount(id, { caps });
}

export interface RetireResult {
  account: Account;
  /** Rascunhos e aprovadas que ainda não tinham saído e foram canceladas. */
  cancelled: number;
}

/**
 * Aposenta um número: ele deixa de receber leads e de enviar. O que estava no rascunho ou aprovado e não saiu é cancelado (os
 * leads voltam a ficar liberados para outro número); as conversas já abertas ficam como estão. Vale também para o número
 * original: o histórico dele (conversas e mensagens) continua no banco, só deixa de enviar e de receber leads. Nada é apagado.
 */
export async function retireAccount(repo: Repo, id: string): Promise<RetireResult> {
  const account = await repo.getAccount(id);
  if (!account || account.retired) throw new Error("Esse número não existe mais.");
  const pending = await repo.listMessages({ accountId: id, statuses: ["draft", "approved"], direction: "out", kinds: [...PROSPECTING], limit: 1000 });
  const cancelled = pending.length
    ? await repo.bulkUpdateMessages(
        pending.map((m) => m.id),
        ["draft", "approved"],
        { status: "cancelled", error: "número aposentado" },
      )
    : 0;
  // O aparelho fica livre: dá para ligá-lo a outro número (o aparelho em si o painel nunca apaga no GOWA).
  const updated = await repo.updateAccount(id, { retired: true, paused: true, pausedReason: "Aposentado.", gowaDeviceId: null });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `${account.name} aposentado (${cancelled} mensagens que não tinham saído foram canceladas)` } }]);
  return { account: updated, cancelled };
}

// ───────────────────────── leads liberados ─────────────────────────

export interface ReleasedGroup {
  /** A chave estável do grupo (ramo + cidade), usada pela ação de preparar. */
  key: string;
  label: string;
  niche: string;
  city: string;
  count: number;
  topScore: number;
  /** Os ids, das melhores notas para baixo. */
  leadIds: string[];
  /** Alguns nomes, para o dono reconhecer o grupo. */
  sample: string[];
}

const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function groupOf(lead: Lead): { key: string; niche: string; city: string } {
  const niche = (lead.niche ?? lead.category ?? "").trim() || "Sem ramo";
  const city = (lead.city ?? "").trim() || "Sem cidade";
  return { key: `${slug(niche)}|${slug(city)}`, niche, city };
}

/**
 * Os leads que o dono liberou (etapa Qualificado, com celular válido) e que ainda não têm abertura na Fila nem foram abordados,
 * agrupados por ramo e cidade. É a lista de onde ele escolhe "estes 20, pelo Número 2".
 */
export async function listReleasedGroups(repo: Repo, opts: { allowDemo?: boolean } = {}): Promise<ReleasedGroup[]> {
  const allowDemo = opts.allowDemo ?? repo.mode === "demo";
  const { rows } = await repo.listLeads({ stages: ["qualificado"], eligible: true, sort: "score", limit: 1000, offset: 0 });
  const taken = new Set(
    (
      await repo.listMessages({ direction: "out", statuses: ["draft", "approved", "sending", "sent", "delivered", "read", "simulated"], limit: 1000 })
    ).map((m) => m.leadId),
  );
  const groups = new Map<string, ReleasedGroup>();
  for (const lead of rows) {
    if (taken.has(lead.id)) continue;
    if (lead.source === "demo" && !allowDemo) continue;
    if (!lead.phoneE164 || !lead.isMobile || lead.permanentlyClosed || lead.whatsappStatus === "no") continue;
    const g = groupOf(lead);
    const existing = groups.get(g.key) ?? { key: g.key, label: `${g.niche} · ${g.city}`, niche: g.niche, city: g.city, count: 0, topScore: 0, leadIds: [], sample: [] };
    existing.count++;
    existing.topScore = Math.max(existing.topScore, lead.score);
    existing.leadIds.push(lead.id);
    if (existing.sample.length < 3) existing.sample.push(lead.name);
    groups.set(g.key, existing);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.topScore - a.topScore);
}

/** O número que cuida de uma conversa, para os crachás das telas. */
export async function accountNames(repo: Repo): Promise<{ multi: boolean; nameOf: (accountId: string | null | undefined) => string | null }> {
  const roster = await loadRoster(repo);
  return { multi: roster.multi, nameOf: (id) => (roster.multi ? (ownerOf(roster, id)?.name ?? null) : null) };
}

// ───────────────────────── aparelhos do GOWA ─────────────────────────

/**
 * Guarda no cadastro o que o GOWA sabe de cada aparelho: o endereço (é por ele que a resposta acha o número) e o telefone. O
 * número original, que nunca teve aparelho fixado, é ligado ao `GOWA_DEVICE_ID` ou, se só há um aparelho, a esse. Só escreve
 * o que mudou.
 */
export async function syncDevices(
  repo: Repo,
  devices: { id: string; jid: string | null; phone: string | null }[],
  envDeviceId: string | null,
): Promise<number> {
  let changed = 0;
  for (const account of await repo.listAccounts()) {
    if (account.retired) continue;
    const patch: { gowaDeviceId?: string; jid?: string; phoneE164?: string } = {};
    let device = account.gowaDeviceId ? devices.find((d) => d.id === account.gowaDeviceId) : undefined;
    if (!account.gowaDeviceId && account.legacy) {
      const picked = envDeviceId ?? (devices.length === 1 ? devices[0].id : null);
      device = picked ? devices.find((d) => d.id === picked) : undefined;
      if (picked) patch.gowaDeviceId = picked;
    }
    if (device?.jid && account.jid !== device.jid) patch.jid = device.jid;
    if (device?.phone && !account.phoneE164) patch.phoneE164 = `+${device.phone}`;
    if (Object.keys(patch).length === 0) continue;
    await repo.updateAccount(account.id, patch);
    changed++;
  }
  return changed;
}

/** No modo demonstração (memória) não há migração: cria o número original para a tela Números funcionar. */
export async function ensureOriginalAccount(repo: Repo): Promise<void> {
  if (repo.mode !== "demo") return;
  if ((await repo.listAccounts()).length === 0) await repo.createAccount({ name: "Número 1", legacy: true });
}

// ───────────────────────── trocar o aparelho de um número ─────────────────────────

export interface DeviceInfo {
  id: string;
  jid: string | null;
  /** Só os dígitos do telefone, quando o aparelho já está pareado. */
  phone: string | null;
}

/** Os aparelhos do GOWA que nenhum número ativo está usando (candidatos a "usar aparelho que já existe"). */
export function freeDevices<T extends { id: string }>(devices: T[], accounts: Pick<Account, "gowaDeviceId" | "retired">[]): T[] {
  const used = new Set(accounts.filter((a) => !a.retired && a.gowaDeviceId).map((a) => a.gowaDeviceId));
  return devices.filter((d) => !used.has(d.id));
}

/**
 * Liga um número a OUTRO aparelho do GOWA (um novo, depois que a conexão antiga caiu, foi restringida ou foi apagada lá). O número
 * continua o mesmo para o painel: nome, conversas, fila e histórico ficam. Por segurança ele fica PAUSADO até o dono conectar o
 * WhatsApp no aparelho novo e liberar o envio. Um aparelho só pode servir a um número ativo por vez.
 */
export async function relinkAccount(repo: Repo, id: string, device: DeviceInfo): Promise<Account> {
  const all = await repo.listAccounts();
  const account = all.find((a) => a.id === id);
  if (!account || account.retired) throw new Error("Esse número não existe mais.");
  const owner = all.find((a) => a.id !== id && !a.retired && a.gowaDeviceId === device.id);
  if (owner) throw new Error(`Esse aparelho já é do ${owner.name}. Aposente esse número antes, ou escolha outro aparelho.`);
  const updated = await repo.updateAccount(id, {
    gowaDeviceId: device.id,
    jid: device.jid,
    phoneE164: device.phone ? `+${device.phone}` : null,
    paused: true,
    pausedReason: "Aparelho novo: conecte o WhatsApp (QR code ou código) e libere o envio quando quiser.",
  });
  await repo.saveAccountState(id, { consecutiveFailures: 0, lastResult: null });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `${account.name} ligado a um aparelho novo do GOWA (pausado até você liberar)` } }]);
  return updated;
}
