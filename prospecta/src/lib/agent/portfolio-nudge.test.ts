import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { loadConversationBoard } from "@/lib/outreach/board";
import { handleMessageEvent, tick } from "@/lib/outreach/engine";
import type { ProviderStatus, WhatsAppProvider } from "@/lib/outreach/provider";
import type { WebhookEvent } from "@/lib/outreach/webhook";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { checkMessage } from "./humanize";
import { HAND_TO_OWNER_AFTER_MS, NUDGE_AFTER_MS, NUDGE_VARIANT, nudgeText, runNudges } from "./nudge";
import { portfolioUrl } from "./portfolio";
import { detectTopics } from "./topics";

const URL = "https://jk-portifolio.vercel.app/";
const PORTFOLIO_POLICY = `meu portfólio com alguns dos meus trabalhos ${URL}`;
const NOW = new Date("2026-10-26T13:00:00Z"); // segunda, 10:00 em Fortaleza (dentro da janela)
// o banco em memória carimba as mensagens com a hora da máquina: relógio fixo no mesmo dia do teste
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW, shouldAdvanceTime: true });
});
afterAll(() => {
  vi.useRealTimers();
});
const HOUR = 3_600_000;
const rng = () => 0.5;
const sleep = async () => {};
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = () => new Promise((r) => setTimeout(r, 3));

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

async function setup(over: { portfolio?: string; autoClose?: boolean } = {}) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar", policyPortfolio: over.portfolio ?? PORTFOLIO_POLICY, pixKey: "88998594131", pixHolder: "Jonathan Kelvin Costa Sousa" });
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false, autoClose: over.autoClose ?? true });
  return { repo, leads };
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

/** O lead já foi abordado (a abertura saiu há um tempo). */
async function contacted(repo: MemoryRepo, lead: Lead, at: Date) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan Kelvin, desenvolvedor.", status: "sent", createdBy: "system", sentAt: at.toISOString(), providerMessageId: `OUT-${lead.id}` }]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: at.toISOString() });
  return conv;
}

const say = async (repo: MemoryRepo, phone: string, text: string, at: Date) => {
  const r = await handleMessageEvent(repo, inbound(phone, text), at, { rng });
  await pause();
  return r;
};

/** Marca como enviadas (e com hora) as respostas aprovadas do agente, como se o worker já as tivesse mandado. */
async function flush(repo: MemoryRepo, conversationId: string, at: Date) {
  for (const m of await repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], statuses: ["approved"], limit: 50 })) {
    await repo.updateMessage(m.id, { status: "sent", sentAt: at.toISOString() });
  }
}

const outs = (repo: MemoryRepo, conversationId: string) => repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], order: "asc", limit: 40 });

describe("pedido de portfólio (a conversa do teste com o amigo)", () => {
  it.each([
    "antes de fecharmos, poderia me mostrar um pouco do seu trabalho?",
    "se tiver algum portifolio ou link do seu trabalho me envie.",
    "quero ver seus trabalhos",
    "tem exemplos de sites que você fez?",
    "me manda o portfólio",
    "pode me passar o link dos seus projetos?",
  ])("%j é um pedido de exemplos", (text) => {
    expect(detectTopics(text)[0]).toBe("send_info");
  });

  it.each(["preciso de um site para o meu trabalho", "quanto custa um site?", "gostei do seu trabalho", "o meu projeto é uma clínica"])("%j não é pedido de exemplos", (text) => {
    expect(detectTopics(text)[0]).not.toBe("send_info");
  });

  it("responde SÓ com o portfólio: sem 'vou separar' e sem pergunta de qualificação por cima", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    await say(repo, lead.phoneE164!, "oi tudo certo? você cria sites?", plus(NOW, 0));
    await say(repo, lead.phoneE164!, "antes de fecharmos, poderia me mostrar um pouco do seu trabalho?", plus(NOW, 90_000));
    const list = await outs(repo, conv.id);
    const last = list.at(-1)!;
    expect(last.body).toBe(PORTFOLIO_POLICY);
    expect(last.body).not.toMatch(/\?/);
    expect(last.body).not.toMatch(/separar|o que você mais quer/i);
    expect(last.status).toBe("approved"); // sai sozinho
  });

  it("depois do valor e do Pix, pedir o portfólio continua sendo só o link", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    await say(repo, lead.phoneE164!, "quero um site para a minha clínica", plus(NOW, 0));
    await say(repo, lead.phoneE164!, "quero mais contatos", plus(NOW, 120_000));
    await say(repo, lead.phoneE164!, "tenho logo e fotos", plus(NOW, 240_000));
    await flush(repo, conv.id, plus(NOW, 300_000));
    await say(repo, lead.phoneE164!, "pode passar o Pix", plus(NOW, 600_000));
    await flush(repo, conv.id, plus(NOW, 700_000));
    expect((await repo.listProposals({ leadId: lead.id, limit: 3 })).length).toBe(1);

    await say(repo, lead.phoneE164!, "se tiver algum portifolio ou link do seu trabalho me envie.", plus(NOW, 900_000));
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toBe(PORTFOLIO_POLICY);
    expect(last.body).not.toMatch(/\?/);
  });

  it("sem o endereço cadastrado, o agente avisa que manda e chama o dono para enviar", async () => {
    const { repo, leads } = await setup({ portfolio: "" });
    const conv = await contacted(repo, leads[0], plus(NOW, -2 * HOUR));
    await say(repo, leads[0].phoneE164!, "tem portfólio?", plus(NOW, 0));
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toMatch(/Já te mando alguns trabalhos/);
  });
});

