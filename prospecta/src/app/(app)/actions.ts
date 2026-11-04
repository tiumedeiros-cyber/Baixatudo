"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { parsePhoneBR } from "@/lib/brazil/phone";
import { apifyToken } from "@/lib/env";
import { ingestPlaces } from "@/lib/leads/ingest";
import { parseLeadsJson } from "@/lib/leads/import-json";
import { ufName } from "@/lib/leads/niches";
import { rescore } from "@/lib/leads/rescore";
import { probeSite, PROBE_SIGNAL_LABEL } from "@/lib/leads/site-probe";
import { STAGE_LABEL, STAGES, type WebsiteKind } from "@/lib/leads/types";
import { getRepo } from "@/lib/repo";
import { ApifyError, buildActorInput, estimateCostUsd, startRun } from "@/lib/sources/apify";
import { makeDemoPlaces } from "@/lib/sources/demo";
import { formatUSD } from "@/lib/utils";

export type ActionResult = { ok: true; message: string; searchId?: string } | { ok: false; message: string };

const ok = (message: string, extra: { searchId?: string } = {}): ActionResult => ({ ok: true, message, ...extra });
const fail = (message: string): ActionResult => ({ ok: false, message });

function refreshAll() {
  for (const path of ["/", "/cacador", "/funil"]) revalidatePath(path);
}

