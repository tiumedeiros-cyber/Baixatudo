import { describe, expect, it } from "vitest";
import { changeProposalStatus, createProposalFor } from "@/lib/deals/service";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { handleMessageEvent } from "@/lib/outreach/engine";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { buildBriefing } from "./briefing";

const NOW = new Date("2026-10-24T13:00:00Z");
const rng = () => 0.5;
/** Um milissegundo de respiro entre as mensagens: no banco real elas nunca nascem no mesmo instante. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 3));
const SALE = { title: "Site de 1 página", amountCents: 80_000, entryPct: 50, deliveryDays: 7 };

async function world() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const lead = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score)[0];
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Posso te explicar?", status: "sent", createdBy: "system", sentAt: new Date().toISOString() },
  ]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: new Date().toISOString() });
  await repo.saveSettings({ agentFlow: "qualificar", pixKey: "85988887777", pixHolder: "Jonathan K." });
  await repo.saveAutomation({ autonomy: "semi", autoClose: true, paused: false, dryRun: false });
  // o relógio é o de verdade: as mensagens que o motor grava (resposta do agente) saem na ordem certa depois da do lead
  /** Faz o papel do worker: o que o agente aprovou já saiu, então a ordem da conversa é a de verdade. */
  const flush = async () => {
    for (const m of await repo.listMessages({ conversationId: conv.id, direction: "out", statuses: ["approved"], limit: 50 })) {
      await repo.updateMessage(m.id, { status: "sent", sentAt: new Date().toISOString() });
    }
  };
  const say = async (text: string | null, media: "audio" | null = null) => {
    await tick();
    const r = await handleMessageEvent(
      repo,
      { kind: "message", providerMessageId: `IN${Math.random().toString(36).slice(2, 9)}`, phoneE164: lead.phoneE164!, fromMe: false, text, media, timestamp: null },
      new Date(),
      { rng },
    );
    await tick();
    await flush();
    await tick();
    return r;
  };
  const thread = () => repo.listMessages({ conversationId: conv.id, order: "asc", limit: 200 });
  return { repo, lead, conv, say, thread };
}

describe("briefing automático", () => {
  it("monta cliente, o que ele quer, a venda, a conversa e o que falta pedir", async () => {
    const { lead, say, thread } = await world();
    await say("quero um site para a minha clínica");
    await say("quero receber mais contatos pelo WhatsApp");
    const text = buildBriefing({ lead, proposal: SALE, messages: await thread(), dueDate: "2026-10-31", now: NOW });

    expect(text).toMatch(/^BRIEFING AUTOMÁTICO/);
    expect(text).toContain(lead.name);
    expect(text).toMatch(/Quer um SITE/);
    expect(text).toMatch(/Objetivo do site, nas palavras dele: “quero receber mais contatos pelo WhatsApp”/);
    expect(text).toMatch(/Site de 1 página · R\$\s?800 · sinal de 50% \(R\$\s?400\) · entrega em até 7 dias \(até 31\/10\/2026\)/);
    expect(text).toMatch(/CONVERSA/);
    expect(text).toMatch(/Ele: quero um site para a minha clínica/);
    expect(text).toMatch(/Agente: /); // o que o agente respondeu sozinho
    expect(text).toMatch(/AINDA FALTA PEDIR AO CLIENTE[\s\S]*logo e cores/);
    expect(text.length).toBeLessThanOrEqual(7500);
    expect(text).not.toMatch(/undefined|null|NaN/);
  });

  it("sistema: diz que é sistema e guarda o que ele descreveu", async () => {
    const { lead, say, thread } = await world();
    await say("preciso de um sistema de agendamento online para a minha clínica de estética");
    const text = buildBriefing({
      lead,
      proposal: { title: "Sistema de agendamento", amountCents: 300_000, entryPct: 50, deliveryDays: 30 },
      messages: await thread(),
      dueDate: null,
      now: NOW,
    });
    expect(text).toMatch(/Quer um SISTEMA/);
    expect(text).toMatch(/sistema de agendamento online/);
    expect(text).toMatch(/Sistema de agendamento · R\$\s?3\.000 · sinal de 50%/);
    expect(text).not.toMatch(/\(até /); // sem data de entrega calculada
  });

  it("prévia pedida e enviada por você aparece, e áudio vira texto legível", async () => {
    const { repo, lead, conv, say, thread } = await world();
    await say("quero ver uma prévia");
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "manual", body: "Segue: https://previa.exemplo.com.br/x", status: "sent", variant: "previa-enviada", createdBy: "user", sentAt: new Date().toISOString() },
    ]);
    await say(null, "audio");
    const text = buildBriefing({ lead, proposal: SALE, messages: await thread(), dueDate: null, now: NOW });
    expect(text).toMatch(/Pediu prévia: você já mandou/);
    expect(text).toMatch(/Ele: \(áudio\)/);
    expect(text).toContain("https://previa.exemplo.com.br/x");
  });

  it("sem conversa nenhuma monta cliente e venda, e diz que não ficou claro o que ele quer", async () => {
    const { lead } = await world();
    const text = buildBriefing({ lead, proposal: SALE, messages: [], dueDate: null, now: NOW });
    expect(text).toMatch(/não deixou claro se é site ou sistema/);
    expect(text).not.toMatch(/CONVERSA/);
  });

  it("pediu prévia e ninguém mandou o link: pede para conferir, sem afirmar; e uma mensagem só não vira 'últimas 1 mensagens'", async () => {
    const { lead, say, thread } = await world();
    await say("quero ver uma prévia");
    const messages = (await thread()).filter((m) => m.direction === "in");
    expect(messages).toHaveLength(1);
    const text = buildBriefing({ lead, proposal: SALE, messages, dueDate: null, now: NOW });
    expect(text).toMatch(/Pediu prévia na conversa: confira se já foi enviada/);
    expect(text).not.toMatch(/ainda não foi enviada/);
    expect(text).toMatch(/CONVERSA \(a única mensagem\)/);
    expect(text).not.toMatch(/últimas 1 mensagens/);
  });

  it("mensagem enorme é cortada e a conversa longa fica nas últimas 14", async () => {
    const { lead, say, thread } = await world();
    for (let i = 0; i < 20; i++) await say(`mensagem número ${i} ${"x".repeat(40)}`);
    await say("y".repeat(900));
    const text = buildBriefing({ lead, proposal: SALE, messages: await thread(), dueDate: null, now: NOW });
    expect(text).toMatch(/últimas 14 mensagens/);
    expect(text).not.toContain("mensagem número 0 ");
    expect(text.split("\n").every((l) => l.length <= 300)).toBe(true);
  });
});

