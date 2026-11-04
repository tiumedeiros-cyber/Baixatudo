import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest } from "@/lib/agent/llm";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { approveMessages, prepareBatch, rewriteOpenings, tick } from "./engine";
import { ProviderError, type ProviderStatus, type WhatsAppProvider } from "./provider";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const HOUR = 3_600_000;
const rng = () => 0.5;
const sleep = async () => {};

/** WhatsApp de mentira que guarda cada mensagem e pode falhar na N-ésima. */
class Rec implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  sent: { phone: string; text: string }[] = [];
  typingCalls: [string, boolean][] = [];
  sendCalls = 0;
  failOnCall: number | null = null;
  async status(): Promise<ProviderStatus> {
    return { connected: true, loggedIn: true, mode: this.mode, detail: "WhatsApp conectado" };
  }
  async typing(phone: string, on: boolean) {
    this.typingCalls.push([phone, on]);
  }
  async sendText(phone: string, text: string) {
    this.sendCalls++;
    if (this.failOnCall === this.sendCalls) throw new ProviderError("o GOWA caiu", true);
    this.sent.push({ phone, text });
    return { id: `ID${this.sendCalls}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

function fakeLlm(over: (req: LlmRequest, call: number) => string | Promise<string> = (req) => good(req)): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return { name: "fake", model: "fake-1", calls, complete: async (req) => over(req, calls.push(req) - 1) };
}
const good = (req: LlmRequest) => {
  const name = /- Nome: (.*)/.exec(req.user)![1].trim();
  // a IA obedece ao pedido: diz o que faz do jeito indicado (a forma é sorteada por abertura)
  const role = /EXATAMENTE como "([^"]+)"/.exec(req.user)?.[1] ?? "desenvolvedor";
  return JSON.stringify({
    messages: [
      `Oi! Sou o Jonathan Kelvin, ${role}.`,
      `Vi o perfil de ${name} no Google, mas sem site, quem chega lá não tem onde conhecer os serviços e agendar.`,
      "Eu crio o site que resolve isso. Posso te explicar como funciona?",
    ],
  });
};

async function setup(flow: "qualificar" | "previa" = "qualificar") {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  // este arquivo testa a abertura "completa" (três mensagens); a curta tem o seu em opening-short.test.ts
  await repo.saveSettings({ agentFlow: flow, openingMode: "completa" });
  return { repo, leads };
}

const live = (repo: MemoryRepo) => repo.saveAutomation({ paused: false, dryRun: false });

/** Uma abertura já aprovada e vencida, com o texto dado. */
async function queued(repo: MemoryRepo, lead: Lead, body: string, kind: "opening" | "reply" = "opening") {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  const [m] = await repo.createMessages([
    {
      conversationId: conv.id,
      leadId: lead.id,
      direction: "out",
      kind,
      body,
      status: "approved",
      createdBy: "system",
      scheduledFor: new Date(NOW.getTime() - 60_000).toISOString(),
      approvedAt: NOW.toISOString(),
    },
  ]);
  return { conv, m };
}

const OPENING = "Oi! Sou o Jonathan, da Kelvin Studio.\n\nVi a Clínica Aurora no Google e não achei um site. Já pensaram em ter um? Para parar de receber, responda PARE.";

describe("prepareBatch com o agente escrevendo", () => {
  it("cada abertura nasce escrita pela IA, em partes, com a saída uma vez só e como rascunho", async () => {
    const { repo } = await setup();
    const llm = fakeLlm();
    const r = await prepareBatch(repo, NOW, { llm });
    expect(r.openings).toBeGreaterThan(0);
    expect(r.written).toMatchObject({ ia: r.openings, modelo: 0, notes: [] });
    expect(llm.calls).toHaveLength(r.openings);

    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(drafts).toHaveLength(r.openings);
    for (const m of drafts) {
      expect(m).toMatchObject({ status: "draft", createdBy: "system", direction: "out" });
      expect(m.variant).toMatch(/^abertura-(none|social|weak)-[a-z-]+-ia~g\d+i\d+q\d+r\d+$/); // ângulo, IA e o estilo (saudação, apresentação, pergunta, o que faz)
      expect(m.body.split("\n\n")).toHaveLength(3); // quem sou, elogio e dor, solução e pergunta
      expect(m.body).toMatch(/^Oi! Sou o Jonathan Kelvin, \S/);
      expect(m.body).not.toMatch(/Kelvin Studio/);
      expect(m.body).not.toMatch(/PARE/);
    }
    expect((await repo.messageCounts()).prospectingSent).toBe(0); // nada saiu
    expect((await repo.listEvents({ types: ["lote_preparado"], limit: 1 }))[0].payload).toMatchObject({ openings: r.openings, ia: r.openings });
  });

  it("a IA recebe os dados do negócio, mas nunca o telefone", async () => {
    const { repo, leads } = await setup();
    const llm = fakeLlm();
    await prepareBatch(repo, NOW, { llm });
    const everything = llm.calls.map((c) => `${c.system}\n${c.user}`).join("\n");
    expect(everything).toMatch(/Nome: /);
    for (const l of leads.slice(0, 20)) {
      const digits = (l.phoneE164 ?? "").replace(/\D/g, "");
      if (digits) expect(everything).not.toContain(digits);
    }
  });

  it("IA fora do ar: o lote sai igual, com os modelos, e diz por quê", async () => {
    const { repo } = await setup();
    const llm = fakeLlm(() => {
      throw new Error("O Gemini respondeu 429");
    });
    const r = await prepareBatch(repo, NOW, { llm });
    expect(r.written).toMatchObject({ ia: 0, modelo: r.openings });
    expect(r.written.notes[0]).toMatch(/indisponível.*429/);
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(drafts.every((m) => !m.variant?.endsWith("-ia") && !m.body.includes("PARE"))).toBe(true);
  });

  it("sem IA configurada, vale o banco de modelos", async () => {
    const { repo } = await setup();
    const r = await prepareBatch(repo, NOW);
    expect(r.written).toMatchObject({ ia: 0, modelo: r.openings });
    expect(r.written.notes).toEqual([]);
  });

  it("no fluxo com prévia a IA não escreve abertura (o texto oferece a prévia dos modelos)", async () => {
    const { repo } = await setup("previa");
    const llm = fakeLlm();
    const r = await prepareBatch(repo, NOW, { llm });
    expect(llm.calls).toHaveLength(0);
    expect(r.written.ia).toBe(0);
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(drafts.every((m) => /pr[eé]via/i.test(m.body))).toBe(true);
  });

  it("IA que escreve prévia ou preço é reprovada e o lead recebe o modelo", async () => {
    const { repo } = await setup();
    const llm = fakeLlm((req) => {
      const name = /- Nome: (.*)/.exec(req.user)![1].trim();
      return JSON.stringify({ messages: ["Oi! Sou o Jonathan, da Kelvin Studio.", `Vi a ${name} e não achei um site. Faço por R$ 300 com prévia grátis. Vale?`] });
    });
    const r = await prepareBatch(repo, NOW, { llm });
    expect(r.written.ia).toBe(0);
    expect(r.written.notes[0]).toMatch(/reprovada pela trava/);
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 100 });
    expect(drafts.every((m) => !/R\$|pr[eé]via/i.test(m.body))).toBe(true);
  });
});

describe("tick: a abordagem sai em partes", () => {
  it("manda uma mensagem por parágrafo, cada uma com o seu 'digitando', e conta como UM envio", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const provider = new Rec();
    const { conv, m } = await queued(repo, leads[0], OPENING);
    const r = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(r).toEqual({ action: "sent", messageId: m.id });

    const phone = leads[0].phoneE164;
    expect(provider.sent).toEqual([
      { phone, text: "Oi! Sou o Jonathan, da Kelvin Studio." },
      { phone, text: "Vi a Clínica Aurora no Google e não achei um site. Já pensaram em ter um? Para parar de receber, responda PARE." },
    ]);
    expect(provider.typingCalls).toEqual([[phone, true], [phone, false], [phone, true], [phone, false]]);
    // o registro é um só, com o id da ÚLTIMA parte (é nela que o WhatsApp avisa "lida")
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "sent", providerMessageId: "ID2", error: null });
    expect((await repo.getConversation(conv.id))!.touches).toBe(1);
    expect((await repo.messageCounts()).prospectingSent).toBe(1);
    expect((await repo.listEvents({ types: ["mensagem_enviada"], limit: 5 })).length).toBe(1);
  });

  it("espera entre uma parte e outra e escreve o 'digitando' pelo tamanho de cada uma", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const waits: number[] = [];
    await queued(repo, leads[0], OPENING);
    await tick({ repo, provider: new Rec(), now: NOW, rng, sleep: async (ms) => void waits.push(ms) });
    // digitando da 1ª, pausa, digitando da 2ª (maior que a da 1ª)
    expect(waits).toHaveLength(3);
    expect(waits[2]).toBeGreaterThan(waits[0]);
    expect(waits[1]).toBeLessThan(waits[0]);
  });

  it("abertura de um parágrafo só continua saindo como uma mensagem", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const provider = new Rec();
    await queued(repo, leads[0], "Oi! Aqui é o Jonathan, da Kelvin Studio. Vale uma conversa rápida? Para parar de receber, responda PARE.");
    await tick({ repo, provider, now: NOW, rng, sleep });
    expect(provider.sent).toHaveLength(1);
    expect(provider.typingCalls).toHaveLength(2);
  });

  it("resposta a quem escreveu sai inteira, mesmo com linha em branco", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const provider = new Rec();
    const { conv } = await queued(repo, leads[0], "x", "reply");
    await repo.updateConversation(conv.id, { lastInboundAt: NOW.toISOString(), status: "active" });
    const [m] = await repo.listMessages({ conversationId: conv.id, limit: 5 });
    await repo.updateMessage(m.id, { body: "Combinado.\n\nTe explico melhor por aqui." });
    await tick({ repo, provider, now: NOW, rng, sleep });
    expect(provider.sent).toEqual([{ phone: leads[0].phoneE164, text: "Combinado.\n\nTe explico melhor por aqui." }]);
  });

  it("falha depois da 1ª parte: a nova tentativa manda só o que faltou, nunca repete o que o lead já leu", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const provider = new Rec();
    provider.failOnCall = 2;
    const { m } = await queued(repo, leads[0], OPENING);

    const first = await tick({ repo, provider, now: NOW, rng, sleep });
    expect(first).toMatchObject({ action: "failed", messageId: m.id });
    expect(provider.sent).toHaveLength(1);
    // a conversa do lead ficou com o "Oi!" e o "digitando" foi desligado mesmo com o erro
    expect(provider.typingCalls.at(-1)).toEqual([leads[0].phoneE164, false]);
    const retry = (await repo.getMessage(m.id))!;
    expect(retry.status).toBe("approved");
    expect(retry.body).toBe("Vi a Clínica Aurora no Google e não achei um site. Já pensaram em ter um? Para parar de receber, responda PARE.");
    expect(retry.error).toMatch(/a parte 1 de 2 já tinha saído/);

    provider.failOnCall = null;
    const second = await tick({ repo, provider, now: new Date(NOW.getTime() + HOUR), rng, sleep });
    expect(second).toMatchObject({ action: "sent" });
    expect(provider.sent.map((s) => s.text)).toEqual([
      "Oi! Sou o Jonathan, da Kelvin Studio.",
      "Vi a Clínica Aurora no Google e não achei um site. Já pensaram em ter um? Para parar de receber, responda PARE.",
    ]);
    expect(await repo.getMessage(m.id)).toMatchObject({ status: "sent", providerMessageId: "ID3" });
  });

  it("falha na 1ª parte: tudo volta como estava, sem mexer no texto", async () => {
    const { repo, leads } = await setup();
    await live(repo);
    const provider = new Rec();
    provider.failOnCall = 1;
    const { m } = await queued(repo, leads[0], OPENING);
    await tick({ repo, provider, now: NOW, rng, sleep });
    const kept = (await repo.getMessage(m.id))!;
    expect(kept.status).toBe("approved");
    expect(kept.body).toBe(OPENING);
    expect(kept.error).not.toMatch(/parte/);
  });
});

describe("rewriteOpenings", () => {
  it("troca o texto de todos os rascunhos de abertura e deixa o que já foi aprovado como está", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW); // sem IA: vêm dos modelos
    const drafts = await repo.listMessages({ kinds: ["opening"], statuses: ["draft"], limit: 100 });
    const [approvedId, ...rest] = drafts.map((d) => d.id);
    await approveMessages(repo, [approvedId], NOW, rng);
    const before = (await repo.getMessage(approvedId))!.body;

    const r = await rewriteOpenings(repo, null, { llm: fakeLlm() });
    expect(r).toMatchObject({ rewritten: rest.length, ia: rest.length, skipped: 0 });
    for (const id of rest) expect((await repo.getMessage(id))!.variant).toMatch(/-ia~g\d+i\d+q\d+r\d+$/);
    expect((await repo.getMessage(approvedId))!.body).toBe(before);
    expect((await repo.getMessage(approvedId))!.variant).not.toMatch(/-ia(~|$)/);
    expect((await repo.getMessage(approvedId))!.status).toBe("approved");
  });

  it("com ids, só mexe nos escolhidos, e um novo sorteio da IA pode dar outro texto", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, NOW);
    const [a, b] = await repo.listMessages({ kinds: ["opening"], statuses: ["draft"], limit: 100 });
    let n = 0;
    const llm = fakeLlm((req) => {
      const name = /- Nome: (.*)/.exec(req.user)![1].trim();
      const role = /EXATAMENTE como "([^"]+)"/.exec(req.user)?.[1] ?? "desenvolvedor";
      return JSON.stringify({
        messages: [
          `Oi! Sou o Jonathan Kelvin, ${role}.`,
          `Vi o perfil de ${name} no Google, mas sem site, quem chega lá não tem onde conhecer os serviços e agendar.`,
          `Eu crio o site que resolve isso. ${n++ ? "Vale uma conversa rápida?" : "Posso te explicar como funciona?"}`,
        ],
      });
    });
    const r = await rewriteOpenings(repo, [a.id], { llm });
    expect(r.rewritten).toBe(1);
    expect((await repo.getMessage(a.id))!.body).toMatch(/Posso te explicar como funciona\?/);
    expect((await repo.getMessage(b.id))!.body).toBe(b.body);
  });

  it("ignora o que não é rascunho de abertura", async () => {
    const { repo, leads } = await setup();
    const { m } = await queued(repo, leads[0], OPENING); // aprovada
    const r = await rewriteOpenings(repo, [m.id], { llm: fakeLlm() });
    expect(r).toMatchObject({ rewritten: 0, skipped: 1 });
    expect((await repo.getMessage(m.id))!.body).toBe(OPENING);
  });
});
