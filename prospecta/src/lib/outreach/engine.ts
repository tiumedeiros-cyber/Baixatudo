import { composeReply, type ComposeDeps } from "@/lib/agent/compose";
import { decideAuto, finalCheck, madeClosingOffer } from "@/lib/agent/autonomy";
import { countAutoReplies, scheduleAutoReply } from "@/lib/agent/autosend";
import { factsFromSettings, loadAgentContext } from "@/lib/agent/context";
import { buildFicha } from "@/lib/agent/ficha";
import { runNudges } from "@/lib/agent/nudge";
import type { LlmClient } from "@/lib/agent/llm";
import { detectTopics } from "@/lib/agent/topics";
import { isRefusal } from "@/lib/agent/discovery";
import { agentVariant, askedQuestion, OWNER_PREVIEW_VARIANT, parseAgentVariant } from "@/lib/agent/variant";
import { changeProposalStatus, createProposalFor, generateDemo } from "@/lib/deals/service";
import type { AgentFlow, Lead } from "@/lib/leads/types";
import type { Repo } from "@/lib/repo/types";
import { AUTO_REPLY_LABEL, AUTO_REPLY_VARIANT, arrivedFast, detectAutoReply, isAutoReplyMessage, menuChoice } from "./autoreply";
import { classifyReply, type InboundMedia } from "./classify";
import { findRecentDuplicate } from "./dedupe";
import { effectiveConfig, type Account, type AccountState } from "./accounts";
import type { AutomationConfig, AutomationState } from "./config";
import {
  dailyCapFor,
  evaluateStop,
  inWindow,
  localParts,
  nextOpening,
  startOfLocalDay,
  typingMs,
  gapMs,
} from "./guardrails";
import { adaptGreeting } from "./greeting";
import { referDecisor } from "./referral";
import { writeOpenings } from "./opening";
import { isShortVariant, type OpeningMode, type OpeningStyle } from "./style";
import { chooseOpeningStyle, historyFrom, remember } from "./variation";
import { betweenPartsMs, splitMessageParts } from "./parts";
import { ProviderError, phoneVariants, type WhatsAppProvider } from "./provider";
import { checkQueue, rescheduleQueue, scheduleSignature, type RescheduleResult } from "./reschedule";
import { accountCounts, loadRoster, ownerOf } from "./roster";
import { getResumePlan, resumeAutomation, type ResumePlan, type ResumeResult } from "./resume";
import { planSchedule } from "./schedule";
import { opensOn } from "./bot-hours";
import { buildBotFollowUp, buildFollowUp, type TemplateContext, type TemplateLead } from "./templates";
import type { Conversation, Intent, Message, MessageStatus } from "./types";
import type { WebhookEvent } from "./webhook";

/**
 * Motor de envio. Tudo passa por aqui: preparar o lote, aprovar, enviar uma mensagem por vez
 * respeitando as regras, tratar resposta que chegou. Só conhece `Repo` e `WhatsAppProvider`,
 * então roda igual com banco real, em memória e com WhatsApp falso (testes).
 */

const PROSPECTING = ["opening", "followup"] as const;
const REAL_SENT: MessageStatus[] = ["sent", "delivered", "read"];
const LIVE_PENDING: MessageStatus[] = ["draft", "approved", "sending"];

export function toTemplateLead(lead: Lead): TemplateLead {
  return {
    id: lead.id,
    name: lead.name,
    neighborhood: lead.neighborhood,
    city: lead.city,
    category: lead.category,
    niche: lead.niche,
    rating: lead.rating,
    reviewsCount: lead.reviewsCount,
    websiteKind: lead.websiteKind,
  };
}

export function templateContext(s: {
  senderName: string;
  brandName: string;
  senderFullName?: string;
  senderRole?: string;
  agentFlow?: AgentFlow;
  openingMode?: OpeningMode;
}): TemplateContext {
  return { senderName: s.senderName, brandName: s.brandName, senderFullName: s.senderFullName, senderRole: s.senderRole, flow: s.agentFlow, mode: s.openingMode };
}

/** A última coisa dita na conversa foi uma pergunta do roteiro de qualificação (que não a do tipo) ainda sem resposta? */
async function awaitingStepAnswer(repo: Repo, conversationId: string): Promise<boolean> {
  const recent = await repo.listMessages({ conversationId, order: "desc", limit: 8 });
  const last = recent.find((m) => !["draft", "cancelled", "failed"].includes(m.status));
  const q = last && last.direction === "out" ? askedQuestion(last.variant) : null;
  return q !== null && q !== "tipo";
}

/**
 * No fluxo "qualificar": o dono mandou um link (pelo celular ou pelo painel) enquanto o lead espera a prévia que pediu?
 * Então é a entrega da prévia, e o agente continua quando o lead responder, em vez de largar a conversa.
 */
export async function isPreviewDelivery(repo: Repo, conv: Conversation, lead: Lead, text: string | null | undefined): Promise<boolean> {
  if (!text || !/https?:\/\/\S+/i.test(text)) return false;
  if ((await repo.getSettings()).agentFlow !== "qualificar") return false;
  const recent = await repo.listMessages({ conversationId: conv.id, order: "desc", limit: 80 });
  const messages = recent.filter((m) => !["draft", "cancelled", "failed"].includes(m.status)).reverse();
  return buildFicha({ lead, conversation: conv, messages, demos: [], proposals: [], flow: "qualificar" }).previewPending;
}

// ───────────────────────── preparar o lote ─────────────────────────

/**
 * O estilo de cada abertura de um lote (saudação, apresentação, pergunta e ângulo), escolhido para NÃO repetir o que saiu
 * há pouco em nenhum número (veja `variation.ts`). Cada escolha entra no histórico antes da próxima, então as aberturas do
 * mesmo lote também diferem entre si.
 */
async function chooseStyles(repo: Repo, leads: TemplateLead[], ctx: TemplateContext, rng: () => number): Promise<(OpeningStyle | null)[]> {
  if (ctx.flow !== "qualificar" || leads.length === 0) return leads.map(() => null);
  const recent = await repo.listMessages({
    kinds: ["opening"],
    direction: "out",
    statuses: ["draft", "approved", "sending", "sent", "delivered", "read", "simulated"],
    order: "desc",
    limit: 200,
  });
  const chronological = recent.slice().reverse();
  const history = historyFrom(chronological.map((m) => m.variant), ctx.mode === "curta" ? "curta" : "completa");
  const bodies = chronological.slice(-30).map((m) => m.body);
  const styles: (OpeningStyle | null)[] = [];
  for (const lead of leads) {
    const choice = chooseOpeningStyle({ lead, ctx, history, recentBodies: bodies, rng });
    if (choice) remember(history, bodies, choice, choice.body);
    styles.push(choice?.style ?? null);
  }
  return styles;
}

export interface PrepareResult {
  day: string;
  cap: number;
  alreadyPrepared: number;
  /** Rascunhos e aprovadas de dias anteriores que ainda não saíram: contam no teto de hoje. */
  carriedOver: number;
  openings: number;
  followUps: number;
  /** Quantas aberturas o agente escreveu com IA (o resto saiu dos modelos) e, se a IA falhou, por quê. */
  written: { ia: number; modelo: number; notes: string[] };
  /** Candidatos que ficaram de fora e por quê. */
  skipped: Record<string, number>;
}

/**
 * Escreve os rascunhos do dia: primeiro os follow-ups que venceram, depois aberturas novas
 * (melhores notas primeiro) até completar o teto do dia. NADA sai daqui: tudo nasce "draft".
 */
