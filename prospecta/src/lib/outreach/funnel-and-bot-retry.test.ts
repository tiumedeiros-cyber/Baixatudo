import { describe, expect, it } from "vitest";
import { lintMessage } from "@/lib/agent/humanize";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { AUTO_REPLY_VARIANT } from "./autoreply";
import { openDays, opensOn } from "./bot-hours";
import { prepareBatch } from "./engine";
import { loadFunnel } from "./funnel";
import { buildBotFollowUp } from "./templates";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza
const DAY = 24 * 60 * 60_000;
const MIN = 60_000;
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);

describe("quando o robô diz que atende", () => {
  it("lê faixas e dias soltos", () => {
    const comercial = [1, 2, 3, 4, 5, 6];
    expect([...openDays("Nosso atendimento do WhatsApp funciona de segunda à sexta-feira, das 08h às 19h, e aos sábados das 08h às 12h.")!].sort()).toEqual(comercial);
    expect([...openDays("Atendimento por hora marcada em horário comercial de Segunda a sexta feira e aos Sábados pela manhã!!")!].sort()).toEqual(comercial);
    expect([...openDays("Atendemos de segunda a sexta, das 8h às 18h")!].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...openDays("Funcionamos todos os dias")!].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([...openDays("terça a sábado, 9h às 17h")!].sort()).toEqual([2, 3, 4, 5, 6]);
    expect([...openDays("sábado das 8h às 12h")!]).toEqual([6]);
  });

  it("sem dia no texto (ou texto de fechamento), não sabe: vale qualquer dia", () => {
    expect(openDays("17:00 em dias úteis. Atendimento no escritório com agendamento.")).toBeNull();
    expect(openDays("Fechamos aos domingos e feriados")).toBeNull();
    expect(openDays(null)).toBeNull();
    expect(opensOn("sem horário nenhum", 0)).toBe(true);
  });

  it("domingo é dia fechado para quem atende de segunda a sábado", () => {
    const t = "segunda à sexta, das 08h às 19h, e aos sábados das 08h às 12h";
    expect(opensOn(t, 0)).toBe(false);
    expect(opensOn(t, 1)).toBe(true);
    expect(opensOn(t, 6)).toBe(true);
  });
});

describe("a cutucada para quem só recebeu o robô", () => {
  type L = Parameters<typeof buildBotFollowUp>[0];
  const lead = { id: "l1", name: "Clínica Styllo | Clinica Odontológica Fortaleza", category: "Dentista", niche: "Dentista", websiteKind: "none", rating: 4.8, reviewsCount: 40, neighborhood: null, city: "Fortaleza" } as unknown as L;
  const ctx = { senderName: "Jonathan", brandName: "Kelvin Studio", flow: "qualificar", mode: "curta" } as unknown as Parameters<typeof buildBotFollowUp>[1];

  it("diz que a mensagem caiu no atendimento automático e pergunta quem cuida da divulgação", () => {
    const { body, variant } = buildBotFollowUp(lead, ctx);
    expect(variant).toBe("followup-bot");
    expect(body).toBe("Bom dia! Jonathan de novo. Minha mensagem caiu no atendimento automático. Quem cuida da divulgação da Clínica Styllo consegue falar comigo por aqui? Para parar de receber, responda PARE.");
    expect(body.match(/\?/g)).toHaveLength(1);
    expect(body.length).toBeLessThanOrEqual(190);
    expect(lintMessage(body, "followup").filter((i) => i.severity === "error")).toEqual([]);
  });

  it("com título fala com a pessoa; advocacia fica sóbria; nome comprido não estoura", () => {
    const dra = buildBotFollowUp({ ...lead, name: "Dra Liane Sobral - Periodontista" }, ctx).body;
    expect(dra).toBe("Bom dia, Dra. Liane! Jonathan de novo. Minha mensagem caiu no atendimento automático. Você consegue me responder por aqui, ou quem cuida da divulgação? Para parar de receber, responda PARE.");
    const law = buildBotFollowUp({ ...lead, name: "Rafael Neves - ADVOCACIA", category: "Advogado", niche: "Advocacia" }, ctx).body;
    expect(law).toMatch(/^Olá, Rafael\. A minha mensagem foi respondida pelo atendimento automático\. Poderia me indicar quem cuida da divulgação\?/);
    const long = buildBotFollowUp({ ...lead, name: "Centro de Especialidades Odontológicas e Estética Facial Avançada de Fortaleza" }, ctx).body;
    expect(long.length).toBeLessThanOrEqual(240);
  });
});

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar" });
  return { repo, leads };
}

