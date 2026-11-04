import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  isDemoSlug,
  type ChecklistItem,
  type Demo,
  type DemoContent,
  type DemoPalette,
  type DemoPatch,
  type DemoStatus,
  type DemoTemplate,
  type NewDemo,
  type NewProject,
  type NewProposal,
  type Project,
  type ProjectPatch,
  type ProjectStatus,
  type Proposal,
  type ProposalPatch,
  type ProposalStatus,
} from "@/lib/deals/types";
import {
  EMPTY_ACCOUNT_STATE,
  type Account,
  type AccountCaps,
  type AccountPatch,
  type AccountState,
  type NewAccount,
} from "@/lib/outreach/accounts";
import {
  DEFAULT_AUTOMATION_STATE,
  mergeAutomation,
  type AutomationConfig,
  type AutomationState,
} from "@/lib/outreach/config";
import type {
  Conversation,
  ConversationPatch,
  ConversationStatus,
  Intent,
  Message,
  MessageCounts,
  MessageDirection,
  MessageKind,
  MessagePatch,
  MessageQuery,
  MessageStatus,
  NewMessage,
} from "@/lib/outreach/types";
import {
  STAGES,
  emptyStageCounts,
  mergeSettings,
  type EventType,
  type IneligibleReason,
  type Lead,
  type LeadEvent,
  type LeadSource,
  type NewEvent,
  type NewLead,
  type NewSearch,
  type ScoreItem,
  type Search,
  type SearchSource,
  type SearchStatus,
  type Settings,
  type Stage,
  type Stats,
  type WebsiteKind,
  type WhatsappStatus,
} from "@/lib/leads/types";
import type { LeadPage, LeadPatch, LeadQuery, Repo, SearchPatch } from "./types";

type LeadRow = {
  id: string;
  dedupe_key: string;
  place_id: string | null;
  name: string;
  category: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  neighborhood: string | null;
  phone_raw: string | null;
  phone_e164: string | null;
  is_mobile: boolean;
  whatsapp_status: WhatsappStatus;
  website_raw: string | null;
  website_kind: WebsiteKind;
  website_signals: string[];
  site_checked_at: string | null;
  rating: number | null;
  reviews_count: number;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  permanently_closed: boolean;
  score: number;
  score_breakdown: ScoreItem[];
  eligible: boolean;
  ineligible_reason: IneligibleReason | null;
  stage: Stage;
  stage_changed_at: string;
  notes: string;
  deal_value: number | string | null;
  source: LeadSource;
  search_id: string | null;
  created_at: string;
  updated_at: string;
};

