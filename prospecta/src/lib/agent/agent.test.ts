import { describe, expect, it } from "vitest";
import { simulationContext } from "./context";
import { buildFicha } from "./ficha";
import { guardReply } from "./guard";
import { lintMessage } from "./humanize";
import { rulesReply } from "./rules";
import { QUALIFY_SCENARIOS, SCENARIOS } from "./scenarios";
import { detectProduct, detectTopics } from "./topics";

const DEMO = "https://painel.exemplo.com.br/p/abcdefghij0123456789";

describe.each(SCENARIOS)("cenário $id", (sc) => {
  const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup });
  const out = rulesReply(ctx);

  it(`entende o assunto (${sc.expect.topic})`, () => {
    expect(out.topic).toBe(sc.expect.topic);
  });

  it("responde (ou se cala) como o gabarito manda", () => {
    if (sc.expect.silent) expect(out.reply).toBeNull();
    else expect(out.reply).not.toBeNull();
    if (sc.expect.handoff !== undefined) expect(out.handoff.needed).toBe(sc.expect.handoff);
    if (sc.expect.handoff) expect(out.handoff.reason).toBeTruthy();
    if (sc.expect.asked) expect(out.asked).toBe(sc.expect.asked);
    else expect(out.asked).toBeNull();
    if (sc.expect.action) expect(out.nextAction?.kind).toBe(sc.expect.action);
    for (const re of sc.expect.include ?? []) expect(out.reply, String(re)).toMatch(re);
    for (const re of sc.expect.exclude ?? []) expect(out.reply ?? "", String(re)).not.toMatch(re);
  });

  it("o texto é de WhatsApp: curto, uma pergunta, sem tique de IA", () => {
    if (!out.reply) return;
    expect(out.reply.length).toBeLessThanOrEqual(260);
    expect(out.reply.match(/\?/g)?.length ?? 0).toBeLessThanOrEqual(1);
    expect(lintMessage(out.reply, "reply"), out.reply).toEqual([]);
  });

  it("passa na trava de fatos (só preço, prazo, sinal, link e Pix verdadeiros)", () => {
    if (!out.reply) return;
    const g = guardReply(out.reply, { facts: ctx.facts, proposal: ctx.proposal, demoUrl: ctx.demoUrl ?? DEMO });
    expect(g.reasons, out.reply).toEqual([]);
  });
});

describe.each(QUALIFY_SCENARIOS)("fluxo qualificar, cenário $id", (sc) => {
  const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup });
  const out = rulesReply(ctx);

  it(`entende o assunto (${sc.expect.topic})`, () => {
    expect(out.topic).toBe(sc.expect.topic);
  });

  it("responde (ou se cala) como o gabarito manda", () => {
    if (sc.expect.silent) expect(out.reply).toBeNull();
    else expect(out.reply).not.toBeNull();
    if (sc.expect.handoff !== undefined) expect(out.handoff.needed).toBe(sc.expect.handoff);
    if (sc.expect.handoff) expect(out.handoff.reason).toBeTruthy();
    if (sc.expect.asked) expect(out.asked).toBe(sc.expect.asked);
    else expect(out.asked).toBeNull();
    if (sc.expect.action) expect(out.nextAction?.kind).toBe(sc.expect.action);
    for (const re of sc.expect.include ?? []) expect(out.reply, String(re)).toMatch(re);
    for (const re of sc.expect.exclude ?? []) expect(out.reply ?? "", String(re)).not.toMatch(re);
    for (const re of sc.expect.reason ?? []) expect(out.handoff.reason ?? "", String(re)).toMatch(re);
  });

  it("o texto é de WhatsApp: curto, uma pergunta, sem tique de IA", () => {
    if (!out.reply) return;
    const max = sc.expect.maxChars ?? 260;
    expect(out.reply.length).toBeLessThanOrEqual(max);
    expect(out.reply.match(/\?/g)?.length ?? 0).toBeLessThanOrEqual(1);
    // a solução do site é a única resposta maior que 260: o aviso de tamanho é esperado, qualquer outro aponta um problema
    const issues = lintMessage(out.reply, "reply").filter((i) => !(max > 260 && i.rule === "longa"));
    expect(issues, out.reply).toEqual([]);
  });

  it("passa na trava de fatos (só preço, prazo, sinal, link e Pix verdadeiros)", () => {
    if (!out.reply) return;
    const g = guardReply(out.reply, { facts: ctx.facts, proposal: ctx.proposal, demoUrl: ctx.demoUrl ?? DEMO });
    expect(g.reasons, out.reply).toEqual([]);
  });

  it("nunca oferece prévia (só confirma a que o dono vai fazer quando o lead pediu)", () => {
    if (!out.reply || !/pr[eé]via/i.test(out.reply)) return;
    expect(ctx.ficha.previewAsked || ctx.ficha.previewSentByOwner, out.reply).toBe(true);
    expect(out.reply, "oferta de prévia").not.toMatch(/\b(posso|quer|quer que eu) (te )?(montar|mostrar)\b.{0,20}pr[eé]via/i);
  });
});

