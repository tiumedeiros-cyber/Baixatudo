import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { BANDS, LANES, laneOf, loadConversationBoard, summaryLine, type BoardLane, type LaneId } from "./board";
import { handleMessageEvent } from "./engine";
import { previewOf } from "./preview";
import type { WebhookEvent } from "./webhook";
import type { Message } from "./types";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const MIN = 60_000;
const rng = () => 0.5;
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = (ms = 3) => new Promise((r) => setTimeout(r, ms));

const conv = (over: Partial<Parameters<typeof laneOf>[0]> = {}): Parameters<typeof laneOf>[0] => ({
  status: "active",
  humanTakenOver: false,
  lastInboundAt: "2026-10-22T13:01:00Z",
  ...over,
});

describe("laneOf: quem precisa agir", () => {
  it("encerrada e bloqueada vão para o fim, mesmo que a ficha peça algo", () => {
    expect(laneOf(conv({ status: "closed" }), { nextAction: { kind: "responder", label: "x" }, proposal: null })).toBe("encerradas");
    expect(laneOf(conv({ status: "opted_out" }), null)).toBe("encerradas");
  });

  it("quem nunca respondeu fica em Sem resposta", () => {
    expect(laneOf(conv({ lastInboundAt: null }), null)).toBe("sem_resposta");
  });

  it("esperando o dono: a ação da ficha escolhe a raia, e o resto cai em Intervir", () => {
    const wait = (kind: string) => laneOf(conv({ status: "awaiting_human" }), { nextAction: { kind: kind as never, label: "x" }, proposal: null });
    expect(wait("orcar_sistema")).toBe("criar");
    expect(wait("fazer_previa")).toBe("criar");
    expect(wait("ajustar_previa")).toBe("criar");
    expect(wait("criar_proposta")).toBe("fechar");
    expect(wait("enviar_proposta")).toBe("fechar");
    expect(wait("marcar_sinal")).toBe("sinal");
    expect(wait("responder")).toBe("intervir");
    expect(wait("ouvir_audio")).toBe("intervir");
    expect(laneOf(conv({ status: "awaiting_human" }), null)).toBe("intervir");
  });

  it("proposta enviada ou aceita espera o sinal; rascunho não", () => {
    const withProposal = (status: string) => ({ nextAction: { kind: "esperar" as const, label: "x" }, proposal: { status, amountCents: 80_000 } as never });
    expect(laneOf(conv(), withProposal("sent"))).toBe("sinal");
    expect(laneOf(conv(), withProposal("accepted"))).toBe("sinal");
    expect(laneOf(conv(), withProposal("draft"))).toBe("agente");
  });

  it("sem pendência, é do agente; se o dono assumiu, é dele", () => {
    expect(laneOf(conv(), null)).toBe("agente");
    expect(laneOf(conv({ humanTakenOver: true }), null)).toBe("voce");
  });

  it("toda raia está em exatamente uma faixa", () => {
    const inBands = BANDS.flatMap((b) => b.lanes).sort();
    expect(inBands).toEqual(LANES.map((l) => l.id).sort());
  });
});

