import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { loadConversationBoard } from "@/lib/outreach/board";
import { handleMessageEvent } from "@/lib/outreach/engine";
import { isFormal, buildOpening, type TemplateLead } from "@/lib/outreach/templates";
import { openingUserPrompt } from "@/lib/outreach/opening";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import type { WebhookEvent } from "@/lib/outreach/webhook";
import { decideAuto } from "./autonomy";
import { composeReply } from "./compose";
import { simulationContext } from "./context";
import type { LlmClient } from "./llm";
import { buildSystemPrompt } from "./playbook";
import { rulesReply } from "./rules";
import { detectTopics } from "./topics";
import { TOPICS } from "./types";

/**
 * O que as conversas reais de 24 e 25/10/2026 ensinaram ao agente (docs/stories/6.9.story.md). Cada bloco guarda um erro que
 * aconteceu de verdade: o link do Instagram virando "já tenho site", a oferta falando do nome do Google, o lead impaciente depois do
 * Pix, o comprovante tratado como "arquivo que não abre" e a conversa solta recebendo promessa inventada.
 */

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
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = () => new Promise((r) => setTimeout(r, 3));

describe("assuntos que as conversas reais mostraram", () => {
  it.each([
    "oi! siga a gente no instagram https://www.instagram.com/clinicabela/",
    "nosso instagram: instagram.com/dra.heloisalima",
    "fala com a gente no wa.me/5585999999999",
    "https://linktr.ee/clinica",
    "veja o catálogo em https://api.whatsapp.com/send?phone=5585",
  ])("link de rede social em %j não vira 'já tenho site'", (text) => {
    expect(detectTopics(text)).not.toContain("has_site");
  });

  it.each(["meu site é clinicabela.com.br", "nosso site: www.clinicabela.com.br", "já tenho site", "o site é abelha.com"])("%j continua sendo 'já tenho site'", (text) => {
    expect(detectTopics(text)).toContain("has_site");
  });

  it.each([
    "vai resolver meu pedido ou nao?",
    "cadê o site?",
    "cade a chave pix",
    "alguma novidade?",
    "e aí, alguma notícia?",
    "como está o meu pedido?",
    "tá demorando hein",
    "estou esperando",
    "ainda não recebi nada",
  ])("%j é cobrança de andamento", (text) => {
    expect(detectTopics(text)[0]).toBe("status_check");
  });

  it.each(["como faço o pedido?", "cadê o meet", "quanto tempo demora?", "o pedido de vocês é por whatsapp?", "estou esperando um orçamento de outra empresa"])("%j NÃO é cobrança de andamento", (text) => {
    expect(detectTopics(text)[0]).not.toBe("status_check");
  });

  it.each(["já fiz o pix", "paguei", "pix feito", "segue o comprovante", "acabei de fazer o pix", "transferi agora", "fiz o pagamento"])("%j é aviso de pagamento", (text) => {
    expect(detectTopics(text)[0]).toBe("paid");
  });

  it.each(["como eu pago?", "pode ser pix?", "já fiz o site com um amigo", "o sinal é quanto?"])("%j NÃO é aviso de pagamento", (text) => {
    expect(detectTopics(text)[0]).not.toBe("paid");
  });

  it.each(["kkkkk", "kkk cadê o meet", "haha, boa", "me manda o link da reunião", "tô chegando", "vamos marcar um meet?", "😂"])("%j é conversa solta (o agente não inventa resposta)", (text) => {
    expect(detectTopics(text)[0]).toBe("casual");
  });

  it("emoji de ok vale como um ok", () => {
    expect(detectTopics("👍")).toEqual(["thanks"]);
    expect(detectTopics("🙏")).toEqual(["thanks"]);
  });

  it.each(["me passe por gentileza", "pode passar", "manda aí", "passa pra mim", "me envie por favor"])("%j, sem objeto, é um aceite", (text) => {
    expect(detectTopics(text)[0]).toBe("yes");
  });

  it("com objeto, 'me manda' segue o assunto de sempre", () => {
    expect(detectTopics("me manda o portfólio")[0]).toBe("send_info");
    expect(detectTopics("me manda um orçamento")[0]).toBe("price");
  });

  it("todo assunto novo existe na lista do agente", () => {
    for (const t of ["paid", "status_check", "casual"] as const) expect(TOPICS).toContain(t);
  });
});

