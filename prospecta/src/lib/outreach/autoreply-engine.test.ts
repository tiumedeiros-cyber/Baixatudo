import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadAgentView } from "@/lib/agent/view";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { AUTO_REPLY_VARIANT } from "./autoreply";
import { loadConversationBoard } from "./board";
import { handleMessageEvent, tick, unblockLead } from "./engine";
import { lastLeadMessage } from "./last-inbound";
import type { ProviderStatus, WhatsAppProvider } from "./provider";
import type { WebhookEvent } from "./webhook";

const NOW = new Date("2026-10-24T16:30:00Z"); // sábado, 13:30 em Fortaleza
// o banco em memória carimba as mensagens com a hora da máquina: sem relógio fixo, a trava de 24 h contra resposta repetida vira
// uma bomba-relógio (o teste passava no dia e quebrava no dia seguinte)
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW, shouldAdvanceTime: true });
});
afterAll(() => {
  vi.useRealTimers();
});
const MIN = 60_000;
const rng = () => 0.5;
const sleep = async () => {};
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = (ms = 3) => new Promise((r) => setTimeout(r, ms));

// os textos que chegaram de verdade (prints do dono)
const ESCRITORIO_1 = "17:00 em dias úteis.\n\nAtendimento no escritório com agendamento.\n\n\n*mensagem automática*.";
const ESCRITORIO_2 = "Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.\n\n*mensagem automática*.";
const MENU =
  "É um prazer ter você por aqui. ✨ Somos um espaço especializado em realçar a sua beleza com naturalidade, segurança e protocolos exclusivos, pensados de forma personalizada para cada paciente. 💎 Me conta como posso te direcionar: 1️⃣ Agendar meu momento de autocuidado 2️⃣ Acessar o catálogo de serviços 3️⃣ Cursos / Mentoria 4️⃣ Outros Conheça mais sobre nosso trabalho: https://www.instagram.com/dra.heloisalima";