export async function prepareBatch(
  repo: Repo,
  now: Date,
  opts: {
    limit?: number;
    /** Leads fictícios só entram no modo demonstração (que nunca tem WhatsApp de verdade). */
    allowDemoLeads?: boolean;
    /** A IA que escreve as aberturas (fluxo "qualificar"). Sem ela valem os modelos do banco de ângulos. */
    llm?: LlmClient | null;
    /** O sorteio da variação das aberturas (testes passam um fixo). */
    rng?: () => number;
  } = {},
): Promise<PrepareResult> {
  const allowDemo = opts.allowDemoLeads ?? repo.mode === "demo";
  const settings = await repo.getSettings();
  const cfg = settings.automation;
  const ctx = templateContext(settings);
  const day = localParts(now, cfg.timezone).ymd;
  // Com vários números cada um tem o seu teto, e as aberturas novas não saem daqui: o dono escolhe o número de cada grupo de
  // leads (veja `prepareLeadsForAccount`). Aqui entram só os follow-ups, que seguem o número que abordou o lead.
  const roster = await loadRoster(repo);
  const cap = roster.multi
    ? roster.active.filter((a) => !a.paused).reduce((sum, a) => sum + dailyCapFor(day, effectiveConfig(a, cfg)), 0)
    : (opts.limit ?? dailyCapFor(day, cfg));

  const today = await repo.listMessages({ batchDay: day, kinds: [...PROSPECTING], limit: 1000 });
  const alreadyPrepared = today.filter((m) => m.status !== "cancelled" && m.status !== "failed").length;
  // O que sobrou de dias anteriores (rascunho ou aprovada que não saiu) ainda vai sair e disputa o teto de hoje: sem contar,
  // um dia parado dobraria a fila e o dono aprovaria mais do que cabe. Desconta só das aberturas novas: follow-up vencido
  // tem prioridade e continua entrando.
  const leftover = await repo.listMessages({ kinds: [...PROSPECTING], statuses: ["draft", "approved"], limit: 1000 });
  const carriedOver = leftover.filter((m) => m.batchDay && m.batchDay < day).length;
  let room = roster.multi ? Number.POSITIVE_INFINITY : Math.max(0, cap - alreadyPrepared);
  const roomLeft = new Map<string, number>();
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  // 1) follow-ups vencidos
  let followUps = 0;
  const convs = await repo.listConversations({ statuses: ["active"], limit: 500 });
  // Quem só recebeu o robô do negócio (nenhuma pessoa escreveu): a 1ª cutucada vem no dia seguinte, e só num dia em que o robô diz que
  // atende, em vez de esperar os 2 dias de quem recebeu a mensagem e ficou quieto.
  const botTexts = new Map<string, string>();
  for (const m of await repo.listMessages({ direction: "in", kinds: ["reply"], order: "asc", limit: 5000 })) {
    if (isAutoReplyMessage(m)) botTexts.set(m.conversationId, `${botTexts.get(m.conversationId) ?? ""}\n${m.body}`);
  }
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  const dueConvs = convs.rows.filter((c) => {
    if (c.humanTakenOver || c.lastInboundAt || !c.lastOutboundAt) return false;
    if (c.touches < 1 || c.touches >= cfg.maxTouches) return false;
    const bot = c.touches === 1 ? botTexts.get(c.id) : undefined;
    if (bot !== undefined && !opensOn(bot, weekday)) {
      skip("robô: o negócio não atende hoje");
      return false;
    }
    const wait = bot !== undefined ? Math.min(1, cfg.followUpDays[c.touches - 1] ?? 1) : cfg.followUpDays[c.touches - 1];
    if (wait === undefined) return false;
    const from = localParts(new Date(c.lastOutboundAt), cfg.timezone).ymd;
    const days = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
    return days >= wait;
  });
  if (dueConvs.length > 0 && room > 0) {
    const leads = new Map((await repo.getLeads(dueConvs.map((c) => c.leadId))).map((l) => [l.id, l]));
    const optouts = await repo.findOptouts(dueConvs.map((c) => c.phoneE164));
    for (const c of dueConvs) {
      if (room <= 0) break;
      const owner = roster.multi ? ownerOf(roster, c.accountId) : null;
      if (roster.multi) {
        if (!owner || owner.retired) {
          skip("número aposentado");
          continue;
        }
        if (!roomLeft.has(owner.id)) {
          const used = today.filter((m) => (m.accountId ?? roster.defaultId) === owner.id && m.status !== "cancelled" && m.status !== "failed").length;
          roomLeft.set(owner.id, Math.max(0, dailyCapFor(day, effectiveConfig(owner, cfg)) - used));
        }
        if ((roomLeft.get(owner.id) ?? 0) <= 0) {
          skip("teto do número");
          continue;
        }
      }
      const lead = leads.get(c.leadId);
      if (!lead || lead.stage !== "contatado") {
        skip("lead fora da etapa Contatado");
        continue;
      }
      if (optouts.has(c.phoneE164)) {
        skip("pediu para não receber");
        continue;
      }
      const pending = await repo.listMessages({ conversationId: c.id, kinds: [...PROSPECTING], statuses: LIVE_PENDING, limit: 1 });
      if (pending.length > 0) continue;
      const step = c.touches as 1 | 2;
      // o follow-up acompanha a abertura que o lead recebeu: quem recebeu a curta não leu nada sobre site; quem recebeu a de sempre, sim
      const opener = (await repo.listMessages({ conversationId: c.id, kinds: ["opening"], direction: "out", limit: 1 }))[0];
      const mode: OpeningMode = isShortVariant(opener?.variant) ? "curta" : "completa";
      const { body, variant } =
        step === 1 && botTexts.has(c.id) ? buildBotFollowUp(toTemplateLead(lead), { ...ctx, mode }) : buildFollowUp(toTemplateLead(lead), step, { ...ctx, mode });
      await repo.createMessages([
        { conversationId: c.id, leadId: lead.id, direction: "out", kind: "followup", step, body: adaptGreeting(body, now, cfg.timezone), variant, status: "draft", createdBy: "system", batchDay: day },
      ]);
      followUps++;
      room--;
      if (owner) roomLeft.set(owner.id, (roomLeft.get(owner.id) ?? 1) - 1);
    }
  }

  // 2) aberturas novas, das melhores notas para baixo: primeiro escolhe quem entra, depois o agente escreve todas
  room = Math.max(0, room - carriedOver);
  let openings = 0;
  const written = { ia: 0, modelo: 0, notes: [] as string[] };
  if (room > 0 && !roster.multi) {
    const chosen: { lead: Lead; conversationId: string }[] = [];
    const { rows } = await repo.listLeads({ stages: ["qualificado"], eligible: true, sort: "score", limit: Math.max(room * 4, 20), offset: 0 });
    const optouts = await repo.findOptouts(rows.map((l) => l.phoneE164).filter((p): p is string => !!p));
    for (const lead of rows) {
      if (room <= 0) break;
      if (lead.source === "demo" && !allowDemo) {
        skip("lead de demonstração"); // nunca abordar dados fictícios
        continue;
      }
      if (!lead.phoneE164 || !lead.isMobile || lead.permanentlyClosed) {
        skip("sem celular válido");
        continue;
      }
      if (lead.whatsappStatus === "no") {
        skip("número sem WhatsApp");
        continue;
      }
      if (optouts.has(lead.phoneE164)) {
        skip("pediu para não receber");
        continue;
      }
      const existing = await repo.findConversationByLead(lead.id);
      if (existing) {
        const any = await repo.listMessages({ conversationId: existing.id, limit: 1 });
        if (any.length > 0) {
          skip("já tem conversa");
          continue;
        }
      }
      const conv = existing ?? (await repo.ensureConversation(lead.id, lead.phoneE164));
      chosen.push({ lead, conversationId: conv.id });
      room--;
    }

    const templateLeads = chosen.map((c) => toTemplateLead(c.lead));
    const styles = await chooseStyles(repo, templateLeads, ctx, opts.rng ?? Math.random);
    const texts = await writeOpenings(templateLeads, ctx, { llm: opts.llm, facts: factsFromSettings(settings) }, { styles });
    for (const [i, c] of chosen.entries()) {
      const { body, variant, source, note } = texts[i];
      await repo.createMessages([
        { conversationId: c.conversationId, leadId: c.lead.id, direction: "out", kind: "opening", step: 0, body: adaptGreeting(body, now, cfg.timezone), variant, status: "draft", createdBy: "system", batchDay: day },
      ]);
      openings++;
      if (source === "ia") written.ia++;
      else written.modelo++;
      if (note && written.notes.length < 3 && !written.notes.includes(note)) written.notes.push(note);
    }
  }

  await repo.addEvents([{ leadId: null, type: "lote_preparado", payload: { day, count: openings + followUps, openings, followUps, ia: written.ia } }]);
  return { day, cap, alreadyPrepared, carriedOver, openings, followUps, written, skipped };
}

export interface RewriteResult {
  rewritten: number;
  /** Quantas ficaram com texto escrito pela IA (as outras voltaram para o modelo do ângulo). */
  ia: number;
  skipped: number;
  notes: string[];
}

/**
 * Reescreve rascunhos de abertura com o agente (ou tira um novo texto para um só). Só mexe em rascunho: o que já foi
 * aprovado não muda. Texto que o dono editou à mão também é trocado; quem chama avisa isso antes.
 */
export async function rewriteOpenings(repo: Repo, ids: string[] | null, opts: { llm?: LlmClient | null; rng?: () => number; now?: Date } = {}): Promise<RewriteResult> {
  const settings = await repo.getSettings();
  const ctx = templateContext(settings);
  const found: Message[] = [];
  if (ids) {
    for (const id of ids) {
      const m = await repo.getMessage(id);
      if (m) found.push(m);
    }
  } else {
    found.push(...(await repo.listMessages({ statuses: ["draft"], kinds: ["opening"], direction: "out", limit: 500 })));
  }
  const drafts = found.filter((m) => m.direction === "out" && m.kind === "opening" && m.status === "draft");
  const leads = new Map((await repo.getLeads([...new Set(drafts.map((m) => m.leadId))])).map((l) => [l.id, l]));
  const targets = drafts.filter((m) => leads.has(m.leadId));
  const templateLeads = targets.map((m) => toTemplateLead(leads.get(m.leadId)!));
  const styles = await chooseStyles(repo, templateLeads, ctx, opts.rng ?? Math.random);
  const texts = await writeOpenings(templateLeads, ctx, { llm: opts.llm, facts: factsFromSettings(settings) }, { styles });
  const notes: string[] = [];
  let ia = 0;
  for (const [i, m] of targets.entries()) {
    await repo.updateMessage(m.id, { body: adaptGreeting(texts[i].body, opts.now ?? new Date(), settings.automation.timezone), variant: texts[i].variant });
    if (texts[i].source === "ia") ia++;
    const note = texts[i].note;
    if (note && notes.length < 3 && !notes.includes(note)) notes.push(note);
  }
  return { rewritten: targets.length, ia, skipped: found.length - targets.length, notes };
}

export interface PrepareForAccountResult {
  account: string;
  day: string;
  /** Quantos rascunhos de abertura foram escritos. */
  prepared: number;
  /** Quantas aberturas o agente escreveu com IA (o resto saiu dos modelos) e, se a IA falhou, por quê. */
  written: { ia: number; modelo: number; notes: string[] };
  /** Os leads que ficaram de fora e por quê. */
  skipped: Record<string, number>;
  /** Teto de abordagens novas por dia deste número hoje: serve para dizer em quantos dias esse lote sai. */
  capPerDay: number;
}

/**
 * O dono escolheu um número para um grupo de leads liberados: o agente escreve a abertura de cada um, já como conversa DESTE
 * número, e os rascunhos esperam o OK na Fila. Mesmas travas do lote do dia (celular válido, sem opt-out, só Qualificado,
 * nada de dado fictício). O lead que só tem mensagens canceladas pode mudar de número; o que já foi abordado fica com o
 * número que o abordou. NADA sai daqui: tudo nasce "draft".
 */
export async function prepareLeadsForAccount(
  repo: Repo,
  now: Date,
  input: { leadIds: string[]; accountId: string; llm?: LlmClient | null; rng?: () => number; allowDemoLeads?: boolean },
): Promise<PrepareForAccountResult> {
  const roster = await loadRoster(repo);
  const account = roster.byId.get(input.accountId);
  if (!account || account.retired) throw new Error("Esse número não existe mais. Escolha outro.");

  const allowDemo = input.allowDemoLeads ?? repo.mode === "demo";
  const settings = await repo.getSettings();
  const cfg = settings.automation;
  const ctx = templateContext(settings);
  const day = localParts(now, cfg.timezone).ymd;
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  const found = await repo.getLeads([...new Set(input.leadIds)]);
  const leads = found.slice().sort((a, b) => b.score - a.score);
  const optouts = await repo.findOptouts(leads.map((l) => l.phoneE164).filter((p): p is string => !!p));

  const chosen: { lead: Lead; conversationId: string }[] = [];
  for (const lead of leads) {
    if (lead.source === "demo" && !allowDemo) {
      skip("lead de demonstração");
      continue;
    }
    if (lead.stage !== "qualificado" || !lead.eligible) {
      skip("fora de Qualificado");
      continue;
    }
    if (!lead.phoneE164 || !lead.isMobile || lead.permanentlyClosed) {
      skip("sem celular válido");
      continue;
    }
    if (lead.whatsappStatus === "no") {
      skip("número sem WhatsApp");
      continue;
    }
    if (optouts.has(lead.phoneE164)) {
      skip("pediu para não receber");
      continue;
    }
    const existing = await repo.findConversationByLead(lead.id);
    if (existing) {
      const msgs = await repo.listMessages({ conversationId: existing.id, limit: 100 });
      if (msgs.some((m) => LIVE_PENDING.includes(m.status))) {
        skip("já está na Fila");
        continue;
      }
      if (existing.touches > 0 || existing.lastInboundAt || msgs.some((m) => !["cancelled", "failed"].includes(m.status))) {
        skip("já foi abordado");
        continue;
      }
      // só tinha rascunhos cancelados: ainda não falou com ninguém, então pode mudar de número
      const ownerId = roster.multi ? ownerOf(roster, existing.accountId)?.id : null;
      if (roster.multi && ownerId !== account.id) await repo.updateConversation(existing.id, { accountId: account.id });
    }
    const conv = existing ?? (await repo.ensureConversation(lead.id, lead.phoneE164, roster.multi ? account.id : null));
    chosen.push({ lead, conversationId: conv.id });
  }

  const templateLeads = chosen.map((c) => toTemplateLead(c.lead));
  const styles = await chooseStyles(repo, templateLeads, ctx, input.rng ?? Math.random);
  const texts = await writeOpenings(templateLeads, ctx, { llm: input.llm, facts: factsFromSettings(settings) }, { styles });
  const written = { ia: 0, modelo: 0, notes: [] as string[] };
  for (const [i, c] of chosen.entries()) {
    const { body, variant, source, note } = texts[i];
    await repo.createMessages([
      { conversationId: c.conversationId, leadId: c.lead.id, direction: "out", kind: "opening", step: 0, body: adaptGreeting(body, now, cfg.timezone), variant, status: "draft", createdBy: "system", batchDay: day },
    ]);
    if (source === "ia") written.ia++;
    else written.modelo++;
    if (note && written.notes.length < 3 && !written.notes.includes(note)) written.notes.push(note);
  }

  const capPerDay = dailyCapFor(day, effectiveConfig(account, cfg));
  await repo.addEvents([
    { leadId: null, type: "lote_preparado", payload: { day, count: chosen.length, openings: chosen.length, followUps: 0, ia: written.ia, account: account.name } },
  ]);
  return { account: account.name, day, prepared: chosen.length, written, skipped, capPerDay };
}

