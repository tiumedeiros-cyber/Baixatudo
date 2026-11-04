import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { simulationContext } from "@/lib/agent/context";
import { rulesReply } from "@/lib/agent/rules";
import { detectTopics } from "@/lib/agent/topics";
import { lintMessage } from "@/lib/agent/humanize";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { classifyReply } from "./classify";
import { handleMessageEvent } from "./engine";
import type { WebhookEvent } from "./webhook";

/**
 * "Às vezes a pessoa não quer um site, mas é que ela acha que é só um site" (dono, 29/10): quem diz "não preciso de site" ou "já tenho
 * Instagram" ouve UMA vez que pode ser uma página simples no estilo Linktree, com cada tratamento, serviço ou produto e um botão que abre
 * o WhatsApp já com o que ele escolheu. Se repetir, o agente agradece e encerra. Recusa firme ("não temos interesse") continua encerrando.
 */

const NOW = new Date("2026-10-29T13:30:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW, shouldAdvanceTime: true });
});
afterAll(() => {
  vi.useRealTimers();
});
const rng = () => 0.5;
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = (ms = 3) => new Promise((r) => setTimeout(r, ms));

describe("a objeção ao 'site' não é recusa", () => {
  it.each(["Não preciso de site", "nao quero site", "Já tenho instagram", "A gente só usa o Instagram mesmo", "meu instagram já resolve", "só uso o insta"])("%s", (text) => {
    expect(classifyReply(text)).toMatchObject({ intent: "other", optout: false });
    expect(detectTopics(text, null, "qualificar")[0]).toBe("no_need_site");
  });

  it.each(["Não temos interesse em site", "não preciso de site, obrigada", "Não quero site, dispenso", "sem interesse"])("%s continua sendo recusa firme", (text) => {
    expect(classifyReply(text).intent).toBe("not_interested");
    expect(detectTopics(text, null, "qualificar")[0]).toBe("not_interested");
  });

  it("quem pede um site continua pedindo um site, e quem fala de preço continua no preço", () => {
    expect(detectTopics("quero um site", null, "qualificar")[0]).toBe("wants_site");
    expect(detectTopics("não preciso de site, quanto custa?", null, "qualificar")[0]).toBe("price");
  });

  it("no fluxo antigo (com prévia) tudo continua como era: vira recusa", () => {
    expect(detectTopics("não preciso de site", null, "previa")[0]).toBe("not_interested");
  });
});

describe("a resposta no estilo Linktree", () => {
  const OPENING = { from: "us" as const, text: "Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Teste no Google. Posso te fazer uma pergunta rápida?", variant: "abertura-social-c-google~g0i0q0" };
  const reply = (text: string, name = "Clínica Teste", lead: Partial<ReturnType<typeof simulationContext>["lead"]> = {}) => {
    const ctx = simulationContext({ text, name, websiteKind: "social", history: [OPENING], facts: { flow: "qualificar" } });
    return rulesReply({ ...ctx, lead: { ...ctx.lead, ...lead } });
  };

  it("explica uma vez que não precisa ser um site grande, sem prévia e sem preço, e cabe em uma mensagem", () => {
    const out = reply("Não preciso de site");
    expect(out.topic).toBe("no_need_site");
    expect(out.reply).toBe(
      "Entendo! Não precisa ser um site grande: é uma página só da Clínica Teste, no estilo Linktree, com cada tratamento e um botão que abre o WhatsApp já com o que o paciente quer. Ela fica no ar para o Google encontrar. Faz sentido eu te explicar?",
    );
    expect(out.reply!.length).toBeLessThanOrEqual(260);
    expect(lintMessage(out.reply!, "reply")).toEqual([]);
    expect(out.discovery).toBe(true);
  });

  it("fala do que o negócio vende: produto para loja, serviço para oficina, e 'estética automotiva' não vira 'tratamento'", () => {
    expect(reply("já tenho instagram", "Bella Moda", { niche: "Loja de roupas", category: "Loja de roupas femininas" }).reply).toMatch(/cada produto e um botão .* o cliente quer/);
    expect(reply("já tenho instagram", "Auto Detail", { niche: "Estética automotiva", category: "Lava jato" }).reply).toMatch(/cada serviço e um botão .* o cliente quer/);
    expect(reply("já tenho instagram", "Dra. Liane Sobral - Periodontista").reply).toMatch(/página só sua, no estilo Linktree/);
  });

  it("a solução com nome comprido continua abaixo do limite que o sistema aceita mandar sozinho", () => {
    const history = [OPENING, { from: "lead" as const, text: "Bom dia" }, { from: "us" as const, text: "Oi! Sou o Jonathan Kelvin, desenvolvedor de sites.\n\nA Clínica tem nota 4,9 no Google. Posso te mostrar como resolvo isso?", variant: "agente+auto:q-apresentacao" }];
    for (const name of ["Clínica Odontológica Sorria com Saúde Parangaba", "Centro de Especialidades Odontológicas e Estética Facial Avançada"]) {
      const out = rulesReply(simulationContext({ text: "pode sim", name, history, facts: { flow: "qualificar" } }));
      expect(out.reply!.length, out.reply!).toBeLessThanOrEqual(360);
      expect(out.reply).toMatch(/\n\nO que você mais quer que a página faça/);
    }
  });
});