class Rec implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  sent: string[] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: true, loggedIn: true, mode: this.mode, detail: "WhatsApp conectado" };
  }
  async typing() {}
  async sendText(_phone: string, text: string) {
    this.sent.push(text);
    return { id: `ID${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar" });
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false });
  return { repo, leads };
}

/** O lead já foi abordado: a abertura saiu. */
async function contacted(repo: MemoryRepo, lead: Lead) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan, da Kelvin Studio.", status: "sent", createdBy: "system", sentAt: NOW.toISOString(), providerMessageId: `OUT-${lead.id}` },
  ]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: NOW.toISOString() });
  return conv;
}

const inbound = (phone: string, text: string | null): Extract<WebhookEvent, { kind: "message" }> => ({
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

describe("resposta automática do negócio", () => {
  it("o aviso do escritório é gravado e marcado, mas o agente não responde a robô nem entra no roteiro de automação", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead);

    // as duas mensagens do robô chegam juntas, como no print
    const a = await say(repo, lead.phoneE164!, ESCRITORIO_1, 5);
    const b = await say(repo, lead.phoneE164!, ESCRITORIO_2, 6);
    expect(a).toMatchObject({ handled: true, intent: "auto_reply", draftedReply: false });
    expect(b).toMatchObject({ handled: true, intent: "auto_reply", draftedReply: false });

    expect(await outs(repo, conv.id)).toHaveLength(0); // nada de "Automação depende do processo de vocês…" duas vezes

    const saved = (await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 10 })).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    expect(saved).toHaveLength(2);
    expect(saved.every((m) => m.variant === AUTO_REPLY_VARIANT && m.status === "received")).toBe(true);

    // a conversa continua como estava: ninguém respondeu de verdade
    expect(await repo.getConversation(conv.id)).toMatchObject({ status: "active", lastInboundAt: null, unread: 0 });
    expect((await repo.getLead(lead.id))!.stage).toBe("contatado");
    expect((await repo.messageCounts()).conversationsReplied).toBe(0);
    expect((await repo.listEvents({ types: ["automacao"], limit: 5 })).some((e) => /robô/.test(String(e.payload.text)))).toBe(true);
  });

  it("saudações curtas de modelo pronto (26/10) também são ignoradas: o agente não pergunta 'landing page, site ou sistema?' ao robô", async () => {
    const { repo, leads } = await setup();
    const textos = [
      "Martins Detailer agradece seu contato. Como podemos ajudar?",
      "Tutti Belle Esmalteria e Estética agradece seu contato. Como podemos ajudar?",
      "✨ Olá, seja muito bem-vindo(a)! É um prazer receber você por aqui! Como posso ajudar?",
      "‎Dalida Massoterapeuta agradece seu contato em que posso lhe ajudar hoje?💆‍♀️🧘‍♀️👐🪷",
    ];
    for (const [i, texto] of textos.entries()) {
      const lead = leads[i];
      const conv = await contacted(repo, lead);
      expect(await say(repo, lead.phoneE164!, texto, 5 + i)).toMatchObject({ handled: true, intent: "auto_reply", draftedReply: false });
      expect(await outs(repo, conv.id)).toHaveLength(0);
      expect(await repo.getConversation(conv.id)).toMatchObject({ status: "active", lastInboundAt: null, unread: 0 });
      expect((await repo.getLead(lead.id))!.stage).toBe("contatado");
      const [saved] = await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 5 });
      expect(saved.variant).toBe(AUTO_REPLY_VARIANT);
    }
    expect((await repo.messageCounts()).conversationsReplied).toBe(0);
  });

  it("a pessoa que responde depois da saudação automática é atendida normalmente, do começo", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "Martins Detailer agradece seu contato. Como podemos ajudar?", 5);
    const r = await say(repo, leads[0].phoneE164!, "Oi, aqui é o Martins. Quanto custa um site?", 60);
    expect(r).toMatchObject({ handled: true, repliedAlone: true });
    expect((await outs(repo, conv.id)).length).toBeGreaterThanOrEqual(1);
    expect((await repo.getLead(leads[0].id))!.stage).toBe("respondeu");
  });

  it("menu automático também é ignorado", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    expect(await say(repo, leads[0].phoneE164!, MENU, 5)).toMatchObject({ intent: "auto_reply", draftedReply: false });
    expect(await outs(repo, conv.id)).toHaveLength(0);
    expect((await repo.getConversation(conv.id))!.status).toBe("active");
  });

  it("quando a pessoa de verdade responde depois do robô, a conversa segue normal, sem herdar nada do robô", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, ESCRITORIO_2, 5);

    const r = await say(repo, leads[0].phoneE164!, "Oi, aqui é o Rafael. Preciso de um sistema de agendamento para o escritório", 60);
    expect(r).toMatchObject({ handled: true, repliedAlone: true });
    expect(await repo.getConversation(conv.id)).toMatchObject({ lastInboundAt: expect.any(String), unread: 1 });
    expect((await repo.messageCounts()).conversationsReplied).toBe(1);
    const [first] = await outs(repo, conv.id);
    expect(first.variant).toMatch(/q-/); // roteiro de sistema (pergunta), não o de automação
    expect(first.body).toMatch(/^Entendi!?\s*Sistema/);
  });

  it("PARE de verdade continua valendo mesmo vindo no meio de um texto de robô", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    const r = await say(repo, leads[0].phoneE164!, "PARE", 5);
    expect(r).toMatchObject({ handled: true, optout: true });
    expect((await repo.getConversation(conv.id))!.status).toBe("opted_out");
  });

  it("o quadro de Conversas mostra quem só respondeu um robô em 'Sem resposta', com a mensagem marcada", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, ESCRITORIO_2, 5);
    const { lanes } = await loadConversationBoard(repo);
    const lane = lanes.find((l) => l.id === "sem_resposta")!;
    expect(lane.cards.map((c) => c.id)).toEqual([conv.id]);
    expect(lane.cards[0].preview).toMatch(/^Automática: Agradecemos sua mensagem/);
    expect(lanes.find((l) => l.id === "intervir")!.cards).toHaveLength(0);
  });

  it("a ficha da conversa e o pedido manual ao agente não leem o texto do robô", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, ESCRITORIO_2, 5);
    const view = await loadAgentView(repo, (await repo.getConversation(conv.id))!, leads[0]);
    // antes: "mensagem automática" virava "Última: quer um sistema" e "Responder (fora do roteiro)"
    expect(view.topic).toBeNull();
    expect(view.ficha.product).toBeNull();
    expect(view.handoff.needed).toBe(false);
    expect((await lastLeadMessage(repo, conv.id))).toBeNull();

    await say(repo, leads[0].phoneE164!, "Oi, pode falar", 60);
    expect((await lastLeadMessage(repo, conv.id))?.body).toBe("Oi, pode falar");
  });

  it("liberar um número bloqueado não faz o agente responder a um robô que escreveu depois", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "PARE", 5);
    await say(repo, leads[0].phoneE164!, ESCRITORIO_2, 10); // o robô respondeu o PARE
    const r = await unblockLead(repo, leads[0].id, plus(NOW, 20 * MIN), { rng });
    expect(r).toMatchObject({ unblocked: true, answered: false });
    expect(await outs(repo, conv.id)).toHaveLength(0);
  });
});

describe("mensagem duplicada", () => {
  it("duas mensagens do lead quase juntas geram UMA pergunta, não duas iguais", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "Preciso de um sistema de agendamento para a minha clínica", 5);
    await say(repo, leads[0].phoneE164!, "alô?", 7); // chegou antes de a 1ª resposta sair
    // a 1ª resposta ainda estava na fila quando a 2ª mensagem chegou: ela é refeita (uma só sai), em vez de sair duas vezes
    const list = await outs(repo, conv.id);
    const live = list.filter((m) => m.status !== "cancelled");
    expect(live).toHaveLength(1);
    expect(live[0].variant).toBe("agente+auto:q-dor");
    const redone = list.filter((m) => m.status === "cancelled");
    expect(redone).toHaveLength(1);
    expect(redone[0].error).toMatch(/escreveu de novo/);
  });

  it("a conversa não fica pedindo você só porque a resposta repetida foi segurada", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "Preciso de um sistema de agendamento para a minha clínica", 5);
    await say(repo, leads[0].phoneE164!, "alô?", 7);
    expect((await repo.getConversation(conv.id))!.status).toBe("active");
  });

  it("no envio, a segunda resposta idêntica é cancelada em vez de sair de novo", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    const body = "Entendi! Automação depende bastante do processo de vocês, por isso eu analiso antes de passar o valor. Como isso é feito hoje?";
    const mk = (at: Date) =>
      repo.createMessages([{ conversationId: conv.id, leadId: leads[0].id, direction: "out", kind: "reply", body, status: "approved", createdBy: "system", approvedAt: NOW.toISOString(), scheduledFor: at.toISOString() }]);
    const [m1] = await mk(plus(NOW, -2 * MIN));
    const [m2] = await mk(plus(NOW, -MIN));
    const provider = new Rec();
    expect(await tick({ repo, provider, now: NOW, rng, sleep })).toMatchObject({ action: "sent", messageId: m1.id });
    expect(await tick({ repo, provider, now: plus(NOW, 20_000), rng, sleep })).toMatchObject({ action: "cancelled", messageId: m2.id });
    expect(provider.sent).toEqual([body]);
    expect((await repo.getMessage(m2.id))!.error).toMatch(/repetida/);
  });

  it("o mesmo texto que o dono escreve de novo (manual) não é barrado", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    const mk = (at: Date) =>
      repo.createMessages([{ conversationId: conv.id, leadId: leads[0].id, direction: "out", kind: "reply", body: "Combinado!", status: "approved", createdBy: "user", approvedAt: NOW.toISOString(), scheduledFor: at.toISOString() }]);
    await mk(plus(NOW, -2 * MIN));
    await mk(plus(NOW, -MIN));
    const provider = new Rec();
    await tick({ repo, provider, now: NOW, rng, sleep });
    await tick({ repo, provider, now: plus(NOW, 20_000), rng, sleep });
    expect(provider.sent).toHaveLength(2);
  });

  it("a que já saiu só segura a repetição por 15 minutos: depois disso a pergunta pode ser feita de novo", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "Preciso de um sistema de agendamento para a minha clínica", 5);
    for (const m of await outs(repo, conv.id)) await repo.updateMessage(m.id, { status: "sent", sentAt: plus(NOW, 60_000).toISOString() });
    await say(repo, leads[0].phoneE164!, "alô?", 20 * 60);
    expect((await outs(repo, conv.id)).length).toBeGreaterThanOrEqual(2);
  });

  it("e dentro dos 15 minutos depois de sair, a mesma pergunta não é refeita", async () => {
    const { repo, leads } = await setup();
    const conv = await contacted(repo, leads[0]);
    await say(repo, leads[0].phoneE164!, "Preciso de um sistema de agendamento para a minha clínica", 5);
    for (const m of await outs(repo, conv.id)) await repo.updateMessage(m.id, { status: "sent", sentAt: plus(NOW, 60_000).toISOString() });
    await say(repo, leads[0].phoneE164!, "alô?", 5 * 60);
    expect(await outs(repo, conv.id)).toHaveLength(1);
  });
});