// ───────────────────────── aprovar e cancelar ─────────────────────────

export interface ApproveResult {
  approved: number;
  skipped: number;
  /** Primeiro e último horário marcados para abordagens. */
  firstAt: string | null;
  lastAt: string | null;
}

function dayOf(iso: string | null, cfg: AutomationConfig): string | null {
  return iso ? localParts(new Date(iso), cfg.timezone).ymd : null;
}

/**
 * Aprova rascunhos e marca a hora de cada um. Abordagens vão para as janelas permitidas, com
 * intervalo aleatório e respeitando o teto do dia (o que não cabe vai para o próximo dia útil).
 * Respostas a quem escreveu saem em segundos.
 */
export async function approveMessages(
  repo: Repo,
  ids: string[],
  now: Date,
  rng: () => number,
): Promise<ApproveResult> {
  const settings = await repo.getSettings();
  const cfg = settings.automation;

  const drafts: Message[] = [];
  for (const id of ids) {
    const m = await repo.getMessage(id);
    // rascunho sem texto não se aprova: iria para a fila e o WhatsApp recusaria
    if (m && m.direction === "out" && m.status === "draft" && m.body.trim() !== "") drafts.push(m);
  }
  const skipped = ids.length - drafts.length;
  if (drafts.length === 0) return { approved: 0, skipped, firstAt: null, lastAt: null };

  const prospecting = drafts.filter((m) => m.kind === "opening" || m.kind === "followup");
  const replies = drafts.filter((m) => m.kind !== "opening" && m.kind !== "followup");
  const stamp = now.toISOString();
  let firstAt: string | null = null;
  let lastAt: string | null = null;

  if (prospecting.length > 0) {
    // Cada número tem a sua fila, o seu teto e o seu intervalo: os horários são planejados por número. Com um número só há
    // um grupo só e nada filtra por número (igual a sempre).
    const roster = await loadRoster(repo);
    const groups = new Map<string, { account: Account | null; list: Message[] }>();
    for (const m of prospecting) {
      const account = roster.multi ? ownerOf(roster, m.accountId) : null;
      const key = account?.id ?? "";
      const group = groups.get(key) ?? { account, list: [] };
      group.list.push(m);
      groups.set(key, group);
    }

    for (const { account, list } of groups.values()) {
      const acfg = account ? effectiveConfig(account, cfg) : cfg;
      // follow-ups primeiro (quem já foi abordado), depois aberturas, na ordem de criação
      list.sort((a, b) => b.step - a.step || a.createdAt.localeCompare(b.createdAt));
      const booked = await repo.listMessages({
        kinds: [...PROSPECTING],
        statuses: ["approved", "sending", ...REAL_SENT],
        ...(account ? { accountId: account.id } : {}),
        limit: 1000,
      });
      const latestScheduled = booked
        .filter((m) => m.status === "approved" || m.status === "sending")
        .map((m) => (m.scheduledFor ? Date.parse(m.scheduledFor) : 0))
        .reduce((a, b) => Math.max(a, b), 0);
      const start = new Date(Math.max(now.getTime(), latestScheduled ? latestScheduled + acfg.gapMinSec * 1000 : 0));
      const startDay = localParts(start, acfg.timezone).ymd;
      const usedOnStartDay = booked.filter((m) => dayOf(m.sentAt ?? m.scheduledFor, acfg) === startDay).length;

      const times = planSchedule({ count: list.length, now: start, cfg: acfg, rng, usedToday: usedOnStartDay });
      for (let i = 0; i < list.length; i++) {
        const at = times[i].toISOString();
        await repo.updateMessage(list[i].id, { status: "approved", approvedAt: stamp, scheduledFor: at, error: null });
      }
      const first = times[0].toISOString();
      const last = times[times.length - 1].toISOString();
      if (!firstAt || first < firstAt) firstAt = first;
      if (!lastAt || last > lastAt) lastAt = last;
    }
  }

  for (const m of replies) {
    const at = new Date(now.getTime() + 15_000 + Math.round(rng() * 60_000)).toISOString();
    await repo.updateMessage(m.id, { status: "approved", approvedAt: stamp, scheduledFor: at, error: null });
  }

  await repo.addEvents([{ leadId: null, type: "lote_aprovado", payload: { count: drafts.length } }]);
  return { approved: drafts.length, skipped, firstAt, lastAt };
}

/**
 * Cancela da Fila. Inclui "sending": a Fila mostra essas mensagens em Agendadas, e uma que o worker pegou e não terminou
 * (o painel reiniciou no meio do envio) ficava lá sem que o botão pudesse tirá-la. Se o worker estiver mesmo enviando agora,
 * o que ele gravar depois vale: saiu, saiu; se falhar, ele não a devolve à fila (veja `settle`).
 */
export async function cancelMessages(repo: Repo, ids: string[], reason = "cancelada pelo dono"): Promise<number> {
  return repo.bulkUpdateMessages(ids, ["draft", "approved", "sending", "simulated"], { status: "cancelled", error: reason });
}

export interface ReopenResult {
  reopened: number;
  skipped: number;
}

/**
 * Devolve mensagens CANCELADAS para rascunho (o dono cancelou sem querer ou mudou de ideia). Nada sai
 * antes de aprovar de novo, e a aprovação marca um horário novo. Não reabre para quem pediu para não
 * receber mensagens.
 */
export async function reopenMessages(repo: Repo, ids: string[]): Promise<ReopenResult> {
  let reopened = 0;
  let skipped = 0;
  for (const id of ids) {
    const m = await repo.getMessage(id);
    if (!m || m.direction !== "out" || m.status !== "cancelled") {
      skipped++;
      continue;
    }
    const conv = await repo.getConversation(m.conversationId);
    const blocked = conv ? (await repo.findOptouts([conv.phoneE164])).has(conv.phoneE164) : true;
    if (!conv || conv.status === "opted_out" || blocked) {
      skipped++;
      continue;
    }
    await repo.updateMessage(m.id, { status: "draft", scheduledFor: null, approvedAt: null, error: null });
    reopened++;
  }
  return { reopened, skipped };
}

export interface SyncQueueResult extends RescheduleResult {
  /** A fila foi planejada de novo. */
  reorganized: boolean;
  /** Quantas aberturas e follow-ups aprovados esperavam a hora. */
  queue: number;
  /** As regras que mexem nos horários (janelas, dias, tetos, intervalo) mudaram. */
  changed: boolean;
  /** A fila já estava fora das regras de agora (madrugada, dia sem envio, dia acima do teto). */
  outOfRules: boolean;
}

/**
 * O dono salvou as regras de envio: a fila aprovada é planejada de novo com as regras NOVAS (veja `reschedule.ts`). Reorganiza
 * quando as regras que mexem nos horários mudaram OU quando a fila já está fora das regras de agora (o horário foi mudado antes e a
 * fila ficou com a madrugada). Se a fila já está certa, não mexe em nada.
 */
export async function syncQueueWithRules(repo: Repo, before: AutomationConfig, after: AutomationConfig, now: Date, rng: () => number): Promise<SyncQueueResult> {
  const check = await checkQueue(repo, after, now);
  const changed = scheduleSignature(before) !== scheduleSignature(after);
  const outOfRules = check.outsideWindow + check.overCap > 0;
  if (check.total === 0 || (!changed && !outOfRules)) return { reorganized: false, queue: check.total, changed, outOfRules, rescheduled: 0, firstAt: null, lastAt: null };
  const r = await rescheduleQueue(repo, (ids) => approveMessages(repo, ids, now, rng));
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `fila reorganizada com as regras de envio novas: ${r.rescheduled} mensagens` } }]);
  return { reorganized: true, queue: check.total, changed, outOfRules, ...r };
}

/**
 * Retoma a automação depois de uma pausa, reorganizando o que ficou parado (veja `resume.ts`): o que já estava aprovado
 * ganha horário novo, a resposta velha do agente volta como rascunho e os rascunhos de ontem ficam esperando o dono.
 */
export function resumeNow(repo: Repo, now: Date, rng: () => number): Promise<ResumeResult> {
  return resumeAutomation(repo, now, (ids) => approveMessages(repo, ids, now, rng));
}

/** Devolve as mensagens simuladas para a fila (ao sair da simulação). Voltam a rascunho e são reaprovadas com horário novo. */
export async function requeueSimulated(repo: Repo, now: Date, rng: () => number): Promise<number> {
  const sim = await repo.listMessages({ statuses: ["simulated"], direction: "out", limit: 500 });
  if (sim.length === 0) return 0;
  await repo.bulkUpdateMessages(
    sim.map((m) => m.id),
    ["simulated"],
    { status: "draft", sentAt: null, error: null },
  );
  const r = await approveMessages(repo, sim.map((m) => m.id), now, rng);
  return r.approved;
}

// ───────────────────────── o worker: uma mensagem por vez ─────────────────────────

export type TickResult =
  | { action: "paused"; reason: string | null }
  | { action: "offline"; reason: string }
  | { action: "idle" }
  | { action: "deferred"; messageId: string; until: string; reason: string }
  | { action: "cancelled"; messageId: string; reason: string }
  | { action: "simulated"; messageId: string }
  | { action: "sent"; messageId: string }
  | { action: "failed"; messageId: string; error: string; paused: boolean };