describe("o agente em conversa com Pix", () => {
  const sent = [
    { from: "lead" as const, text: "quero um site para a clínica" },
    { from: "us" as const, text: "Ótimo! O que você mais quer que o site faça?", variant: "agente+auto:q-objetivo" },
    { from: "lead" as const, text: "mais contatos" },
    { from: "us" as const, text: "Anotado! Fica assim: o seu site sai por R$ 800, com entrega em até 7 dias. O sinal é de 50% e o restante na entrega. Posso te passar o Pix?", variant: "agente+auto:answer" },
    { from: "lead" as const, text: "pode" },
    { from: "us" as const, text: "Ótimo! O sinal é de R$ 400,00, por Pix, chave dono@exemplo.com. Assim que cair, eu começo o seu site.", variant: "agente+auto:yes" },
  ];
  const proposal = { status: "sent", title: "Site", amountCents: 80_000, entryPct: 50, deliveryDays: 7 } as const;
  const base = { history: sent, proposal, facts: { flow: "qualificar" as const, pixKey: "dono@exemplo.com", pixHolder: "Jonathan" } };

  it("impaciente depois do Pix: lembra o valor e a chave, sem dizer que 'falta' se ele já pagou", () => {
    const out = rulesReply(simulationContext({ text: "vai resolver meu pedido ou nao?", ...base }));
    expect(out.topic).toBe("status_check");
    expect(out.reply).toMatch(/Se você já fez o Pix do sinal de R\$\s?400, vou conferir agora/);
    expect(out.reply).toMatch(/dono@exemplo\.com/);
    expect(out.commits).toBe(true); // tem a chave Pix: só sai sozinho com "Pode fechar sozinho"
    expect(out.queued).toBe(true); // e o dono é avisado
    expect(out.reply).not.toMatch(/Vou confirmar o (contexto|link)/);
  });

  it("sem chave Pix cadastrada, não inventa: pede ao dono", () => {
    const out = rulesReply(simulationContext({ text: "cadê o site?", ...base, facts: { ...base.facts, pixKey: "" } }));
    expect(out.missing).toBe("pix_key");
    expect(out.handoff.needed).toBe(true);
  });

  it("'paguei' vira confirmação de recebimento e entrega ao dono conferir a conta", () => {
    const out = rulesReply(simulationContext({ text: "já fiz o pix", ...base }));
    expect(out.topic).toBe("paid");
    expect(out.reply).toBe("Recebi! Vou conferir o Pix aqui na conta e já te confirmo.");
    expect(out.queued).toBe(true);
    expect(out.nextAction?.kind).toBe("marcar_sinal");
    expect(out.handoff.reason).toMatch(/marque o sinal no Financeiro/);
  });

  it("a foto do comprovante não é 'arquivo que não consigo abrir'", () => {
    const out = rulesReply(simulationContext({ text: null, media: "image", ...base }));
    expect(out.topic).toBe("paid");
    expect(out.reply).toMatch(/^Recebi!/);
    expect(out.reply).not.toMatch(/não consigo abrir/);
    // o PDF do comprovante também
    expect(rulesReply(simulationContext({ text: null, media: "document", ...base })).topic).toBe("paid");
  });

  it("foto sem Pix combinado continua pedindo para escrever", () => {
    const out = rulesReply(simulationContext({ text: null, media: "image", facts: { flow: "qualificar" } }));
    expect(out.topic).toBe("media");
    expect(out.reply).toMatch(/por escrito/);
  });

  it("depois que o sinal caiu, cobrar o andamento chama o dono com a resposta real", () => {
    const out = rulesReply(simulationContext({ text: "alguma novidade do meu site?", ...base, proposal: { ...proposal, status: "entry_paid" } }));
    expect(out.topic).toBe("status_check");
    expect(out.reply).toBe("Vou ver o andamento aqui e já te respondo.");
    expect(out.handoff.reason).toMatch(/pagou o sinal/);
  });

  it("a oferta fala do 'seu site', não do nome que veio do Google", () => {
    const history = [
      { from: "us" as const, text: "Oi!" },
      { from: "lead" as const, text: "quero um site" },
      { from: "us" as const, text: "Ótimo! O que você mais quer que o site faça?", variant: "agente+auto:q-objetivo" },
      { from: "lead" as const, text: "mais contatos" },
      { from: "us" as const, text: "Anotado! Você já tem logo, fotos e textos do negócio, ou precisa que eu monte tudo?", variant: "agente+auto:q-material" },
    ];
    const out = rulesReply(simulationContext({ text: "tenho tudo", history, name: "Estética Teste Fabricio", facts: { flow: "qualificar" } }));
    expect(out.reply).toMatch(/o seu site sai por R\$\s?800/);
    expect(out.reply).not.toMatch(/Fabricio/);
  });

  it("a IA nunca escreve por cima de 'paguei', conversa solta nem cobrança com Pix", async () => {
    let calls = 0;
    const llm: LlmClient = {
      name: "teste",
      model: "teste",
      async complete() {
        calls++;
        return JSON.stringify({ reply: "Pode deixar, confirmo o link da reunião já!", topic: "other", asked: null, handoff: { needed: false, reason: null } });
      },
    };
    for (const text of ["já fiz o pix", "kkkk cadê o meet", "vai resolver meu pedido ou nao?"]) {
      const out = await composeReply(simulationContext({ text, ...base }), { llm });
      expect(out.source, text).toBe("rules");
    }
    expect(calls).toBe(0);
  });

  it("a cobrança com Pix só sai sozinha com 'Pode fechar sozinho'; o aviso de pagamento sai sempre que o modo semi está ligado", () => {
    const cfg = { autonomy: "semi" as const, autoClose: false, autoFreeform: false, autoMaxPerConversation: 10, autoMaxPerDay: 50, paused: false };
    const input = (text: string) => {
      const ctx = simulationContext({ text, ...base });
      return { cfg, out: rulesReply(ctx), humanTakenOver: false, blocked: false, inboundText: text, autoInConversation: 0, autoToday: 0 };
    };
    expect(decideAuto(input("vai resolver meu pedido ou nao?")).auto).toBe(false);
    expect(decideAuto({ ...input("vai resolver meu pedido ou nao?"), cfg: { ...cfg, autoClose: true } })).toMatchObject({ auto: true, notifyOwner: true });
    // "Recebi! Vou conferir o Pix" não mexe em dinheiro: sai, e o dono é avisado para conferir a conta
    expect(decideAuto(input("já fiz o pix"))).toMatchObject({ auto: true, notifyOwner: true });
  });

  it("conversa solta não ganha resposta: fica com o dono", () => {
    const out = rulesReply(simulationContext({ text: "kkkk cadê o meet", ...base }));
    expect(out.topic).toBe("casual");
    expect(out.reply).toBeNull();
    expect(out.handoff.needed).toBe(true);
  });
});