function friendly(error: unknown): string {
  if (error instanceof ApifyError) return error.message;
  console.error(error);
  return "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

// ───────────────────────── Caçador ─────────────────────────

const SearchInput = z.object({
  niche: z.string().trim().min(2, "Informe o nicho.").max(80, "Nicho muito longo."),
  city: z.string().trim().min(2, "Informe a cidade.").max(80, "Cidade muito longa."),
  state: z.string().trim().max(2).optional(),
  limit: z.coerce.number().int().min(5, "Mínimo de 5 lugares.").max(300, "Máximo de 300 por busca."),
});

export async function startSearch(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireViewer();

  const parsed = SearchInput.safeParse({
    niche: formData.get("niche"),
    city: formData.get("city"),
    state: formData.get("state") || undefined,
    limit: formData.get("limit"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

  const { niche, city, limit } = parsed.data;
  const state = parsed.data.state?.toUpperCase() || null;
  const repo = await getRepo();
  const settings = await repo.getSettings();
  const token = apifyToken();

  if (token) {
    const cost = estimateCostUsd(limit);
    if (cost > settings.apifyMaxChargeUsd) {
      return fail(
        `Essa busca custaria cerca de ${formatUSD(cost)}, acima do seu teto de ${formatUSD(settings.apifyMaxChargeUsd)} por busca. ` +
          "Reduza a quantidade ou ajuste o teto em Configurações.",
      );
    }
    try {
      const run = await startRun(
        token,
        buildActorInput({ niche, city, state, limit, stateName: ufName(state) }),
        { maxChargeUsd: settings.apifyMaxChargeUsd },
      );
      const search = await repo.createSearch({
        niche,
        city,
        state,
        requested: limit,
        source: "apify",
        status: "running",
        apifyRunId: run.id,
        datasetId: run.defaultDatasetId,
        estimatedCostUsd: cost,
      });
      await repo.addEvents([
        { leadId: null, type: "busca_iniciada", payload: { niche, city, searchId: search.id } },
      ]);
      refreshAll();
      return ok("Busca iniciada. Os leads aparecem aqui quando o Apify terminar (de 1 a 3 minutos).", {
        searchId: search.id,
      });
    } catch (error) {
      return fail(friendly(error));
    }
  }

  if (repo.mode === "demo") {
    const search = await repo.createSearch({
      niche,
      city,
      state,
      requested: limit,
      source: "demo",
      status: "ingesting",
    });
    const result = await ingestPlaces(repo, makeDemoPlaces({ niche, city, limit }), {
      niche,
      city,
      searchId: search.id,
      source: "demo",
    });
    await repo.updateSearch(search.id, {
      status: "done",
      found: result.received,
      inserted: result.inserted,
      duplicates: result.duplicates,
      invalid: result.invalid,
      eligible: result.eligible,
      estimatedCostUsd: 0,
      finishedAt: new Date().toISOString(),
    });
    await repo.addEvents([
      { leadId: null, type: "busca_concluida", payload: { niche, city, inserted: result.inserted, searchId: search.id } },
    ]);
    refreshAll();
    return ok(`Demonstração: ${result.inserted} leads fictícios criados (${result.duplicates} repetidos).`, {
      searchId: search.id,
    });
  }

  return fail("Falta o token do Apify. Defina APIFY_TOKEN no ambiente ou importe um JSON.");
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function importJson(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireViewer();

  const file = formData.get("file");
  let text = String(formData.get("text") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return fail("Arquivo grande demais (limite de 10 MB).");
    text = await file.text();
  }

  const parsed = parseLeadsJson(text);
  if (parsed.error) return fail(parsed.error);

  const niche = String(formData.get("niche") ?? "").trim().slice(0, 80) || null;
  const city = String(formData.get("city") ?? "").trim().slice(0, 80) || null;

  const repo = await getRepo();
  const search = await repo.createSearch({
    niche: niche ?? "Importação",
    city: city ?? "—",
    state: null,
    requested: parsed.items.length,
    source: "json",
    status: "ingesting",
  });

  try {
    const result = await ingestPlaces(repo, parsed.items, { niche, city, searchId: search.id, source: "json" });
    await repo.updateSearch(search.id, {
      status: "done",
      found: result.received,
      inserted: result.inserted,
      duplicates: result.duplicates,
      invalid: result.invalid,
      eligible: result.eligible,
      finishedAt: new Date().toISOString(),
    });
    await repo.addEvents([
      { leadId: null, type: "importacao", payload: { inserted: result.inserted, duplicates: result.duplicates, searchId: search.id } },
    ]);
    refreshAll();
    return ok(
      `${result.inserted} leads novos · ${result.duplicates} repetidos · ${result.invalid} sem nome`,
      { searchId: search.id },
    );
  } catch (error) {
    await repo.updateSearch(search.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    });
    return fail(friendly(error));
  }
}

// ───────────────────────── Funil e leads ─────────────────────────

const StageInput = z.enum(STAGES);

export async function moveLead(id: string, stage: string): Promise<ActionResult> {
  await requireViewer();
  const idOk = z.uuid().safeParse(id);
  const stageOk = StageInput.safeParse(stage);
  if (!idOk.success || !stageOk.success) return fail("Pedido inválido.");

  try {
    const repo = await getRepo();
    const before = await repo.getLead(id);
    if (!before) return fail("Lead não encontrado.");
    const lead = await repo.setStage(id, stageOk.data);
    if (before.stage !== lead.stage) {
      await repo.addEvents([
        { leadId: id, type: "etapa", payload: { name: lead.name, from: before.stage, to: lead.stage } },
      ]);
    }
    refreshAll();
    revalidatePath(`/leads/${id}`);
    return ok(`${lead.name} → ${STAGE_LABEL[lead.stage]}`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function bulkStage(ids: string[], stage: string): Promise<ActionResult> {
  await requireViewer();
  const idsOk = z.array(z.uuid()).min(1).max(500).safeParse(ids);
  const stageOk = StageInput.safeParse(stage);
  if (!idsOk.success || !stageOk.success) return fail("Pedido inválido.");

  try {
    const repo = await getRepo();
    const leads = await repo.getLeads(idsOk.data);
    const changed = leads.filter((l) => l.stage !== stageOk.data);
    await repo.bulkSetStage(
      changed.map((l) => l.id),
      stageOk.data,
    );
    await repo.addEvents(
      changed.map((l) => ({
        leadId: l.id,
        type: "etapa" as const,
        payload: { name: l.name, from: l.stage, to: stageOk.data },
      })),
    );
    refreshAll();
    return ok(`${changed.length} ${changed.length === 1 ? "lead movido" : "leads movidos"} para ${STAGE_LABEL[stageOk.data]}.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function saveNotes(id: string, notes: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(id).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    await repo.updateLead(id, { notes: notes.slice(0, 4000) });
    revalidatePath(`/leads/${id}`);
    return ok("Anotação salva.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function probeLeadSite(id: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(id).success) return fail("Pedido inválido.");

  try {
    const repo = await getRepo();
    const lead = await repo.getLead(id);
    if (!lead) return fail("Lead não encontrado.");
    if (!lead.websiteRaw || lead.websiteKind === "none") return fail("Esse lead não tem site para analisar.");
    if (lead.websiteKind === "social") return fail("É só rede social: não há site para analisar.");

    const probe = await probeSite(lead.websiteRaw);
    if (probe.error === "host_privado" || probe.error === "url_invalida") {
      return fail("Não consegui acessar esse endereço (inválido ou interno).");
    }

    const kind: WebsiteKind = probe.weak ? "weak" : "real";
    const settings = await repo.getSettings();
    const rescored = rescore(lead, settings, { websiteKind: kind });
    await repo.updateLead(id, {
      websiteKind: kind,
      websiteSignals: probe.signals,
      siteCheckedAt: new Date().toISOString(),
      ...rescored,
    });
    await repo.addEvents([
      { leadId: id, type: "site_analisado", payload: { name: lead.name, weak: probe.weak, signals: probe.signals } },
    ]);
    refreshAll();
    revalidatePath(`/leads/${id}`);
    return ok(
      probe.weak
        ? `Site fraco: ${probe.signals.map((s) => PROBE_SIGNAL_LABEL[s]).join(", ")}.`
        : "O site parece em ordem.",
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── Configurações ─────────────────────────

const SettingsInput = z.object({
  agentFlow: z.enum(["previa", "qualificar"]).default("qualificar"),
  openingMode: z.enum(["curta", "completa"]).default("curta"),
  offer: z.string().trim().max(1500),
  audience: z.string().trim().max(1500),
  proof: z.string().trim().max(1500),
  ticketAverage: z.coerce.number().min(0, "Ticket inválido.").max(1_000_000),
  deliveryDays: z.coerce.number().int("O prazo é em dias inteiros.").min(1, "Prazo mínimo de 1 dia.").max(90, "Prazo máximo de 90 dias."),
  entryPct: z.coerce.number().int("O sinal é um número inteiro.").min(0, "Sinal mínimo de 0%.").max(100, "Sinal máximo de 100%."),
  apifyMaxChargeUsd: z.coerce.number().min(0.1, "Teto mínimo de US$ 0,10.").max(50, "Teto máximo de US$ 50."),
  highTicketTerms: z.string().max(2000),
  contactPhone: z.string().trim().max(30).default(""),
  pixKey: z.string().trim().max(140, "Chave Pix longa demais.").default(""),
  pixHolder: z.string().trim().max(60, "Nome do titular longo demais.").default(""),
  // as respostas do dono: saem do jeito que ele escreveu (o agente só complementa com a prévia)
  policyGuarantee: z.string().trim().max(300, "A resposta sobre garantia passou de 300 caracteres.").default(""),
  policyHosting: z.string().trim().max(300, "A resposta sobre hospedagem passou de 300 caracteres.").default(""),
  policyPayment: z.string().trim().max(300, "A resposta sobre pagamento passou de 300 caracteres.").default(""),
  policyPortfolio: z.string().trim().max(300, "A resposta sobre exemplos passou de 300 caracteres.").default(""),
  policyPrice: z.string().trim().max(300, "A resposta sobre desconto passou de 300 caracteres.").default(""),
});

export async function saveSettingsAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireViewer();
  const parsed = SettingsInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");

  const contactPhone = parsed.data.contactPhone;
  if (contactPhone && !parsePhoneBR(contactPhone).isMobile) {
    return fail("O WhatsApp de contato precisa ser um celular com DDD, por exemplo (85) 99999-9999.");
  }
  if ([...parsed.data.pixKey].some((ch) => ch.charCodeAt(0) < 32)) return fail("A chave Pix tem caracteres inválidos.");

  const terms = parsed.data.highTicketTerms
    .split(/[\n,;]+/)
    .map((t) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim())
    .filter(Boolean);

  try {
    const repo = await getRepo();
    await repo.saveSettings({
      agentFlow: parsed.data.agentFlow,
      openingMode: parsed.data.openingMode,
      offer: parsed.data.offer,
      audience: parsed.data.audience,
      proof: parsed.data.proof,
      ticketAverage: parsed.data.ticketAverage,
      deliveryDays: parsed.data.deliveryDays,
      entryPct: parsed.data.entryPct,
      apifyMaxChargeUsd: parsed.data.apifyMaxChargeUsd,
      highTicketTerms: [...new Set(terms)],
      contactPhone,
      pixKey: parsed.data.pixKey,
      pixHolder: parsed.data.pixHolder,
      policyGuarantee: parsed.data.policyGuarantee,
      policyHosting: parsed.data.policyHosting,
      policyPayment: parsed.data.policyPayment,
      policyPortfolio: parsed.data.policyPortfolio,
      policyPrice: parsed.data.policyPrice,
    });
    revalidatePath("/configuracoes");
    return ok("Configurações salvas. Valem para os próximos leads que entrarem.");
  } catch (error) {
    return fail(friendly(error));
  }
}