export interface TickDeps {
  repo: Repo;
  provider: WhatsAppProvider;
  now: Date;
  rng: () => number;
  sleep: (ms: number) => Promise<void>;
  /** A IA que escreve as aberturas do lote do dia sozinho (caixa "autoBatch"). Sem ela valem os modelos. */
  llm?: LlmClient | null;
  /** A volta é deste número (fila, teto, pausa e estado próprios). Sem ele é o painel de um número só. */
  account?: Account | null;
}

async function pauseAutomation(repo: Repo, reason: string) {
  await repo.saveAutomation({ paused: true, pausedReason: reason });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `pausada: ${reason}` } }]);
}

/** Pausa o número que teve o problema (os outros seguem) ou, num painel de um número só, a automação inteira. */
async function pauseFor(repo: Repo, account: Account | null | undefined, reason: string) {
  if (!account) return pauseAutomation(repo, reason);
  await repo.updateAccount(account.id, { paused: true, pausedReason: reason });
  await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `${account.name} pausado: ${reason}` } }]);
}

/** Onde o worker guarda o que lembra: no estado do número ou, sem número, no estado geral de sempre. */
function stateSaver(repo: Repo, account: Account | null | undefined) {
  return (patch: Partial<AccountState>) => (account ? repo.saveAccountState(account.id, patch) : repo.saveAutomationState(patch));
}

/**
 * O worker só mexe numa mensagem que continua "enviando". Se o dono a cancelou enquanto ela estava nas mãos do worker,
 * a decisão dele vale e o worker não a devolve à fila (a gravação condicional é atômica no banco).
 */
async function settle(repo: Repo, msg: Message, patch: Parameters<Repo["updateMessage"]>[1]): Promise<void> {
  await repo.bulkUpdateMessages([msg.id], ["sending"], patch);
}

async function defer(repo: Repo, msg: Message, until: Date, reason: string): Promise<TickResult> {
  await settle(repo, msg, {
    status: "approved",
    scheduledFor: until.toISOString(),
    attempts: Math.max(0, msg.attempts - 1),
    error: reason,
  });
  return { action: "deferred", messageId: msg.id, until: until.toISOString(), reason };
}

async function cancel(repo: Repo, msg: Message, reason: string): Promise<TickResult> {
  await repo.updateMessage(msg.id, { status: "cancelled", error: reason });
  return { action: "cancelled", messageId: msg.id, reason };
}

/** Se o texto que acabou de sair leva o link de uma prévia deste lead, a prévia passa a constar como enviada. */
async function markDemosSent(repo: Repo, leadId: string, body: string, stamp: string): Promise<void> {
  try {
    const slugs = new Set([...body.matchAll(/\/p\/([a-z0-9]{16,40})/g)].map((m) => m[1]));
    if (slugs.size === 0) return;
    for (const demo of await repo.listDemos({ leadId, limit: 20 })) {
      if (slugs.has(demo.slug) && !demo.sentAt) await repo.updateDemo(demo.id, { sentAt: stamp });
    }
  } catch (error) {
    // não derruba um envio que já saiu
    console.error("marcar prévia como enviada:", error);
  }
}

/**
 * Uma volta do worker: no máximo UMA mensagem sai por chamada. As travas, em ordem:
 * pausa geral → parada automática → conexão → regras de cada mensagem (opt-out, janela, teto,
 * intervalo) → simulação ou envio. Quem chama (o loop do PC) repete a cada ~20 s.
 *
 * Com `deps.account` a volta é daquele número: fila, teto, intervalo, pausa e parada automática são DELE (quem passa por
 * todos os números é `tickAll`). Sem `account` é o painel de um número só, exatamente como sempre foi.
 */
export async function tick(deps: TickDeps): Promise<TickResult> {
  const { repo, provider, now, rng, account } = deps;
  const settings = await repo.getSettings();
  const globalCfg = settings.automation;
  // as regras do número: as gerais (janelas, dias, intervalos) com o teto e o aquecimento dele por cima
  const cfg = account ? effectiveConfig(account, globalCfg) : globalCfg;
  const autoState = account ? null : await repo.getAutomationState();
  const state: AccountState = account ? await repo.getAccountState(account.id) : autoState!;
  const saveState = stateSaver(repo, account);
  if (!account) await repo.saveAutomationState({ lastTickAt: now.toISOString() });

  if (globalCfg.paused) return { action: "paused", reason: globalCfg.pausedReason };
  if (account?.paused) return { action: "paused", reason: account.pausedReason };

  const counts = account ? await accountCounts(repo, account.id) : await repo.messageCounts();
  const stop = evaluateStop(counts, cfg);
  if (stop.stop) {
    await pauseFor(repo, account, stop.reason ?? "parada automática");
    return { action: "paused", reason: stop.reason ?? null };
  }

  const live = !cfg.dryRun;
  if (live) {
    if (provider.mode !== "gowa") return { action: "offline", reason: "Envio real ligado, mas o GOWA não está configurado (GOWA_URL)." };
    const status = await provider.status();
    // O aparelho do número foi apagado no GOWA: nada pode sair por ele. Pausa só este número, com o motivo, para ninguém
    // achar que está tudo bem; a fila e as conversas dele ficam como estão até ele ganhar um aparelho novo (Números).
    if (status.missing && account) {
      await pauseFor(repo, account, "O aparelho dele foi apagado do GOWA. Conecte um aparelho novo em Números.");
      return { action: "offline", reason: status.detail };
    }
    if (!status.connected) return { action: "offline", reason: status.detail };
  }

  // O lote do dia sozinho e as cutucadas são do painel inteiro, não de um número: com vários, `tickAll` roda uma vez só.
  if (autoState) await housekeeping(deps, globalCfg, autoState);

  const msg = await repo.claimNextDueMessage(now.toISOString(), account?.id);
  if (!msg) return { action: "idle" };

  try {
    return await deliver(deps, msg, { cfg, state, live });
  } catch (error) {
    // Um erro entre pegar a mensagem e ela sair (banco, rede) a devolve à fila. Sem isto ela ficava presa em "enviando":
    // o worker só pega "aprovada", então nada a tirava de lá.
    const text = error instanceof Error ? error.message : String(error);
    console.error("envio:", error);
    const failures = state.consecutiveFailures + 1;
    await saveState({ consecutiveFailures: failures, lastResult: `falha: ${text}` });
    if (msg.attempts >= 3) {
      await settle(repo, msg, { status: "failed", error: text });
    } else {
      await settle(repo, msg, { status: "approved", scheduledFor: new Date(now.getTime() + gapMs(rng, cfg)).toISOString(), error: text });
    }
    const paused = failures >= cfg.maxConsecutiveFailures;
    if (paused) await pauseFor(repo, account, `${failures} falhas de envio seguidas. Último erro: ${text}`);
    return { action: "failed", messageId: msg.id, error: text, paused };
  }
}

/**
 * Lote do dia sozinho: o dono autorizou o agente a preparar e aprovar a Fila. Roda uma vez por dia, dentro do horário
 * permitido; teto, aquecimento, janela e intervalo continuam valendo (approveMessages e as travas deste worker). Depois, quem
 * viu o portfólio ou o valor e sumiu recebe uma cutucada (uma só) e, sem resposta, a conversa vem para o dono fechar.
 */
async function housekeeping(deps: TickDeps, cfg: AutomationConfig, state: AutomationState): Promise<void> {
  const { repo, now, rng } = deps;
  if (cfg.autonomy === "semi" && cfg.autoBatch && inWindow(now, cfg)) {
    const today = localParts(now, cfg.timezone).ymd;
    if (state.lastAutoBatchDay !== today) {
      // grava antes: se algo falhar, o lote não se repete a cada volta do worker
      await repo.saveAutomationState({ lastAutoBatchDay: today });
      try {
        const prepared = await prepareBatch(repo, now, { llm: deps.llm });
        const drafts = await repo.listMessages({ batchDay: today, kinds: [...PROSPECTING], statuses: ["draft"], limit: 1000 });
        const approved = drafts.length > 0 ? await approveMessages(repo, drafts.map((m) => m.id), now, rng) : null;
        await repo.addEvents([
          {
            leadId: null,
            type: "automacao",
            payload: {
              text: approved
                ? `agente preparou e aprovou o lote do dia: ${approved.approved} mensagens (${prepared.openings} aberturas, ${prepared.followUps} follow-ups)`
                : "agente verificou o lote do dia: nada novo para enviar",
            },
          },
        ]);
      } catch (error) {
        console.error("lote do dia sozinho:", error);
        await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: `agente não conseguiu preparar o lote do dia: ${error instanceof Error ? error.message : String(error)}` } }]);
      }
    }
  }

  await runNudges(repo, now, cfg, rng);
}

export interface TickAllDeps extends Omit<TickDeps, "account"> {
  /** O WhatsApp de cada número (o aparelho dele no GOWA). `provider` é o padrão, de um número só. */
  providerFor: (account: Account) => WhatsAppProvider;
}

export type TickAllResult = TickResult | { action: "multi"; accounts: { id: string; name: string; result: TickResult }[] };

/**
 * Uma volta do worker com vários números. Com um número só (ou nenhum cadastrado) é a `tick` de sempre. Com vários, o lote do
 * dia sozinho e as cutucadas rodam uma vez, e cada número ativo tem a sua volta, em ordem sorteada: no máximo UMA mensagem
 * sai por volta no total (a volta termina no primeiro envio), então dois números nunca mandam no mesmo instante.
 */
export async function tickAll(deps: TickAllDeps): Promise<TickAllResult> {
  const { repo, now } = deps;
  const roster = await loadRoster(repo);
  if (!roster.multi) return tick(deps);

  const settings = await repo.getSettings();
  const autoState = await repo.getAutomationState();
  await repo.saveAutomationState({ lastTickAt: now.toISOString() });
  if (settings.automation.paused) return { action: "paused", reason: settings.automation.pausedReason };

  await housekeeping(deps, settings.automation, autoState);

  const order = roster.active
    .map((a) => ({ a, k: deps.rng() }))
    .sort((x, y) => x.k - y.k)
    .map((x) => x.a);
  const accounts: { id: string; name: string; result: TickResult }[] = [];
  for (const account of order) {
    let result: TickResult;
    try {
      result = await tick({ ...deps, provider: deps.providerFor(account), account });
    } catch (error) {
      // um número com problema (GOWA fora do ar, banco) não impede os outros
      console.error(`volta do número ${account.name}:`, error);
      result = { action: "offline", reason: error instanceof Error ? error.message : String(error) };
    }
    accounts.push({ id: account.id, name: account.name, result });
    if (result.action === "sent" || result.action === "simulated" || result.action === "failed") break;
  }
  return { action: "multi", accounts };
}