// ───────────────────────── o motor ─────────────────────────

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const lead = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score)[0];
  await repo.saveSettings({ agentFlow: "qualificar" });
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false });
  return { repo, lead };
}

async function contacted(repo: MemoryRepo, lead: Lead) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Bom dia! Aqui é o Jonathan. Posso fazer uma pergunta rápida?", status: "sent", variant: "abertura-none-c-google~g0i0q0", createdBy: "system", sentAt: NOW.toISOString(), providerMessageId: `OUT-${lead.id}` },
  ]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: NOW.toISOString() });
  return conv;
}

const inbound = (phone: string, text: string): Extract<WebhookEvent, { kind: "message" }> => ({
  kind: "message",
  providerMessageId: `IN${Math.random().toString(36).slice(2, 10)}`,
  phoneE164: phone,
  fromMe: false,
  text,
  media: null,
  timestamp: null,
});
const say = async (repo: MemoryRepo, phone: string, text: string, seconds: number) => {
  const r = await handleMessageEvent(repo, inbound(phone, text), plus(NOW, seconds * 1000), { rng });
  await pause();
  return r;
};
const outs = (repo: MemoryRepo, conversationId: string) => repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], order: "asc", limit: 30 });

describe("no motor", () => {
  it("'já tenho Instagram' recebe a página no estilo Linktree sozinho, a conversa segue aberta e o lead não vai para Perdido", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    const r = await say(repo, lead.phoneE164!, "já tenho instagram", 20);
    expect(r).toMatchObject({ handled: true, intent: "other", repliedAlone: true });
    const [m] = await outs(repo, conv.id);
    expect(m).toMatchObject({ status: "approved", variant: "agente+auto:no_need_site" });
    expect(m.body).toMatch(/^Entendo! Não precisa ser um site grande/);
    expect(await repo.getConversation(conv.id)).toMatchObject({ status: "active" });
    expect((await repo.getLead(lead.id))!.stage).toBe("respondeu");
  });

  it("se ele repetir, volta à dor do dia a dia (o dono também faz sistema); na terceira, agradece e encerra", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "não preciso de site", 20);
    await say(repo, lead.phoneE164!, "não preciso de site mesmo", 20 + 5 * 60);
    await say(repo, lead.phoneE164!, "não preciso de site, obrigada", 20 + 10 * 60);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.map((m) => m.variant)).toEqual(["agente+auto:no_need_site", "agente+auto:q-escopo", "agente+auto:not_interested"]);
    expect(live[1].body).toMatch(/^Sem problema! Além de página e site, eu desenvolvo sistemas sob medida\. Hoje o que mais dá trabalho no dia a dia: /);
    expect(live[2].body).toMatch(/^Tudo bem, obrigado pelo retorno/);
  });

  it("depois da pergunta sobre a dor, a resposta vira o pedido de um sistema: o roteiro segue e, no fim, vai para o dono orçar", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "não preciso de site", 20);
    await say(repo, lead.phoneE164!, "não preciso de site mesmo", 20 + 5 * 60);
    await say(repo, lead.phoneE164!, "agendar as consultas e lembrar os pacientes, hoje é tudo no caderno", 20 + 10 * 60);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.at(-1)!.variant).toBe("agente+auto:q-dor");
    expect(live.at(-1)!.body).toMatch(/Como vocês fazem isso hoje/);
    expect(live.at(-1)!.body).not.toMatch(/R\$|Linktree/);
  });

  it("se ele topar ('pode explicar'), vem a solução com o prazo e a pergunta do objetivo, sem se apresentar de novo", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "não preciso de site", 20);
    await say(repo, lead.phoneE164!, "pode explicar", 20 + 5 * 60);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.map((m) => m.variant)).toEqual(["agente+auto:no_need_site", "agente+auto:q-objetivo"]);
    expect(live[1].body).toMatch(/^Em até 7 dias eu monto uma página só da .*, no estilo Linktree/);
    expect(live[1].body).not.toMatch(/Sou o Jonathan/);
  });

  it("recusa firme continua encerrando a conversa", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    const r = await say(repo, lead.phoneE164!, "Não temos interesse em site, obrigada", 20);
    expect(r).toMatchObject({ intent: "not_interested" });
    expect((await repo.getConversation(conv.id))!.status).toBe("closed");
    expect((await repo.getLead(lead.id))!.stage).toBe("perdido");
  });
});
