import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { simulationContext } from "@/lib/agent/context";
import { rulesReply } from "@/lib/agent/rules";
import { detectTopics } from "@/lib/agent/topics";
import { alreadyIntroduced, introducesSelf } from "@/lib/agent/variant";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import type { Lead } from "@/lib/leads/types";
import { createMemoryRepo, type MemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { detectAutoReply, menuChoice } from "./autoreply";
import { classifyReply } from "./classify";
import { handleMessageEvent } from "./engine";
import type { WebhookEvent } from "./webhook";

/**
 * As conversas de 29/10 (36 aberturas): o lead escrevia duas mensagens em segundos e recebia duas apresentações; quem recusava ainda
 * recebia a pergunta que estava na fila; recusa dita com "agradecemos pelo contato" era tratada como robô; menus de robô ficavam
 * sem resposta. Os textos abaixo são os que chegaram de verdade.
 */

const NOW = new Date("2026-10-29T13:30:00Z"); // quinta, 10:30 em Fortaleza
beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"], now: NOW, shouldAdvanceTime: true });
});
afterAll(() => {
  vi.useRealTimers();
});
const rng = () => 0.5;
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);
const pause = (ms = 3) => new Promise((r) => setTimeout(r, ms));

const MENU_ODONTODENT =
  "Seja  Bem vindo(a) a Clínica OdontoDent  \n\n📍Nossa Clínica está  há 12 Anos  Cuidando de Sorrisos com Excelência. \n\n1️⃣ Digite 1  se ja é  paciente \n2️⃣ Digite 2 se não for paciente, porém é indicação de algum paciente? \n3️⃣ Digite 3 se não for paciente e nem indicação";
const MENU_DRA_DENTISTA =
  "Olá! Seja bem-vindo à Clínica Dra Dentista 💙🦷 \n\nPara agilizar seu atendimento, escolha uma das opções abaixo e envie apenas o número correspondente: \n\n1️⃣ Agendamento ou reagendamento de consultas \n2️⃣ Primeira avaliação (caso ainda não seja paciente) \n3️⃣ Setor financeiro";
const MENU_MULTICLINIC =
  "Olá, Seja bem vindo 🦷💛 \n*Para marcação de consulta informe a opção abaixo* 👇🏽 \n\n*1- Consulta Particular* \n*2- Consulta por Convênio( informe o convênio)* \n🔎Amil dental \n🔎Postal saúde \n\n*Atendimento por hora marcada em horário comercial de Segunda a sexta feira e aos Sábados pela manhã!!*";
const MENU_STYLLO =
  "Olá! Tudo bem ?  \nSeja bem-vindo(a) à Clínica Styllo.   \nObrigada pelo seu contato! 💙 \n\nPara agilizar seu atendimento, nos diga: \n\n📅 Deseja agendar sua avaliação?   \n✨ Qual tratamento você procura?   \n💬 Quer tirar alguma dúvida?   \n📍 Precisa da localização da clínica?";
const MENU_COM_ATENDENTE = "Bem-vindo! Digite:\n1 - Agendar consulta\n2 - Falar com atendente\n3 - Setor financeiro";

describe("cumprimentos: 'oi bom dia' é cumprimento, não 'outro assunto'", () => {
  it.each(["oi bom dia", "Olá, Bom dia!", "bom dia tudo bem", "Oi, tudo bem?", "oi boa tarde Jonathan", "Bom dia", "oii"])("%s", (text) => {
    expect(detectTopics(text, null, "qualificar")[0]).toBe("greeting");
  });

  it.each(["oi quero um site", "bom dia, quanto custa?", "oi pode me ligar amanhã"])("%s não é só cumprimento", (text) => {
    expect(detectTopics(text, null, "qualificar")[0]).not.toBe("greeting");
  });
});

describe("recusa", () => {
  it.each(["Não temos interesse, obrigada!!", "No momento não temos interesse", "Agradecemos pelo contato e disponibilidade!! No momento, não temos interesse na criação de um site para a clínica, mas surgindo um interesse futuro, entraremos em contato por aqui."])(
    "%s é recusa",
    (text) => {
      expect(classifyReply(text).intent).toBe("not_interested");
    },
  );
});