describe("summaryLine", () => {
  it("sistema mostra o que precisa fazer; site mostra o objetivo", () => {
    expect(summaryLine({ product: "sistema", answers: { escopo: "agendamento online", objetivo: "x" } })).toBe("agendamento online");
    expect(summaryLine({ product: "site", answers: { objetivo: "mais contatos", material: "logo" } })).toBe("mais contatos");
    expect(summaryLine({ product: null, answers: {} })).toBeNull();
  });

  it("corta texto longo", () => {
    const out = summaryLine({ product: "sistema", answers: { escopo: "a ".repeat(200) } })!;
    expect(out.length).toBeLessThanOrEqual(110);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("previewOf", () => {
  const msg = (over: Partial<Message>): Message => ({ direction: "out", status: "sent", body: "oi", ...over }) as Message;
  it("rascunho e agendada não parecem enviadas; cancelada some", () => {
    expect(previewOf(msg({ direction: "in", body: "quanto custa?" }))).toBe("quanto custa?");
    expect(previewOf(msg({ status: "sent" }))).toBe("Você: oi");
    expect(previewOf(msg({ status: "draft" }))).toBe("Rascunho: oi");
    expect(previewOf(msg({ status: "approved" }))).toBe("Agendada: oi");
    expect(previewOf(msg({ status: "failed" }))).toBe("Falhou: oi");
    expect(previewOf(msg({ status: "cancelled" }))).toBeNull();
  });
});

describe("loadConversationBoard", () => {
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

  /** Um lead já abordado: a abertura saiu e a conversa existe. */
  async function contacted(repo: MemoryRepo, lead: Awaited<ReturnType<typeof setup>>["leads"][number]) {
    const c = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const [m] = await repo.createMessages([
      { conversationId: c.id, leadId: lead.id, direction: "out", kind: "opening", body: `Olá ${lead.name}`, status: "sent", createdBy: "system", sentAt: NOW.toISOString() },
    ]);
    await repo.updateMessage(m.id, { providerMessageId: `OUT-${lead.id}` });
    await repo.setStage(lead.id, "contatado");
    await repo.updateConversation(c.id, { touches: 1, lastOutboundAt: NOW.toISOString() });
    return c;
  }

  const inbound = (phone: string, text: string | null, over: Partial<Extract<WebhookEvent, { kind: "message" }>> = {}): Extract<WebhookEvent, { kind: "message" }> => ({
    kind: "message",
    providerMessageId: `IN${Math.random().toString(36).slice(2, 10)}`,
    phoneE164: phone,
    fromMe: false,
    text,
    media: null,
    timestamp: null,
    ...over,
  });
  const say = async (repo: MemoryRepo, phone: string, text: string | null, minute: number, over: Parameters<typeof inbound>[2] = {}) => {
    await handleMessageEvent(repo, inbound(phone, text, over), plus(NOW, minute * MIN), { rng });
    await pause();
  };
  const lane = (lanes: BoardLane[], id: LaneId) => lanes.find((l) => l.id === id)!;

  it("sem conversas: todas as raias vazias, na ordem", async () => {
    const { repo } = await setup();
    const { lanes, total } = await loadConversationBoard(repo);
    expect(total).toBe(0);
    expect(lanes.map((l) => l.id)).toEqual(LANES.map((l) => l.id));
    expect(lanes.every((l) => l.cards.length === 0 && l.total === 0)).toBe(true);
  });

  it("cada conversa cai na raia certa e o cartão traz o resumo", async () => {
    const { repo, leads } = await setup();
    const [silent, system, doubt, audio, gone] = leads;

    await contacted(repo, silent);

    const systemConv = await contacted(repo, system);
    await say(repo, system.phoneE164!, "preciso de um sistema de agendamento online para a minha clínica de estética", 1);
    await say(repo, system.phoneE164!, "hoje é tudo no caderno e a recepção perde muita coisa", 3);
    await say(repo, system.phoneE164!, "a recepção e os clientes", 5);
    await say(repo, system.phoneE164!, "não", 7);
    await say(repo, system.phoneE164!, "uns 30 dias", 9);

    // com a autonomia semi o agente responde o que é seguro; "como funciona" mas com dúvida de preço vai para o dono
    const doubtConv = await contacted(repo, doubt);
    await say(repo, doubt.phoneE164!, "vocês trabalham com contrato de fidelidade e nota fiscal?", 2);

    const audioConv = await contacted(repo, audio);
    await say(repo, audio.phoneE164!, null, 2, { media: "audio" });

    const goneConv = await contacted(repo, gone);
    await say(repo, gone.phoneE164!, "PARE", 2);

    const { lanes, total } = await loadConversationBoard(repo);
    expect(total).toBe(5);

    expect(lane(lanes, "sem_resposta").cards.map((c) => c.leadName)).toEqual([silent.name]);
    expect(lane(lanes, "sem_resposta").cards[0].preview).toMatch(/^Você: Olá /);

    const criar = lane(lanes, "criar");
    expect(criar.cards.map((c) => c.id)).toEqual([systemConv.id]);
    expect(criar.cards[0]).toMatchObject({ product: "sistema", action: expect.stringMatching(/Analisar o sistema/) });
    expect(criar.cards[0].summary).toMatch(/sistema de agendamento online/);
    expect(criar.cards[0].waitingSince).not.toBeNull();

    expect(lane(lanes, "intervir").cards.map((c) => c.id)).toEqual(expect.arrayContaining([audioConv.id]));
    // o agente já respondeu "não consigo ouvir áudio", mas a conversa continua sendo sua: o cartão nunca diz "esperar"
    expect(lane(lanes, "intervir").cards.find((c) => c.id === audioConv.id)!.action).toMatch(/responder/i);
    expect(lane(lanes, "intervir").cards.every((c) => c.action && !/esperar/i.test(c.action))).toBe(true);
    // dúvida fora do roteiro (contrato, nota fiscal) também é só sua
    expect(lane(lanes, "intervir").cards.map((c) => c.id)).toContain(doubtConv.id);

    expect(lane(lanes, "encerradas").cards.map((c) => c.id)).toEqual([goneConv.id]);
    expect(lane(lanes, "encerradas").cards[0].waitingSince).toBeNull();

    // o total das raias fecha com o total de conversas
    expect(lanes.reduce((n, l) => n + l.total, 0)).toBe(5);
  });

  it("nas raias do dono quem espera há mais tempo vem primeiro", async () => {
    const { repo, leads } = await setup();
    const [a, b] = leads;
    const ca = await contacted(repo, a);
    const cb = await contacted(repo, b);
    await say(repo, b.phoneE164!, null, 2, { media: "audio" }); // b chamou primeiro
    await say(repo, a.phoneE164!, null, 8, { media: "audio" });
    const { lanes } = await loadConversationBoard(repo);
    expect(lane(lanes, "intervir").cards.map((c) => c.id)).toEqual([cb.id, ca.id]);
  });

  it("proposta enviada vai para Aguardando o sinal, com o valor", async () => {
    const { repo, leads } = await setup();
    const lead = leads[0];
    const c = await contacted(repo, lead);
    await repo.saveSettings({ pixKey: "chave@pix.com", pixHolder: "Jonathan K." });
    await repo.saveAutomation({ autoClose: true });
    await say(repo, lead.phoneE164!, "quero um site para a minha clínica", 1);
    await say(repo, lead.phoneE164!, "quero receber mais contatos pelo WhatsApp", 3);
    await say(repo, lead.phoneE164!, "tenho logo e fotos", 5);
    await say(repo, lead.phoneE164!, "pode passar o Pix", 7);
    const { lanes } = await loadConversationBoard(repo);
    const sinal = lane(lanes, "sinal");
    expect(sinal.cards.map((x) => x.id)).toEqual([c.id]);
    expect(sinal.cards[0]).toMatchObject({ amountCents: 80_000, product: "site" });
  });
});