describe("o valor das Configurações é o preço do site simples (nunca 'a partir de')", () => {
  it.each([800, 900, 1000, 1250])("com R$ %i configurado, o agente diz exatamente esse valor, no preço e na oferta", (valor) => {
    // o espaço depois de "R$" é um espaço sem quebra (formatação em reais)
    const dinheiro = (verbo: string) => new RegExp(`${verbo} R\\$\\s${valor.toLocaleString("pt-BR").replace(".", "\\.")}\\b`);
    const price = rulesReply(simulationContext({ text: "quanto custa?", facts: { flow: "qualificar", priceFrom: valor } }));
    expect(price.reply).toMatch(dinheiro("fica em"));
    expect(price.reply).not.toMatch(/partem|a partir de|depende do que você precisa/i);

    const history = [
      { from: "us" as const, text: "Oi!" },
      { from: "lead" as const, text: "quero um site" },
      { from: "us" as const, text: "Ótimo! O que você mais quer que o site faça?", variant: "agente+auto:q-objetivo" },
      { from: "lead" as const, text: "mais contatos" },
      { from: "us" as const, text: "Anotado! Você já tem logo, fotos e textos do negócio, ou precisa que eu monte tudo?", variant: "agente+auto:q-material" },
    ];
    const offer = rulesReply(simulationContext({ text: "tenho tudo", history, facts: { flow: "qualificar", priceFrom: valor } }));
    expect(offer.reply).toMatch(dinheiro("sai por"));
  });

  it("a IA recebe o valor como fechado e a proibição de 'a partir de'", () => {
    const system = buildSystemPrompt(simulationContext({ text: "oi", facts: { flow: "qualificar", priceFrom: 900 } }).facts);
    expect(system).toMatch(/site simples fica em R\$\s?900/);
    expect(system).toMatch(/nunca diga "a partir de"/);
    expect(system).not.toMatch(/partem de/);
  });

  it("sistema continua sem valor fixo: é do dono", () => {
    const out = rulesReply(simulationContext({ text: "quanto custa um sistema?", facts: { flow: "qualificar", priceFrom: 900 } }));
    expect(out.reply).not.toMatch(/R\$/);
  });
});