describe("o projeto já nasce com o briefing ao marcar o sinal", () => {
  it("de ponta a ponta: o agente fecha, você marca o sinal e o projeto abre com o resumo", async () => {
    const { repo, lead, say } = await world();
    await say("quero um site para a minha clínica");
    await say("quero mais contatos");
    await say("tenho logo e fotos"); // o material: só depois vem a oferta
    await say("pode passar o Pix");
    const [proposal] = await repo.listProposals({ leadId: lead.id, limit: 5 });
    expect(proposal.status).toBe("sent");

    const { project } = await changeProposalStatus(repo, proposal.id, "entry_paid", NOW);
    expect(project).not.toBeNull();
    expect(project!.briefing).toMatch(/^BRIEFING AUTOMÁTICO/);
    expect(project!.briefing).toMatch(/Quer um SITE/);
    expect(project!.briefing).toMatch(/Objetivo do site, nas palavras dele: “quero mais contatos”/);
    expect(project!.briefing).toMatch(/Material que já tem, nas palavras dele: “tenho logo e fotos”/);
    expect(project!.briefing).toMatch(/entrega em até 7 dias \(até 31\/10\/2026\)/);
  });

  it("proposta feita à mão, sem conversa: o projeto abre com o resumo do cliente e da venda", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 1, offset: 0 });
    const proposal = await createProposalFor(repo, { leadId: rows[0].id, ...SALE });
    await changeProposalStatus(repo, proposal.id, "sent", NOW);
    const { project } = await changeProposalStatus(repo, proposal.id, "entry_paid", NOW);
    expect(project!.briefing).toMatch(/^BRIEFING AUTOMÁTICO/);
    expect(project!.briefing).toContain(rows[0].name);
    expect(project!.briefing).toMatch(/não deixou claro se é site ou sistema/);
    expect(project!.briefing).not.toMatch(/CONVERSA/);
  });

  it("se montar o briefing falhar, o projeto nasce mesmo assim com o briefing vazio", async () => {
    const { repo, lead } = await world();
    const proposal = await createProposalFor(repo, { leadId: lead.id, ...SALE });
    await changeProposalStatus(repo, proposal.id, "sent", NOW);
    // a leitura da conversa quebra: o projeto não pode deixar de abrir
    const broken = Object.create(repo) as typeof repo;
    broken.findConversationByLead = async () => {
      throw new Error("banco fora do ar");
    };
    const { project } = await changeProposalStatus(broken, proposal.id, "entry_paid", NOW);
    expect(project).not.toBeNull();
    expect(project!.briefing).toBe("");
  });
});