async function sentOpening(repo: MemoryRepo, lead: Lead, variant = "abertura-none-c-google~g0i0q0", at = NOW) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Bom dia! Aqui é o Jonathan. Posso fazer uma pergunta rápida?", status: "sent", variant, createdBy: "system", sentAt: at.toISOString() },
  ]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: at.toISOString() });
  return conv;
}
const botSays = (repo: MemoryRepo, convId: string, leadId: string, body: string, at: Date) =>
  repo.createMessages([{ conversationId: convId, leadId, direction: "in", kind: "reply", body, status: "received", variant: AUTO_REPLY_VARIANT, intent: "other", createdBy: "lead", sentAt: at.toISOString() }]);
const personSays = (repo: MemoryRepo, convId: string, leadId: string, body: string, at: Date) =>
  repo.createMessages([{ conversationId: convId, leadId, direction: "in", kind: "reply", body, status: "received", intent: "other", createdBy: "lead", sentAt: at.toISOString() }]);
const agentSays = (repo: MemoryRepo, convId: string, leadId: string, body: string, variant: string, at: Date) =>
  repo.createMessages([{ conversationId: convId, leadId, direction: "out", kind: "reply", body, status: "sent", variant, createdBy: "system", sentAt: at.toISOString() }]);

const MENU = "Nosso atendimento funciona de segunda à sexta-feira, das 08h às 19h, e aos sábados das 08h às 12h. Responderemos assim que possível.";

describe("prepareBatch: a 1ª cutucada de quem só recebeu o robô vem no dia seguinte", () => {
  it("1 dia depois já vence (quem ficou quieto só vence em 2) e o texto é o do atendimento automático", async () => {
    const { repo, leads } = await setup();
    const bot = await sentOpening(repo, leads[0]);
    await botSays(repo, bot.id, leads[0].id, MENU, plus(NOW, 10_000));
    const quiet = await sentOpening(repo, leads[1]);

    const r = await prepareBatch(repo, plus(NOW, DAY), { limit: 5 }); // sexta
    expect(r.followUps).toBe(1);
    const fus = await repo.listMessages({ kinds: ["followup"], limit: 10 });
    expect(fus).toHaveLength(1);
    expect(fus[0]).toMatchObject({ conversationId: bot.id, step: 1, status: "draft", variant: "followup-bot" });
    expect(fus[0].body).toMatch(/Minha mensagem caiu no atendimento automático/);
    expect(fus[0].body).toMatch(/Para parar de receber, responda PARE\.$/);
    void quiet;
  });

  it("não cutuca num dia em que o robô diz que não atende (domingo) e cutuca na segunda", async () => {
    const { repo, leads } = await setup();
    const bot = await sentOpening(repo, leads[0]);
    await botSays(repo, bot.id, leads[0].id, MENU, plus(NOW, 10_000));

    const sunday = await prepareBatch(repo, plus(NOW, 3 * DAY), { limit: 5 });
    expect(sunday.followUps).toBe(0);
    expect(sunday.skipped["robô: o negócio não atende hoje"]).toBe(1);
    const monday = await prepareBatch(repo, plus(NOW, 4 * DAY), { limit: 5 });
    expect(monday.followUps).toBe(1);
  });

  it("robô sem horário no texto: vale o dia seguinte, qualquer dia", async () => {
    const { repo, leads } = await setup();
    const bot = await sentOpening(repo, leads[0]);
    await botSays(repo, bot.id, leads[0].id, "Olá! Seja bem-vindo à clínica. Para agilizar seu atendimento, nos diga em que podemos ajudar.", plus(NOW, 10_000));
    expect((await prepareBatch(repo, plus(NOW, 3 * DAY), { limit: 5 })).followUps).toBe(1); // domingo
  });

  it("se uma pessoa escreveu depois do robô, a cutucada do robô não existe", async () => {
    const { repo, leads } = await setup();
    const conv = await sentOpening(repo, leads[0]);
    await botSays(repo, conv.id, leads[0].id, MENU, plus(NOW, 10_000));
    await personSays(repo, conv.id, leads[0].id, "Bom dia", plus(NOW, 2 * MIN));
    await repo.updateConversation(conv.id, { lastInboundAt: plus(NOW, 2 * MIN).toISOString() });
    expect((await prepareBatch(repo, plus(NOW, DAY), { limit: 5 })).followUps).toBe(0);
  });

  it("a 2ª cutucada é a de sempre, não a do robô", async () => {
    const { repo, leads } = await setup();
    const conv = await sentOpening(repo, leads[0]);
    await botSays(repo, conv.id, leads[0].id, MENU, plus(NOW, 10_000));
    await repo.updateConversation(conv.id, { touches: 2, lastOutboundAt: plus(NOW, DAY).toISOString() });
    await prepareBatch(repo, plus(NOW, 6 * DAY), { limit: 5 });
    const fus = await repo.listMessages({ kinds: ["followup"], limit: 10 });
    expect(fus).toHaveLength(1);
    expect(fus[0]).toMatchObject({ step: 2, variant: "followup-2" });
  });
});