describe("todo assunto, em todo tipo de lead", () => {
  const topicsToTry = [
    "oi", "quem é você", "quanto custa", "quanto tempo demora", "como funciona", "achei caro", "tem garantia", "como eu pago",
    "tem mensalidade", "já tenho site", "vou pensar", "agora não", "estou sem tempo", "sou a atendente", "gostei", "pode sim", "ok",
    "manda por email", "onde conseguiu meu número", "dá pra mudar a cor",
  ];
  for (const kind of ["none", "social", "weak", "real"] as const) {
    it(`respostas limpas para site '${kind}', com e sem prévia enviada`, () => {
      for (const text of topicsToTry) {
        for (const demoSent of [false, true]) {
          const ctx = simulationContext({ text, websiteKind: kind, demoSent, demoUrl: DEMO });
          const out = rulesReply(ctx);
          if (!out.reply) continue;
          expect(lintMessage(out.reply, "reply"), `${kind}/${demoSent}/${text}: ${out.reply}`).toEqual([]);
          expect(out.reply).not.toMatch(/undefined|null|NaN/);
          const g = guardReply(out.reply, { facts: ctx.facts, proposal: ctx.proposal, demoUrl: DEMO });
          expect(g.reasons, out.reply).toEqual([]);
        }
      }
    });
  }

  it("nome de negócio enorme não estoura o tamanho", () => {
    const name = "Centro Integrado de Estética Avançada e Bem-Estar Corporal do Nordeste Brasileiro";
    for (const text of ["quem é você", "como funciona", "vou pensar", "gostei", "pode sim", "tem mensalidade"]) {
      const out = rulesReply(simulationContext({ text, name, demoSent: text === "gostei" }));
      if (out.reply) expect(out.reply.length, out.reply).toBeLessThanOrEqual(360);
    }
  });

  it("usa o preço, o prazo e o sinal das Configurações, não valores fixos", () => {
    const ctx = simulationContext({ text: "quanto custa e quanto tempo demora", facts: { priceFrom: 1500, deliveryDays: 10 } });
    const out = rulesReply(ctx);
    expect(out.reply).toMatch(/R\$\s?1\.500/);
    expect(out.reply).toMatch(/10 dias/);
    expect(out.reply).not.toMatch(/R\$\s?800|7 dias/);
  });
});

describe("detectTopics", () => {
  it("devolve todos os assuntos, do mais importante ao menos", () => {
    expect(detectTopics("Quanto custa e quanto tempo demora?")).toEqual(["price", "timeline"]);
    // com pergunta no meio, o "sim" não conta como aceite: a pergunta vem primeiro
    expect(detectTopics("Sim, mas quanto custa?")).toEqual(["price"]);
    expect(detectTopics("Fechado, pode passar o pix")).toEqual(["payment", "yes"]);
    expect(detectTopics("não quero, já tenho site")[0]).toBe("not_interested");
  });

  it("palavras de dono de negócio: variações de escrita", () => {
    const table: [string, string][] = [
      ["Qto custa?", "price"],
      ["vlr do site", "other"], // abreviação que ainda não cobrimos: vai para o dono, sem inventar
      ["qual o preço", "price"],
      ["me passa o orçamento", "price"],
      ["pq tão caro", "too_expensive"],
      ["sou eu mesma a dona", "other"],
      ["Boa tarde", "greeting"],
      ["valeu", "thanks"],
      ["beleza", "thanks"],
      ["tô sem tempo agora", "busy"],
      ["agora não dá, fala semana que vem", "not_now"],
      ["quem tá falando?", "who"],
      ["Isso é golpe", "abusive"],
    ];
    for (const [text, topic] of table) expect(detectTopics(text)[0], text).toBe(topic);
  });

  it("nunca volta vazio", () => {
    for (const t of ["", "   ", "???", "hmm", "👍"]) expect(detectTopics(t).length).toBeGreaterThan(0);
  });
});