describe("portfólio como prova antes de fechar", () => {
  it("a oferta do site já leva o convite a ver o trabalho, uma vez só", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    await say(repo, lead.phoneE164!, "quero um site para a minha clínica", plus(NOW, 0));
    await say(repo, lead.phoneE164!, "quero mais contatos", plus(NOW, 120_000));
    await say(repo, lead.phoneE164!, "tenho logo e fotos", plus(NOW, 240_000));
    const offer = (await outs(repo, conv.id)).find((m) => /R\$/.test(m.body))!;
    expect(offer.body).toMatch(/Posso te passar o Pix\?/);
    expect(offer.body).toContain(`Se quiser, dá uma olhada nos meus trabalhos antes de fechar: ${URL}`);
    expect(offer.body.split(URL)).toHaveLength(2); // o link aparece uma vez

    // uma segunda mensagem com valor na mesma conversa não repete o link
    await flush(repo, conv.id, plus(NOW, 300_000));
    await say(repo, lead.phoneE164!, "e o valor qual é mesmo?", plus(NOW, 400_000));
    const withPrice = (await outs(repo, conv.id)).filter((m) => /R\$/.test(m.body));
    expect(withPrice.filter((m) => m.body.includes(URL))).toHaveLength(1);
  });

  it("quem já pediu o portfólio não recebe o link de novo junto do valor", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    await say(repo, lead.phoneE164!, "quero um site para a minha clínica", plus(NOW, 0));
    await say(repo, lead.phoneE164!, "me manda o portfólio", plus(NOW, 60_000));
    await flush(repo, conv.id, plus(NOW, 120_000));
    await say(repo, lead.phoneE164!, "quanto custa?", plus(NOW, 180_000));
    const priceReply = (await outs(repo, conv.id)).filter((m) => /R\$/.test(m.body)).at(-1);
    if (priceReply) expect(priceReply.body.split(URL).length - 1).toBe(0);
  });

  it("sem endereço de portfólio cadastrado, nada é acrescentado", async () => {
    const { repo, leads } = await setup({ portfolio: "" });
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    await say(repo, lead.phoneE164!, "quero um site para a minha clínica", plus(NOW, 0));
    await say(repo, lead.phoneE164!, "quero mais contatos", plus(NOW, 120_000));
    await say(repo, lead.phoneE164!, "tenho logo e fotos", plus(NOW, 240_000));
    const offer = (await outs(repo, conv.id)).find((m) => /R\$/.test(m.body))!;
    expect(offer.body).not.toMatch(/trabalhos antes de fechar/);
  });

  it("o aviso 'vou analisar' de um sistema também leva o portfólio, enquanto o dono orça", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
    const steps = [
      "preciso de um sistema de agendamento online para a minha clínica de estética",
      "hoje é tudo no caderno e a recepção perde muita coisa",
      "a recepção e os clientes",
      "não",
      "uns 30 dias",
    ];
    for (const [i, t] of steps.entries()) await say(repo, lead.phoneE164!, t, plus(NOW, (i + 1) * 60_000));
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toMatch(/analisar com calma/);
    expect(last.body).toContain(URL);
  });

  it("o endereço sai do texto que o dono escreveu, sem a pontuação do fim", () => {
    expect(portfolioUrl("Veja meu trabalho em https://exemplo.com/portfolio.")).toBe("https://exemplo.com/portfolio");
    expect(portfolioUrl("sem endereço")).toBeNull();
    expect(portfolioUrl("")).toBeNull();
  });
});