describe("robôs de clínica", () => {
  it("a saudação de modelo curta e a de recepção são reconhecidas", () => {
    expect(detectAutoReply("Seja bem-vindo. 🩵").auto).toBe(true);
    expect(detectAutoReply("Bem-vindo ao Consultório Odontológico Dr.Rômulo de Oliveira. \n É um prazer tê- lo conosco. Em que podemos ajudar?").auto).toBe(true);
  });

  it("uma pessoa que só diz 'Em que posso ajudar' continua sendo uma pessoa", () => {
    expect(detectAutoReply("Bom dia. em que posso lhe ajudar?").auto).toBe(false);
    expect(detectAutoReply("Olá Jonathan! Me chamo Natacha, tudo bem com você?").auto).toBe(false);
  });

  it("do menu, escolhe só a opção que leva a uma pessoa", () => {
    expect(menuChoice(MENU_ODONTODENT)).toMatchObject({ option: "3" });
    expect(menuChoice(MENU_COM_ATENDENTE)).toMatchObject({ option: "2" });
  });

  it("não escolhe agendamento, avaliação, financeiro nem convênio (o robô abriria um atendimento que não existe)", () => {
    expect(menuChoice(MENU_DRA_DENTISTA)).toBeNull();
    expect(menuChoice(MENU_MULTICLINIC)).toBeNull();
    expect(menuChoice(MENU_STYLLO)).toBeNull(); // pergunta aberta, sem número
    expect(menuChoice("Digite 1 para agendar\nDigite 2 para falar com o financeiro")).toBeNull();
    expect(menuChoice(null)).toBeNull();
  });
});

describe("apresentação: uma vez só", () => {
  it("reconhece 'sou o Jonathan' em qualquer jeito de dizer", () => {
    for (const t of ["Sou o Jonathan Kelvin, desenvolvedor de sites.", "Bom dia! Sou o Jonathan, faço sites para negócios locais.", "Prazer, Letícia. Eu sou o Jonathan e trabalho com sites.", "Aqui é o Jonathan, trabalho com sites."]) {
      expect(introducesSelf(t, "Jonathan"), t).toBe(true);
      expect(introducesSelf(t), t).toBe(true);
    }
    expect(introducesSelf("Perfeito! Em até 7 dias eu monto uma página sob medida para a clínica.", "Jonathan")).toBe(false);
    expect(introducesSelf("Não sou o dono, sou a recepcionista", "Jonathan")).toBe(false);
  });

  it("a apresentação da IA conta: as regras não se apresentam de novo e seguem para a solução", () => {
    const opening = { from: "us" as const, text: "Bom dia! Aqui é o Jonathan. Esse é o WhatsApp da Medical Odonto?", variant: "abertura-none-c-confirma-ia~g0i0q1" };
    const iaIntro = { from: "us" as const, text: "Bom dia! Sou o Jonathan, faço sites para negócios locais. A Medical Odonto ainda não tem site.", variant: "agente-ia+auto:q-objetivo" };
    const ctx = simulationContext({ text: "sim sim", name: "Medical Odonto - Genibaú", history: [opening, { from: "lead", text: "oi bom dia" }, iaIntro], facts: { flow: "qualificar" } });
    expect(alreadyIntroduced(ctx.messages, "Jonathan")).toBe(true);
    const out = rulesReply(ctx);
    // quem já tem a pergunta do objetivo na conversa não recebe a explicação outra vez; o que não pode é uma 2ª apresentação
    expect(out.reply ?? "").not.toMatch(/Sou o Jonathan/);
    expect(out.asked).not.toBe("apresentacao");
  });
});

