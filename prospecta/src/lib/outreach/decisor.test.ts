import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decisorFromText, decisorFromTexts, ofDecisor } from "@/lib/agent/decisor";
import { simulationContext } from "@/lib/agent/context";
import { rulesReply } from "@/lib/agent/rules";
import { detectTopics } from "@/lib/agent/topics";
import { lintMessage } from "@/lib/agent/humanize";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { handleMessageEvent } from "./engine";
import { referralOpening } from "./referral";
import type { WebhookEvent } from "./webhook";

/**
 * Quem responde a uma clínica quase sempre é a recepção. Os textos abaixo chegaram de verdade em 29/10 (Ora Clinic e ORALLIS).
 * O que vale é o contato de quem decide: o agente guarda, pede o que falta e deixa a abertura para essa pessoa como rascunho.
 */

describe("o que a recepção disse sobre quem decide", () => {
  it("Ora Clinic: o nome em uma mensagem, quem passou em outra", () => {
    const d = decisorFromTexts(["Olá Jonathan, bom dia!", "Sou a Ju, recepcionista da Oraclinic", "A Dra.Joyce ficar responsável pela divulgação"]);
    expect(d).toMatchObject({ name: "Dra. Joyce", pronoun: "ela", phone: null, via: "Ju, recepcionista", viaName: "Ju" });
  });

  it("ORALLIS: a consultora fala dos doutores (vale o primeiro) e o negrito do WhatsApp não atrapalha", () => {
    const d = decisorFromTexts(["Bom dia, S. Jonathan! Me chamo Letícia, consultora na clínica *ORALLIS*, e responsável pelos agendamentos com a *Dra. Juliana* e *Dr. Giovanni Vieira*"]);
    expect(d).toMatchObject({ name: "Dra. Juliana", pronoun: "ela", via: "Letícia, consultora" });
  });

  it("com celular e horário", () => {
    const d = decisorFromTexts(["Sou a Ju, recepcionista", "Fala com o Dr. Marcos, o número dele é (85) 99123-4567, melhor amanhã de manhã"]);
    expect(d).toMatchObject({ name: "Dr. Marcos", pronoun: "ele", phone: "+5585991234567", phoneDisplay: "(85) 99123-4567", when: "amanhã de manhã", viaName: "Ju" });
  });

  it("só o telefone (sem título e sem nome)", () => {
    expect(decisorFromText("pode chamar no 85 98888-7766 depois das 14h")).toMatchObject({ phone: "+5585988887766", when: "depois das 14h" });
  });

  it("nome sem título", () => {
    expect(decisorFromText("O responsável é o Marcelo")).toMatchObject({ name: "Marcelo", pronoun: null });
    expect(decisorFromText("fala com a Joyce")).toMatchObject({ name: "Joyce" });
  });

  it("quem se apresenta como a Dra. não aponta outra pessoa: é quem decide falando", () => {
    expect(decisorFromTexts(["Sou a Dra. Joyce, pode falar"])).toBeNull();
    expect(decisorFromTexts(["Oi, tudo bem? Como posso ajudar?"])).toBeNull();
  });

  it("concordância: da Dra., do Dr., dela", () => {
    expect(ofDecisor({ name: "Dra. Joyce", pronoun: "ela" })).toBe("da Dra. Joyce");
    expect(ofDecisor({ name: "Dr. Marcos", pronoun: "ele" })).toBe("do Dr. Marcos");
    expect(ofDecisor({ name: null, pronoun: null })).toBe("dela");
  });
});

describe("a recepção é reconhecida", () => {
  it.each([
    "Sou a Ju, recepcionista da Oraclinic",
    "A Dra.Joyce ficar responsável pela divulgação",
    "Me chamo Letícia, consultora na clínica ORALLIS",
    "Sou a secretária, a doutora não está",
    "o marketing quem cuida é a Dra. Joyce",
    "vou repassar para a doutora",
  ])("%s", (text) => {
    expect(detectTopics(text, null, "qualificar")[0]).toBe("gatekeeper");
  });

  it("quem decide falando não é recepção", () => {
    expect(detectTopics("eu sou o responsável pelo marketing", null, "qualificar")[0]).not.toBe("gatekeeper");
    expect(detectTopics("Sou a dona da clínica", null, "qualificar")[0]).not.toBe("gatekeeper");
    expect(detectTopics("Olá Jonathan! Me chamo Natacha, tudo bem com você?", null, "qualificar")[0]).not.toBe("gatekeeper");
  });
});