type SearchRow = {
  id: string;
  niche: string;
  city: string;
  state: string | null;
  requested: number;
  source: SearchSource;
  status: SearchStatus;
  apify_run_id: string | null;
  dataset_id: string | null;
  found: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  eligible: number;
  estimated_cost_usd: number | string | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

type EventRow = {
  id: string;
  lead_id: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  created_at: string;
};

type AccountRow = {
  id: string;
  name: string;
  gowa_device_id: string | null;
  phone_e164: string | null;
  jid: string | null;
  legacy: boolean;
  paused: boolean;
  paused_reason: string | null;
  retired: boolean;
  position: number;
  caps: AccountCaps | null;
  warmup_start: string | null;
  last_send_at: string | null;
  consecutive_failures: number;
  last_result: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: string;
  lead_id: string;
  phone_e164: string;
  account_id: string | null;
  status: ConversationStatus;
  human_taken_over: boolean;
  touches: number;
  unread: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  lead_id: string;
  account_id: string | null;
  direction: MessageDirection;
  kind: MessageKind;
  step: number;
  body: string;
  status: MessageStatus;
  variant: string | null;
  intent: Intent | null;
  scheduled_for: string | null;
  approved_at: string | null;
  sent_at: string | null;
  provider_message_id: string | null;
  attempts: number;
  error: string | null;
  created_by: "system" | "user" | "lead";
  batch_day: string | null;
  created_at: string;
};

type DemoRow = {
  id: string;
  lead_id: string;
  slug: string;
  template: DemoTemplate;
  palette: DemoPalette;
  content: DemoContent;
  status: DemoStatus;
  views: number;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProposalRow = {
  id: string;
  lead_id: string;
  demo_id: string | null;
  title: string;
  amount_cents: number;
  entry_pct: number;
  delivery_days: number;
  status: ProposalStatus;
  notes: string;
  sent_at: string | null;
  accepted_at: string | null;
  entry_paid_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectRow = {
  id: string;
  lead_id: string;
  proposal_id: string | null;
  status: ProjectStatus;
  due_date: string | null;
  checklist: ChecklistItem[];
  briefing: string;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

function rowToDemo(r: DemoRow): Demo {
  return {
    id: r.id,
    leadId: r.lead_id,
    slug: r.slug,
    template: r.template,
    palette: r.palette,
    content: r.content,
    status: r.status,
    views: r.views,
    firstViewedAt: r.first_viewed_at,
    lastViewedAt: r.last_viewed_at,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToProposal(r: ProposalRow): Proposal {
  return {
    id: r.id,
    leadId: r.lead_id,
    demoId: r.demo_id,
    title: r.title,
    amountCents: r.amount_cents,
    entryPct: r.entry_pct,
    deliveryDays: r.delivery_days,
    status: r.status,
    notes: r.notes,
    sentAt: r.sent_at,
    acceptedAt: r.accepted_at,
    entryPaidAt: r.entry_paid_at,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    leadId: r.lead_id,
    proposalId: r.proposal_id,
    status: r.status,
    dueDate: r.due_date,
    checklist: Array.isArray(r.checklist) ? r.checklist : [],
    briefing: r.briefing,
    deliveredAt: r.delivered_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Só leva para o banco os campos que vieram no patch (undefined = não mexer). */
function definedOnly(entries: [string, unknown][]): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of entries) if (value !== undefined) row[key] = value;
  return row;
}

const toNum = (v: number | string | null): number | null => (v == null ? null : Number(v));

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    gowaDeviceId: r.gowa_device_id,
    phoneE164: r.phone_e164,
    jid: r.jid,
    legacy: r.legacy,
    paused: r.paused,
    pausedReason: r.paused_reason,
    retired: r.retired,
    position: r.position,
    caps: r.caps && typeof r.caps === "object" ? r.caps : null,
    warmupStart: r.warmup_start,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function accountStateOf(r: AccountRow): AccountState {
  return { lastSendAt: r.last_send_at, consecutiveFailures: r.consecutive_failures, lastResult: r.last_result };
}

function rowToConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    leadId: r.lead_id,
    phoneE164: r.phone_e164,
    accountId: r.account_id ?? null,
    status: r.status,
    humanTakenOver: r.human_taken_over,
    touches: r.touches,
    unread: r.unread,
    lastInboundAt: r.last_inbound_at,
    lastOutboundAt: r.last_outbound_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    leadId: r.lead_id,
    accountId: r.account_id ?? null,
    direction: r.direction,
    kind: r.kind,
    step: r.step,
    body: r.body,
    status: r.status,
    variant: r.variant,
    intent: r.intent,
    scheduledFor: r.scheduled_for,
    approvedAt: r.approved_at,
    sentAt: r.sent_at,
    providerMessageId: r.provider_message_id,
    attempts: r.attempts,
    error: r.error,
    createdBy: r.created_by,
    batchDay: r.batch_day,
    createdAt: r.created_at,
  };
}

function messagePatchToRow(patch: MessagePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.body !== undefined) row.body = patch.body;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.scheduledFor !== undefined) row.scheduled_for = patch.scheduledFor;
  if (patch.approvedAt !== undefined) row.approved_at = patch.approvedAt;
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt;
  if (patch.providerMessageId !== undefined) row.provider_message_id = patch.providerMessageId;
  if (patch.attempts !== undefined) row.attempts = patch.attempts;
  if (patch.error !== undefined) row.error = patch.error;
  if (patch.intent !== undefined) row.intent = patch.intent;
  if (patch.variant !== undefined) row.variant = patch.variant;
  if (patch.accountId !== undefined) row.account_id = patch.accountId;
  return row;
}

function rowToLead(r: LeadRow): Lead {
  return {
    id: r.id,
    dedupeKey: r.dedupe_key,
    placeId: r.place_id,
    name: r.name,
    category: r.category,
    niche: r.niche,
    city: r.city,
    state: r.state,
    address: r.address,
    neighborhood: r.neighborhood,
    phoneRaw: r.phone_raw,
    phoneE164: r.phone_e164,
    isMobile: r.is_mobile,
    whatsappStatus: r.whatsapp_status,
    websiteRaw: r.website_raw,
    websiteKind: r.website_kind,
    websiteSignals: r.website_signals ?? [],
    siteCheckedAt: r.site_checked_at,
    rating: toNum(r.rating),
    reviewsCount: r.reviews_count,
    mapsUrl: r.maps_url,
    lat: r.lat,
    lng: r.lng,
    permanentlyClosed: r.permanently_closed,
    score: r.score,
    scoreBreakdown: r.score_breakdown ?? [],
    eligible: r.eligible,
    ineligibleReason: r.ineligible_reason,
    stage: r.stage,
    stageChangedAt: r.stage_changed_at,
    notes: r.notes,
    dealValue: toNum(r.deal_value),
    source: r.source,
    searchId: r.search_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function leadToRow(l: NewLead) {
  return {
    dedupe_key: l.dedupeKey,
    place_id: l.placeId,
    name: l.name,
    category: l.category,
    niche: l.niche,
    city: l.city,
    state: l.state,
    address: l.address,
    neighborhood: l.neighborhood,
    phone_raw: l.phoneRaw,
    phone_e164: l.phoneE164,
    is_mobile: l.isMobile,
    whatsapp_status: l.whatsappStatus,
    website_raw: l.websiteRaw,
    website_kind: l.websiteKind,
    website_signals: l.websiteSignals,
    site_checked_at: l.siteCheckedAt,
    rating: l.rating,
    reviews_count: l.reviewsCount,
    maps_url: l.mapsUrl,
    lat: l.lat,
    lng: l.lng,
    permanently_closed: l.permanentlyClosed,
    score: l.score,
    score_breakdown: l.scoreBreakdown,
    eligible: l.eligible,
    ineligible_reason: l.ineligibleReason,
    stage: l.stage,
    notes: l.notes,
    deal_value: l.dealValue,
    source: l.source,
    search_id: l.searchId,
  };
}

function rowToSearch(r: SearchRow): Search {
  return {
    id: r.id,
    niche: r.niche,
    city: r.city,
    state: r.state,
    requested: r.requested,
    source: r.source,
    status: r.status,
    apifyRunId: r.apify_run_id,
    datasetId: r.dataset_id,
    found: r.found,
    inserted: r.inserted,
    duplicates: r.duplicates,
    invalid: r.invalid,
    eligible: r.eligible,
    estimatedCostUsd: toNum(r.estimated_cost_usd),
    error: r.error,
    createdAt: r.created_at,
    finishedAt: r.finished_at,
  };
}

function rowToEvent(r: EventRow): LeadEvent {
  return { id: r.id, leadId: r.lead_id, type: r.type, payload: r.payload ?? {}, createdAt: r.created_at };
}

/** Lança erro legível se a consulta falhou; devolve a linha já tipada. */
function must<T>(res: { data: unknown; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null || res.data === undefined) throw new Error(`${what}: resposta vazia`);
  return res.data as T;
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Tira caracteres que quebrariam o filtro `.or()` do PostgREST. */
function safeLike(text: string): string {
  return text.replace(/[,()%*\\:"']/g, " ").replace(/\s+/g, " ").trim();
}

/** Configurações do negócio e da automação ficam em chaves separadas para um não pisar no outro. */
const SETTINGS_KEY = "app";
const AUTOMATION_KEY = "automation";
const STATE_KEY = "automation_state";

/** Repositório real, sobre o Supabase, com a sessão do dono (RLS vale em tudo). */
export function createSupabaseRepo(sb: SupabaseClient): Repo {
  const repo: Repo = {
    mode: "supabase",

    async listLeads(q: LeadQuery): Promise<LeadPage> {
      let qb = sb.from("leads").select("*", { count: "exact" });
      if (q.stages?.length) qb = qb.in("stage", q.stages);
      if (q.siteKinds?.length) qb = qb.in("website_kind", q.siteKinds);
      if (q.eligible !== undefined) qb = qb.eq("eligible", q.eligible);
      if (q.minScore !== undefined) qb = qb.gte("score", q.minScore);
      if (q.searchId) qb = qb.eq("search_id", q.searchId);
      const text = q.q ? safeLike(q.q) : "";
      if (text) {
        const t = `%${text}%`;
        qb = qb.or(
          `name.ilike.${t},category.ilike.${t},city.ilike.${t},neighborhood.ilike.${t},phone_raw.ilike.${t}`,
        );
      }
      const sort = q.sort ?? "score";
      if (sort === "recent") qb = qb.order("created_at", { ascending: false });
      else if (sort === "name") qb = qb.order("name", { ascending: true });
      else if (sort === "reviews") qb = qb.order("reviews_count", { ascending: false });
      else qb = qb.order("score", { ascending: false }).order("reviews_count", { ascending: false });
      qb = qb.order("id", { ascending: true }).range(q.offset, q.offset + q.limit - 1);

      const { data, error, count } = await qb;
      if (error) throw new Error(`listar leads: ${error.message}`);
      return { rows: ((data ?? []) as LeadRow[]).map(rowToLead), total: count ?? 0 };
    },

    async getLead(id) {
      const { data, error } = await sb.from("leads").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar lead: ${error.message}`);
      return data ? rowToLead(data as LeadRow) : null;
    },

    async getLeads(ids) {
      if (ids.length === 0) return [];
      const out: Lead[] = [];
      for (const part of chunk(ids, 100)) {
        const { data, error } = await sb.from("leads").select("*").in("id", part);
        if (error) throw new Error(`buscar leads: ${error.message}`);
        out.push(...((data ?? []) as LeadRow[]).map(rowToLead));
      }
      return out;
    },

    async findExisting({ dedupeKeys, phones }) {
      const foundKeys = new Set<string>();
      const foundPhones = new Set<string>();
      for (const part of chunk(dedupeKeys, 100)) {
        const { data, error } = await sb.from("leads").select("dedupe_key").in("dedupe_key", part);
        if (error) throw new Error(`checar duplicados: ${error.message}`);
        for (const r of data ?? []) foundKeys.add((r as { dedupe_key: string }).dedupe_key);
      }
      for (const part of chunk(phones, 100)) {
        const { data, error } = await sb.from("leads").select("phone_e164").in("phone_e164", part);
        if (error) throw new Error(`checar telefones: ${error.message}`);
        for (const r of data ?? []) foundPhones.add((r as { phone_e164: string }).phone_e164);
      }
      return { dedupeKeys: foundKeys, phones: foundPhones };
    },

    async findOptouts(phones) {
      const found = new Set<string>();
      for (const part of chunk(phones, 100)) {
        const { data, error } = await sb.from("optouts").select("phone_e164").in("phone_e164", part);
        if (error) throw new Error(`checar bloqueios: ${error.message}`);
        for (const r of data ?? []) found.add((r as { phone_e164: string }).phone_e164);
      }
      return found;
    },

    async insertLeads(list: NewLead[]) {
      const created: Lead[] = [];
      for (const part of chunk(list, 100)) {
        const rows = part.map(leadToRow);
        const batch = await sb.from("leads").insert(rows).select("*");
        if (!batch.error) {
          created.push(...((batch.data ?? []) as LeadRow[]).map(rowToLead));
          continue;
        }
        // 23505 = violação de unicidade (corrida entre duas buscas). Tenta um a um e pula repetidos.
        if (batch.error.code !== "23505") throw new Error(`gravar leads: ${batch.error.message}`);
        for (const row of rows) {
          const one = await sb.from("leads").insert(row).select("*").single();
          if (one.error) {
            if (one.error.code === "23505") continue;
            throw new Error(`gravar lead: ${one.error.message}`);
          }
          created.push(rowToLead(one.data as LeadRow));
        }
      }
      return created;
    },

    async updateLead(id: string, patch: LeadPatch) {
      const row: Record<string, unknown> = {};
      if (patch.notes !== undefined) row.notes = patch.notes;
      if (patch.dealValue !== undefined) row.deal_value = patch.dealValue;
      if (patch.websiteKind !== undefined) row.website_kind = patch.websiteKind;
      if (patch.websiteSignals !== undefined) row.website_signals = patch.websiteSignals;
      if (patch.siteCheckedAt !== undefined) row.site_checked_at = patch.siteCheckedAt;
      if (patch.score !== undefined) row.score = patch.score;
      if (patch.scoreBreakdown !== undefined) row.score_breakdown = patch.scoreBreakdown;
      if (patch.whatsappStatus !== undefined) row.whatsapp_status = patch.whatsappStatus;
      const data = must<LeadRow>(
        await sb.from("leads").update(row).eq("id", id).select("*").single(),
        "atualizar lead",
      );
      return rowToLead(data);
    },

    async setStage(id: string, stage: Stage) {
      const current = await repo.getLead(id);
      if (!current) throw new Error("Lead não encontrado.");
      if (current.stage === stage) return current;
      const row: Record<string, unknown> = { stage, stage_changed_at: new Date().toISOString() };
      if (stage === "ganho" && current.dealValue == null) {
        row.deal_value = (await repo.getSettings()).ticketAverage;
      }
      const data = must<LeadRow>(
        await sb.from("leads").update(row).eq("id", id).select("*").single(),
        "mudar etapa",
      );
      return rowToLead(data);
    },

    async bulkSetStage(ids: string[], stage: Stage) {
      if (ids.length === 0) return 0;
      if (stage === "ganho") {
        let n = 0;
        for (const id of ids) {
          await repo.setStage(id, stage);
          n++;
        }
        return n;
      }
      let n = 0;
      for (const part of chunk(ids, 100)) {
        const { data, error } = await sb
          .from("leads")
          .update({ stage, stage_changed_at: new Date().toISOString() })
          .in("id", part)
          .select("id");
        if (error) throw new Error(`mudar etapa em lote: ${error.message}`);
        n += data?.length ?? 0;
      }
      return n;
    },

    async stats(): Promise<Stats> {
      const { data, error } = await sb.rpc("lead_stats");
      if (error) throw new Error(`estatísticas: ${error.message}`);
      const s = (data ?? {}) as {
        total?: number;
        eligible?: number;
        eligible_no_site?: number;
        avg_score?: number;
        won_value?: number | string;
        stages?: Partial<Record<Stage, number>>;
      };
      return {
        total: s.total ?? 0,
        eligible: s.eligible ?? 0,
        eligibleNoSite: s.eligible_no_site ?? 0,
        avgScore: s.avg_score ?? 0,
        wonValue: Number(s.won_value ?? 0),
        stages: { ...emptyStageCounts(), ...(s.stages ?? {}) },
      };
    },

    async board(perStage: number) {
      const entries = await Promise.all(
        STAGES.map(async (stage) => {
          let qb = sb.from("leads").select("*", { count: "exact" }).eq("stage", stage);
          // O funil só mostra quem dá para trabalhar: inelegível parado em "novo" fica de fora.
          if (stage === "novo") qb = qb.eq("eligible", true);
          const { data, error, count } = await qb
            .order("score", { ascending: false })
            .order("reviews_count", { ascending: false })
            .limit(perStage);
          if (error) throw new Error(`funil (${stage}): ${error.message}`);
          return [stage, { rows: ((data ?? []) as LeadRow[]).map(rowToLead), total: count ?? 0 }] as const;
        }),
      );
      return Object.fromEntries(entries) as Record<Stage, { rows: Lead[]; total: number }>;
    },

    async addEvents(events: NewEvent[]) {
      for (const part of chunk(events, 200)) {
        const rows = part.map((e) => ({ lead_id: e.leadId, type: e.type, payload: e.payload }));
        const { error } = await sb.from("lead_events").insert(rows);
        if (error) throw new Error(`gravar eventos: ${error.message}`);
      }
    },

    async listEvents({ leadId, types, limit }) {
      let qb = sb.from("lead_events").select("*").order("created_at", { ascending: false }).limit(limit);
      if (leadId) qb = qb.eq("lead_id", leadId);
      if (types?.length) qb = qb.in("type", types);
      const { data, error } = await qb;
      if (error) throw new Error(`listar eventos: ${error.message}`);
      return ((data ?? []) as EventRow[]).map(rowToEvent);
    },

    async createSearch(s: NewSearch) {
      const data = must<SearchRow>(
        await sb
          .from("searches")
          .insert({
            niche: s.niche,
            city: s.city,
            state: s.state,
            requested: s.requested,
            source: s.source,
            status: s.status,
            apify_run_id: s.apifyRunId ?? null,
            dataset_id: s.datasetId ?? null,
            estimated_cost_usd: s.estimatedCostUsd ?? null,
          })
          .select("*")
          .single(),
        "criar busca",
      );
      return rowToSearch(data);
    },

    async getSearch(id) {
      const { data, error } = await sb.from("searches").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar busca: ${error.message}`);
      return data ? rowToSearch(data as SearchRow) : null;
    },

    async updateSearch(id: string, patch: SearchPatch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.apifyRunId !== undefined) row.apify_run_id = patch.apifyRunId;
      if (patch.datasetId !== undefined) row.dataset_id = patch.datasetId;
      if (patch.found !== undefined) row.found = patch.found;
      if (patch.inserted !== undefined) row.inserted = patch.inserted;
      if (patch.duplicates !== undefined) row.duplicates = patch.duplicates;
      if (patch.invalid !== undefined) row.invalid = patch.invalid;
      if (patch.eligible !== undefined) row.eligible = patch.eligible;
      if (patch.estimatedCostUsd !== undefined) row.estimated_cost_usd = patch.estimatedCostUsd;
      if (patch.error !== undefined) row.error = patch.error;
      if (patch.finishedAt !== undefined) row.finished_at = patch.finishedAt;
      const data = must<SearchRow>(
        await sb.from("searches").update(row).eq("id", id).select("*").single(),
        "atualizar busca",
      );
      return rowToSearch(data);
    },

    async claimSearchForIngest(id) {
      const { data, error } = await sb
        .from("searches")
        .update({ status: "ingesting" })
        .eq("id", id)
        .eq("status", "running")
        .select("id");
      if (error) throw new Error(`reservar busca: ${error.message}`);
      return (data?.length ?? 0) > 0;
    },

    async listSearches(limit) {
      const { data, error } = await sb
        .from("searches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`listar buscas: ${error.message}`);
      return ((data ?? []) as SearchRow[]).map(rowToSearch);
    },

    async getSettings() {
      const { data, error } = await sb
        .from("settings")
        .select("key, value")
        .in("key", [SETTINGS_KEY, AUTOMATION_KEY]);
      if (error) throw new Error(`ler configurações: ${error.message}`);
      const byKey = Object.fromEntries((data ?? []).map((r) => [r.key as string, r.value]));
      return mergeSettings({
        ...(byKey[SETTINGS_KEY] as Partial<Settings> | undefined),
        automation: byKey[AUTOMATION_KEY] as Partial<AutomationConfig> | undefined,
      } as Partial<Settings>);
    },

    async saveSettings(patch) {
      const { automation: _ignored, ...rest } = patch;
      void _ignored;
      const current = await repo.getSettings();
      const { automation: _keep, ...business } = current;
      void _keep;
      const next = { ...business, ...rest };
      const { error } = await sb
        .from("settings")
        .upsert({ key: SETTINGS_KEY, value: next, updated_at: new Date().toISOString() });
      if (error) throw new Error(`salvar configurações: ${error.message}`);
      return mergeSettings({ ...next, automation: current.automation });
    },

    async saveAutomation(patch: Partial<AutomationConfig>) {
      const current = await repo.getSettings();
      const automation = mergeAutomation({ ...current.automation, ...patch });
      const { error } = await sb
        .from("settings")
        .upsert({ key: AUTOMATION_KEY, value: automation, updated_at: new Date().toISOString() });
      if (error) throw new Error(`salvar automação: ${error.message}`);
      return { ...current, automation };
    },

    async getAutomationState() {
      const { data, error } = await sb.from("settings").select("value").eq("key", STATE_KEY).maybeSingle();
      if (error) throw new Error(`ler estado da automação: ${error.message}`);
      return { ...DEFAULT_AUTOMATION_STATE, ...((data?.value as Partial<AutomationState> | undefined) ?? {}) };
    },

    async saveAutomationState(patch) {
      const next = { ...(await repo.getAutomationState()), ...patch };
      const { error } = await sb
        .from("settings")
        .upsert({ key: STATE_KEY, value: next, updated_at: new Date().toISOString() });
      if (error) throw new Error(`salvar estado da automação: ${error.message}`);
      return next;
    },

    async listAccounts() {
      const { data, error } = await sb.from("whatsapp_accounts").select("*").order("position").order("created_at");
      if (error) {
        // 42P01: a migração dos números ainda não rodou. Sem a tabela, o painel segue com um número só, como sempre foi.
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw new Error(`listar números: ${error.message}`);
      }
      return ((data ?? []) as AccountRow[]).map(rowToAccount);
    },

    async getAccount(id: string) {
      const { data, error } = await sb.from("whatsapp_accounts").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar número: ${error.message}`);
      return data ? rowToAccount(data as AccountRow) : null;
    },

    async createAccount(input: NewAccount) {
      const last = await sb.from("whatsapp_accounts").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
      const position = ((last.data as { position: number } | null)?.position ?? 0) + 1;
      const data = must<AccountRow>(
        await sb
          .from("whatsapp_accounts")
          .insert({
            name: input.name,
            gowa_device_id: input.gowaDeviceId ?? null,
            phone_e164: input.phoneE164 ?? null,
            jid: input.jid ?? null,
            legacy: input.legacy ?? false,
            paused: input.paused ?? false,
            paused_reason: input.pausedReason ?? null,
            position,
            caps: input.caps ?? null,
            warmup_start: input.warmupStart ?? null,
          })
          .select("*")
          .single(),
        "criar número",
      );
      return rowToAccount(data);
    },

    async updateAccount(id: string, patch: AccountPatch) {
      const row = definedOnly([
        ["name", patch.name],
        ["gowa_device_id", patch.gowaDeviceId],
        ["phone_e164", patch.phoneE164],
        ["jid", patch.jid],
        ["paused", patch.paused],
        ["paused_reason", patch.pausedReason],
        ["retired", patch.retired],
        ["caps", patch.caps],
        ["warmup_start", patch.warmupStart],
      ]);
      const data = must<AccountRow>(
        await sb.from("whatsapp_accounts").update(row).eq("id", id).select("*").single(),
        "atualizar número",
      );
      return rowToAccount(data);
    },

    async getAccountState(accountId: string) {
      const { data, error } = await sb.from("whatsapp_accounts").select("*").eq("id", accountId).maybeSingle();
      if (error) throw new Error(`ler estado do número: ${error.message}`);
      if (!data) return { ...EMPTY_ACCOUNT_STATE };
      const row = data as AccountRow;
      // o número original guarda o estado no mesmo lugar de sempre
      if (row.legacy) {
        const st = await repo.getAutomationState();
        return { lastSendAt: st.lastSendAt, consecutiveFailures: st.consecutiveFailures, lastResult: st.lastResult };
      }
      return accountStateOf(row);
    },

    async saveAccountState(accountId: string, patch: Partial<AccountState>) {
      const current = await repo.getAccount(accountId);
      if (!current) throw new Error("Número não encontrado.");
      if (current.legacy) {
        const st = await repo.saveAutomationState(patch);
        return { lastSendAt: st.lastSendAt, consecutiveFailures: st.consecutiveFailures, lastResult: st.lastResult };
      }
      const row = definedOnly([
        ["last_send_at", patch.lastSendAt],
        ["consecutive_failures", patch.consecutiveFailures],
        ["last_result", patch.lastResult],
      ]);
      const data = must<AccountRow>(
        await sb.from("whatsapp_accounts").update(row).eq("id", accountId).select("*").single(),
        "salvar estado do número",
      );
      return accountStateOf(data);
    },

    async ensureConversation(leadId: string, phoneE164: string, accountId?: string | null) {
      const found = await sb
        .from("conversations")
        .select("*")
        .or(`lead_id.eq.${leadId},phone_e164.eq.${phoneE164}`)
        .limit(1)
        .maybeSingle();
      if (found.error) throw new Error(`buscar conversa: ${found.error.message}`);
      if (found.data) return rowToConversation(found.data as ConversationRow);
      const created = await sb
        .from("conversations")
        // sem número escolhido, o gatilho do banco põe o original
        .insert({ lead_id: leadId, phone_e164: phoneE164, ...(accountId ? { account_id: accountId } : {}) })
        .select("*")
        .single();
      if (created.error) {
        // 23505: outra chamada criou no mesmo instante. Busca de novo.
        if (created.error.code === "23505") {
          const again = await sb
            .from("conversations")
            .select("*")
            .or(`lead_id.eq.${leadId},phone_e164.eq.${phoneE164}`)
            .limit(1)
            .single();
          if (!again.error) return rowToConversation(again.data as ConversationRow);
        }
        throw new Error(`criar conversa: ${created.error.message}`);
      }
      return rowToConversation(created.data as ConversationRow);
    },

    async getConversation(id) {
      const { data, error } = await sb.from("conversations").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar conversa: ${error.message}`);
      return data ? rowToConversation(data as ConversationRow) : null;
    },

    async findConversationByLead(leadId) {
      const { data, error } = await sb.from("conversations").select("*").eq("lead_id", leadId).maybeSingle();
      if (error) throw new Error(`buscar conversa: ${error.message}`);
      return data ? rowToConversation(data as ConversationRow) : null;
    },

    async findConversationByPhone(phoneE164) {
      const { data, error } = await sb.from("conversations").select("*").eq("phone_e164", phoneE164).maybeSingle();
      if (error) throw new Error(`buscar conversa: ${error.message}`);
      return data ? rowToConversation(data as ConversationRow) : null;
    },

    async listConversations({ statuses, accountId, limit, offset = 0 }) {
      let qb = sb.from("conversations").select("*", { count: "exact" });
      if (statuses?.length) qb = qb.in("status", statuses);
      if (accountId) qb = qb.eq("account_id", accountId);
      const { data, error, count } = await qb
        .order("last_inbound_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw new Error(`listar conversas: ${error.message}`);
      const rows = ((data ?? []) as ConversationRow[]).map(rowToConversation);
      // quem precisa do dono primeiro (a ordenação por data continua dentro de cada grupo)
      rows.sort((a, b) => Number(b.status === "awaiting_human") - Number(a.status === "awaiting_human"));
      return { rows, total: count ?? 0 };
    },

    async updateConversation(id: string, patch: ConversationPatch) {
      const row: Record<string, unknown> = {};
      if (patch.status !== undefined) row.status = patch.status;
      if (patch.humanTakenOver !== undefined) row.human_taken_over = patch.humanTakenOver;
      if (patch.touches !== undefined) row.touches = patch.touches;
      if (patch.unread !== undefined) row.unread = patch.unread;
      if (patch.lastInboundAt !== undefined) row.last_inbound_at = patch.lastInboundAt;
      if (patch.lastOutboundAt !== undefined) row.last_outbound_at = patch.lastOutboundAt;
      if (patch.accountId !== undefined) row.account_id = patch.accountId;
      const data = must<ConversationRow>(
        await sb.from("conversations").update(row).eq("id", id).select("*").single(),
        "atualizar conversa",
      );
      return rowToConversation(data);
    },

    async createMessages(list: NewMessage[]) {
      const created: Message[] = [];
      for (const part of chunk(list, 100)) {
        const rows = part.map((m) => ({
          conversation_id: m.conversationId,
          lead_id: m.leadId,
          direction: m.direction,
          kind: m.kind,
          step: m.step ?? 0,
          body: m.body,
          status: m.status,
          variant: m.variant ?? null,
          intent: m.intent ?? null,
          scheduled_for: m.scheduledFor ?? null,
          approved_at: m.approvedAt ?? null,
          sent_at: m.sentAt ?? null,
          provider_message_id: m.providerMessageId ?? null,
          created_by: m.createdBy,
          batch_day: m.batchDay ?? null,
        }));
        const { data, error } = await sb.from("messages").insert(rows).select("*");
        if (error) throw new Error(`gravar mensagens: ${error.message}`);
        created.push(...((data ?? []) as MessageRow[]).map(rowToMessage));
      }
      return created;
    },

    async getMessage(id) {
      const { data, error } = await sb.from("messages").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar mensagem: ${error.message}`);
      return data ? rowToMessage(data as MessageRow) : null;
    },

    async listMessages(q: MessageQuery) {
      let qb = sb.from("messages").select("*");
      if (q.conversationId) qb = qb.eq("conversation_id", q.conversationId);
      if (q.leadId) qb = qb.eq("lead_id", q.leadId);
      if (q.accountId) qb = qb.eq("account_id", q.accountId);
      if (q.statuses?.length) qb = qb.in("status", q.statuses);
      if (q.kinds?.length) qb = qb.in("kind", q.kinds);
      if (q.direction) qb = qb.eq("direction", q.direction);
      if (q.sentSince) qb = qb.gte("sent_at", q.sentSince);
      if (q.scheduledUntil) qb = qb.lte("scheduled_for", q.scheduledUntil);
      if (q.batchDay) qb = qb.eq("batch_day", q.batchDay);
      if (q.providerMessageId) qb = qb.eq("provider_message_id", q.providerMessageId);
      const asc = (q.order ?? "asc") === "asc";
      const { data, error } = await qb
        .order("created_at", { ascending: asc })
        .order("id", { ascending: asc })
        .limit(q.limit);
      if (error) throw new Error(`listar mensagens: ${error.message}`);
      return ((data ?? []) as MessageRow[]).map(rowToMessage);
    },

    async updateMessage(id: string, patch: MessagePatch) {
      const data = must<MessageRow>(
        await sb.from("messages").update(messagePatchToRow(patch)).eq("id", id).select("*").single(),
        "atualizar mensagem",
      );
      return rowToMessage(data);
    },

    async bulkUpdateMessages(ids: string[], onlyIfStatus: MessageStatus[], patch: MessagePatch) {
      if (ids.length === 0) return 0;
      let n = 0;
      for (const part of chunk(ids, 100)) {
        const { data, error } = await sb
          .from("messages")
          .update(messagePatchToRow(patch))
          .in("id", part)
          .in("status", onlyIfStatus)
          .select("id");
        if (error) throw new Error(`atualizar mensagens: ${error.message}`);
        n += data?.length ?? 0;
      }
      return n;
    },

    async claimNextDueMessage(nowIso: string, accountId?: string) {
      const { data, error } = await sb.rpc("claim_next_message", accountId ? { p_now: nowIso, p_account: accountId } : { p_now: nowIso });
      if (error) throw new Error(`pegar próxima mensagem: ${error.message}`);
      const rows = (data ?? []) as MessageRow[];
      return rows.length > 0 ? rowToMessage(rows[0]) : null;
    },

    async messageCounts(): Promise<MessageCounts> {
      const { data, error } = await sb.rpc("message_counts");
      if (error) throw new Error(`contadores de mensagens: ${error.message}`);
      const c = (data ?? {}) as Record<string, number>;
      return {
        prospectingSent: c.prospecting_sent ?? 0,
        conversationsReplied: c.conversations_replied ?? 0,
        draft: c.draft ?? 0,
        approved: c.approved ?? 0,
        simulated: c.simulated ?? 0,
        failed: c.failed ?? 0,
      };
    },

    async pulse() {
      const { data, error } = await sb.rpc("app_pulse");
      if (!error && typeof data === "string") return data;
      // 42883 / PGRST202: a migration do pulso ainda não rodou. A tela segue funcionando, só recarrega a cada 20 s.
      if (error && (error.code === "42883" || error.code === "PGRST202")) return `tempo:${Math.floor(Date.now() / 20_000)}`;
      throw new Error(`pulso do painel: ${error?.message ?? "resposta inesperada"}`);
    },

    async addOptout(phoneE164: string, reason: string) {
      const { error } = await sb
        .from("optouts")
        .upsert({ phone_e164: phoneE164, reason }, { onConflict: "phone_e164", ignoreDuplicates: true });
      if (error) throw new Error(`registrar bloqueio: ${error.message}`);
    },

    async removeOptout(phones: string[]) {
      if (phones.length === 0) return;
      const { error } = await sb.from("optouts").delete().in("phone_e164", phones);
      if (error) throw new Error(`liberar número: ${error.message}`);
    },

    // ── prévia do site ──
    async createDemo(d: NewDemo) {
      const data = must<DemoRow>(
        await sb
          .from("demos")
          .insert({ lead_id: d.leadId, slug: d.slug, template: d.template, palette: d.palette, content: d.content })
          .select("*")
          .single(),
        "criar prévia",
      );
      return rowToDemo(data);
    },

    async getDemo(id) {
      const { data, error } = await sb.from("demos").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar prévia: ${error.message}`);
      return data ? rowToDemo(data as DemoRow) : null;
    },

    async listDemos({ leadId, status, limit }) {
      let qb = sb.from("demos").select("*");
      if (leadId) qb = qb.eq("lead_id", leadId);
      if (status) qb = qb.eq("status", status);
      const { data, error } = await qb.order("created_at", { ascending: false }).order("id").limit(limit);
      if (error) throw new Error(`listar prévias: ${error.message}`);
      return ((data ?? []) as DemoRow[]).map(rowToDemo);
    },

    async updateDemo(id: string, patch: DemoPatch) {
      const row = definedOnly([
        ["template", patch.template],
        ["palette", patch.palette],
        ["content", patch.content],
        ["status", patch.status],
        ["sent_at", patch.sentAt],
      ]);
      const data = must<DemoRow>(
        await sb.from("demos").update(row).eq("id", id).select("*").single(),
        "atualizar prévia",
      );
      return rowToDemo(data);
    },

    async viewDemo(slug: string, count: boolean) {
      if (!isDemoSlug(slug)) return null;
      const { data, error } = await sb.rpc("view_demo", { p_slug: slug, p_count: count });
      if (error) throw new Error(`abrir prévia: ${error.message}`);
      if (!data || typeof data !== "object") return null;
      const demo = data as { template?: DemoTemplate; palette?: DemoPalette; content?: DemoContent };
      if (!demo.template || !demo.palette || !demo.content) return null;
      return { template: demo.template, palette: demo.palette, content: demo.content };
    },

    // ── proposta ──
    async createProposal(p: NewProposal) {
      const data = must<ProposalRow>(
        await sb
          .from("proposals")
          .insert({
            lead_id: p.leadId,
            demo_id: p.demoId ?? null,
            title: p.title,
            amount_cents: p.amountCents,
            entry_pct: p.entryPct,
            delivery_days: p.deliveryDays,
            notes: p.notes ?? "",
          })
          .select("*")
          .single(),
        "criar proposta",
      );
      return rowToProposal(data);
    },

    async getProposal(id) {
      const { data, error } = await sb.from("proposals").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar proposta: ${error.message}`);
      return data ? rowToProposal(data as ProposalRow) : null;
    },

    async listProposals({ leadId, statuses, limit }) {
      let qb = sb.from("proposals").select("*");
      if (leadId) qb = qb.eq("lead_id", leadId);
      if (statuses?.length) qb = qb.in("status", statuses);
      const { data, error } = await qb.order("created_at", { ascending: false }).order("id").limit(limit);
      if (error) throw new Error(`listar propostas: ${error.message}`);
      return ((data ?? []) as ProposalRow[]).map(rowToProposal);
    },

    async updateProposal(id: string, patch: ProposalPatch) {
      const row = definedOnly([
        ["title", patch.title],
        ["amount_cents", patch.amountCents],
        ["entry_pct", patch.entryPct],
        ["delivery_days", patch.deliveryDays],
        ["demo_id", patch.demoId],
        ["notes", patch.notes],
        ["status", patch.status],
        ["sent_at", patch.sentAt],
        ["accepted_at", patch.acceptedAt],
        ["entry_paid_at", patch.entryPaidAt],
        ["paid_at", patch.paidAt],
      ]);
      const data = must<ProposalRow>(
        await sb.from("proposals").update(row).eq("id", id).select("*").single(),
        "atualizar proposta",
      );
      return rowToProposal(data);
    },

    // ── produção ──
    async createProject(p: NewProject) {
      const data = must<ProjectRow>(
        await sb
          .from("projects")
          .insert(
            definedOnly([
              ["lead_id", p.leadId],
              ["proposal_id", p.proposalId ?? null],
              ["status", p.status],
              ["due_date", p.dueDate ?? null],
              ["checklist", p.checklist],
              ["briefing", p.briefing],
            ]),
          )
          .select("*")
          .single(),
        "criar projeto",
      );
      return rowToProject(data);
    },

    async getProject(id) {
      const { data, error } = await sb.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(`buscar projeto: ${error.message}`);
      return data ? rowToProject(data as ProjectRow) : null;
    },

    async listProjects({ leadId, proposalId, statuses, limit }) {
      let qb = sb.from("projects").select("*");
      if (leadId) qb = qb.eq("lead_id", leadId);
      if (proposalId) qb = qb.eq("proposal_id", proposalId);
      if (statuses?.length) qb = qb.in("status", statuses);
      const { data, error } = await qb
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`listar projetos: ${error.message}`);
      return ((data ?? []) as ProjectRow[]).map(rowToProject);
    },

    async updateProject(id: string, patch: ProjectPatch) {
      const row = definedOnly([
        ["status", patch.status],
        ["due_date", patch.dueDate],
        ["checklist", patch.checklist],
        ["briefing", patch.briefing],
        ["delivered_at", patch.deliveredAt],
      ]);
      const data = must<ProjectRow>(
        await sb.from("projects").update(row).eq("id", id).select("*").single(),
        "atualizar projeto",
      );
      return rowToProject(data);
    },
  };
  return repo;
}