describe("a apresentação e a solução novas", () => {
  const OPENING = { from: "us" as const, text: "Bom dia! Aqui é o Jonathan. Vi o perfil de Medical Odonto no Google. Posso te fazer uma pergunta rápida?", variant: "abertura-none-c-google~g0i0q0" };
  const intro = (over: Parameters<typeof simulationContext>[0] = { text: "Bom dia" }) => rulesReply(simulationContext({ name: "Medical Odonto", history: [OPENING], facts: { flow: "qualificar" }, ...over }));

  it("a apresentação é curta, em dois balões: quem sou e a dor, sem repetir 'vi o perfil no Google' da abertura", () => {
    const out = intro();
    expect(out.reply).toMatch(/^Sou o Jonathan Kelvin, desenvolvedor de sites\.\n\nA Medical Odonto tem nota 4,9 no Google, mas sem uma página própria quem pesquisa não vê os tratamentos nem consegue agendar\. /);
    expect(out.reply).not.toMatch(/Vi o perfil/);
    expect(out.reply!.length).toBeLessThanOrEqual(230);
    expect(out.reply!.match(/\?/g)).toHaveLength(1);
    expect(out.asked).toBe("apresentacao");
  });

  it("quem só tem Instagram ouve isso; quem tem site fraco, outra coisa; e advocacia fica sóbria", () => {
    expect(intro({ text: "Bom dia", websiteKind: "social" }).reply).toMatch(/só acha o Instagram e não vê os tratamentos nem consegue agendar/);
    expect(intro({ text: "Bom dia", websiteKind: "weak" }).reply).toMatch(/Vi o site de vocês e acho que dá para ele mostrar melhor os tratamentos/);
    const law = rulesReply(simulationContext({ text: "Bom dia", name: "Rafael Neves - ADVOCACIA", history: [OPENING], facts: { flow: "qualificar" } }));
    expect(law.reply).toMatch(/^Rafael, sou o Jonathan Kelvin/);
  });

  it("a solução diz o que a página leva e como o paciente chega ao WhatsApp, com o prazo das Configurações", () => {
    const history = [OPENING, { from: "lead" as const, text: "Bom dia" }, { from: "us" as const, text: "Sou o Jonathan Kelvin, desenvolvedor de sites.\n\nA Medical Odonto tem nota 4,9 no Google, mas sem uma página própria quem pesquisa não vê os tratamentos nem consegue agendar. Posso te mostrar como resolvo isso?", variant: "agente+auto:q-apresentacao" }];
    const out = rulesReply(simulationContext({ text: "pode sim", name: "Medical Odonto", history, facts: { flow: "qualificar", deliveryDays: 10 } }));
    expect(out.reply).toMatch(/^Perfeito! Em até 10 dias eu monto uma página só da Medical Odonto, no estilo Linktree: cada tratamento com um botão que abre o WhatsApp já com o que o paciente quer, mais avaliações do Google e mapa\. Ela fica no ar para o Google encontrar\./);
    expect(out.reply).toMatch(/\n\nO que você mais quer que a página faça/);
    expect(out.reply).not.toMatch(/posição|primeiro lugar|garant|prévia/i);
    expect(out.asked).toBe("objetivo");
  });
});

// ───────────────────────── o motor ─────────────────────────

const OPENING_SHORT = "Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Teste no Google. Posso te fazer uma pergunta rápida?";

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar" });
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false });
  return { repo, lead: leads[0] };
}