describe("fluxo qualificar nunca volta ao texto da prévia sem custo", () => {
  const frases = [
    "oi", "quem é você", "quanto custa", "quanto tempo demora", "como funciona", "achei caro", "tem garantia", "como eu pago", "tem mensalidade",
    "já tenho site", "vou pensar", "agora não", "estou sem tempo", "sou a atendente", "gostei", "pode sim", "ok", "manda por email",
    "onde conseguiu meu número", "dá pra mudar a cor", "cadê o site", "já paguei", "alguma novidade", "me passe por gentileza", "kkk",
  ];
  for (const kind of ["none", "social", "weak", "real"] as const) {
    it(`site '${kind}': nenhuma resposta oferece prévia ou fala em prévia sem custo`, () => {
      for (const text of frases) {
        const out = rulesReply(simulationContext({ text, websiteKind: kind, facts: { flow: "qualificar", pixKey: "dono@exemplo.com" } }));
        if (!out.reply) continue;
        expect(out.reply, `${kind}/${text}`).not.toMatch(/pr[eé]via|sem custo/i);
      }
    });
  }
});

describe("advocacia e contabilidade: abordagem mais sóbria", () => {
  const lead = (over: Partial<TemplateLead>): TemplateLead => ({
    id: "lead-adv-1",
    name: "Tavares Lopes Advogados",
    neighborhood: "Aldeota",
    city: "Fortaleza",
    category: "Escritório de advocacia",
    niche: "Advocacia",
    rating: 5,
    reviewsCount: 40,
    websiteKind: "none",
    ...over,
  });
  const ctx = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor", flow: "qualificar" as const };

  it("reconhece o ramo pelo nicho, categoria ou nome", () => {
    expect(isFormal(lead({}))).toBe(true);
    expect(isFormal(lead({ niche: "Jurídico", category: null, name: "Dr. Silva" }))).toBe(true);
    expect(isFormal(lead({ niche: null, category: null, name: "Souza Contabilidade" }))).toBe(true);
    expect(isFormal(lead({ niche: "Estética", category: "Spa", name: "Clínica Bela" }))).toBe(false);
  });

  it("a abertura de modelo sempre começa com 'Olá', em qualquer ângulo", () => {
    for (let i = 0; i < 40; i++) {
      const o = buildOpening(lead({ id: `adv-${i}`, websiteKind: (["none", "social", "weak"] as const)[i % 3] }), ctx);
      expect(o.parts[0], o.body).toMatch(/^Olá!/);
    }
  });

  it("fora desse ramo a abertura continua podendo ser 'Oi'", () => {
    const greetings = new Set(Array.from({ length: 40 }, (_, i) => buildOpening(lead({ id: `est-${i}`, name: "Clínica Bela", niche: "Estética", category: "Spa" }), ctx).parts[0].split("!")[0]));
    expect(greetings.has("Oi")).toBe(true);
  });

  it("a IA recebe a instrução de registro sóbrio e sem promessa de resultado", () => {
    const l = lead({});
    const prompt = openingUserPrompt(l, ctx, { id: "x", label: "x", brief: "b", build: () => ["Olá! Sou o Jonathan Kelvin, desenvolvedor."] });
    expect(prompt).toMatch(/Registro: profissão de regras próprias de publicidade/);
    expect(prompt).toMatch(/Tom: sóbrio e respeitoso/);
    const normal = openingUserPrompt(lead({ name: "Clínica Bela", niche: "Estética", category: "Spa" }), ctx, { id: "x", label: "x", brief: "b", build: () => ["Oi!"] });
    expect(normal).not.toMatch(/Registro: profissão/);
  });
});

// ───────────────────────── pela engrenagem inteira (motor + banco em memória) ─────────────────────────

const inbound = (phone: string, text: string | null, media: "image" | null = null): Extract<WebhookEvent, { kind: "message" }> => ({
  kind: "message",
  providerMessageId: `IN${Math.random().toString(36).slice(2, 10)}`,
  phoneE164: phone,
  fromMe: false,
  text,
  media,
  timestamp: null,
});

async function setup(autoClose = true) {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar", pixKey: "88998594131", pixHolder: "Jonathan Kelvin Costa Sousa" });
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false, autoClose });
  return { repo, leads };
}

