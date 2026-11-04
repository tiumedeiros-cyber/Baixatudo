import { changeProposalStatus, createProposalFor, generateDemo, setProjectStatus, toggleChecklistItem } from "@/lib/deals/service";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { Stage } from "@/lib/leads/types";
import { approveMessages, handleMessageEvent, prepareBatch, templateContext, toTemplateLead } from "@/lib/outreach/engine";
import { buildOpening } from "@/lib/outreach/templates";
import { makeDemoPlaces } from "@/lib/sources/demo";
import { createMemoryRepo, type MemoryRepo } from "./memory";

/**
 * Monta o modo demonstração: 2 buscas fictícias e um funil com gente em cada etapa,
 * para o painel nunca abrir vazio durante o desenvolvimento.
 */
export async function createSeededDemoRepo(): Promise<MemoryRepo> {
  const repo = createMemoryRepo();

  const runs = [
    { niche: "Estética", city: "Fortaleza", limit: 80 },
    { niche: "Barbearia", city: "Fortaleza", limit: 40 },
  ];

  for (const run of runs) {
    const search = await repo.createSearch({
      niche: run.niche,
      city: run.city,
      state: "CE",
      requested: run.limit,
      source: "demo",
      status: "ingesting",
    });
    const result = await ingestPlaces(repo, makeDemoPlaces(run), {
      niche: run.niche,
      city: run.city,
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
      {
        leadId: null,
        type: "busca_concluida",
        payload: { niche: run.niche, city: run.city, inserted: result.inserted, searchId: search.id },
      },
    ]);
  }

  // Distribui os melhores leads elegíveis pelas etapas do funil.
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 40, offset: 0 });
  const plan: [Stage, number][] = [
    ["qualificado", 9],
    ["contatado", 6],
    ["respondeu", 4],
    ["proposta", 2],
    ["ganho", 1],
    ["perdido", 3],
  ];
  let cursor = 0;
  for (const [stage, count] of plan) {
    for (let i = 0; i < count && cursor < rows.length; i++, cursor++) {
      const lead = rows[cursor];
      await repo.setStage(lead.id, stage);
      await repo.addEvents([
        { leadId: lead.id, type: "etapa", payload: { name: lead.name, from: "novo", to: stage } },
      ]);
    }
  }

  await seedOutreach(repo);
  await seedDeals(repo);
  await seedNumbers(repo);
  return repo;
}

/**
 * Vários números só quando pedido (DEMO_NUMBERS=3, por exemplo): serve para ver a tela Números e a escolha de número da Fila no
 * modo demonstração. Sem a variável a demonstração tem um número só, como o painel de sempre.
 */
async function seedNumbers(repo: MemoryRepo): Promise<void> {
  const wanted = Math.min(6, Math.max(1, Number(process.env.DEMO_NUMBERS) || 1));
  if (wanted < 2) return;
  const accounts = [await repo.createAccount({ name: "Número 1", legacy: true, phoneE164: "+5585999990001" })];
  for (let i = 2; i <= wanted; i++) {
    accounts.push(await repo.createAccount({
      name: `Número ${i}`,
      // o último número da demonstração (a partir do 3º) mostra o caso "aparelho apagado no GOWA"
      gowaDeviceId: i === wanted && i >= 3 ? "demo-sem-aparelho" : `demo-${i}`,
      phoneE164: `+558599999000${i}`,
      paused: i > 2,
      pausedReason: i > 2 ? "Número novo: confira a conexão e tire a pausa quando quiser começar." : null,
      caps: { week1: 8, week2: 15, steady: 25 },
    }));
  }
  // distribui as conversas da demonstração entre os números, para ver a aba Conversas com vários números
  const { rows } = await repo.listConversations({ limit: 500 });
  for (const [i, conv] of rows.entries()) {
    const target = accounts[i % accounts.length];
    if (target.legacy) continue;
    await repo.updateConversation(conv.id, { accountId: target.id });
  }
}

/**
 * Prévias, propostas e projetos de exemplo: uma prévia já vista, uma proposta enviada, uma com
 * sinal pago (que abre um projeto em andamento). Tudo fictício e em memória.
 */