describe("funil do agente", () => {
  it("conta cada passo, tira o robô de 'pessoa' e mostra onde a conversa esfriou", async () => {
    const { repo, leads } = await setup();
    const [a, b, c, d, old] = leads;

    await sentOpening(repo, a); // A: ninguém respondeu

    const cb = await sentOpening(repo, b); // B: só o robô
    await botSays(repo, cb.id, b.id, MENU, plus(NOW, 10_000));

    const cc = await sentOpening(repo, c); // C: pessoa, apresentação, silêncio
    await personSays(repo, cc.id, c.id, "Bom dia", plus(NOW, 2 * MIN));
    await agentSays(repo, cc.id, c.id, "Oi! Sou o Jonathan Kelvin...", "agente+auto:q-apresentacao", plus(NOW, 3 * MIN));

    const cd = await sentOpening(repo, d); // D: pessoa, apresentação, "pode", solução, respondeu, proposta
    await personSays(repo, cd.id, d.id, "Bom dia", plus(NOW, 2 * MIN));
    await agentSays(repo, cd.id, d.id, "Oi! Sou o Jonathan Kelvin...", "agente+auto:q-apresentacao", plus(NOW, 3 * MIN));
    await personSays(repo, cd.id, d.id, "pode sim", plus(NOW, 6 * MIN));
    await agentSays(repo, cd.id, d.id, "Perfeito! Em até 7 dias eu monto uma página...", "agente+auto:q-objetivo", plus(NOW, 7 * MIN));
    await personSays(repo, cd.id, d.id, "quero receber contatos", plus(NOW, 10 * MIN));
    await repo.setStage(d.id, "proposta");

    await sentOpening(repo, old, "abertura-none-c-google~g0i0q0", plus(NOW, -60 * DAY)); // fora dos 30 dias

    const f = await loadFunnel(repo, plus(NOW, DAY), 30);
    expect(f.sent).toBe(4);
    expect(Object.fromEntries(f.steps.map((s) => [s.id, s.count]))).toEqual({
      sent: 4,
      answered: 3,
      person: 2,
      presented: 2,
      afterPresentation: 1,
      solution: 1,
      goal: 1,
      offer: 0,
      proposal: 1,
      won: 0,
    });
    expect(f.steps.find((s) => s.id === "person")).toMatchObject({ ofPrev: 2 / 3, ofStart: 0.5 });
    expect(f.steps[0]).toMatchObject({ ofPrev: null, ofStart: 1, outOfOrder: false });
    expect(f.steps.find((s) => s.id === "person")!.outOfOrder).toBe(false);
    // a proposta veio do dono (etapa movida à mão), sem a oferta do agente antes: fica sem percentual
    expect(f.steps.find((s) => s.id === "proposal")).toMatchObject({ count: 1, outOfOrder: true, ofPrev: null });
    expect(f.lost).toEqual({ silent: 1, botOnly: 1, stoppedAfterPresentation: 1 });
    // por tipo de abertura: as quatro foram do mesmo ângulo
    expect(f.byAngle).toHaveLength(1);
    expect(f.byAngle[0]).toMatchObject({ sent: 4, people: 2, presented: 2, afterPresentation: 1 });
    expect(f.byNiche.reduce((n, g) => n + g.sent, 0)).toBe(4);
  });

  it("passo com mais conversas que o anterior (roteiro antigo, sem apresentação) não vira 500%: fica sem percentual", async () => {
    const { repo, leads } = await setup();
    for (const lead of leads.slice(0, 3)) {
      const conv = await sentOpening(repo, lead);
      await personSays(repo, conv.id, lead.id, "Bom dia", plus(NOW, 2 * MIN));
      await agentSays(repo, conv.id, lead.id, "Bom dia! Sou o Jonathan, faço sites. Você pensa em uma página ou em um site mais completo?", "agente-ia+auto:q-objetivo", plus(NOW, 3 * MIN));
    }
    const f = await loadFunnel(repo, plus(NOW, DAY), 30);
    const solution = f.steps.find((s) => s.id === "solution")!;
    expect(solution).toMatchObject({ count: 3, ofPrev: null, outOfOrder: true });
  });

  it("sem aberturas no período o funil vem zerado, sem dividir por zero", async () => {
    const { repo } = await setup();
    const f = await loadFunnel(repo, NOW, 30);
    expect(f.sent).toBe(0);
    expect(f.steps.every((s) => s.count === 0 && (s.ofPrev === null || Number.isFinite(s.ofPrev)))).toBe(true);
    expect(f.lost).toEqual({ silent: 0, botOnly: 0, stoppedAfterPresentation: 0 });
  });
});