describe("cutucada depois do silêncio", () => {
  /** Uma conversa que andou: o lead respondeu duas vezes e o agente mandou o portfólio (ou o valor) há `ago` horas. */
  async function engaged(repo: MemoryRepo, lead: Lead, ago: number, body = PORTFOLIO_POLICY, variant = "agente+auto:send_info") {
    const conv = await contacted(repo, lead, plus(NOW, -(ago + 3) * HOUR));
    for (const [i, text] of ["oi, quero um site", "mostrar serviços"].entries()) {
      await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "in", kind: "reply", body: text, status: "received", createdBy: "lead", sentAt: plus(NOW, -(ago + 2 - i) * HOUR).toISOString() }]);
    }
    await repo.updateConversation(conv.id, { lastInboundAt: plus(NOW, -(ago + 1) * HOUR).toISOString(), status: "active", unread: 0 });
    await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "out", kind: "reply", body, status: "sent", variant, createdBy: "system", sentAt: plus(NOW, -ago * HOUR).toISOString() }]);
    return conv;
  }

  const cfgOf = async (repo: MemoryRepo) => (await repo.getSettings()).automation;

  it("depois do silêncio, o agente cutuca UMA vez, dentro do horário, e só quem viu o portfólio", async () => {
    const { repo, leads } = await setup();
    const conv = await engaged(repo, leads[0], NUDGE_AFTER_MS / HOUR + 1);
    const r = await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true });
    expect(r).toMatchObject({ nudged: 1, handedToOwner: 0 });
    const nudge = (await outs(repo, conv.id)).at(-1)!;
    expect(nudge).toMatchObject({ status: "approved", variant: NUDGE_VARIANT, createdBy: "system", body: nudgeText("portfolio") });
    expect(Date.parse(nudge.scheduledFor!)).toBeGreaterThan(NOW.getTime());

    // rodar de novo não cutuca outra vez (a cutucada pendente ou enviada trava)
    await flush(repo, conv.id, plus(NOW, 60_000));
    expect(await runNudges(repo, plus(NOW, HOUR), await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
    expect((await outs(repo, conv.id)).filter((m) => m.variant === NUDGE_VARIANT)).toHaveLength(1);
  });

  it("antes do tempo de silêncio não cutuca", async () => {
    const { repo, leads } = await setup();
    await engaged(repo, leads[0], 1);
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
  });

  it("depois do valor, a cutucada fala do valor; com Pix na mão, fala do Pix", async () => {
    const { repo, leads } = await setup();
    const offerBody = "Ótimo! Então fica assim: o site sai por R$ 800, com entrega em até 7 dias. O sinal é de 50% e o restante na entrega. Posso te passar o Pix?";
    const conv = await engaged(repo, leads[0], 6, offerBody, "agente+auto:answer");
    await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true });
    expect((await outs(repo, conv.id)).at(-1)!.body).toBe(nudgeText("offer"));

    const other = await engaged(repo, leads[1], 6, offerBody, "agente+auto:answer");
    const [proposal] = await (async () => {
      const { createProposalFor, changeProposalStatus } = await import("@/lib/deals/service");
      const p = await createProposalFor(repo, { leadId: leads[1].id, title: "Site", amountCents: 80_000, entryPct: 50, deliveryDays: 7, demoId: null });
      await changeProposalStatus(repo, p.id, "sent", NOW);
      return [p];
    })();
    expect(proposal).toBeTruthy();
    await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true });
    expect((await outs(repo, other.id)).at(-1)!.body).toBe(nudgeText("pix"));
  });

  it("não cutuca quem não conversou, quem o dono assumiu, quem já fechou nem quem recebeu algo que não é portfólio nem valor", async () => {
    const { repo, leads } = await setup();
    const a = await engaged(repo, leads[0], 6);
    await repo.updateConversation(a.id, { humanTakenOver: true });
    const b = await engaged(repo, leads[1], 6);
    await repo.setStage(leads[1].id, "ganho");
    const c = await engaged(repo, leads[2], 6, "Entendi! Qual é o objetivo do site?", "agente+auto:q-objetivo");
    // d: só uma mensagem do lead (não conversou)
    const d = await engaged(repo, leads[3], 6);
    const inboundOfD = await repo.listMessages({ conversationId: d.id, direction: "in", limit: 5 });
    await repo.bulkUpdateMessages(inboundOfD.slice(1).map((m) => m.id), ["received"], { status: "cancelled" });
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
    for (const x of [a, b, c, d]) expect((await outs(repo, x.id)).some((m) => m.variant === NUDGE_VARIANT)).toBe(false);
  });

  it("só com 'Pode fechar sozinho' ligado, fora da pausa e dentro do horário de envio", async () => {
    const { repo, leads } = await setup({ autoClose: false });
    await engaged(repo, leads[0], 6);
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
    await repo.saveAutomation({ autoClose: true, paused: true });
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
    await repo.saveAutomation({ paused: false });
    expect(await runNudges(repo, new Date("2026-10-26T04:00:00Z"), await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 }); // 01:00 em Fortaleza
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 1 });
  });

  it("respeita o teto de respostas do agente por conversa", async () => {
    const { repo, leads } = await setup();
    await engaged(repo, leads[0], 6);
    await repo.saveAutomation({ autoMaxPerConversation: 1 });
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0 });
  });

  it("um dia depois da cutucada, sem resposta, a conversa vem para o dono fechar à mão", async () => {
    const { repo, leads } = await setup();
    const conv = await engaged(repo, leads[0], 30);
    await repo.createMessages([{ conversationId: conv.id, leadId: leads[0].id, direction: "out", kind: "reply", body: nudgeText("portfolio"), status: "sent", variant: NUDGE_VARIANT, createdBy: "system", sentAt: plus(NOW, -(HAND_TO_OWNER_AFTER_MS + HOUR)).toISOString() }]);
    expect(await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true })).toMatchObject({ nudged: 0, handedToOwner: 1 });
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    // e o quadro de Conversas diz por quê
    const card = (await loadConversationBoard(repo)).lanes.flatMap((l) => l.cards).find((c) => c.id === conv.id)!;
    expect(card.action).toMatch(/Sumiu depois do portfólio ou do valor/);
    // não repete: a conversa já está com o dono
    expect(await runNudges(repo, plus(NOW, HOUR), await cfgOf(repo), rng, { force: true })).toMatchObject({ handedToOwner: 0 });
  });

  it("se o lead responde à cutucada, a conversa segue normal (nada vai para o dono)", async () => {
    const { repo, leads } = await setup();
    const conv = await engaged(repo, leads[0], 6);
    await runNudges(repo, NOW, await cfgOf(repo), rng, { force: true });
    await flush(repo, conv.id, plus(NOW, 60_000));
    await say(repo, leads[0].phoneE164!, "vi sim, gostei! pode passar o valor", plus(NOW, 2 * HOUR));
    expect(await runNudges(repo, plus(NOW, HOUR * 30), await cfgOf(repo), rng, { force: true })).toMatchObject({ handedToOwner: 0 });
  });

  it("os textos da cutucada passam no humanizador e têm uma pergunta só", () => {
    for (const kind of ["portfolio", "offer", "pix"] as const) {
      const text = nudgeText(kind);
      expect(checkMessage(text, "reply").ok, text).toBe(true);
      expect(text.match(/\?/g)?.length, text).toBe(1);
      expect(text).not.toMatch(/R\$|https?:\/\//);
    }
  });

  it("o worker faz a varredura: depois de rodar, a cutucada está na fila e sai no horário", async () => {
    const { repo, leads } = await setup();
    const conv = await engaged(repo, leads[0], 6);
    const provider = new Rec();
    await tick({ repo, provider, now: NOW, rng, sleep });
    const nudge = (await outs(repo, conv.id)).find((m) => m.variant === NUDGE_VARIANT);
    expect(nudge?.status).toBe("approved");
    await tick({ repo, provider, now: plus(NOW, 5 * 60_000), rng, sleep });
    expect(provider.sent).toContain(nudgeText("portfolio"));
  });
});
