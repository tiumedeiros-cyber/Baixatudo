/**
 * Fase 4 e 5: prévia do site, proposta (com Pix manual) e produção. Nada aqui fala com o WhatsApp
 * nem com banco de pagamento: o dono marca o que recebeu.
 */

// ───────────────────────── prévia do site ─────────────────────────

export const DEMO_TEMPLATES = ["estetica", "barbearia", "clinica", "generico"] as const;
export type DemoTemplate = (typeof DEMO_TEMPLATES)[number];
export const DEMO_TEMPLATE_LABEL: Record<DemoTemplate, string> = {
  estetica: "Estética e beleza",
  barbearia: "Barbearia",
  clinica: "Clínica e saúde",
  generico: "Negócio local",
};

export const DEMO_PALETTES = ["rose", "sage", "noir", "ocean"] as const;
export type DemoPalette = (typeof DEMO_PALETTES)[number];
export const DEMO_PALETTE_LABEL: Record<DemoPalette, string> = {
  rose: "Rosé",
  sage: "Verde sálvia",
  noir: "Noir e dourado",
  ocean: "Azul oceano",
};

export type DemoStatus = "published" | "archived";

export interface DemoService {
  name: string;
  description: string;
}

/** Foto do negócio no momento em que a prévia foi gerada. Só dados públicos do Google Maps. */
export interface DemoContent {
  businessName: string;
  category: string;
  tagline: string;
  about: string;
  services: DemoService[];
  highlights: string[];
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  phoneDisplay: string | null;
  /** Só dígitos, com 55, para o botão de WhatsApp do próprio negócio. Nulo se não for celular. */
  whatsappDigits: string | null;
  instagramUrl: string | null;
  rating: number | null;
  reviewsCount: number;
  madeBy: { brand: string; sender: string };
  /** WhatsApp do dono, para o botão "Gostei, quero este site". Opcional. */
  ownerWhatsappDigits: string | null;
}

export interface Demo {
  id: string;
  leadId: string;
  slug: string;
  template: DemoTemplate;
  palette: DemoPalette;
  content: DemoContent;
  status: DemoStatus;
  views: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewDemo = Pick<Demo, "leadId" | "slug" | "template" | "palette" | "content">;
export type DemoPatch = Partial<Pick<Demo, "template" | "palette" | "content" | "status" | "sentAt">>;

/** O que a página pública recebe: nunca o id, o lead ou qualquer outro dado interno. */
export interface PublicDemo {
  template: DemoTemplate;
  palette: DemoPalette;
  content: DemoContent;
}

/** Tokens longos e aleatórios: o link é a única proteção da prévia, então não pode ser adivinhável. */
export const SLUG_PATTERN = /^[a-z0-9]{16,40}$/;

export function isDemoSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_PATTERN.test(value);
}

// ───────────────────────── proposta e financeiro ─────────────────────────

export const PROPOSAL_STATUSES = ["draft", "sent", "accepted", "entry_paid", "paid", "cancelled"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_LABEL: Record<ProposalStatus, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  accepted: "Aceita",
  entry_paid: "Sinal pago",
  paid: "Paga",
  cancelled: "Cancelada",
};

export interface Proposal {
  id: string;
  leadId: string;
  demoId: string | null;
  title: string;
  /** Em centavos, para nunca somar ponto flutuante. */
  amountCents: number;
  /** Percentual do sinal (0 a 100). */
  entryPct: number;
  deliveryDays: number;
  status: ProposalStatus;
  notes: string;
  sentAt: string | null;
  acceptedAt: string | null;
  entryPaidAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewProposal = Pick<Proposal, "leadId" | "title" | "amountCents" | "entryPct" | "deliveryDays"> &
  Partial<Pick<Proposal, "demoId" | "notes">>;
export type ProposalPatch = Partial<
  Pick<
    Proposal,
    | "title"
    | "amountCents"
    | "entryPct"
    | "deliveryDays"
    | "demoId"
    | "notes"
    | "status"
    | "sentAt"
    | "acceptedAt"
    | "entryPaidAt"
    | "paidAt"
  >
>;

// ───────────────────────── produção ─────────────────────────

export const PROJECT_STATUSES = ["briefing", "producao", "revisao", "entregue"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_LABEL: Record<ProjectStatus, string> = {
  briefing: "Briefing",
  producao: "Em produção",
  revisao: "Em revisão",
  entregue: "Entregue",
};

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Project {
  id: string;
  leadId: string;
  proposalId: string | null;
  status: ProjectStatus;
  /** Data (AAAA-MM-DD) de entrega prometida. */
  dueDate: string | null;
  checklist: ChecklistItem[];
  briefing: string;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewProject = Pick<Project, "leadId"> &
  Partial<Pick<Project, "proposalId" | "dueDate" | "checklist" | "briefing" | "status">>;
export type ProjectPatch = Partial<
  Pick<Project, "status" | "dueDate" | "checklist" | "briefing" | "deliveredAt">
>;
