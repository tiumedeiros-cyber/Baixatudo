import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { AUTO_REPLY_VARIANT } from "./autoreply";
import { loadConversationBoard } from "./board";
import { cleanRobotConversations, findRobotConversations } from "./robot-cleanup";

const NOW = new Date("2026-10-25T12:00:00Z");
const at = (min: number) => new Date(NOW.getTime() + min * 60_000).toISOString();

// os textos de robô que chegaram de verdade em 24/10 (prints do dono)
const AUSENCIA = "Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível.\n\n*mensagem automática*.";
const MENU =
  "É um prazer ter você por aqui. ✨ Somos um espaço especializado em realçar a sua beleza com naturalidade, segurança e protocolos exclusivos, pensados de forma personalizada para cada paciente. 💎 Me conta como posso te direcionar: 1️⃣ Agendar meu momento de autocuidado 2️⃣ Acessar o catálogo de serviços 3️⃣ Cursos / Mentoria 4️⃣ Outros Conheça mais sobre nosso trabalho: https://www.instagram.com/dra.heloisalima";

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  return { repo, leads };
}

/** Como ficava no banco ANTES de o motor reconhecer robô: a mensagem entra como resposta de verdade. */
async function oldStyleReply(repo: MemoryRepo, lead: Lead, texts: string[], opts: { withDraft?: boolean; stage?: Lead["stage"] } = {}) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan Kelvin, desenvolvedor.", status: "sent", createdBy: "system", sentAt: at(0), providerMessageId: `OUT-${lead.id}` },
  ]);
  for (const [i, body] of texts.entries()) {
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "in", kind: "reply", body, status: "received", intent: "interested", createdBy: "lead", sentAt: at(1 + i), providerMessageId: `IN-${lead.id}-${i}` },
    ]);
  }
  if (opts.withDraft) {
    await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "reply", body: "Oi! Me conta o que você precisa.", status: "draft", createdBy: "system", variant: "agente:greeting" },
    ]);
  }
  await repo.setStage(lead.id, opts.stage ?? "respondeu");
  await repo.updateConversation(conv.id, { status: "awaiting_human", lastInboundAt: at(1), unread: texts.length, touches: 1, lastOutboundAt: at(0) });
  return conv;
}

describe("consertar conversas em que quem respondeu foi um robô", () => {
  it("acha só as conversas em que TODA mensagem recebida é de robô", async () => {
    const { repo, leads } = await setup();
    const bot = await oldStyleReply(repo, leads[0], [AUSENCIA], { withDraft: true });
    await oldStyleReply(repo, leads[1], ["Oi, tudo bem? Pode falar, é a Ana."]); // pessoa de verdade
    await oldStyleReply(repo, leads[2], [AUSENCIA, "Oi! Aqui é o Rafael, pode falar"]); // robô e depois a pessoa

    const found = await findRobotConversations(repo);
    expect(found.map((f) => f.conversationId)).toEqual([bot.id]);
    expect(found[0]).toMatchObject({ leadName: leads[0].name, robotMessages: 1, unsentReplies: 1, sentReplies: 0, kind: "Aviso de ausência", resetsStage: true });
    expect(found[0].sample).toMatch(/^Agradecemos sua mensagem/);
  });

  it("achar não muda nada no banco", async () => {
    const { repo, leads } = await setup();
    const conv = await oldStyleReply(repo, leads[0], [MENU], { withDraft: true });
    await findRobotConversations(repo);
    expect(await repo.getConversation(conv.id)).toMatchObject({ status: "awaiting_human", unread: 1 });
    expect((await repo.getLead(leads[0].id))!.stage).toBe("respondeu");
  });

  it("conserta: marca a mensagem, devolve a conversa a 'sem resposta', volta a etapa e cancela o rascunho, sem apagar nada", async () => {
    const { repo, leads } = await setup();
    const conv = await oldStyleReply(repo, leads[0], [AUSENCIA, MENU], { withDraft: true });
    const before = await repo.listMessages({ conversationId: conv.id, limit: 50 });

    const r = await cleanRobotConversations(repo);
    expect(r).toMatchObject({ fixed: 1, messagesMarked: 2, repliesCancelled: 1 });

    const after = await repo.listMessages({ conversationId: conv.id, limit: 50 });
    expect(after).toHaveLength(before.length); // nenhuma mensagem some
    const robots = after.filter((m) => m.direction === "in");
    expect(robots.every((m) => m.variant === AUTO_REPLY_VARIANT && m.intent === "other")).toBe(true);
    expect(robots.map((m) => m.body)).toEqual(before.filter((m) => m.direction === "in").map((m) => m.body)); // o texto continua igual
    const draft = after.find((m) => m.kind === "reply" && m.direction === "out")!;
    expect(draft).toMatchObject({ status: "cancelled", body: "Oi! Me conta o que você precisa." });
    expect(draft.error).toMatch(/robô/);

    expect(await repo.getConversation(conv.id)).toMatchObject({ status: "active", lastInboundAt: null, unread: 0 });
    expect((await repo.getLead(leads[0].id))!.stage).toBe("contatado");
    const events = await repo.listEvents({ leadId: leads[0].id, limit: 10 });
    expect(events.some((e) => e.type === "automacao" && /era de um robô/.test(String(e.payload.text)))).toBe(true);
    expect((await repo.messageCounts()).conversationsReplied).toBe(0);
  });

  it("depois de consertar, a conversa cai em 'Sem resposta' no quadro e sai de 'Intervir'", async () => {
    const { repo, leads } = await setup();
    const conv = await oldStyleReply(repo, leads[0], [MENU], { withDraft: true });
    const lanesBefore = (await loadConversationBoard(repo)).lanes;
    expect(lanesBefore.find((l) => l.id === "intervir")!.cards.map((c) => c.id)).toContain(conv.id);

    await cleanRobotConversations(repo);
    const lanes = (await loadConversationBoard(repo)).lanes;
    expect(lanes.find((l) => l.id === "sem_resposta")!.cards.map((c) => c.id)).toContain(conv.id);
    expect(lanes.find((l) => l.id === "intervir")!.cards.map((c) => c.id)).not.toContain(conv.id);
  });

  it("é seguro rodar de novo: o que foi consertado não aparece mais", async () => {
    const { repo, leads } = await setup();
    await oldStyleReply(repo, leads[0], [AUSENCIA]);
    expect((await cleanRobotConversations(repo)).fixed).toBe(1);
    expect(await findRobotConversations(repo)).toEqual([]);
    expect((await cleanRobotConversations(repo)).fixed).toBe(0);
  });

  it("não mexe na etapa de quem já passou de 'Respondeu'", async () => {
    const { repo, leads } = await setup();
    await oldStyleReply(repo, leads[0], [AUSENCIA], { stage: "proposta" });
    await cleanRobotConversations(repo);
    expect((await repo.getLead(leads[0].id))!.stage).toBe("proposta");
  });

  it("respeita quem o dono já assumiu ou já respondeu à mão", async () => {
    const { repo, leads } = await setup();
    const taken = await oldStyleReply(repo, leads[0], [AUSENCIA]);
    await repo.updateConversation(taken.id, { humanTakenOver: true });
    const answered = await oldStyleReply(repo, leads[1], [AUSENCIA]);
    await repo.createMessages([
      { conversationId: answered.id, leadId: leads[1].id, direction: "out", kind: "reply", body: "Oi, aqui é o Jonathan!", status: "sent", createdBy: "user", sentAt: at(30), providerMessageId: "MAN-1" },
    ]);
    expect(await findRobotConversations(repo)).toEqual([]);
  });

  it("conserta só as conversas escolhidas, quando pedido", async () => {
    const { repo, leads } = await setup();
    const a = await oldStyleReply(repo, leads[0], [AUSENCIA]);
    const b = await oldStyleReply(repo, leads[1], [MENU]);
    const r = await cleanRobotConversations(repo, [a.id]);
    expect(r.fixed).toBe(1);
    expect((await repo.getConversation(a.id))!.status).toBe("active");
    expect((await repo.getConversation(b.id))!.status).toBe("awaiting_human");
  });

  it("conta o que o agente já tinha mandado ao robô (isso não dá para desfazer)", async () => {
    const { repo, leads } = await setup();
    const conv = await oldStyleReply(repo, leads[0], [AUSENCIA]);
    await repo.createMessages([
      { conversationId: conv.id, leadId: leads[0].id, direction: "out", kind: "reply", body: "Oi! Posso te ajudar?", status: "sent", createdBy: "system", sentAt: at(5), providerMessageId: "AG-1" },
    ]);
    const [item] = await findRobotConversations(repo);
    expect(item).toMatchObject({ sentReplies: 1, unsentReplies: 0 });
    const r = await cleanRobotConversations(repo);
    expect(r.repliesCancelled).toBe(0);
  });
});