async function contacted(repo: MemoryRepo, lead: Lead, at: Date) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan Kelvin, desenvolvedor.", status: "sent", createdBy: "system", sentAt: at.toISOString(), providerMessageId: `OUT-${lead.id}` }]);
  await repo.setStage(lead.id, "contatado");
  await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: at.toISOString() });
  return conv;
}

const say = async (repo: MemoryRepo, phone: string, text: string | null, at: Date, media: "image" | null = null) => {
  const r = await handleMessageEvent(repo, inbound(phone, text, media), at, { rng });
  await pause();
  return r;
};

async function flush(repo: MemoryRepo, conversationId: string, at: Date) {
  for (const m of await repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], statuses: ["approved"], limit: 50 })) {
    await repo.updateMessage(m.id, { status: "sent", sentAt: at.toISOString() });
  }
}

const outs = (repo: MemoryRepo, conversationId: string) => repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], order: "asc", limit: 40 });

/** O lead fechou: oferta, "pode passar o Pix", proposta criada e chave enviada. */
async function closeDeal(repo: MemoryRepo, lead: Lead) {
  const conv = await contacted(repo, lead, plus(NOW, -2 * HOUR));
  await say(repo, lead.phoneE164!, "quero um site para a minha clínica", plus(NOW, 0));
  await say(repo, lead.phoneE164!, "quero mais contatos", plus(NOW, 120_000));
  await say(repo, lead.phoneE164!, "tenho logo e fotos", plus(NOW, 240_000));
  await flush(repo, conv.id, plus(NOW, 300_000));
  await say(repo, lead.phoneE164!, "pode passar o Pix", plus(NOW, 600_000));
  await flush(repo, conv.id, plus(NOW, 700_000));
  return conv;
}

describe("a conversa de ponta a ponta", () => {
  it("a oferta e o Pix falam do 'seu site' e o lead impaciente recebe a chave de novo", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await closeDeal(repo, lead);
    expect((await repo.listProposals({ leadId: lead.id, limit: 3 })).length).toBe(1);
    const bodies = (await outs(repo, conv.id)).map((m) => m.body);
    expect(bodies.some((b) => /o seu site sai por/.test(b))).toBe(true);
    expect(bodies.some((b) => /chave 88998594131/.test(b))).toBe(true);
    expect(bodies.join("\n")).not.toContain(lead.name);

    await say(repo, lead.phoneE164!, "vai resolver meu pedido ou nao?", plus(NOW, 2 * HOUR));
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toMatch(/Estou por aqui!/);
    expect(last.body).toMatch(/88998594131/);
    expect(last.status).toBe("approved"); // com "Pode fechar sozinho", sai sozinho
  });

  it("'paguei' manda 'Recebi!' sozinho e a conversa vai para Intervir com a ação de conferir o Pix", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await closeDeal(repo, lead);
    await say(repo, lead.phoneE164!, "já fiz o pix", plus(NOW, 2 * HOUR));
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toBe("Recebi! Vou conferir o Pix aqui na conta e já te confirmo.");
    expect(last.status).toBe("approved");
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");

    const { lanes } = await loadConversationBoard(repo);
    const intervir = lanes.find((l) => l.id === "intervir")!;
    expect(intervir.cards.map((c) => c.id)).toContain(conv.id);
    expect(intervir.cards.find((c) => c.id === conv.id)!.action).toBe("Conferir o Pix e marcar o sinal");
    expect(lanes.find((l) => l.id === "sinal")!.cards.map((c) => c.id)).not.toContain(conv.id);
  });

  it("a foto do comprovante recebe 'Recebi!' e não o aviso de arquivo que não abre", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await closeDeal(repo, lead);
    await say(repo, lead.phoneE164!, null, plus(NOW, 2 * HOUR), "image");
    const last = (await outs(repo, conv.id)).at(-1)!;
    expect(last.body).toMatch(/^Recebi! Vou conferir o Pix/);
  });

  it("conversa solta não gera resposta nenhuma e a conversa fica com você", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const conv = await closeDeal(repo, lead);
    const before = (await outs(repo, conv.id)).length;
    await say(repo, lead.phoneE164!, "kkkk cadê o meet", plus(NOW, 2 * HOUR));
    expect((await outs(repo, conv.id)).length).toBe(before);
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
  });
});