/** O que o worker já sabe quando pega uma mensagem: as regras (do número), o estado dele e se o envio real está ligado. */
interface TickContext {
  cfg: AutomationConfig;
  state: AccountState;
  live: boolean;
}

/** Passa a mensagem pegada pelas travas e a envia (ou simula, adia, cancela). */
async function deliver(deps: TickDeps, msg: Message, { cfg, state, live }: TickContext): Promise<TickResult> {
  const { repo, provider, now, rng, sleep, account } = deps;
  const saveState = stateSaver(repo, account);

  const conv = await repo.getConversation(msg.conversationId);
  const lead = await repo.getLead(msg.leadId);
  if (!conv || !lead) return cancel(repo, msg, "conversa ou lead não existe mais");
  // Mensagem sem texto nunca vai para o WhatsApp (ele recusa com "message: cannot be blank"). Não é falha de envio: sai da fila
  // sem contar para a pausa automática, que existe para pegar problema do número ou do GOWA, não de uma mensagem só.
  if (msg.body.trim() === "") return cancel(repo, msg, "mensagem sem texto");

  const prospecting = msg.kind === "opening" || msg.kind === "followup";
  const optouts = await repo.findOptouts([conv.phoneE164]);

  if (optouts.has(conv.phoneE164) || conv.status === "opted_out") return cancel(repo, msg, "pediu para não receber mensagens");
  if (!prospecting && msg.kind === "reply" && msg.createdBy === "system") {
    // segunda barreira contra a mensagem repetida (veja dedupe.ts): se a mesma resposta já saiu há pouco, esta não sai
    const dup = await findRecentDuplicate(repo, conv.id, { body: msg.body, variant: msg.variant, excludeId: msg.id }, now, {
      statuses: ["sending", "sent", "delivered", "read"],
    });
    if (dup) return cancel(repo, msg, "resposta repetida: a mesma já saiu há pouco");
  }
  if (prospecting) {
    if (conv.humanTakenOver) return cancel(repo, msg, "o dono assumiu a conversa");
    if (conv.status === "closed") return cancel(repo, msg, "conversa encerrada");
    if (lead.stage === "perdido" || lead.stage === "ganho") return cancel(repo, msg, `lead em ${lead.stage}`);
    if (msg.kind === "followup" && conv.lastInboundAt) return cancel(repo, msg, "o lead já respondeu");
    if (conv.touches >= cfg.maxTouches) return cancel(repo, msg, "limite de toques atingido");

    // janela, teto do dia e intervalo mínimo
    if (!inWindow(now, cfg)) {
      const at = new Date(nextOpening(now, cfg).getTime() + Math.round(rng() * cfg.gapMinSec * 1000));
      return defer(repo, msg, at, "fora do horário permitido");
    }
    const day = localParts(now, cfg.timezone).ymd;
    const countedStatuses: MessageStatus[] = cfg.dryRun ? [...REAL_SENT, "simulated"] : REAL_SENT;
    const sentToday = (
      await repo.listMessages({
        kinds: [...PROSPECTING],
        statuses: countedStatuses,
        sentSince: startOfLocalDay(now, cfg).toISOString(),
        ...(account ? { accountId: account.id } : {}),
        limit: 500,
      })
    ).length;
    if (sentToday >= dailyCapFor(day, cfg)) {
      const tomorrowStart = new Date(startOfLocalDay(now, cfg).getTime() + 24 * 3_600_000 + 60_000);
      const at = new Date(nextOpening(tomorrowStart, cfg).getTime() + Math.round(rng() * cfg.gapMinSec * 1000));
      return defer(repo, msg, at, "teto do dia atingido");
    }
    if (state.lastSendAt) {
      const earliest = Date.parse(state.lastSendAt) + cfg.gapMinSec * 1000;
      if (now.getTime() < earliest) return defer(repo, msg, new Date(earliest + Math.round(rng() * 30_000)), "intervalo mínimo entre envios");
    }
  }

  // simulação: registra o que sairia, sem tocar em nada do mundo real
  if (!live) {
    await repo.updateMessage(msg.id, { status: "simulated", sentAt: now.toISOString(), error: null });
    await saveState({ lastSendAt: now.toISOString(), lastResult: "simulado" });
    await repo.addEvents([{ leadId: lead.id, type: "mensagem_simulada", payload: { name: lead.name, step: msg.step, kind: msg.kind } }]);
    return { action: "simulated", messageId: msg.id };
  }

  // trava final: dado fictício jamais sai de verdade
  if (lead.source === "demo") return cancel(repo, msg, "lead de demonstração");

  // envio real: o número tem WhatsApp?
  if (prospecting && lead.whatsappStatus === "unknown") {
    const on = await provider.isOnWhatsApp(conv.phoneE164);
    if (on === false) {
      await repo.updateLead(lead.id, { whatsappStatus: "no" });
      return cancel(repo, msg, "número sem WhatsApp");
    }
    if (on === true) await repo.updateLead(lead.id, { whatsappStatus: "yes" });
  }

  // Abordagem e follow-up saem como uma pessoa escreve: um parágrafo por mensagem, cada um com o seu "digitando…".
  // Resposta a quem escreveu sai inteira. Conta como UM envio para o teto do dia e o intervalo entre envios.
  // a abertura é escrita de madrugada e sai de manhã ou de tarde: o "Bom dia" vira o cumprimento do horário em que sai de verdade
  // O que o dono escreve sai na hora e inteiro, como no celular dele: sem "digitando…" de mentira (quem digitou foi ele).
  const instant = msg.kind === "manual";
  // (e a resposta que o agente escreveu também: ela pode sair horas depois de escrita). O texto guardado passa a ser o que saiu, para a
  // conversa não mostrar "Bom dia" numa mensagem que o WhatsApp entregou como "Boa tarde".
  const greeted = prospecting || (msg.kind === "reply" && msg.createdBy === "system");
  const outgoing = greeted ? adaptGreeting(msg.body, now, cfg.timezone) : msg.body;
  const parts = prospecting ? splitMessageParts(outgoing) : [outgoing];
  let delivered = 0;
  let id: string | null = null;
  try {
    for (const [i, part] of parts.entries()) {
      if (instant) {
        ({ id } = await provider.sendText(conv.phoneE164, part));
        delivered++;
        continue;
      }
      if (i > 0) await sleep(betweenPartsMs(rng));
      await provider.typing(conv.phoneE164, true);
      try {
        await sleep(typingMs(part, rng, cfg));
        ({ id } = await provider.sendText(conv.phoneE164, part));
        delivered++;
      } finally {
        await provider.typing(conv.phoneE164, false);
      }
    }

    const stamp = now.toISOString();
    // o id da ÚLTIMA parte: quando o lead lê a conversa, é nela que o WhatsApp avisa "lida"
    await repo.updateMessage(msg.id, { status: "sent", sentAt: stamp, providerMessageId: id, error: null, ...(outgoing !== msg.body ? { body: outgoing } : {}) });
    await repo.updateConversation(conv.id, {
      lastOutboundAt: stamp,
      ...(prospecting ? { touches: conv.touches + 1 } : {}),
    });
    if (prospecting && (lead.stage === "novo" || lead.stage === "qualificado")) {
      await repo.setStage(lead.id, "contatado");
      await repo.addEvents([{ leadId: lead.id, type: "etapa", payload: { name: lead.name, from: lead.stage, to: "contatado" } }]);
    }
    await saveState({ lastSendAt: stamp, consecutiveFailures: 0, lastResult: "enviado" });
    if (!cfg.warmupStart) {
      const today = localParts(now, cfg.timezone).ymd;
      // cada número aquece a partir do SEU primeiro envio; o original continua usando o início geral
      if (account && !account.legacy) await repo.updateAccount(account.id, { warmupStart: today });
      else await repo.saveAutomation({ warmupStart: today });
    }
    await repo.addEvents([{ leadId: lead.id, type: "mensagem_enviada", payload: { name: lead.name, step: msg.step, kind: msg.kind, ...(account ? { account: account.name } : {}) } }]);
    await markDemosSent(repo, lead.id, msg.body, stamp);
    return { action: "sent", messageId: msg.id };
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    // TUDO já tinha chegado ao lead e o erro foi depois do envio (o banco falhou ao gravar "enviada", por exemplo). A mensagem
    // não volta à fila: reenviar mandaria a abertura inteira de novo, e deixar o resto vazio mandaria uma mensagem em branco
    // (foi o que pausou a automação em 26/10). Fica registrada como enviada, com o aviso do que não foi gravado.
    if (delivered > 0 && delivered === parts.length) {
      const stamp = now.toISOString();
      await settle(repo, msg, { status: "sent", sentAt: stamp, providerMessageId: id, error: `Enviada. Não deu para registrar tudo: ${text}` });
      await saveState({ lastSendAt: stamp, consecutiveFailures: 0, lastResult: "enviado" }).catch(() => undefined);
      return { action: "sent", messageId: msg.id };
    }
    // O dono vê o erro na hora e decide. Uma mensagem que ele escreveu não pode sair sozinha minutos depois, fora de contexto, e
    // uma falha dela não conta para a pausa automática (que existe para pegar problema da automação).
    if (instant) {
      await settle(repo, msg, { status: "failed", error: text });
      await repo.addEvents([{ leadId: lead.id, type: "mensagem_falhou", payload: { name: lead.name, error: text } }]);
      return { action: "failed", messageId: msg.id, error: text, paused: false };
    }
    const retryable = error instanceof ProviderError ? error.retryable : true;
    const failures = state.consecutiveFailures + 1;
    await saveState({ consecutiveFailures: failures, lastResult: `falha: ${text}` });

    // Se parte do texto já chegou ao lead, a nova tentativa manda só o que faltou (nunca repete o que ele já leu).
    const rest = delivered > 0 ? { body: parts.slice(delivered).join("\n\n") } : {};
    const partial = delivered > 0 ? ` (a parte ${delivered} de ${parts.length} já tinha saído)` : "";
    if (!retryable || msg.attempts >= 3) {
      await settle(repo, msg, { status: "failed", error: `${text}${partial}`, ...rest });
      await repo.addEvents([{ leadId: lead.id, type: "mensagem_falhou", payload: { name: lead.name, error: `${text}${partial}` } }]);
    } else {
      await settle(repo, msg, {
        status: "approved",
        scheduledFor: new Date(now.getTime() + gapMs(rng, cfg)).toISOString(),
        error: `${text}${partial}`,
        ...rest,
      });
    }
    const paused = failures >= cfg.maxConsecutiveFailures;
    if (paused) await pauseFor(repo, account, `${failures} falhas de envio seguidas. Último erro: ${text}`);
    return { action: "failed", messageId: msg.id, error: text, paused };
  }
}

export interface SendNowDeps {
  repo: Repo;
  provider: WhatsAppProvider;
  now: Date;
  /** O número da conversa, quando há vários. Sem ele é o painel de um número só. */
  account?: Account | null;
}