describe("a resposta do agente", () => {
  const OPENING = { from: "us" as const, text: "Bom dia! Aqui é o Jonathan. Quem cuida da divulgação da Ora Clinic?", variant: "abertura-social-c-quem~g0i0q0" };
  const reply = (texts: string[], name = "Ora Clinic Odontologia") => {
    const history = [OPENING, ...texts.slice(0, -1).map((text) => ({ from: "lead" as const, text }))];
    return rulesReply(simulationContext({ text: texts.at(-1)!, name, websiteKind: "social", history, facts: { flow: "qualificar" } }));
  };

  it("sem nada: pergunta quem cuida da divulgação e o melhor horário, agradecendo pelo nome", () => {
    const out = reply(["Sou a Ju, recepcionista da Oraclinic"]);
    expect(out.topic).toBe("gatekeeper");
    expect(out.reply).toBe("Sem problema, Ju. Quem cuida da divulgação da Ora Clinic Odontologia, e qual o melhor horário para falar com essa pessoa?");
    expect(lintMessage(out.reply!, "reply")).toEqual([]);
  });

  it("com o nome: pede o número ou o melhor horário, no gênero certo", () => {
    const out = reply(["Sou a Ju, recepcionista da Oraclinic", "A Dra.Joyce ficar responsável pela divulgação"]);
    expect(out.reply).toBe("Obrigado, Ju! Você consegue me passar o número da Dra. Joyce ou o melhor horário para eu falar com ela?");
    expect(out.handoff.needed).toBe(false);
    expect(lintMessage(out.reply!, "reply")).toEqual([]);
  });

  it("com o celular: agradece, avisa que vai falar com a pessoa e chama o dono para aprovar a abertura", () => {
    const out = reply(["Sou a Ju, recepcionista da Oraclinic", "A Dra. Joyce cuida, o número dela é 85 99123-4567, melhor de manhã"]);
    expect(out.reply).toBe("Obrigado, Ju! Vou falar com Dra. Joyce nesse número e digo que foi você quem indicou.");
    expect(out.queued).toBe(true);
    expect(out.handoff).toMatchObject({ needed: true });
    expect(out.handoff.reason).toMatch(/Dra\. Joyce, \(85\) 99123-4567 \(de manhã\)\. Confira o rascunho da abertura na Fila/);
    expect(out.nextAction?.label).toBe("Aprovar na Fila a abertura para Dra. Joyce");
    expect(lintMessage(out.reply!, "reply")).toEqual([]);
  });

  it("a abertura para quem decide é curta, cita quem indicou e termina em uma pergunta", () => {
    const body = referralOpening({ senderName: "Jonathan", business: "Ora Clinic Odontologia", decisor: { viaName: "Ju" }, addressee: "Dra. Joyce" });
    expect(body).toBe("Bom dia, Dra. Joyce! Aqui é o Jonathan. Ju, da Ora Clinic Odontologia, me passou o seu contato. Posso te fazer uma pergunta rápida?");
    expect(body.length).toBeLessThanOrEqual(140);
    expect(referralOpening({ senderName: "Jonathan", business: "Ora Clinic", decisor: { viaName: null }, addressee: null })).toBe(
      "Bom dia! Aqui é o Jonathan. O pessoal da Ora Clinic me passou o seu contato. Posso te fazer uma pergunta rápida?",
    );
  });
});

// ───────────────────────── o motor ─────────────────────────

const NOW = new Date("2026-10-29T13:30:00Z");
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW, shouldAdvanceTime: true });
});
afterAll(() => {
  vi.useRealTimers();
});
const rng = () => 0.5;
const pause = (ms = 3) => new Promise((r) => setTimeout(r, ms));
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);

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
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Bom dia! Aqui é o Jonathan. Quem cuida da divulgação?", status: "sent", variant: "abertura-social-c-quem~g0i0q0", createdBy: "system", sentAt: NOW.toISOString(), providerMessageId: `OUT-${lead.id}` },
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

