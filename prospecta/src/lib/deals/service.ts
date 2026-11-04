import { buildBriefing } from "@/lib/agent/briefing";
import type { Lead, Settings, Stage } from "@/lib/leads/types";
import { localParts } from "@/lib/outreach/guardrails";
import type { Message } from "@/lib/outreach/types";
import type { Repo } from "@/lib/repo/types";
import { buildDemoContent, defaultPalette, pickTemplate } from "./demo-content";
import { demoLinkMessage, proposalMessage, type PixInfo } from "./messages";
import { receivedCents } from "./money";
import { allowedNext, canTransition, isPaymentStatus, stampsFor } from "./transitions";
import type {
  ChecklistItem,
  Demo,
  DemoPalette,
  DemoTemplate,
  Project,
  ProjectStatus,
  Proposal,
  ProposalStatus,
} from "./types";

/** Erro com mensagem própria para mostrar ao dono (nunca vaza detalhe interno). */
export class DealError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DealError";
  }
}

const TZ = "America/Fortaleza";
const EARLY_STAGES: Stage[] = ["novo", "qualificado", "contatado", "respondeu"];

// ───────────────────────── prévia ─────────────────────────

/** 20 caracteres de [a-z0-9], vindos do gerador criptográfico: ~100 bits, impossível de adivinhar. */
export function newSlug(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  while (out.length < 20) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      // 256 não é múltiplo de 36: bytes a partir de 252 seriam mais raros e criariam viés, então saem
      if (b < 252 && out.length < 20) out += alphabet[b % 36];
    }
  }
  return out;
}