describe("ficha do lead", () => {
  const ficha = (text: string, over: Parameters<typeof simulationContext>[0] extends infer T ? Partial<T> : never = {}) =>
    simulationContext({ text, ...over }).ficha;

  it("lead que só disse 'oi' está frio; quem pediu preço e prazo está morno", () => {
    expect(ficha("oi").heat).toBe("frio");
    const f = simulationContext({
      text: "quanto custa e quanto tempo demora",
      history: [
        { from: "us", text: "abertura" },
        { from: "lead", text: "pode sim" },
        { from: "us", text: "ok" },
        { from: "lead", text: "quanto custa e quanto tempo demora" },
      ],
    }).ficha;
    expect(f.heat).toBe("quente");
    expect(f.need).toBe("sim");
    expect(f.budget).toBe("talvez");
    expect(f.timing).toBe("sim");
  });

  it("quem gostou depois da prévia está quente e a próxima ação é criar a proposta", () => {
    const f = ficha("Gostei muito!", { demoSent: true });
    expect(f.heat).toBe("quente");
    expect(f.phase).toBe("previa");
    expect(f.nextAction?.kind).toBe("criar_proposta");
  });

  it("achou caro: orçamento 'não'. Sem tempo: prazo 'não'. Recepcionista: autoridade 'não'", () => {
    expect(ficha("achei caro").budget).toBe("nao");
    expect(ficha("estou sem tempo").timing).toBe("nao");
    expect(ficha("sou a recepcionista").authority).toBe("nao");
    expect(ficha("sou a dona da clínica").authority).toBe("sim");
  });

  it("PARE no histórico não bloqueia depois que o dono liberou o número (conversa de volta a 'active')", () => {
    const messages = simulationContext({ text: "PARE" }).messages;
    const base = { lead: { stage: "respondeu" as const }, messages, demos: [], proposals: [] };
    expect(buildFicha({ ...base, conversation: { status: "opted_out" } }).phase).toBe("bloqueado");
    expect(buildFicha({ ...base, conversation: { status: "awaiting_human" } }).phase).toBe("bloqueado");
    const freed = buildFicha({ ...base, conversation: { status: "active" } });
    expect(freed.phase).not.toBe("bloqueado");
    expect(freed.heat).not.toBe("bloqueado");
    // um PARE novo, depois de liberado, bloqueia de novo
    const again = buildFicha({ ...base, messages: [...messages, ...simulationContext({ text: "PARE" }).messages.slice(-1).map((m, i) => ({ ...m, id: `again-${i}` }))], conversation: { status: "opted_out" } });
    expect(again.phase).toBe("bloqueado");
  });

  it("recusa vira Perdido; PARE vira Bloqueado", () => {
    expect(ficha("não tenho interesse")).toMatchObject({ phase: "perdido", heat: "perdido", nextAction: null });
    expect(ficha("PARE")).toMatchObject({ phase: "bloqueado", heat: "bloqueado", nextAction: null });
  });

  it("proposta enviada: a próxima ação é marcar o sinal", () => {
    const f = ficha("pode", {
      demoSent: true,
      proposal: { status: "sent", title: "Site", amountCents: 80_000, entryPct: 50, deliveryDays: 7 },
    });
    expect(f.phase).toBe("proposta");
    expect(f.nextAction?.kind).toBe("marcar_sinal");
  });

  it("registra a resposta à pergunta de descoberta e não pergunta de novo", () => {
    const f = simulationContext({
      text: "quero mostrar meus serviços e ganhar mais clientes",
      history: [
        { from: "us", text: "abertura" },
        { from: "lead", text: "pode sim" },
        { from: "us", text: "Perfeito!", variant: "agente:q-objetivo" },
      ],
    }).ficha;
    expect(f.asked).toEqual(["objetivo"]);
    expect(f.answers.objetivo).toMatch(/mostrar meus serviços/);
    expect(f.lastTopic).toBe("answer");
    const again = rulesReply(
      simulationContext({
        text: "sim",
        history: [
          { from: "us", text: "abertura" },
          { from: "lead", text: "pode sim" },
          { from: "us", text: "Perfeito!", variant: "agente:q-objetivo" },
        ],
      }),
    );
    expect(again.asked).toBeNull();
  });

  it("buildFicha ignora rascunhos e canceladas", () => {
    const ctx = simulationContext({ text: "oi" });
    const withDraft = buildFicha({
      lead: { stage: "respondeu" },
      conversation: { status: "awaiting_human" },
      messages: [...ctx.messages, { ...ctx.messages[0], id: "d", status: "draft", direction: "out", variant: "agente:q-objetivo" }],
      demos: [],
      proposals: [],
    });
    expect(withDraft.asked).toEqual([]);
  });
});