async function seedDeals(repo: MemoryRepo): Promise<void> {
  const now = new Date();
  const settings = await repo.getSettings();
  const inStage = async (stage: Stage, n: number) =>
    (await repo.listLeads({ stages: [stage], sort: "score", limit: n, offset: 0 })).rows;

  const answered = await inStage("respondeu", 3);
  const first = answered[0] ? await generateDemo(repo, answered[0].id, { settings }) : null;
  if (answered[1]) await generateDemo(repo, answered[1].id, { settings, palette: "sage" });
  if (first) {
    for (let i = 0; i < 3; i++) await repo.viewDemo(first.slug, true);
    await repo.updateDemo(first.id, { sentAt: new Date(now.getTime() - 3 * 3_600_000).toISOString() });
  }

  const [offered] = await inStage("proposta", 1);
  if (offered) {
    const demo = await generateDemo(repo, offered.id, { settings, palette: "noir" });
    const p = await createProposalFor(repo, {
      leadId: offered.id,
      title: "Site de 1 página",
      amountCents: 80_000,
      entryPct: 50,
      deliveryDays: 7,
      demoId: demo.id,
    });
    await changeProposalStatus(repo, p.id, "sent", new Date(now.getTime() - 26 * 3_600_000));
  }

  const [won] = await inStage("ganho", 1);
  if (won) {
    const p = await createProposalFor(repo, {
      leadId: won.id,
      title: "Site de 1 página",
      amountCents: 80_000,
      entryPct: 50,
      deliveryDays: 7,
    });
    await changeProposalStatus(repo, p.id, "sent", new Date(now.getTime() - 3 * 24 * 3_600_000));
    const { project } = await changeProposalStatus(repo, p.id, "entry_paid", new Date(now.getTime() - 2 * 24 * 3_600_000));
    if (project) {
      await toggleChecklistItem(repo, project.id, project.checklist[0].id, true);
      await setProjectStatus(repo, project.id, "producao", now);
    }
  }
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Conversas e filas de exemplo, para as telas de Fila e Conversas nascerem vivas:
 * quem está em Contatado, Respondeu e Proposta ganha a abertura "enviada" há 2 dias; quem está
 * em Respondeu/Proposta/Perdido ganha uma resposta (interessado, preço, dúvida, áudio, sem
 * interesse); e um lote novo fica de rascunho para aprovar. Tudo fictício e em memória.
 */
async function seedOutreach(repo: MemoryRepo): Promise<void> {
  const now = new Date();
  const settings = await repo.getSettings();
  const ctx = templateContext(settings);

  const staged = async (stage: Stage) =>
    (await repo.listLeads({ stages: [stage], sort: "score", limit: 20, offset: 0 })).rows;
  const [contacted, answered, proposal, lost] = await Promise.all([
    staged("contatado"),
    staged("respondeu"),
    staged("proposta"),
    staged("perdido"),
  ]);

  const sentTwoDaysAgo = new Date(now.getTime() - 2 * DAY).toISOString();
  async function opened(lead: (typeof contacted)[number], status: "read" | "delivered") {
    if (!lead.phoneE164) return;
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164);
    const { body, variant } = buildOpening(toTemplateLead(lead), ctx);
    await repo.createMessages([
      {
        conversationId: conv.id,
        leadId: lead.id,
        direction: "out",
        kind: "opening",
        step: 0,
        body,
        variant,
        status,
        createdBy: "system",
        sentAt: sentTwoDaysAgo,
        approvedAt: sentTwoDaysAgo,
        scheduledFor: sentTwoDaysAgo,
        providerMessageId: `DEMO-${lead.id.slice(0, 8)}`,
      },
    ]);
    await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: sentTwoDaysAgo });
  }

  for (const lead of contacted.slice(0, 5)) await opened(lead, "delivered");

  const replies: [string | null, "audio" | null][] = [
    ["Pode sim, manda a prévia", null],
    ["Quanto custa?", null],
    ["Como funciona? Vocês fazem loja virtual também?", null],
    [null, "audio"],
  ];
  for (const [i, lead] of answered.slice(0, replies.length).entries()) {
    await opened(lead, "read");
    const [text, media] = replies[i];
    await handleMessageEvent(
      repo,
      {
        kind: "message",
        providerMessageId: `DEMO-IN-${i}`,
        phoneE164: lead.phoneE164 ?? "",
        fromMe: false,
        text,
        media,
        timestamp: new Date(now.getTime() - (i + 1) * 3 * 60 * 60 * 1000).toISOString(),
      },
      now,
    );
  }
  for (const lead of proposal.slice(0, 1)) {
    await opened(lead, "read");
    await handleMessageEvent(
      repo,
      {
        kind: "message",
        providerMessageId: "DEMO-IN-P",
        phoneE164: lead.phoneE164 ?? "",
        fromMe: false,
        text: "Gostei da prévia! Pode me passar o orçamento?",
        media: null,
        timestamp: new Date(now.getTime() - DAY).toISOString(),
      },
      now,
    );
  }
  for (const lead of lost.slice(0, 1)) {
    await opened(lead, "read");
    await handleMessageEvent(
      repo,
      {
        kind: "message",
        providerMessageId: "DEMO-IN-L",
        phoneE164: lead.phoneE164 ?? "",
        fromMe: false,
        text: "Não tenho interesse, obrigado",
        media: null,
        timestamp: new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString(),
      },
      now,
    );
  }

  // lote novo: 6 rascunhos, 2 já aprovados e agendados
  await prepareBatch(repo, now, { limit: 6 });
  const drafts = await repo.listMessages({ statuses: ["draft"], kinds: ["opening"], order: "asc", limit: 10 });
  await approveMessages(repo, drafts.slice(0, 2).map((m) => m.id), now, Math.random);
}