export function demoUrl(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/p/${slug}`;
}

export async function generateDemo(
  repo: Repo,
  leadId: string,
  opts: { template?: DemoTemplate; palette?: DemoPalette; settings: Settings },
): Promise<Demo> {
  const lead = await repo.getLead(leadId);
  if (!lead) throw new DealError("Lead não encontrado.");

  const template = opts.template ?? pickTemplate(lead.niche, lead.category);
  const palette = opts.palette ?? defaultPalette(template);
  const content = buildDemoContent(
    lead,
    {
      brandName: opts.settings.brandName,
      senderName: opts.settings.senderName,
      ownerPhone: opts.settings.contactPhone || null,
    },
    template,
  );

  let demo: Demo | null = null;
  for (let attempt = 0; attempt < 4 && !demo; attempt++) {
    try {
      demo = await repo.createDemo({ leadId, slug: newSlug(), template, palette, content });
    } catch (error) {
      // colisão de slug é praticamente impossível; qualquer outra falha sobe
      if (!/duplicate|já existe|unique/i.test(error instanceof Error ? error.message : "")) throw error;
    }
  }
  if (!demo) throw new DealError("Não consegui gerar um endereço único para a prévia. Tente de novo.");

  await repo.addEvents([{ leadId, type: "demo_gerada", payload: { name: lead.name, template } }]);
  return demo;
}

// ───────────────────────── mensagens para o lead (sempre rascunho) ─────────────────────────

/** Cria um rascunho de resposta na conversa do lead. Nada sai: o dono aprova na Fila. */
export async function draftReplyToLead(repo: Repo, lead: Lead, body: string): Promise<Message> {
  if (!lead.phoneE164 || !lead.isMobile) throw new DealError("Este lead não tem celular para receber mensagens.");
  const optouts = await repo.findOptouts([lead.phoneE164]);
  if (optouts.has(lead.phoneE164)) throw new DealError("Este número pediu para não receber mensagens.");
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164);
  if (conv.status === "opted_out") throw new DealError("Este número pediu para não receber mensagens.");

  const [message] = await repo.createMessages([
    {
      conversationId: conv.id,
      leadId: lead.id,
      direction: "out",
      kind: "reply",
      step: 0,
      body,
      status: "draft",
      createdBy: "user",
    },
  ]);
  return message;
}

export async function draftDemoMessage(repo: Repo, demoId: string, baseUrl: string): Promise<Message> {
  const demo = await repo.getDemo(demoId);
  if (!demo) throw new DealError("Prévia não encontrada.");
  if (demo.status !== "published") throw new DealError("Esta prévia está arquivada. Publique de novo para enviar o link.");
  const lead = await repo.getLead(demo.leadId);
  if (!lead) throw new DealError("Lead não encontrado.");
  return draftReplyToLead(repo, lead, demoLinkMessage({ leadName: lead.name, url: demoUrl(baseUrl, demo.slug) }));
}

export async function draftProposalMessage(repo: Repo, proposalId: string, pix: PixInfo | null): Promise<Message> {
  const proposal = await repo.getProposal(proposalId);
  if (!proposal) throw new DealError("Proposta não encontrada.");
  if (proposal.status === "cancelled") throw new DealError("Esta proposta foi cancelada.");
  const lead = await repo.getLead(proposal.leadId);
  if (!lead) throw new DealError("Lead não encontrado.");
  return draftReplyToLead(repo, lead, proposalMessage(proposal, { leadName: lead.name, pix }));
}

// ───────────────────────── propostas ─────────────────────────

export interface ProposalInput {
  leadId: string;
  title: string;
  amountCents: number;
  entryPct: number;
  deliveryDays: number;
  demoId?: string | null;
  notes?: string;
}

export async function createProposalFor(repo: Repo, input: ProposalInput): Promise<Proposal> {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 120) throw new DealError("Dê um nome para a proposta (até 120 caracteres).");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 100 || input.amountCents > 100_000_000) {
    throw new DealError("O valor precisa ficar entre R$ 1 e R$ 1.000.000.");
  }
  if (!Number.isInteger(input.entryPct) || input.entryPct < 0 || input.entryPct > 100) {
    throw new DealError("O sinal precisa ficar entre 0% e 100%.");
  }
  if (!Number.isInteger(input.deliveryDays) || input.deliveryDays < 1 || input.deliveryDays > 90) {
    throw new DealError("O prazo precisa ficar entre 1 e 90 dias.");
  }
  const lead = await repo.getLead(input.leadId);
  if (!lead) throw new DealError("Lead não encontrado.");

  const proposal = await repo.createProposal({ ...input, title });
  await repo.addEvents([
    { leadId: lead.id, type: "proposta_criada", payload: { name: lead.name, amountCents: proposal.amountCents } },
  ]);
  return proposal;
}

export const DEFAULT_CHECKLIST = [
  "Receber briefing, logo, fotos e textos do cliente",
  "Definir cores e estrutura das páginas",
  "Montar o site",
  "Revisar com o cliente",
  "Publicar e configurar o domínio",
  "Entregar os acessos",
];

export function makeChecklist(texts: string[] = DEFAULT_CHECKLIST): ChecklistItem[] {
  return texts.map((text) => ({ id: crypto.randomUUID(), text, done: false }));
}

/** Data de entrega (AAAA-MM-DD, horário de Fortaleza) contando a partir de `now`. */
export function dueDateFrom(now: Date, days: number): string {
  return localParts(new Date(now.getTime() + days * 24 * 3_600_000), TZ).ymd;
}

/**
 * O briefing de partida do projeto, montado do atendimento (o que o lead quer, o que respondeu, a venda e a conversa).
 * Nunca impede a criação do projeto: se algo falhar, o briefing nasce vazio como sempre nasceu.
 */
async function autoBriefing(repo: Repo, proposal: Proposal, lead: Lead | null, dueDate: string, now: Date): Promise<string> {
  if (!lead) return "";
  try {
    const conv = await repo.findConversationByLead(lead.id);
    const recent = conv ? await repo.listMessages({ conversationId: conv.id, order: "desc", limit: 80 }) : [];
    return buildBriefing({ lead, proposal, messages: recent.reverse(), dueDate, now });
  } catch (error) {
    console.error("briefing automático:", error);
    return "";
  }
}

/** Cria o projeto da proposta se ainda não existir (idempotente). */
export async function ensureProject(repo: Repo, proposal: Proposal, now: Date): Promise<Project> {
  const [existing] = await repo.listProjects({ proposalId: proposal.id, limit: 1 });
  if (existing) return existing;
  const lead = await repo.getLead(proposal.leadId);
  const dueDate = dueDateFrom(now, proposal.deliveryDays);
  const project = await repo.createProject({
    leadId: proposal.leadId,
    proposalId: proposal.id,
    dueDate,
    checklist: makeChecklist(),
    briefing: await autoBriefing(repo, proposal, lead, dueDate, now),
  });
  await repo.addEvents([{ leadId: proposal.leadId, type: "projeto_criado", payload: { name: lead?.name ?? "Lead" } }]);
  return project;
}

/** Soma o que o lead já fechou (propostas com sinal ou pagas), em reais, para o campo "valor do negócio". */
async function wonValueFor(repo: Repo, leadId: string): Promise<number> {
  const all = await repo.listProposals({ leadId, statuses: ["entry_paid", "paid"], limit: 100 });
  return all.reduce((sum, p) => sum + p.amountCents, 0) / 100;
}

export async function changeProposalStatus(
  repo: Repo,
  id: string,
  to: ProposalStatus,
  now: Date = new Date(),
): Promise<{ proposal: Proposal; project: Project | null }> {
  const current = await repo.getProposal(id);
  if (!current) throw new DealError("Proposta não encontrada.");
  if (!canTransition(current.status, to)) {
    const options = allowedNext(current.status);
    throw new DealError(
      options.length > 0
        ? "Essa mudança de status não é permitida a partir do status atual."
        : "Esta proposta já está encerrada e não muda mais de status.",
    );
  }
  const lead = await repo.getLead(current.leadId);
  if (!lead) throw new DealError("Lead não encontrado.");

  const proposal = await repo.updateProposal(id, stampsFor(to, current, now.toISOString()));
  await repo.addEvents([
    { leadId: lead.id, type: "proposta_status", payload: { name: lead.name, from: current.status, to } },
  ]);

  async function moveLead(stage: Stage) {
    if (lead!.stage === stage) return;
    await repo.setStage(lead!.id, stage);
    await repo.addEvents([{ leadId: lead!.id, type: "etapa", payload: { name: lead!.name, from: lead!.stage, to: stage } }]);
  }

  let project: Project | null = null;
  if (to === "sent" && EARLY_STAGES.includes(lead.stage)) {
    await moveLead("proposta");
  }
  if (isPaymentStatus(to)) {
    await moveLead("ganho");
    await repo.updateLead(lead.id, { dealValue: await wonValueFor(repo, lead.id) });
    project = await ensureProject(repo, proposal, now);
  }
  return { proposal, project };
}

/** Quanto entrou no caixa e quanto falta, somando todas as propostas. */
export function summarize(proposals: Proposal[]) {
  let received = 0;
  let outstanding = 0;
  let open = 0;
  let paid = 0;
  for (const p of proposals) {
    received += receivedCents(p);
    if (p.status === "sent" || p.status === "accepted") {
      outstanding += p.amountCents;
      open++;
    } else if (p.status === "entry_paid") {
      outstanding += p.amountCents - receivedCents(p);
      open++;
    } else if (p.status === "paid") {
      paid++;
    }
  }
  return { received, outstanding, open, paid };
}

// ───────────────────────── produção ─────────────────────────

export async function setProjectStatus(
  repo: Repo,
  id: string,
  to: ProjectStatus,
  now: Date = new Date(),
): Promise<Project> {
  const project = await repo.getProject(id);
  if (!project) throw new DealError("Projeto não encontrado.");
  return repo.updateProject(id, {
    status: to,
    deliveredAt: to === "entregue" ? (project.deliveredAt ?? now.toISOString()) : null,
  });
}

export async function toggleChecklistItem(repo: Repo, id: string, itemId: string, done: boolean): Promise<Project> {
  const project = await repo.getProject(id);
  if (!project) throw new DealError("Projeto não encontrado.");
  if (!project.checklist.some((i) => i.id === itemId)) throw new DealError("Item não encontrado.");
  return repo.updateProject(id, {
    checklist: project.checklist.map((i) => (i.id === itemId ? { ...i, done } : i)),
  });
}

export async function addChecklistItem(repo: Repo, id: string, text: string): Promise<Project> {
  const clean = text.trim();
  if (clean.length < 1 || clean.length > 160) throw new DealError("Escreva o item (até 160 caracteres).");
  const project = await repo.getProject(id);
  if (!project) throw new DealError("Projeto não encontrado.");
  if (project.checklist.length >= 40) throw new DealError("A lista já tem itens demais (máximo de 40).");
  return repo.updateProject(id, {
    checklist: [...project.checklist, { id: crypto.randomUUID(), text: clean, done: false }],
  });
}

export async function saveBriefing(repo: Repo, id: string, briefing: string): Promise<Project> {
  if (briefing.length > 8000) throw new DealError("O briefing passou de 8.000 caracteres.");
  const project = await repo.getProject(id);
  if (!project) throw new DealError("Projeto não encontrado.");
  return repo.updateProject(id, { briefing });
}