describe("fluxo qualificar: o que ele quer comprar e a prévia pedida", () => {
  const Q = { flow: "qualificar" as const };
  const OPENING = { from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio. Vocês já pensaram em ter um site?" };
  const ficha = (text: string, history = [OPENING] as Parameters<typeof simulationContext>[0]["history"]) => simulationContext({ text, history, facts: Q }).ficha;

  it("detecta o produto: sistema vence, e quem 'já tem' algo não conta", () => {
    expect(detectProduct("quero um site para a clínica")).toBe("site");
    expect(detectProduct("uma landing page")).toBe("site");
    expect(detectProduct("preciso de um sistema de agendamento")).toBe("sistema");
    expect(detectProduct("quero um site e depois um sistema")).toBe("sistema");
    expect(detectProduct("quero uma loja online")).toBe("sistema");
    expect(detectProduct("já tenho um sistema")).toBeNull();
    expect(detectProduct("já tenho site")).toBeNull();
    expect(detectProduct("oi, tudo bem?")).toBeNull();
  });

  it("o pedido de prévia fica pendente até o dono mandar o link", () => {
    const asked = [OPENING, { from: "lead" as const, text: "quero ver uma prévia" }, { from: "us" as const, text: "Claro! Vou montar a prévia com cuidado.", variant: "agente+auto:wants_preview" }];
    const pending = ficha("ok", asked);
    expect(pending).toMatchObject({ previewAsked: true, previewPending: true, previewSentByOwner: false });
    expect(pending.nextAction?.kind).toBe("fazer_previa");

    const sent = ficha("gostei", [...asked, { from: "us" as const, text: "Segue: https://previa.exemplo.com.br", variant: "previa-enviada" }]);
    expect(sent).toMatchObject({ previewAsked: true, previewPending: false, previewSentByOwner: true });
    expect(sent.nextAction?.kind).not.toBe("fazer_previa");

    // pediu outra depois de receber a primeira: volta para a fila
    const again = ficha("pode fazer outra prévia?", [...asked, { from: "us" as const, text: "https://previa.exemplo.com.br", variant: "previa-enviada" }]);
    expect(again.previewPending).toBe(true);
  });

  it("sistema vira 'orçar o sistema' e o que ele respondeu fica na ficha", () => {
    const f = ficha("cadastrar clientes e agendar consultas", [
      OPENING,
      { from: "lead", text: "quero um sistema" },
      { from: "us", text: "Entendi! Me conta em uma frase o que ele precisa fazer?", variant: "agente+auto:q-escopo" },
    ]);
    expect(f.product).toBe("sistema");
    expect(f.answers.escopo).toMatch(/cadastrar clientes/);
    expect(f.lastAnswered).toBe("escopo");
    expect(f.nextAction?.kind).toBe("orcar_sistema");
  });

  it("site com o objetivo respondido: a próxima ação é fechar o valor", () => {
    const f = ficha("quero mais contatos pelo WhatsApp", [
      OPENING,
      { from: "lead", text: "quero um site para a clínica" },
      { from: "us", text: "Ótimo! O que você mais quer que o site faça?", variant: "agente+auto:q-objetivo" },
    ]);
    expect(f.product).toBe("site");
    expect(f.lastAnswered).toBe("objetivo");
    expect(f.nextAction?.kind).toBe("criar_proposta");
  });

  it("'landing page' respondendo a pergunta do tipo é resposta, mesmo com poucas palavras", () => {
    const f = ficha("landing page", [OPENING, { from: "lead", text: "pode" }, { from: "us", text: "Perfeito! Hoje você pensa em uma landing page, um site completo ou um sistema?", variant: "agente+auto:q-tipo" }]);
    expect(f.lastTopic).toBe("answer");
    expect(f.answers.tipo).toBe("landing page");
  });

  it("perguntar de novo reabre a pergunta: a resposta que vem depois conta", () => {
    const f = ficha("uma landing page", [
      OPENING,
      { from: "lead", text: "quero" },
      { from: "us", text: "Perfeito! Hoje você pensa em uma landing page, um site completo ou um sistema?", variant: "agente+auto:q-tipo" },
      { from: "lead", text: "pode sim" },
      { from: "us", text: "Show! Seria uma landing page, um site completo ou um sistema?", variant: "agente+auto:q-tipo" },
    ]);
    expect(f.asked).toEqual(["tipo"]); // a pergunta só conta uma vez
    expect(f.lastAnswered).toBe("tipo");
    expect(f.answers.tipo).toBe("uma landing page");
  });

  it("no fluxo antigo os assuntos novos não existem: 'quero ver a prévia' é o 'pode' de sempre e 'sistema' é fora do roteiro", () => {
    expect(detectTopics("quero ver a prévia")[0]).toBe("yes");
    expect(detectTopics("quero um site")[0]).toBe("yes");
    expect(detectTopics("Vocês fazem loja virtual?")[0]).toBe("other");
    expect(detectTopics("quero ver a prévia", null, "qualificar")[0]).toBe("wants_preview");
    expect(detectTopics("quero um site", null, "qualificar")[0]).toBe("wants_site");
    expect(detectTopics("Vocês fazem loja virtual?", null, "qualificar")[0]).toBe("system_request");
    // 'já tenho loja virtual' é o que ele tem, não o que quer
    expect(detectTopics("já tenho loja virtual", null, "qualificar")[0]).toBe("has_site");
  });
});
