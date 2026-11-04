import { isAutoReplyMessage } from "@/lib/outreach/autoreply";
import {
  defaultAccount,
  EMPTY_ACCOUNT_STATE,
  type Account,
  type AccountPatch,
  type AccountState,
  type NewAccount,
} from "@/lib/outreach/accounts";
import { norm } from "@/lib/utils";
import {
  isDemoSlug,
  type Demo,
  type DemoPatch,
  type NewDemo,
  type NewProject,
  type NewProposal,
  type Project,
  type ProjectPatch,
  type Proposal,
  type ProposalPatch,
} from "@/lib/deals/types";
import {
  DEFAULT_AUTOMATION_STATE,
  mergeAutomation,
  type AutomationConfig,
  type AutomationState,
} from "@/lib/outreach/config";
import type {
  Conversation,
  ConversationPatch,
  Message,
  MessageCounts,
  MessagePatch,
  MessageQuery,
  MessageStatus,
  NewMessage,
} from "@/lib/outreach/types";
import {
  mergeSettings,
  STAGES,
  emptyStageCounts,
  type Lead,
  type LeadEvent,
  type NewEvent,
  type NewLead,
  type NewSearch,
  type Search,
  type Settings,
  type Stage,
  type Stats,
} from "@/lib/leads/types";
import type { LeadPage, LeadPatch, LeadQuery, Repo, SearchPatch } from "./types";

const now = () => new Date().toISOString();

export type MemoryRepo = Repo & {
  /** Só para testes e para a semente de demonstração. */
  _addOptout(phone: string): void;
};

