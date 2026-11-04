import { DEFAULT_AUTOMATION, mergeAutomation, type AutomationConfig } from "@/lib/outreach/config";
import type { OpeningMode } from "@/lib/outreach/style";
import { DEFAULT_HIGH_TICKET_TERMS } from "./niches";

export const STAGES = [
  "novo",
  "qualificado",
  "contatado",
  "respondeu",
  "proposta",
  "ganho",
  "perdido",
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  novo: "Novo",
  qualificado: "Qualificado",
  contatado: "Contatado",
  respondeu: "Respondeu",
  proposta: "Proposta",
  ganho: "Ganho",
  perdido: "Perdido",
};

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && (STAGES as readonly string[]).includes(value);
}

export type WebsiteKind = "none" | "social" | "weak" | "real";
export const WEBSITE_KINDS: readonly WebsiteKind[] = ["none", "social", "weak", "real"];
export const WEBSITE_LABEL: Record<WebsiteKind, string> = {
  none: "Sem site",
  social: "Só rede social",
  weak: "Site fraco",
  real: "Tem site",
};

export type WhatsappStatus = "unknown" | "yes" | "no";
export type LeadSource = "apify" | "json" | "manual" | "demo";
export type IneligibleReason = "sem_celular" | "fechado" | "optout";
export const INELIGIBLE_LABEL: Record<IneligibleReason, string> = {
  sem_celular: "Sem celular",
  fechado: "Fechado",
  optout: "Pediu para não receber",
};

export interface ScoreItem {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface LeadBase {
  dedupeKey: string;
  placeId: string | null;
  name: string;
  category: string | null;
  niche: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  neighborhood: string | null;
  phoneRaw: string | null;
  phoneE164: string | null;
  isMobile: boolean;
  whatsappStatus: WhatsappStatus;
  websiteRaw: string | null;
  websiteKind: WebsiteKind;
  websiteSignals: string[];
  siteCheckedAt: string | null;
  rating: number | null;
  reviewsCount: number;
  mapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  permanentlyClosed: boolean;
  score: number;
  scoreBreakdown: ScoreItem[];
  eligible: boolean;
  ineligibleReason: IneligibleReason | null;
  stage: Stage;
  notes: string;
  dealValue: number | null;
  source: LeadSource;
  searchId: string | null;
}

export type NewLead = LeadBase;

export interface Lead extends LeadBase {
  id: string;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export type EventType =
  | "lead_criado"
  | "etapa"
  | "nota"
  | "site_analisado"
  | "busca_iniciada"
  | "busca_concluida"
  | "busca_falhou"
  | "importacao"
  | "lote_preparado"
  | "lote_aprovado"
  | "mensagem_enviada"
  | "mensagem_simulada"
  | "mensagem_falhou"
  | "resposta_recebida"
  | "optout"
  | "automacao"
  | "demo_gerada"
  | "proposta_criada"
  | "proposta_status"
  | "projeto_criado";

export interface LeadEvent {
  id: string;
  leadId: string | null;
  type: EventType;
  payload: Record<string, unknown>;
  createdAt: string;
}
export type NewEvent = Omit<LeadEvent, "id" | "createdAt">;

export type SearchStatus = "running" | "ingesting" | "done" | "failed";
export type SearchSource = "apify" | "json" | "demo";

export interface Search {
  id: string;
  niche: string;
  city: string;
  state: string | null;
  requested: number;
  source: SearchSource;
  status: SearchStatus;
  apifyRunId: string | null;
  datasetId: string | null;
  found: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  eligible: number;
  estimatedCostUsd: number | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export type NewSearch = Pick<Search, "niche" | "city" | "state" | "requested" | "source" | "status"> &
  Partial<Pick<Search, "apifyRunId" | "datasetId" | "estimatedCostUsd">>;

/**
 * Como o agente conduz a conversa.
 * previa: oferece uma prévia automática do site e só fala de valor depois dela.
 * qualificar: nunca oferece prévia. Descobre o que o lead quer (site ou sistema), fecha o valor do site
 * e entrega o resto ao dono com um resumo (prévia pedida, sistema para orçar).
 */
export type AgentFlow = "previa" | "qualificar";

export interface Settings {
  /** O fluxo do agente (veja `AgentFlow`). */
  agentFlow: AgentFlow;
  /**
   * Como é a primeira abordagem no fluxo "qualificar". "curta": uma mensagem curtinha (cumprimento, primeiro nome e uma pergunta
   * fácil) para a pessoa responder, e o agente apresenta o assunto na resposta. "completa": as três mensagens com a dor e a solução.
   */
  openingMode: OpeningMode;
  offer: string;
  audience: string;
  proof: string;
  ticketAverage: number;
  /** Prazo de entrega (dias depois de começar) e sinal (%) que o agente pode citar nas conversas. */
  deliveryDays: number;
  entryPct: number;
  /** Respostas do dono que o agente pode dar sozinho (vazio = continua com o dono). */
  policyGuarantee: string;
  policyHosting: string;
  policyPayment: string;
  policyPortfolio: string;
  policyPrice: string;
  highTicketTerms: string[];
  apifyMaxChargeUsd: number;
  /** Como o dono se apresenta nas mensagens. */
  senderName: string;
  brandName: string;
  /** Na primeira abordagem ele se apresenta como pessoa e profissional ("Sou o Jonathan Kelvin, desenvolvedor"), sem a marca. */
  senderFullName: string;
  senderRole: string;
  /** WhatsApp do dono (qualquer formato brasileiro): vira o botão "Gostei, quero este site" na prévia. */
  contactPhone: string;
  /** Chave Pix do dono, que vai na mensagem da proposta. Nunca é inventada: vazio = a mensagem avisa. */
  pixKey: string;
  pixHolder: string;
  automation: AutomationConfig;
}

export const DEFAULT_SETTINGS: Settings = {
  agentFlow: "qualificar",
  openingMode: "curta",
  offer: "",
  audience: "",
  proof: "",
  ticketAverage: 800,
  deliveryDays: 7,
  entryPct: 50,
  policyGuarantee: "",
  policyHosting: "",
  policyPayment: "",
  policyPortfolio: "",
  policyPrice: "",
  highTicketTerms: DEFAULT_HIGH_TICKET_TERMS,
  apifyMaxChargeUsd: 1,
  senderName: "Jonathan",
  brandName: "Kelvin Studio",
  senderFullName: "Jonathan Kelvin",
  senderRole: "desenvolvedor e ajudo empresas a se posicionarem na internet",
  contactPhone: "",
  pixKey: "",
  pixHolder: "",
  automation: DEFAULT_AUTOMATION,
};

/** Junta o que está salvo com os padrões (inclusive a automação, que é aninhada). */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...(stored ?? {}),
    automation: mergeAutomation(stored?.automation),
  };
}

export interface Stats {
  total: number;
  eligible: number;
  eligibleNoSite: number;
  avgScore: number;
  stages: Record<Stage, number>;
  wonValue: number;
}

export function emptyStageCounts(): Record<Stage, number> {
  return {
    novo: 0,
    qualificado: 0,
    contatado: 0,
    respondeu: 0,
    proposta: 0,
    ganho: 0,
    perdido: 0,
  };
}