export type SendNowResult =
  | { sent: true; simulated: boolean; messageId: string }
  | { sent: false; reason: string; messageId?: string };

/**
 * O dono escreveu na conversa e enviou: sai NA HORA, como se ele estivesse no celular. Não entra na fila, não espera a volta
 * do worker, não finge "digitando…" e não depende da pausa da automação (a pausa é da automação, não do dono). Valem só as
 * travas que protegem o lead e o número: bloqueio (PARE), lead de demonstração, simulação e conexão com o WhatsApp.
 * Se falhar, não tenta de novo sozinha: o dono vê o motivo e decide.
 */
export async function sendManualNow(
  deps: SendNowDeps,
  input: { conv: Conversation; lead: Lead; body: string; variant?: string | null },
): Promise<SendNowResult> {
  const { repo, provider, now, account } = deps;
  const settings = await repo.getSettings();
  const cfg = account ? effectiveConfig(account, settings.automation) : settings.automation;
  const live = !cfg.dryRun;

  // antes de gravar qualquer coisa: dá para enviar agora?
  if (live) {
    if (provider.mode !== "gowa") return { sent: false, reason: "O envio real está ligado, mas o GOWA não está configurado (GOWA_URL)." };
    const status = await provider.status();
    if (status.missing) return { sent: false, reason: "O aparelho deste número foi apagado do GOWA. Conecte um aparelho novo em Números." };
    if (!status.connected) return { sent: false, reason: `${status.detail}. Não enviei; o texto continua na caixa.` };
  }

  const [msg] = await repo.createMessages([
    {
      conversationId: input.conv.id,
      leadId: input.lead.id,
      direction: "out",
      kind: "manual",
      body: input.body,
      // já nasce "enviando": o worker só pega "aprovada", então nunca disputa esta mensagem
      status: "sending",
      createdBy: "user",
      approvedAt: now.toISOString(),
      scheduledFor: now.toISOString(),
      ...(input.variant ? { variant: input.variant } : {}),
    },
  ]);
  const state = account ? await repo.getAccountState(account.id) : await repo.getAutomationState();
  const r = await deliver({ repo, provider, now, rng: Math.random, sleep: async () => {}, account }, msg, { cfg, state, live });

  if (r.action === "sent") return { sent: true, simulated: false, messageId: msg.id };
  if (r.action === "simulated") return { sent: true, simulated: true, messageId: msg.id };
  if (r.action === "cancelled") return { sent: false, reason: r.reason, messageId: msg.id };
  if (r.action === "failed") return { sent: false, reason: r.error, messageId: msg.id };
  return { sent: false, reason: "Não consegui enviar agora.", messageId: msg.id };
}

// ───────────────────────── o que chega do WhatsApp ─────────────────────────

export type InboundResult =
  | { handled: false; reason: string }
  | { handled: true; intent: string; optout: boolean; draftedReply: boolean; /** o agente mandou sozinho (nível 3) */ repliedAlone?: boolean };

/** Uma mensagem recebida (ou uma que o próprio dono mandou pelo celular). */
export async function handleMessageEvent(
  repo: Repo,
  evt: Extract<WebhookEvent, { kind: "message" }>,
  now: Date,
  opts: {
    publicBaseUrl?: string | null;
    agent?: ComposeDeps;
    rng?: () => number;
    /** O número em que a mensagem chegou (o webhook descobre pelo aparelho). Nulo = não se sabe ou um número só. */
    arrivedOn?: string | null;
  } = {},
): Promise<InboundResult> {
  // o WhatsApp devolve o número na forma em que está registrado (com ou sem o 9 depois do DDD),
  // que pode ser diferente da que o painel guardou: procura as duas
  let conv: Conversation | null = null;
  for (const phone of phoneVariants(evt.phoneE164)) {
    conv = await repo.findConversationByPhone(phone);
    if (conv) break;
  }
  if (!conv) return { handled: false, reason: "número fora das conversas da prospecção" };

  const dup = await repo.listMessages({ providerMessageId: evt.providerMessageId, limit: 1 });
  if (dup.length > 0) return { handled: false, reason: "mensagem repetida" };

  const stamp = evt.timestamp && !Number.isNaN(Date.parse(evt.timestamp)) ? new Date(evt.timestamp).toISOString() : now.toISOString();
  const lead = await repo.getLead(conv.leadId);
  if (!lead) return { handled: false, reason: "lead não existe mais" };

  // o dono respondeu pelo celular: a automação sai de cena nesta conversa
  if (evt.fromMe) {
    // a prévia que o lead pediu: o dono manda o link e o agente continua depois, em vez de largar a conversa
    const delivery = await isPreviewDelivery(repo, conv, lead, evt.text);
    await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "out",
        kind: "manual",
        body: evt.text ?? "(mídia enviada pelo celular)",
        status: "sent",
        createdBy: "user",
        sentAt: stamp,
        providerMessageId: evt.providerMessageId,
        ...(delivery ? { variant: OWNER_PREVIEW_VARIANT } : {}),
      },
    ]);
    await repo.updateConversation(
      conv.id,
      delivery ? { humanTakenOver: false, status: "active", lastOutboundAt: stamp } : { humanTakenOver: true, lastOutboundAt: stamp },
    );
    const pending = await repo.listMessages({ conversationId: conv.id, statuses: ["draft", "approved"], direction: "out", limit: 100 });
    await repo.bulkUpdateMessages(
      pending.map((m) => m.id),
      ["draft", "approved"],
      { status: "cancelled", error: "o dono respondeu pelo celular" },
    );
    return { handled: true, intent: "manual", optout: false, draftedReply: false };
  }

  let c = classifyReply(evt.text, evt.media);
  // no meio do roteiro de perguntas, um "não" solto é a resposta ("precisa ligar a algo?" "não"), não uma recusa
  if (c.intent === "not_interested" && !isRefusal(evt.text) && (await awaitingStepAnswer(repo, conv.id))) {
    c = { intent: "other", optout: false, needsHuman: true };
  }

  // Resposta automática do negócio (aviso de ausência, saudação do WhatsApp Business, menu): fica gravada e marcada para o dono
  // ver, mas o agente não conversa com robô, ela não conta como resposta, não pede você e não muda a etapa nem o follow-up.
  // Quando uma pessoa de verdade responder, a conversa segue de onde estava. PARE de verdade sempre vale (checado antes).
  // Robô responde em segundos: a primeira resposta que chega logo depois da nossa abordagem pesa mais na dúvida (veja `fast`).
  const fast = !conv.lastInboundAt && arrivedFast(stamp, conv.lastOutboundAt);
  // Quem recusa ("no momento não temos interesse na criação de um site") não é robô, mesmo que a frase comece com "agradecemos pelo
  // contato" ou termine com "entraremos em contato": a recusa precisa chegar ao agente, que encerra com educação.
  const auto = c.optout || evt.media || c.intent === "not_interested" ? null : detectAutoReply(evt.text, { fast });
  if (auto?.auto && auto.kind) {
    await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "in",
        kind: "reply",
        body: evt.text ?? "",
        status: "received",
        intent: "other",
        variant: AUTO_REPLY_VARIANT,
        createdBy: "lead",
        sentAt: stamp,
        providerMessageId: evt.providerMessageId,
      },
    ]);
    await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `${lead.name} respondeu com ${AUTO_REPLY_LABEL[auto.kind].toLowerCase()}: o agente não conversa com robô e segue esperando uma pessoa` } }]);
    // Menu de robô com uma opção que leva a uma pessoa ("falar com atendente", "outros assuntos"): o agente digita só o número.
    const navigated = auto.kind === "menu" ? await answerBotMenu(repo, { conv, lead, text: evt.text, now, rng: opts.rng }) : false;
    return { handled: true, intent: "auto_reply", optout: false, draftedReply: navigated };
  }
  await repo.createMessages([
    {
      conversationId: conv.id,
      leadId: lead.id,
      direction: "in",
      kind: "reply",
      body: evt.text ?? (evt.media ? `(${evt.media})` : ""),
      status: "received",
      intent: c.intent,
      createdBy: "lead",
      sentAt: stamp,
      providerMessageId: evt.providerMessageId,
    },
  ]);

  // Quem já pediu para parar continua parado, não importa o que escreva depois (o dono pode seguir
  // conversando pelo celular, mas a automação não volta nem a tela volta a pedir atenção).
  const alreadyBlocked = conv.status === "opted_out" || (await repo.findOptouts([conv.phoneE164])).has(conv.phoneE164);
  const status = c.optout || alreadyBlocked ? "opted_out" : c.intent === "not_interested" ? "closed" : "awaiting_human";
  await repo.updateConversation(conv.id, { status, lastInboundAt: stamp, unread: conv.unread + 1 });

  // quem respondeu não recebe mais follow-up automático
  const pending = await repo.listMessages({ conversationId: conv.id, kinds: [...PROSPECTING], statuses: ["draft", "approved"], limit: 100 });
  await repo.bulkUpdateMessages(
    pending.map((m) => m.id),
    ["draft", "approved"],
    { status: "cancelled", error: "o lead respondeu" },
  );

  const events: Parameters<Repo["addEvents"]>[0] = [
    { leadId: lead.id, type: "resposta_recebida", payload: { name: lead.name, intent: c.intent } },
  ];

  if (c.optout) {
    await repo.addOptout(conv.phoneE164, "pediu para parar por mensagem");
    events.push({ leadId: lead.id, type: "optout", payload: { name: lead.name } });
  }

  let newStage: Lead["stage"] | null = null;
  if (c.optout || c.intent === "not_interested") newStage = "perdido";
  else if (lead.stage === "qualificado" || lead.stage === "contatado") newStage = "respondeu";
  if (newStage && newStage !== lead.stage) {
    await repo.setStage(lead.id, newStage);
    events.push({ leadId: lead.id, type: "etapa", payload: { name: lead.name, from: lead.stage, to: newStage } });
  }
  await repo.addEvents(events);

  // O lead respondeu em OUTRO número que não o que o abordou (salvou o contato errado, ou o dono tem os dois). O agente não
  // responde por um número que ele não abordou: a conversa vem para o dono decidir.
  if (!c.optout && !alreadyBlocked && opts.arrivedOn && conv.accountId && opts.arrivedOn !== conv.accountId) {
    const roster = await loadRoster(repo);
    const arrived = roster.byId.get(opts.arrivedOn)?.name ?? "outro número";
    const owner = ownerOf(roster, conv.accountId)?.name ?? "o número que abordou";
    await repo.addEvents([
      { leadId: lead.id, type: "automacao", payload: { text: `${lead.name} respondeu no ${arrived}, mas foi abordado pelo ${owner}. O agente não responde: você decide.` } },
    ]);
    return { handled: true, intent: c.intent, optout: false, draftedReply: false };
  }

  // O agente escreve a resposta. No modo assistido ela vira RASCUNHO e só sai com o "Aprovar" do dono. No modo
  // semi-automático as respostas seguras (veja agent/autonomy.ts) já nascem aprovadas e saem pelo worker, com as
  // mesmas travas de envio (PARE, pausa, bloqueio). Sem resposta para número bloqueado (inclusive a "despedida"
  // do PARE): o worker cancelaria de qualquer jeito, então só deixaria uma sugestão que parece enviável e não é.
  let draftedReply = false;
  let repliedAlone = false;
  if (!c.optout && !alreadyBlocked) {
    ({ draftedReply, repliedAlone } = await agentRespond(repo, {
      conv,
      lead,
      status,
      stage: newStage ?? lead.stage,
      burst: !!conv.lastInboundAt && Date.parse(stamp) - Date.parse(conv.lastInboundAt) <= BURST_MS && Date.parse(stamp) >= Date.parse(conv.lastInboundAt),
      text: evt.text,
      media: evt.media,
      intent: c.intent,
      now,
      publicBaseUrl: opts.publicBaseUrl,
      agent: opts.agent,
      rng: opts.rng,
    }));
  }
  return { handled: true, intent: c.intent, optout: c.optout, draftedReply, repliedAlone };
}

