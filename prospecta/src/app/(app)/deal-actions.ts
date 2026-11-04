"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/deals/base-url";
import { parseMoneyToCents } from "@/lib/deals/money";
import {
  addChecklistItem,
  changeProposalStatus,
  createProposalFor,
  DealError,
  draftDemoMessage,
  draftProposalMessage,
  generateDemo,
  saveBriefing,
  setProjectStatus,
  toggleChecklistItem,
} from "@/lib/deals/service";
import {
  DEMO_PALETTES,
  DEMO_TEMPLATES,
  PROJECT_STATUSES,
  PROPOSAL_LABEL,
  PROPOSAL_STATUSES,
} from "@/lib/deals/types";
import { appMode } from "@/lib/env";
import { getRepo } from "@/lib/repo";
import type { ActionResult } from "./actions";

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

/** Tudo que mexe em prévia, proposta e projeto aparece em várias telas; atualiza todas. */
function refresh() {
  revalidatePath("/", "layout");
}

function friendly(error: unknown): string {
  if (error instanceof DealError) return error.message;
  console.error(error);
  return "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

const Id = z.uuid();

// ───────────────────────── prévia do site ─────────────────────────

export async function generateDemoAction(leadId: string, template?: string, palette?: string): Promise<ActionResult> {
  await requireViewer();
  const lead = Id.safeParse(leadId);
  const t = template ? z.enum(DEMO_TEMPLATES).safeParse(template) : null;
  const p = palette ? z.enum(DEMO_PALETTES).safeParse(palette) : null;
  if (!lead.success || (t && !t.success) || (p && !p.success)) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const settings = await repo.getSettings();
    await generateDemo(repo, lead.data, { template: t?.data, palette: p?.data, settings });
    refresh();
    return ok("Prévia criada. Abra para conferir e copie o link quando quiser enviar.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function setDemoStatusAction(demoId: string, status: "published" | "archived"): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(demoId).success || !["published", "archived"].includes(status)) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    await repo.updateDemo(demoId, { status });
    refresh();
    return ok(status === "archived" ? "Prévia tirada do ar: o link deixa de abrir." : "Prévia publicada de novo.");
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Cria o RASCUNHO da mensagem com o link. Nada sai: o dono aprova na Fila. */
export async function draftDemoMessageAction(demoId: string): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(demoId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const base = await publicBaseUrl();
    if (base.local && appMode() === "supabase") {
      return fail(
        "O endereço do painel é local (" +
          base.url +
          "): o lead não conseguiria abrir o link. Publique o painel e defina SITE_URL no .env.local, ou use um túnel. Veja docs/PREVIAS.md.",
      );
    }
    await draftDemoMessage(repo, demoId, base.url);
    refresh();
    return ok(
      base.local
        ? "Rascunho criado na Fila (modo demonstração: o link usa localhost). Nada sai antes de você aprovar."
        : "Rascunho criado na Fila e na conversa. Leia e aprove para enviar. Nada sai antes disso.",
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── proposta ─────────────────────────

const ProposalForm = z.object({
  leadId: z.uuid(),
  demoId: z.uuid().optional(),
  title: z.string().trim().min(1, "Dê um nome para a proposta.").max(120, "Nome muito longo."),
  amount: z.string().min(1, "Informe o valor."),
  entryPct: z.coerce.number().int("O sinal precisa ser um número inteiro.").min(0, "Sinal mínimo de 0%.").max(100, "Sinal máximo de 100%."),
  deliveryDays: z.coerce.number().int().min(1, "Prazo mínimo de 1 dia.").max(90, "Prazo máximo de 90 dias."),
});

export async function createProposalAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireViewer();
  const parsed = ProposalForm.safeParse({
    leadId: formData.get("leadId"),
    demoId: formData.get("demoId") || undefined,
    title: formData.get("title"),
    amount: formData.get("amount"),
    entryPct: formData.get("entryPct"),
    deliveryDays: formData.get("deliveryDays"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const cents = parseMoneyToCents(parsed.data.amount);
  if (cents === null) return fail("Não entendi o valor. Use algo como 800 ou 1.200,00.");
  try {
    const repo = await getRepo();
    await createProposalFor(repo, {
      leadId: parsed.data.leadId,
      demoId: parsed.data.demoId ?? null,
      title: parsed.data.title,
      amountCents: cents,
      entryPct: parsed.data.entryPct,
      deliveryDays: parsed.data.deliveryDays,
    });
    refresh();
    return ok("Proposta criada como rascunho. Gere a mensagem para enviar o valor e o Pix.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function setProposalStatusAction(proposalId: string, to: string): Promise<ActionResult> {
  await requireViewer();
  const status = z.enum(PROPOSAL_STATUSES).safeParse(to);
  if (!Id.safeParse(proposalId).success || !status.success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const { project } = await changeProposalStatus(repo, proposalId, status.data, new Date());
    refresh();
    return ok(
      project
        ? `Proposta marcada como "${PROPOSAL_LABEL[status.data]}". O lead virou Ganho e o projeto foi aberto em Produção.`
        : `Proposta marcada como "${PROPOSAL_LABEL[status.data]}".`,
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Rascunho com o valor e o Pix. Sem chave Pix cadastrada a mensagem avisa em vez de inventar. */
export async function draftProposalMessageAction(proposalId: string): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(proposalId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const settings = await repo.getSettings();
    const key = settings.pixKey.trim();
    await draftProposalMessage(repo, proposalId, key ? { key, holder: settings.pixHolder.trim() } : null);
    refresh();
    return ok(
      key
        ? "Rascunho criado na Fila e na conversa. Leia e aprove para enviar. Nada sai antes disso."
        : "Rascunho criado, mas sem chave Pix: cadastre a sua em Configurações para ela entrar na mensagem.",
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── produção ─────────────────────────

export async function setProjectStatusAction(projectId: string, to: string): Promise<ActionResult> {
  await requireViewer();
  const status = z.enum(PROJECT_STATUSES).safeParse(to);
  if (!Id.safeParse(projectId).success || !status.success) return fail("Pedido inválido.");
  try {
    await setProjectStatus(await getRepo(), projectId, status.data);
    refresh();
    return ok("Projeto atualizado.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function toggleChecklistAction(projectId: string, itemId: string, done: boolean): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(projectId).success || !Id.safeParse(itemId).success) return fail("Pedido inválido.");
  try {
    await toggleChecklistItem(await getRepo(), projectId, itemId, !!done);
    refresh();
    return ok("Item atualizado.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function addChecklistItemAction(projectId: string, text: string): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(projectId).success || typeof text !== "string") return fail("Pedido inválido.");
  try {
    await addChecklistItem(await getRepo(), projectId, text);
    refresh();
    return ok("Item adicionado.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function saveBriefingAction(projectId: string, briefing: string): Promise<ActionResult> {
  await requireViewer();
  if (!Id.safeParse(projectId).success || typeof briefing !== "string") return fail("Pedido inválido.");
  try {
    await saveBriefing(await getRepo(), projectId, briefing);
    refresh();
    return ok("Briefing salvo.");
  } catch (error) {
    return fail(friendly(error));
  }
}