/** O lead já recebeu a abertura curta. */
async function contacted(repo: MemoryRepo, lead: Lead) {
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  await repo.createMessages([
    { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: OPENING_SHORT, status: "sent", variant: "abertura-none-c-google~g0i0q0", createdBy: "system", sentAt: NOW.toISOString(), providerMessageId: `OUT-${lead.id}` },
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

describe("duas mensagens do lead em segundos: uma resposta só, com uma apresentação só", () => {
  it("'oi bom dia' e 'sim sim' (4 s) geram UMA apresentação; a primeira, que ainda estava na fila, é refeita", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "oi bom dia", 5);
    await say(repo, lead.phoneE164!, "sim sim", 9);
    const list = await outs(repo, conv.id);
    const live = list.filter((m) => m.status !== "cancelled");
    expect(live).toHaveLength(1);
    expect(live[0].variant).toBe("agente+auto:q-apresentacao");
    expect(live.filter((m) => /Sou o Jonathan/.test(m.body))).toHaveLength(1);
    expect(list.filter((m) => m.status === "cancelled")).toHaveLength(1);
  });

  it("com minutos de intervalo cada resposta segue o roteiro: apresentação e, depois do 'pode', a solução", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "oi bom dia", 5);
    await say(repo, lead.phoneE164!, "pode sim", 5 * 60);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live.map((m) => m.variant)).toEqual(["agente+auto:q-apresentacao", "agente+auto:q-objetivo"]);
    expect(live[1].body).toMatch(/página só da .*estilo Linktree/);
    expect(live.filter((m) => /Sou o Jonathan/.test(m.body))).toHaveLength(1);
  });

  it("quem recusa logo depois de cumprimentar não recebe a apresentação que estava na fila", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "Olá, Bom dia!", 5);
    expect((await outs(repo, conv.id)).filter((m) => m.status === "approved")).toHaveLength(1);
    await say(repo, lead.phoneE164!, "Não temos interesse, obrigada!!", 19);
    const live = (await outs(repo, conv.id)).filter((m) => m.status !== "cancelled");
    expect(live).toHaveLength(1);
    expect(live[0].body).not.toMatch(/site|Sou o Jonathan/i);
    expect(live[0].variant).toBe("agente+auto:not_interested");
  });

  it("a recusa que começa com 'agradecemos pelo contato' é recusa, não robô: a conversa é encerrada", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    const r = await say(
      repo,
      lead.phoneE164!,
      "Agradecemos pelo contato e disponibilidade!! No momento, não temos interesse na criação de um site para a clínica, mas surgindo um interesse futuro, entraremos em contato por aqui.",
      40,
    );
    expect(r).toMatchObject({ handled: true, intent: "not_interested" });
    expect((await repo.getConversation(conv.id))!.status).toBe("closed");
  });
});

describe("menu de robô", () => {
  it("o agente digita o número da opção que leva a uma pessoa, uma vez só", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    const r = await say(repo, lead.phoneE164!, MENU_ODONTODENT, 8);
    expect(r).toMatchObject({ handled: true, intent: "auto_reply", draftedReply: true });
    const [m] = await outs(repo, conv.id);
    expect(m).toMatchObject({ body: "3", status: "approved", variant: "agente+auto:menu", createdBy: "system" });
    expect(m.scheduledFor).toBeTruthy();

    // o robô repete o menu: não digita de novo
    const again = await say(repo, lead.phoneE164!, MENU_ODONTODENT, 40);
    expect(again).toMatchObject({ draftedReply: false });
    expect(await outs(repo, conv.id)).toHaveLength(1);
    // e a conversa continua como estava: ninguém respondeu de verdade
    expect(await repo.getConversation(conv.id)).toMatchObject({ lastInboundAt: null, unread: 0 });
  });

  it("menu sem opção que leve a uma pessoa fica sem resposta, esperando uma pessoa", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    const r = await say(repo, lead.phoneE164!, MENU_DRA_DENTISTA, 8);
    expect(r).toMatchObject({ intent: "auto_reply", draftedReply: false });
    expect(await outs(repo, conv.id)).toHaveLength(0);
  });

  it("no modo assistido vira rascunho para o dono; pausada, não faz nada sozinho", async () => {
    const { repo, lead } = await setup();
    await repo.saveAutomation({ autonomy: "copiloto" });
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, MENU_ODONTODENT, 8);
    const [m] = await outs(repo, conv.id);
    expect(m).toMatchObject({ body: "3", status: "draft", variant: "agente:menu" });
  });

  it("depois que uma pessoa escreveu, o agente não digita número em cima da conversa", async () => {
    const { repo, lead } = await setup();
    const conv = await contacted(repo, lead);
    await say(repo, lead.phoneE164!, "Bom dia, tudo bem?", 8);
    const before = (await outs(repo, conv.id)).length;
    const r = await say(repo, lead.phoneE164!, MENU_ODONTODENT, 300);
    expect(r).toMatchObject({ draftedReply: false });
    expect((await outs(repo, conv.id)).length).toBe(before);
  });
});
