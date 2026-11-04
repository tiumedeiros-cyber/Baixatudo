import type {
  EventType,
  Lead,
  LeadEvent,
  NewEvent,
  NewLead,
  NewSearch,
  Search,
  Settings,
  Stage,
  Stats,
  WebsiteKind,
} from "@/lib/leads/types";
import type {
  Demo,
  DemoPatch,
  DemoStatus,
  NewDemo,
  NewProject,
  NewProposal,
  Project,
  ProjectPatch,
  ProjectStatus,
  Proposal,
  ProposalPatch,
  ProposalStatus,
  PublicDemo,
} from "@/lib/deals/types";
import type { Account, AccountPatch, AccountState, NewAccount } from "@/lib/outreach/accounts";
import type { AutomationConfig, AutomationState } from "@/lib/outreach/config";
import type {
  Conversation,
  ConversationPatch,
  ConversationStatus,
  Message,
  MessageCounts,
  MessagePatch,
  MessageQuery,
  MessageStatus,
  NewMessage,
} from "@/lib/outreach/types";

export type LeadSort = "score" | "recent" | "name" | "reviews";

export interface LeadQuery {
  q?: string;
  stages?: Stage[];
  siteKinds?: WebsiteKind[];
  eligible?: boolean;
  minScore?: number;
  searchId?: string;
  sort?: LeadSort;
  limit: number;
  offset: number;
}

export interface LeadPage {
  rows: Lead[];
  total: number;
}

export type LeadPatch = Partial<
  Pick<
    Lead,
    | "notes"
    | "dealValue"
    | "websiteKind"
    | "websiteSignals"
    | "siteCheckedAt"
    | "score"
    | "scoreBreakdown"
    | "whatsappStatus"
  >
>;

export type SearchPatch = Partial<
  Pick<
    Search,
    | "status"
    | "apifyRunId"
    | "datasetId"
    | "found"
    | "inserted"
    | "duplicates"
    | "invalid"
    | "eligible"
    | "estimatedCostUsd"
    | "error"
    | "finishedAt"
  >
>;

/**
 * Camada de dados. Duas implementações: Supabase (produção) e memória (demonstração
 * e testes). Toda a lógica de negócio fala só com esta interface.
 */
export interface Repo {
  readonly mode: "supabase" | "demo";

  listLeads(query: LeadQuery): Promise<LeadPage>;
  getLead(id: string): Promise<Lead | null>;
  getLeads(ids: string[]): Promise<Lead[]>;
  /** Quais chaves de deduplicação e telefones já existem na base. */
  findExisting(keys: { dedupeKeys: string[]; phones: string[] }): Promise<{
    dedupeKeys: Set<string>;
    phones: Set<string>;
  }>;
  /** Quais desses telefones pediram para não receber mensagens. */
  findOptouts(phones: string[]): Promise<Set<string>>;
  insertLeads(leads: NewLead[]): Promise<Lead[]>;
  updateLead(id: string, patch: LeadPatch): Promise<Lead>;
  setStage(id: string, stage: Stage): Promise<Lead>;
  bulkSetStage(ids: string[], stage: Stage): Promise<number>;
  stats(): Promise<Stats>;
  /** Cartões do funil: os melhores `perStage` de cada coluna, mais o total real. */
  board(perStage: number): Promise<Record<Stage, { rows: Lead[]; total: number }>>;

  addEvents(events: NewEvent[]): Promise<void>;
  listEvents(opts: { leadId?: string; types?: EventType[]; limit: number }): Promise<LeadEvent[]>;

  createSearch(search: NewSearch): Promise<Search>;
  getSearch(id: string): Promise<Search | null>;
  updateSearch(id: string, patch: SearchPatch): Promise<Search>;
  /** Marca "running" → "ingesting" de forma atômica. False se outro processo já pegou. */
  claimSearchForIngest(id: string): Promise<boolean>;
  listSearches(limit: number): Promise<Search[]>;

  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  /** Mescla só os campos informados da automação (não pisa no resto). */
  saveAutomation(patch: Partial<AutomationConfig>): Promise<Settings>;
  getAutomationState(): Promise<AutomationState>;
  saveAutomationState(patch: Partial<AutomationState>): Promise<AutomationState>;