/** O que o agente precisa para escrever a resposta a uma mensagem do lead. */
interface RespondInput {
  conv: Conversation;
  lead: Lead;
  /** O status que a conversa tem agora (já com a mensagem do lead registrada). */
  status: Conversation["status"];
  /** A etapa do lead agora (depois de a mensagem mudar o funil). */
  stage: Lead["stage"];
  text: string | null;
  media: InboundMedia | null;
  intent: Intent;
  now: Date;
  /** A mensagem anterior do lead chegou há segundos (veja `BURST_MS`). */
  burst?: boolean;
  publicBaseUrl?: string | null;
  agent?: ComposeDeps;
  rng?: () => number;
}

/** Duas mensagens do lead com menos que isto entre elas são uma conversa só, escrita em pedaços. */
export const BURST_MS = 45_000;

/**
 * O agente escreve a resposta à mensagem do lead. No modo assistido ela vira RASCUNHO e só sai com o "Aprovar" do dono. No
 * modo semi-automático as respostas seguras (veja agent/autonomy.ts) já nascem aprovadas e saem pelo worker, com as mesmas
 * travas de envio (PARE, pausa, bloqueio). Nunca lança: um erro do agente não pode derrubar o recebimento da mensagem.
 */
async function agentRespond(repo: Repo, p: RespondInput): Promise<{ draftedReply: boolean; repliedAlone: boolean }> {
  const { conv, lead, now } = p;
  let draftedReply = false;
  let repliedAlone = false;
  try {
    const settings = await repo.getSettings();
    const cfg = settings.automation;
    const rng = p.rng ?? Math.random;
    const nowStamp = now.toISOString();
    const inbound = { text: p.text, media: p.media, intent: p.intent };
    const updatedLead = { ...lead, stage: p.stage };
    const updatedConv: Conversation = { ...conv, status: p.status };

    // Respostas do agente que ainda NÃO saíram (aprovadas na fila, sem o dono ter revisado). Se o lead escreveu de novo antes de
    // elas saírem, a que sai agora responde a tudo o que ele disse: as velhas são canceladas. Sem isto, duas mensagens quase juntas
    // geravam duas respostas, cada uma se apresentando, e como o envio tem sorteio de tempo a mais nova podia sair antes.
    // Só vale para mensagens quase juntas (a anterior chegou há segundos) ou para uma recusa: com minutos de intervalo o lead está
    // respondendo ao que o agente disse, e não escrevendo em cima dele.
    const stale =
      p.burst || p.intent === "not_interested"
        ? (await repo.listMessages({ conversationId: conv.id, direction: "out", kinds: ["reply"], statuses: ["approved"], limit: 20 })).filter(
            (m) => m.createdBy === "system" && !!parseAgentVariant(m.variant)?.auto,
          )
        : [];
    const staleIds = new Set(stale.map((m) => m.id));
    const supersede = async () => {
      if (stale.length === 0) return;
      await repo.bulkUpdateMessages(
        stale.map((m) => m.id),
        ["approved"],
        { status: "cancelled", error: "o lead escreveu de novo: a resposta foi refeita com tudo o que ele disse" },
      );
    };

    let ctx = await loadAgentContext(repo, updatedConv, updatedLead, inbound, { publicBaseUrl: p.publicBaseUrl, exclude: staleIds });

    // Lead disse "pode": no modo semi-automático com endereço público, a prévia nasce sozinha e o link vai na resposta.
    if (
      cfg.autonomy === "semi" &&
      settings.agentFlow !== "qualificar" && // no fluxo "qualificar" a prévia é feita à mão pelo dono
      p.publicBaseUrl &&
      !ctx.ficha.demo.exists &&
      !ctx.ficha.proposal &&
      ctx.ficha.lastTopic !== "answer" &&
      detectTopics(p.text, p.media)[0] === "yes"
    ) {
      await generateDemo(repo, lead.id, { settings });
      ctx = await loadAgentContext(repo, updatedConv, updatedLead, inbound, { publicBaseUrl: p.publicBaseUrl, exclude: staleIds });
    }

    // Fechamento sozinho: o lead aceitou a oferta que o agente fez (valor, sinal e prazo das Configurações).
    // A proposta nasce já enviada e a resposta leva o Pix; o dono só marca "Recebi o sinal" quando cair.
    if (
      cfg.autonomy === "semi" &&
      cfg.autoClose &&
      ctx.facts.pixKey &&
      // com prévia: o lead precisa ter visto. Sem prévia (qualificar): ele quer um site, não um sistema (esse é do dono)
      (settings.agentFlow === "qualificar" ? ctx.ficha.product === "site" : ctx.ficha.demo.sent) &&
      !ctx.ficha.proposal &&
      ["yes", "payment"].includes(detectTopics(p.text, p.media, settings.agentFlow)[0]) &&
      madeClosingOffer(ctx.messages)
    ) {
      const demo = (await repo.listDemos({ leadId: lead.id, status: "published", limit: 1 }))[0];
      const proposal = await createProposalFor(repo, {
        leadId: lead.id,
        title: "Site de 1 página",
        amountCents: Math.round(ctx.facts.priceFrom * 100),
        entryPct: ctx.facts.entryPct,
        deliveryDays: ctx.facts.deliveryDays,
        demoId: demo?.id ?? null,
      });
      await changeProposalStatus(repo, proposal.id, "sent", now);
      await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente criou a proposta de ${lead.name} com as condições padrão e passou o Pix` } }]);
      ctx = await loadAgentContext(repo, updatedConv, { ...updatedLead, stage: "proposta" }, inbound, { publicBaseUrl: p.publicBaseUrl, exclude: staleIds });
    }

    const out = await composeReply(ctx, p.agent);
    // A recepção passou o contato de quem decide: vira lead novo, ligado a este, com a abertura como RASCUNHO na Fila (nunca sai sozinha,
    // é um primeiro contato com outra pessoa). Um erro aqui não derruba a resposta ao lead.
    if (out.topic === "gatekeeper" && ctx.ficha.decisor?.phone) {
      try {
        await referDecisor(repo, { conv, lead, decisor: ctx.ficha.decisor, now });
      } catch (error) {
        console.error("agente de atendimento (contato de quem decide):", error);
      }
    }
    if (out.notes.length > 0) {
      await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente: ${out.notes.join(" ")}` } }]);
    }
    if (out.reply) {
      const counts = await countAutoReplies(repo, conv.id, now, cfg);
      const decision = decideAuto({
        cfg,
        out,
        humanTakenOver: conv.humanTakenOver,
        blocked: false,
        inboundText: p.text,
        autoInConversation: counts.inConversation,
        autoToday: counts.today,
      });
      // Duas mensagens do lead quase juntas (ou o robô do negócio dele) disparam duas respostas, e como nenhuma "responde" a
      // pergunta, a segunda saía igual à primeira. Quem já foi atendido com o mesmo texto, ou com a mesma pergunta do roteiro,
      // há pouco, não recebe de novo.
      const dup = await findRecentDuplicate(repo, conv.id, { body: out.reply, variant: agentVariant(out) }, now, { ignore: staleIds });
      if (dup) {
        if (decision.auto && !decision.notifyOwner && p.status === "awaiting_human") await repo.updateConversation(conv.id, { status: "active" });
        await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente: não repeti a resposta a ${lead.name} (a mesma já existe há pouco)` } }]);
        return { draftedReply: false, repliedAlone: false };
      }
      // a trava de fatos roda de novo em TODA resposta que vai sair sem ninguém ler; o texto que o próprio dono
      // escreveu em Configurações (authorized) não passa pelo humanizador, mas números e links seguem conferidos
      const checked = decision.auto ? finalCheck(out.reply, ctx, { trusted: out.authorized === true }) : null;
      const alone = decision.auto && checked?.ok === true;
      await supersede();

      if (alone) {
        await repo.createMessages([
          {
            conversationId: conv.id,
            leadId: lead.id,
            direction: "out",
            kind: "reply",
            body: adaptGreeting(out.reply, now, cfg.timezone),
            status: "approved",
            intent: p.intent,
            variant: agentVariant(out, true),
            createdBy: "system",
            approvedAt: nowStamp,
            scheduledFor: scheduleAutoReply(now, cfg, rng).toISOString(),
          },
        ]);
        // quem foi atendido sozinho não "precisa de você"; encerrada (sem interesse) continua encerrada. Só segue
        // em "Precisa de você" o que o agente respondeu mas o dono ainda tem que ver (áudio, "vou confirmar").
        if (p.status === "awaiting_human" && !decision.notifyOwner) await repo.updateConversation(conv.id, { status: "active" });
        await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente respondeu sozinho a ${lead.name}: ${out.topic}` } }]);
        repliedAlone = true;
      } else {
        await repo.createMessages([
          {
            conversationId: conv.id,
            leadId: lead.id,
            direction: "out",
            kind: "reply",
            body: adaptGreeting(out.reply, now, cfg.timezone),
            status: "draft",
            intent: p.intent,
            variant: agentVariant(out),
            createdBy: "system",
          },
        ]);
        if (decision.auto && checked && !checked.ok) {
          await repo.addEvents([{ leadId: lead.id, type: "automacao", payload: { text: `agente: não mandei sozinho a ${lead.name} (${checked.reasons.join("; ")}); ficou como rascunho` } }]);
        }
      }
      draftedReply = true;
    } else if (p.intent === "not_interested") {
      // quem acabou de recusar não recebe a pergunta que estava na fila para a mensagem anterior dele
      await supersede();
    }
  } catch (error) {
    // um erro do agente nunca pode derrubar o recebimento: a resposta do lead já está gravada
    console.error("agente de atendimento:", error);
  }
  return { draftedReply, repliedAlone };
}