describe("no motor: o contato de quem decide vira rascunho na Fila", () => {
  it("a recepção passa o celular: o agente agradece, o lead novo nasce e a abertura fica como RASCUNHO (nada sai)", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "Sou a Ju, recepcionista", 20);
    const r = await say(repo, lead.phoneE164!, "A Dra. Joyce cuida disso, o número dela é 85 99123-4567", 20 + 5 * 60);
    expect(r).toMatchObject({ handled: true });

    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.at(-1)!.body).toMatch(/^Obrigado, Ju! Vou falar com Dra\. Joyce nesse número/);

    const created = (await repo.listLeads({ stages: ["qualificado"], limit: 200, offset: 0 })).rows.find((l) => l.dedupeKey.startsWith("indicacao:"));
    expect(created).toBeTruthy();
    expect(created).toMatchObject({ phoneE164: "+5585991234567", isMobile: true, stage: "qualificado", source: "manual", websiteKind: lead.websiteKind });
    expect(created!.name).toMatch(/^Dra\. Joyce - /);
    expect(created!.notes).toMatch(/Indicado por Ju, recepcionista/);

    const referred = (await repo.findConversationByLead(created!.id))!;
    expect(referred.accountId).toBe(conv.accountId);
    const msgs = await repo.listMessages({ conversationId: referred.id, limit: 10 });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ kind: "opening", status: "draft", direction: "out", createdBy: "system" });
    expect(msgs[0].variant).toMatch(/^abertura-(none|social|weak)-c-indicacao$/);
    expect(msgs[0].body).toMatch(/^Bom dia, Dra\. Joyce! Aqui é o Jonathan\. Ju, da .+, me passou o seu contato\. Posso te fazer uma pergunta rápida\?$/);

    // a conversa original vai para o dono (precisa aprovar a abertura) e o fato fica no histórico
    expect((await repo.getConversation(conv.id))!.status).toBe("awaiting_human");
    const events = await repo.listEvents({ types: ["automacao"], limit: 50 });
    expect(events.some((e) => /passou o contato de Dra\. Joyce/.test(String(e.payload.text)))).toBe(true);
  });

  it("o mesmo celular de novo não cria outro lead nem outro rascunho", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "Sou a Ju, recepcionista. A Dra. Joyce cuida, o número dela é 85 99123-4567", 20);
    await say(repo, lead.phoneE164!, "o número da Dra. Joyce é 85 99123-4567, pode chamar", 20 + 5 * 60);
    const made = (await repo.listLeads({ stages: ["qualificado"], limit: 200, offset: 0 })).rows.filter((l) => l.dedupeKey.startsWith("indicacao:"));
    expect(made).toHaveLength(1);
    const referred = (await repo.findConversationByLead(made[0].id))!;
    expect(await repo.listMessages({ conversationId: referred.id, limit: 10 })).toHaveLength(1);
    void conv;
  });

  it("o número da própria conversa, ou de quem pediu para não receber, não vira lead", async () => {
    const { repo, lead } = await setup();
    await contacted(repo, lead);
    await say(repo, lead.phoneE164!, `Sou a Ju, recepcionista. A Dra. Joyce cuida, o número dela é ${lead.phoneRaw ?? lead.phoneE164}`, 20);
    expect((await repo.listLeads({ stages: ["qualificado"], limit: 200, offset: 0 })).rows.filter((l) => l.dedupeKey.startsWith("indicacao:"))).toHaveLength(0);

    const other = await setup();
    await contacted(other.repo, other.lead);
    await other.repo.addOptout("+5585991234567", "pediu para parar");
    await say(other.repo, other.lead.phoneE164!, "Sou a Ju, recepcionista. A Dra. Joyce cuida, o número dela é 85 99123-4567", 20);
    expect((await other.repo.listLeads({ stages: ["qualificado"], limit: 200, offset: 0 })).rows.filter((l) => l.dedupeKey.startsWith("indicacao:"))).toHaveLength(0);
  });

  it("só o nome: pede o número, e o lead novo só nasce quando o telefone chega", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "Sou a Ju, recepcionista da clínica. A Dra. Joyce é responsável pela divulgação", 20);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.at(-1)!.body).toMatch(/Você consegue me passar o número da Dra\. Joyce ou o melhor horário para eu falar com ela\?/);
    expect((await repo.listLeads({ stages: ["qualificado"], limit: 200, offset: 0 })).rows.filter((l) => l.dedupeKey.startsWith("indicacao:"))).toHaveLength(0);
  });
});