  // ── Números de WhatsApp ──
  listAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | null>;
  createAccount(account: NewAccount): Promise<Account>;
  updateAccount(id: string, patch: AccountPatch): Promise<Account>;
  /** O que o worker lembra de um número (o original usa o mesmo lugar do `automation_state`). */
  getAccountState(accountId: string): Promise<AccountState>;
  saveAccountState(accountId: string, patch: Partial<AccountState>): Promise<AccountState>;

  // ── Envio: conversas e mensagens ──
  /**
   * Cria (ou devolve) a conversa do lead. Uma por lead e uma por telefone. `accountId` só vale na criação: a conversa
   * fica para sempre com o número que abordou o lead.
   */
  ensureConversation(leadId: string, phoneE164: string, accountId?: string | null): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  findConversationByLead(leadId: string): Promise<Conversation | null>;
  findConversationByPhone(phoneE164: string): Promise<Conversation | null>;
  listConversations(q: {
    statuses?: ConversationStatus[];
    /** Só as conversas deste número (o original inclui as sem número). */
    accountId?: string;
    limit: number;
    offset?: number;
  }): Promise<{ rows: Conversation[]; total: number }>;
  updateConversation(id: string, patch: ConversationPatch): Promise<Conversation>;

  createMessages(messages: NewMessage[]): Promise<Message[]>;
  getMessage(id: string): Promise<Message | null>;
  listMessages(q: MessageQuery): Promise<Message[]>;
  updateMessage(id: string, patch: MessagePatch): Promise<Message>;
  /** Atualiza várias de uma vez, só as que estão num dos status dados (evita pisar em quem mudou). */
  bulkUpdateMessages(ids: string[], onlyIfStatus: MessageStatus[], patch: MessagePatch): Promise<number>;
  /**
   * Pega, de forma atômica, a próxima mensagem aprovada e vencida e a marca como "sending". Com `accountId`, só as desse
   * número (o original inclui as que não têm número).
   */
  claimNextDueMessage(nowIso: string, accountId?: string): Promise<Message | null>;
  messageCounts(): Promise<MessageCounts>;
  /**
   * Uma assinatura curta do que as telas mostram: muda quando muda uma mensagem, um recibo, uma conversa, um lead, um evento
   * ou uma configuração. A tela aberta compara e só recarrega quando muda. Não inclui o estado interno do worker.
   */
  pulse(): Promise<string>;
  addOptout(phoneE164: string, reason: string): Promise<void>;
  /** Tira os números da lista de bloqueio (o dono liberou). Só quem pediu para parar e voltou a escrever deve ser liberado. */
  removeOptout(phones: string[]): Promise<void>;

  // ── Prévia do site, proposta e produção ──
  createDemo(demo: NewDemo): Promise<Demo>;
  getDemo(id: string): Promise<Demo | null>;
  listDemos(q: { leadId?: string; status?: DemoStatus; limit: number }): Promise<Demo[]>;
  updateDemo(id: string, patch: DemoPatch): Promise<Demo>;
  /**
   * Página pública da prévia: devolve só o conteúdo de uma prévia PUBLICADA, pelo slug exato.
   * `count` soma a visita (robôs de pré-visualização e o próprio dono não contam).
   */
  viewDemo(slug: string, count: boolean): Promise<PublicDemo | null>;

  createProposal(proposal: NewProposal): Promise<Proposal>;
  getProposal(id: string): Promise<Proposal | null>;
  listProposals(q: { leadId?: string; statuses?: ProposalStatus[]; limit: number }): Promise<Proposal[]>;
  updateProposal(id: string, patch: ProposalPatch): Promise<Proposal>;

  createProject(project: NewProject): Promise<Project>;
  getProject(id: string): Promise<Project | null>;
  listProjects(q: { leadId?: string; proposalId?: string; statuses?: ProjectStatus[]; limit: number }): Promise<Project[]>;
  updateProject(id: string, patch: ProjectPatch): Promise<Project>;
}