/** Repositório em memória: modo demonstração e testes. Zera ao reiniciar o servidor. */
export function createMemoryRepo(): MemoryRepo {
  const leads = new Map<string, Lead>();
  const events: LeadEvent[] = [];
  const searches = new Map<string, Search>();
  const optouts = new Set<string>();
  let settings: Settings = mergeSettings(null);
  let automationState: AutomationState = { ...DEFAULT_AUTOMATION_STATE };
  const accounts = new Map<string, Account>();
  const accountStates = new Map<string, AccountState>();
  const conversations = new Map<string, Conversation>();
  const messages: Message[] = [];
  const demos = new Map<string, Demo>();
  const proposals = new Map<string, Proposal>();
  const projects = new Map<string, Project>();

  /** O número original (ou o primeiro) cuida das mensagens e conversas sem número. */
  const defaultAccountId = () => defaultAccount([...accounts.values()])?.id ?? null;
  const ownedBy = (rowAccountId: string | null, wanted: string) => rowAccountId === wanted || (rowAccountId === null && wanted === defaultAccountId());

  const haystack = (l: Lead) =>
    norm(`${l.name} ${l.category ?? ""} ${l.city ?? ""} ${l.neighborhood ?? ""} ${l.phoneRaw ?? ""}`);

  function require(id: string): Lead {
    const lead = leads.get(id);
    if (!lead) throw new Error("Lead não encontrado.");
    return lead;
  }

  const repo: Repo = {
    mode: "demo",

    async listLeads(q: LeadQuery): Promise<LeadPage> {
      const needle = q.q ? norm(q.q) : "";
      let rows = [...leads.values()].filter((l) => {
        if (q.stages?.length && !q.stages.includes(l.stage)) return false;
        if (q.siteKinds?.length && !q.siteKinds.includes(l.websiteKind)) return false;
        if (q.eligible !== undefined && l.eligible !== q.eligible) return false;
        if (q.minScore !== undefined && l.score < q.minScore) return false;
        if (q.searchId && l.searchId !== q.searchId) return false;
        if (needle && !haystack(l).includes(needle)) return false;
        return true;
      });
      const sort = q.sort ?? "score";
      rows.sort((a, b) => {
        if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
        if (sort === "name") return a.name.localeCompare(b.name, "pt-BR");
        if (sort === "reviews") return b.reviewsCount - a.reviewsCount;
        return b.score - a.score || b.reviewsCount - a.reviewsCount || a.id.localeCompare(b.id);
      });
      const total = rows.length;
      rows = rows.slice(q.offset, q.offset + q.limit);
      return { rows, total };
    },

    async getLead(id) {
      return leads.get(id) ?? null;
    },

    async getLeads(ids) {
      return ids.map((id) => leads.get(id)).filter((l): l is Lead => !!l);
    },

    async findExisting({ dedupeKeys, phones }) {
      const keySet = new Set(dedupeKeys);
      const phoneSet = new Set(phones);
      const foundKeys = new Set<string>();
      const foundPhones = new Set<string>();
      for (const l of leads.values()) {
        if (keySet.has(l.dedupeKey)) foundKeys.add(l.dedupeKey);
        if (l.phoneE164 && phoneSet.has(l.phoneE164)) foundPhones.add(l.phoneE164);
      }
      return { dedupeKeys: foundKeys, phones: foundPhones };
    },

    async findOptouts(phones) {
      return new Set(phones.filter((p) => optouts.has(p)));
    },

    async insertLeads(list: NewLead[]) {
      const created: Lead[] = [];
      for (const l of list) {
        const ts = now();
        const lead: Lead = {
          ...l,
          id: crypto.randomUUID(),
          stageChangedAt: ts,
          createdAt: ts,
          updatedAt: ts,
        };
        leads.set(lead.id, lead);
        created.push(lead);
      }
      return created;
    },

    async updateLead(id: string, patch: LeadPatch) {
      const lead = { ...require(id), ...patch, updatedAt: now() };
      leads.set(id, lead);
      return lead;
    },

    async setStage(id: string, stage: Stage) {
      const current = require(id);
      if (current.stage === stage) return current;
      const ts = now();
      const lead: Lead = {
        ...current,
        stage,
        stageChangedAt: ts,
        updatedAt: ts,
        dealValue: stage === "ganho" ? (current.dealValue ?? settings.ticketAverage) : current.dealValue,
      };
      leads.set(id, lead);
      return lead;
    },

    async bulkSetStage(ids: string[], stage: Stage) {
      let n = 0;
      for (const id of ids) {
        if (!leads.has(id)) continue;
        await repo.setStage(id, stage);
        n++;
      }
      return n;
    },

    async stats(): Promise<Stats> {
      const stages = emptyStageCounts();
      let eligible = 0;
      let eligibleNoSite = 0;
      let scoreSum = 0;
      let won = 0;
      for (const l of leads.values()) {
        // O funil só conta quem dá para trabalhar: lead inelegível parado em "novo" fica de fora.
        if (l.stage !== "novo" || l.eligible) stages[l.stage]++;
        scoreSum += l.score;
        if (l.eligible) {
          eligible++;
          if (l.websiteKind === "none" || l.websiteKind === "social") eligibleNoSite++;
        }
        if (l.stage === "ganho") won += l.dealValue ?? 0;
      }
      return {
        total: leads.size,
        eligible,
        eligibleNoSite,
        avgScore: leads.size ? Math.round(scoreSum / leads.size) : 0,
        stages,
        wonValue: won,
      };
    },

    async board(perStage: number) {
      const out = {} as Record<Stage, { rows: Lead[]; total: number }>;
      for (const stage of STAGES) {
        const all = [...leads.values()]
          .filter((l) => l.stage === stage && (stage !== "novo" || l.eligible))
          .sort((a, b) => b.score - a.score || b.reviewsCount - a.reviewsCount);
        out[stage] = { rows: all.slice(0, perStage), total: all.length };
      }
      return out;
    },

    async addEvents(list: NewEvent[]) {
      for (const e of list) {
        events.push({ ...e, id: crypto.randomUUID(), createdAt: now() });
      }
    },

    async listEvents({ leadId, types, limit }) {
      return events
        .filter((e) => (leadId ? e.leadId === leadId : true))
        .filter((e) => (types?.length ? types.includes(e.type) : true))
        .slice()
        .reverse()
        .slice(0, limit);
    },

    async createSearch(s: NewSearch) {
      const search: Search = {
        id: crypto.randomUUID(),
        niche: s.niche,
        city: s.city,
        state: s.state,
        requested: s.requested,
        source: s.source,
        status: s.status,
        apifyRunId: s.apifyRunId ?? null,
        datasetId: s.datasetId ?? null,
        found: 0,
        inserted: 0,
        duplicates: 0,
        invalid: 0,
        eligible: 0,
        estimatedCostUsd: s.estimatedCostUsd ?? null,
        error: null,
        createdAt: now(),
        finishedAt: null,
      };
      searches.set(search.id, search);
      return search;
    },

    async getSearch(id) {
      return searches.get(id) ?? null;
    },

    async updateSearch(id: string, patch: SearchPatch) {
      const current = searches.get(id);
      if (!current) throw new Error("Busca não encontrada.");
      const next = { ...current, ...patch };
      searches.set(id, next);
      return next;
    },

    async claimSearchForIngest(id) {
      const current = searches.get(id);
      if (!current || current.status !== "running") return false;
      searches.set(id, { ...current, status: "ingesting" });
      return true;
    },

    async listSearches(limit) {
      return [...searches.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
    },

    async getSettings() {
      return mergeSettings(settings);
    },

    async saveSettings(patch) {
      settings = mergeSettings({ ...settings, ...patch, automation: settings.automation });
      return mergeSettings(settings);
    },

    async saveAutomation(patch: Partial<AutomationConfig>) {
      settings = { ...settings, automation: mergeAutomation({ ...settings.automation, ...patch }) };
      return mergeSettings(settings);
    },

    async getAutomationState() {
      return { ...automationState };
    },

    async saveAutomationState(patch) {
      automationState = { ...automationState, ...patch };
      return { ...automationState };
    },

    async listAccounts() {
      return [...accounts.values()].sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)).map((a) => ({ ...a }));
    },

    async getAccount(id: string) {
      const found = accounts.get(id);
      return found ? { ...found } : null;
    },

    async createAccount(input: NewAccount) {
      const ts = now();
      const account: Account = {
        id: crypto.randomUUID(),
        name: input.name,
        gowaDeviceId: input.gowaDeviceId ?? null,
        phoneE164: input.phoneE164 ?? null,
        jid: input.jid ?? null,
        legacy: input.legacy ?? false,
        paused: input.paused ?? false,
        pausedReason: input.pausedReason ?? null,
        retired: false,
        position: Math.max(0, ...[...accounts.values()].map((a) => a.position)) + 1,
        caps: input.caps ?? null,
        warmupStart: input.warmupStart ?? null,
        createdAt: ts,
        updatedAt: ts,
      };
      accounts.set(account.id, account);
      return { ...account };
    },

    async updateAccount(id: string, patch: AccountPatch) {
      const current = accounts.get(id);
      if (!current) throw new Error("Número não encontrado.");
      const next: Account = { ...current, ...patch, updatedAt: now() };
      accounts.set(id, next);
      return { ...next };
    },

    async getAccountState(accountId: string) {
      const account = accounts.get(accountId);
      // o número original guarda o estado no mesmo lugar de sempre
      if (account?.legacy) {
        return { lastSendAt: automationState.lastSendAt, consecutiveFailures: automationState.consecutiveFailures, lastResult: automationState.lastResult };
      }
      return { ...(accountStates.get(accountId) ?? EMPTY_ACCOUNT_STATE) };
    },

    async saveAccountState(accountId: string, patch: Partial<AccountState>) {
      const account = accounts.get(accountId);
      if (account?.legacy) {
        automationState = { ...automationState, ...patch };
        return { lastSendAt: automationState.lastSendAt, consecutiveFailures: automationState.consecutiveFailures, lastResult: automationState.lastResult };
      }
      const next = { ...(accountStates.get(accountId) ?? EMPTY_ACCOUNT_STATE), ...patch };
      accountStates.set(accountId, next);
      return { ...next };
    },

    async ensureConversation(leadId: string, phoneE164: string, accountId?: string | null) {
      const existing = [...conversations.values()].find((c) => c.leadId === leadId || c.phoneE164 === phoneE164);
      if (existing) return existing;
      const ts = now();
      const conv: Conversation = {
        id: crypto.randomUUID(),
        leadId,
        phoneE164,
        accountId: accountId ?? null,
        status: "active",
        humanTakenOver: false,
        touches: 0,
        unread: 0,
        lastInboundAt: null,
        lastOutboundAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      conversations.set(conv.id, conv);
      return conv;
    },

    async getConversation(id) {
      return conversations.get(id) ?? null;
    },

    async findConversationByLead(leadId) {
      return [...conversations.values()].find((c) => c.leadId === leadId) ?? null;
    },

    async findConversationByPhone(phoneE164) {
      return [...conversations.values()].find((c) => c.phoneE164 === phoneE164) ?? null;
    },

    async listConversations({ statuses, accountId, limit, offset = 0 }) {
      const rows = [...conversations.values()]
        .filter((c) => (statuses?.length ? statuses.includes(c.status) : true))
        .filter((c) => !accountId || ownedBy(c.accountId, accountId))
        .sort((a, b) => {
          // quem precisa do dono primeiro; depois a atividade mais recente
          const needs = Number(b.status === "awaiting_human") - Number(a.status === "awaiting_human");
          if (needs !== 0) return needs;
          const last = (c: Conversation) => c.lastInboundAt ?? c.lastOutboundAt ?? c.createdAt;
          return last(b).localeCompare(last(a));
        });
      return { rows: rows.slice(offset, offset + limit), total: rows.length };
    },

    async updateConversation(id: string, patch: ConversationPatch) {
      const current = conversations.get(id);
      if (!current) throw new Error("Conversa não encontrada.");
      const next = { ...current, ...patch, updatedAt: now() };
      conversations.set(id, next);
      // trocar o número de uma conversa leva as mensagens dela junto (a demonstração e os testes usam isto para distribuir conversas)
      if (patch.accountId !== undefined && patch.accountId !== current.accountId) {
        for (let i = 0; i < messages.length; i++) if (messages[i].conversationId === id) messages[i] = { ...messages[i], accountId: patch.accountId };
      }
      return next;
    },

    async createMessages(list: NewMessage[]) {
      const created: Message[] = [];
      for (const m of list) {
        const msg: Message = {
          id: crypto.randomUUID(),
          conversationId: m.conversationId,
          leadId: m.leadId,
          accountId: conversations.get(m.conversationId)?.accountId ?? null,
          direction: m.direction,
          kind: m.kind,
          step: m.step ?? 0,
          body: m.body,
          status: m.status,
          variant: m.variant ?? null,
          intent: m.intent ?? null,
          scheduledFor: m.scheduledFor ?? null,
          approvedAt: m.approvedAt ?? null,
          sentAt: m.sentAt ?? null,
          providerMessageId: m.providerMessageId ?? null,
          attempts: 0,
          error: null,
          createdBy: m.createdBy,
          batchDay: m.batchDay ?? null,
          createdAt: now(),
        };
        messages.push(msg);
        created.push(msg);
      }
      return created;
    },

    async getMessage(id) {
      return messages.find((m) => m.id === id) ?? null;
    },

    async listMessages(q: MessageQuery) {
      let rows = messages.filter((m) => {
        if (q.conversationId && m.conversationId !== q.conversationId) return false;
        if (q.leadId && m.leadId !== q.leadId) return false;
        if (q.accountId && !ownedBy(m.accountId, q.accountId)) return false;
        if (q.statuses?.length && !q.statuses.includes(m.status)) return false;
        if (q.kinds?.length && !q.kinds.includes(m.kind)) return false;
        if (q.direction && m.direction !== q.direction) return false;
        if (q.sentSince && !(m.sentAt && m.sentAt >= q.sentSince)) return false;
        if (q.scheduledUntil && !(m.scheduledFor && m.scheduledFor <= q.scheduledUntil)) return false;
        if (q.batchDay && m.batchDay !== q.batchDay) return false;
        if (q.providerMessageId && m.providerMessageId !== q.providerMessageId) return false;
        return true;
      });
      const asc = (q.order ?? "asc") === "asc";
      rows = rows.slice().sort((a, b) => {
        const ka = a.sentAt ?? a.scheduledFor ?? a.createdAt;
        const kb = b.sentAt ?? b.scheduledFor ?? b.createdAt;
        return asc ? ka.localeCompare(kb) || a.createdAt.localeCompare(b.createdAt) : kb.localeCompare(ka) || b.createdAt.localeCompare(a.createdAt);
      });
      return rows.slice(0, q.limit);
    },

    async updateMessage(id: string, patch: MessagePatch) {
      const i = messages.findIndex((m) => m.id === id);
      if (i < 0) throw new Error("Mensagem não encontrada.");
      messages[i] = { ...messages[i], ...patch };
      return messages[i];
    },

    async bulkUpdateMessages(ids: string[], onlyIfStatus: MessageStatus[], patch: MessagePatch) {
      let n = 0;
      for (const id of ids) {
        const i = messages.findIndex((m) => m.id === id);
        if (i < 0 || !onlyIfStatus.includes(messages[i].status)) continue;
        messages[i] = { ...messages[i], ...patch };
        n++;
      }
      return n;
    },

    async claimNextDueMessage(nowIso: string, accountId?: string) {
      const due = messages
        .filter(
          (m) =>
            m.direction === "out" &&
            m.status === "approved" &&
            (!m.scheduledFor || m.scheduledFor <= nowIso) &&
            (!accountId || ownedBy(m.accountId, accountId)),
        )
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "") || a.createdAt.localeCompare(b.createdAt))[0];
      if (!due) return null;
      const i = messages.indexOf(due);
      messages[i] = { ...due, status: "sending", attempts: due.attempts + 1 };
      return messages[i];
    },

    async messageCounts(): Promise<MessageCounts> {
      const prospecting = new Set(["opening", "followup"]);
      const sent = messages.filter(
        (m) => m.direction === "out" && prospecting.has(m.kind) && ["sent", "delivered", "read"].includes(m.status),
      );
      const contacted = new Set(sent.map((m) => m.conversationId));
      const replied = new Set(
        // resposta automática do negócio ("mensagem automática", menu) não conta como resposta
        messages.filter((m) => m.direction === "in" && !isAutoReplyMessage(m) && contacted.has(m.conversationId)).map((m) => m.conversationId),
      );
      const count = (s: MessageStatus) => messages.filter((m) => m.direction === "out" && m.status === s).length;
      return {
        prospectingSent: sent.length,
        conversationsReplied: replied.size,
        draft: count("draft"),
        approved: count("approved"),
        simulated: count("simulated"),
        failed: count("failed"),
      };
    },

    async pulse() {
      // o mesmo que a função `app_pulse` do banco, em memória: tudo o que as telas mostram, menos o estado do worker
      const text = JSON.stringify([
        messages.map((m) => [m.id, m.status, m.attempts, m.error, m.scheduledFor]),
        [...conversations.values()].map((c) => [c.id, c.status, c.unread, c.humanTakenOver, c.touches, c.lastInboundAt, c.lastOutboundAt, c.accountId]),
        [...leads.values()].map((l) => [l.id, l.stage, l.eligible, l.notes, l.dealValue]),
        events.length,
        optouts.size,
        settings,
        [...accounts.values()],
        [...demos.values()],
        [...proposals.values()],
        [...projects.values()],
      ]);
      let h = 5381;
      for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    },

    async addOptout(phoneE164: string) {
      optouts.add(phoneE164);
    },

    async removeOptout(phones: string[]) {
      for (const phone of phones) optouts.delete(phone);
    },

    // ── prévia do site ──
    async createDemo(d: NewDemo) {
      if ([...demos.values()].some((x) => x.slug === d.slug)) throw new Error("Esse endereço de prévia já existe.");
      const ts = now();
      const demo: Demo = {
        id: crypto.randomUUID(),
        ...d,
        content: structuredClone(d.content),
        status: "published",
        views: 0,
        firstViewedAt: null,
        lastViewedAt: null,
        sentAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      demos.set(demo.id, demo);
      return demo;
    },

    async getDemo(id) {
      return demos.get(id) ?? null;
    },

    async listDemos({ leadId, status, limit }) {
      return [...demos.values()]
        .filter((d) => (!leadId || d.leadId === leadId) && (!status || d.status === status))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },

    async updateDemo(id: string, patch: DemoPatch) {
      const current = demos.get(id);
      if (!current) throw new Error("Prévia não encontrada.");
      const next: Demo = { ...current, ...patch, updatedAt: now() };
      demos.set(id, next);
      return next;
    },

    async viewDemo(slug, count) {
      const demo = isDemoSlug(slug) ? [...demos.values()].find((d) => d.slug === slug && d.status === "published") : null;
      if (!demo) return null;
      if (count) {
        const ts = now();
        demos.set(demo.id, { ...demo, views: demo.views + 1, firstViewedAt: demo.firstViewedAt ?? ts, lastViewedAt: ts });
      }
      return { template: demo.template, palette: demo.palette, content: structuredClone(demo.content) };
    },

    // ── proposta ──
    async createProposal(p: NewProposal) {
      const ts = now();
      const proposal: Proposal = {
        id: crypto.randomUUID(),
        leadId: p.leadId,
        demoId: p.demoId ?? null,
        title: p.title,
        amountCents: p.amountCents,
        entryPct: p.entryPct,
        deliveryDays: p.deliveryDays,
        status: "draft",
        notes: p.notes ?? "",
        sentAt: null,
        acceptedAt: null,
        entryPaidAt: null,
        paidAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      proposals.set(proposal.id, proposal);
      return proposal;
    },

    async getProposal(id) {
      return proposals.get(id) ?? null;
    },

    async listProposals({ leadId, statuses, limit }) {
      return [...proposals.values()]
        .filter((p) => (!leadId || p.leadId === leadId) && (!statuses?.length || statuses.includes(p.status)))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
        .slice(0, limit);
    },

    async updateProposal(id: string, patch: ProposalPatch) {
      const current = proposals.get(id);
      if (!current) throw new Error("Proposta não encontrada.");
      const next: Proposal = { ...current, ...patch, updatedAt: now() };
      proposals.set(id, next);
      return next;
    },

    // ── produção ──
    async createProject(p: NewProject) {
      if (p.proposalId && [...projects.values()].some((x) => x.proposalId === p.proposalId)) {
        throw new Error("Essa proposta já tem um projeto.");
      }
      const ts = now();
      const project: Project = {
        id: crypto.randomUUID(),
        leadId: p.leadId,
        proposalId: p.proposalId ?? null,
        status: p.status ?? "briefing",
        dueDate: p.dueDate ?? null,
        checklist: structuredClone(p.checklist ?? []),
        briefing: p.briefing ?? "",
        deliveredAt: null,
        createdAt: ts,
        updatedAt: ts,
      };
      projects.set(project.id, project);
      return project;
    },

    async getProject(id) {
      return projects.get(id) ?? null;
    },

    async listProjects({ leadId, proposalId, statuses, limit }) {
      return [...projects.values()]
        .filter(
          (p) =>
            (!leadId || p.leadId === leadId) &&
            (!proposalId || p.proposalId === proposalId) &&
            (!statuses?.length || statuses.includes(p.status)),
        )
        .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.createdAt.localeCompare(b.createdAt))
        .slice(0, limit);
    },

    async updateProject(id: string, patch: ProjectPatch) {
      const current = projects.get(id);
      if (!current) throw new Error("Projeto não encontrado.");
      const next: Project = { ...current, ...patch, updatedAt: now() };
      projects.set(id, next);
      return next;
    },
  };

  return Object.assign(repo, {
    _addOptout(phone: string) {
      optouts.add(phone);
    },
  });
}