/**
 * O negócio respondeu com um menu de robô ("digite 1 se já é paciente, 2…") e uma das opções leva a uma pessoa. O agente digita só o
 * número, uma vez por conversa, com o tempo de uma pessoa: o robô entrega a conversa a um atendente, que lê a nossa abertura e o
 * que escrevermos depois. Menu sem uma opção assim (só agendamento, financeiro, convênio) fica como está, esperando uma pessoa.
 * No modo assistido vira rascunho para o dono aprovar. Nunca lança.
 */
async function answerBotMenu(
  repo: Repo,
  p: { conv: Conversation; lead: Lead; text: string | null; now: Date; rng?: () => number },
): Promise<boolean> {
  try {
    const { conv, lead, now } = p;
    const choice = menuChoice(p.text);
    if (!choice) return false;
    if (conv.humanTakenOver || conv.status === "opted_out" || conv.status === "closed") return false;
    const settings = await repo.getSettings();
    const cfg = settings.automation;
    const history = await repo.listMessages({ conversationId: conv.id, order: "desc", limit: 60 });
    // uma pessoa já conversou, ou já respondemos a um menu aqui: não digita número em cima disso
    if (history.some((m) => m.direction === "in" && m.variant !== AUTO_REPLY_VARIANT && m.status === "received")) return false;
    if (history.some((m) => m.direction === "out" && m.kind === "reply" && parseAgentVariant(m.variant)?.topic === "menu" && !["cancelled", "failed"].includes(m.status))) return false;

    const counts = await countAutoReplies(repo, conv.id, now, cfg);
    const auto = cfg.autonomy === "semi" && !cfg.paused && counts.inConversation < cfg.autoMaxPerConversation && counts.today < cfg.autoMaxPerDay;
    await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "out",
        kind: "reply",
        body: choice.option,
        status: auto ? "approved" : "draft",
        intent: "other",
        variant: `agente${auto ? "+auto" : ""}:menu`,
        createdBy: "system",
        ...(auto ? { approvedAt: now.toISOString(), scheduledFor: scheduleAutoReply(now, cfg, p.rng ?? Math.random).toISOString() } : {}),
      },
    ]);
    await repo.addEvents([
      {
        leadId: lead.id,
        type: "automacao",
        payload: { text: `${auto ? "agente digitou" : "agente sugere digitar"} ${choice.option} no menu de ${lead.name} (“${choice.label}”): é a opção que leva a uma pessoa` },
      },
    ]);
    return true;
  } catch (error) {
    console.error("agente de atendimento (menu de robô):", error);
    return false;
  }
}

/** Recibos de entrega e leitura: só andam para a frente (enviada → entregue → lida). */
export async function handleAckEvent(
  repo: Repo,
  evt: Extract<WebhookEvent, { kind: "ack" }>,
): Promise<number> {
  let updated = 0;
  for (const id of evt.providerMessageIds) {
    const [m] = await repo.listMessages({ providerMessageId: id, limit: 1 });
    if (!m) continue;
    const next: MessageStatus | null =
      evt.receipt === "read" && (m.status === "sent" || m.status === "delivered")
        ? "read"
        : evt.receipt === "delivered" && m.status === "sent"
          ? "delivered"
          : null;
    if (next) {
      await repo.updateMessage(m.id, { status: next });
      updated++;
    }
  }
  return updated;
}

// ───────────────────────── bloqueio manual ─────────────────────────

/**
 * O dono marcou "não incomodar": lista de bloqueio, conversa encerrada, tudo pendente cancelado
 * e o lead vai para Perdido. Vale para o caso de o pedido de parar chegar por ligação ou Instagram.
 */
export async function blockLead(repo: Repo, leadId: string, reason: string): Promise<boolean> {
  const lead = await repo.getLead(leadId);
  if (!lead || !lead.phoneE164) return false;
  await repo.addOptout(lead.phoneE164, reason);
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164);
  await repo.updateConversation(conv.id, { status: "opted_out" });
  const pending = await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["draft", "approved"], limit: 200 });
  await repo.bulkUpdateMessages(
    pending.map((m) => m.id),
    ["draft", "approved"],
    { status: "cancelled", error: "número bloqueado" },
  );
  const events: Parameters<Repo["addEvents"]>[0] = [{ leadId: lead.id, type: "optout", payload: { name: lead.name, manual: true } }];
  if (lead.stage !== "perdido") {
    await repo.setStage(lead.id, "perdido");
    events.push({ leadId: lead.id, type: "etapa", payload: { name: lead.name, from: lead.stage, to: "perdido" } });
  }
  await repo.addEvents(events);
  return true;
}

export interface UnblockResult {
  /** O número saiu da lista de bloqueio e a conversa voltou para a automação. */
  unblocked: boolean;
  /** Por que não liberou (só quando `unblocked` é falso). */
  reason?: string;
  /** Havia mensagem do lead sem resposta e o agente a respondeu (rascunho ou resposta sozinho). */
  answered: boolean;
  repliedAlone: boolean;
}

const MEDIA_BODY = /^\((audio|image|video|document|sticker|contact|location)\)$/;

/**
 * O dono liberou um número que estava bloqueado (pediu para parar, ou foi bloqueado à mão) porque ele voltou a escrever ou
 * pediu para falar. Tira da lista de bloqueio, devolve a conversa à automação, tira o lead de Perdido e, se a última coisa
 * na conversa é uma mensagem dele sem resposta (escrita enquanto estava bloqueado), o agente a responde agora, com as
 * mesmas regras de sempre (assistido: rascunho; autônomo: sai sozinho se for seguro).
 */
export async function unblockLead(
  repo: Repo,
  leadId: string,
  now: Date,
  opts: { publicBaseUrl?: string | null; agent?: ComposeDeps; rng?: () => number } = {},
): Promise<UnblockResult> {
  const none = (reason: string): UnblockResult => ({ unblocked: false, reason, answered: false, repliedAlone: false });
  const lead = await repo.getLead(leadId);
  if (!lead || !lead.phoneE164) return none("Esse lead não tem celular.");
  const conv = await repo.findConversationByLead(lead.id);
  if (!conv) return none("Esse lead não tem conversa.");

  const phones = [...new Set([lead.phoneE164, conv.phoneE164, ...phoneVariants(lead.phoneE164), ...phoneVariants(conv.phoneE164)])];
  const wasBlocked = conv.status === "opted_out" || (await repo.findOptouts(phones)).size > 0;
  if (!wasBlocked) return none("Esse número não está bloqueado.");

  await repo.removeOptout(phones);

  // a última coisa dita na conversa: se for do lead (escrita enquanto bloqueado), ele está esperando resposta
  const recent = await repo.listMessages({ conversationId: conv.id, order: "desc", limit: 30 });
  const real = recent.filter((m) => !["draft", "cancelled", "failed"].includes(m.status) && !isAutoReplyMessage(m));
  const last = real[0] ?? null;
  const media = last && MEDIA_BODY.test(last.body) ? (MEDIA_BODY.exec(last.body)![1] as InboundMedia) : null;
  const text = last && !media ? last.body : null;
  const c = last?.direction === "in" ? classifyReply(text, media) : null;
  // quem acabou de dizer PARE ou "sem interesse" não recebe resposta: a liberação vale para a próxima mensagem dele
  const waiting = !!last && last.direction === "in" && !!c && !c.optout && c.intent !== "not_interested";

  const hasInbound = real.some((m) => m.direction === "in");
  const stage: Lead["stage"] = lead.stage === "perdido" ? (hasInbound ? "respondeu" : "contatado") : lead.stage;
  const status: Conversation["status"] = waiting ? "awaiting_human" : "active";
  await repo.updateConversation(conv.id, { status, humanTakenOver: false });
  const events: Parameters<Repo["addEvents"]>[0] = [{ leadId: lead.id, type: "automacao", payload: { text: `número de ${lead.name} liberado por você: o agente volta a atender` } }];
  if (stage !== lead.stage) {
    await repo.setStage(lead.id, stage);
    events.push({ leadId: lead.id, type: "etapa", payload: { name: lead.name, from: lead.stage, to: stage } });
  }
  await repo.addEvents(events);

  let answered = false;
  let repliedAlone = false;
  if (waiting && last && c) {
    const r = await agentRespond(repo, {
      conv: { ...conv, status, humanTakenOver: false },
      lead: { ...lead, stage },
      status,
      stage,
      text,
      media,
      intent: c.intent,
      now,
      publicBaseUrl: opts.publicBaseUrl,
      agent: opts.agent,
      rng: opts.rng,
    });
    answered = r.draftedReply;
    repliedAlone = r.repliedAlone;
  }
  return { unblocked: true, answered, repliedAlone };
}

// ───────────────────────── resumo para o painel ─────────────────────────

export interface Overview {
  cfg: AutomationConfig;
  providerMode: WhatsAppProvider["mode"];
  providerDetail: string;
  connected: boolean;
  counts: Awaited<ReturnType<Repo["messageCounts"]>>;
  sentToday: number;
  capToday: number;
  nextAt: string | null;
  lastTickAt: string | null;
  lastResult: string | null;
  replyRate: number | null;
  /** O que acontece se o dono retomar agora. Só vem quando a automação está pausada. */
  resume: ResumePlan | null;
}

export async function getOverview(repo: Repo, provider: WhatsAppProvider, now: Date): Promise<Overview> {
  const settings = await repo.getSettings();
  const cfg = settings.automation;
  const state = await repo.getAutomationState();
  const counts = await repo.messageCounts();
  const status = await provider.status();
  const day = localParts(now, cfg.timezone).ymd;
  // com vários números o teto do dia é a soma dos tetos de quem pode enviar
  const roster = await loadRoster(repo);
  const capToday = roster.multi
    ? roster.active.filter((a) => !a.paused).reduce((sum, a) => sum + dailyCapFor(day, effectiveConfig(a, cfg)), 0)
    : dailyCapFor(day, cfg);
  const sent = await repo.listMessages({
    kinds: [...PROSPECTING],
    statuses: [...REAL_SENT, "simulated"],
    sentSince: startOfLocalDay(now, cfg).toISOString(),
    limit: 500,
  });
  const upcoming = await repo.listMessages({ kinds: [...PROSPECTING], statuses: ["approved"], order: "asc", limit: 50 });
  const nextAt = upcoming.map((m) => m.scheduledFor).filter((x): x is string => !!x).sort()[0] ?? null;
  return {
    cfg,
    providerMode: provider.mode,
    providerDetail: status.detail,
    connected: status.connected,
    counts,
    sentToday: sent.length,
    capToday,
    nextAt,
    lastTickAt: state.lastTickAt,
    lastResult: state.lastResult,
    replyRate: counts.prospectingSent > 0 ? counts.conversationsReplied / counts.prospectingSent : null,
    resume: cfg.paused ? await getResumePlan(repo, now) : null,
  };
}