describe("consertar: respostas que só se reconhecem pelo tempo (26/10)", () => {
  const RECEBEMOS = "Recebemos sua proposta sobre criação de site. Já encaminhei para nossa equipe e alguém responderá aqui neste chat.";
  const INTAKE = "Olá! Para agilizar seu atendimento. Diga seu serviço e horário. Se ainda não tem cadastro aqui, passe seu E-mail e CPF por gentileza. Obrigado!";

  it("o recebimento que chegou 1 minuto depois da abordagem aparece para consertar; o que chegou horas depois, não", async () => {
    const { repo, leads } = await setup();
    const rapido = await oldStyleReply(repo, leads[0], [RECEBEMOS]); // chega 1 min depois da abertura
    // o mesmo texto, de uma pessoa, 5 horas depois
    const lento = await repo.ensureConversation(leads[1].id, leads[1].phoneE164!);
    await repo.createMessages([
      { conversationId: lento.id, leadId: leads[1].id, direction: "out", kind: "opening", body: "Oi! Sou o Jonathan Kelvin.", status: "sent", createdBy: "system", sentAt: at(0) },
      { conversationId: lento.id, leadId: leads[1].id, direction: "in", kind: "reply", body: RECEBEMOS, status: "received", intent: "other", createdBy: "lead", sentAt: at(300) },
    ]);
    await repo.updateConversation(lento.id, { status: "awaiting_human", lastInboundAt: at(300), unread: 1, touches: 1, lastOutboundAt: at(0) });

    const found = await findRobotConversations(repo);
    expect(found.map((f) => f.conversationId)).toEqual([rapido.id]);
    expect(found[0].kind).toBe("Recebimento automático");
  });

  it("a recepção que pede e-mail e CPF aparece mesmo sem o tempo, e conserta como as outras", async () => {
    const { repo, leads } = await setup();
    const conv = await oldStyleReply(repo, leads[0], [INTAKE], { withDraft: true });
    const found = await findRobotConversations(repo);
    expect(found).toHaveLength(1);
    expect(found[0].kind).toBe("Atendimento automático que pede seus dados");

    const r = await cleanRobotConversations(repo);
    expect(r).toMatchObject({ fixed: 1, messagesMarked: 1, repliesCancelled: 1 });
    const inbound = (await repo.listMessages({ conversationId: conv.id, direction: "in", limit: 5 }))[0];
    expect(inbound.variant).toBe(AUTO_REPLY_VARIANT);
    expect((await repo.getConversation(conv.id))!.lastInboundAt).toBeNull();
  });
});
