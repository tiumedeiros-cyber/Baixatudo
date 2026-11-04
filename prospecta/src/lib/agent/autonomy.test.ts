import { describe, expect, it } from "vitest";
import { simulationContext } from "./context";
import { AUTO_TOPICS, AUTONOMY_CONFIRM, decideAuto, finalCheck, madeClosingOffer, type AutoInput } from "./autonomy";
import { rulesReply } from "./rules";
import { SCENARIOS } from "./scenarios";
import { agentVariant, parseAgentVariant } from "./variant";
import { TOPICS, type Topic } from "./types";

const base = (over: Partial<AutoInput> = {}): AutoInput => ({
  cfg: { autonomy: "semi", autoClose: false, autoFreeform: true, autoMaxPerConversation: 10, autoMaxPerDay: 80, paused: false },
  out: { reply: "Oi! Posso te mostrar a prévia?", topic: "greeting", commits: false, handoff: { needed: false, reason: null } },
  humanTakenOver: false,
  blocked: false,
  inboundText: "oi",
  autoInConversation: 0,
  autoToday: 0,
  ...over,
});

describe("decideAuto", () => {
  it("responde sozinho quando tudo está certo", () => {
    expect(decideAuto(base())).toEqual({ auto: true, reason: "ok", notifyOwner: false });
  });

  it("no modo assistido, sem resposta, bloqueado, dono assumiu ou pausado: nunca", () => {
    expect(decideAuto(base({ cfg: { ...base().cfg, autonomy: "copiloto" } })).auto).toBe(false);
    expect(decideAuto(base({ out: { ...base().out, reply: null } })).auto).toBe(false);
    expect(decideAuto(base({ blocked: true })).auto).toBe(false);
    expect(decideAuto(base({ humanTakenOver: true })).reason).toMatch(/assumiu/);
    expect(decideAuto(base({ cfg: { ...base().cfg, paused: true } })).reason).toMatch(/pausada/);
  });

  it("assuntos do dono nunca saem sozinhos (sem a resposta dele escrita), mesmo com o fechamento ligado", () => {
    const humanOnly: Topic[] = ["abusive", "optout", "guarantee", "domain_hosting", "send_info", "change_request", "too_expensive", "casual", "other"];
    for (const topic of humanOnly) {
      const d = decideAuto(base({ cfg: { ...base().cfg, autoClose: true }, out: { reply: "x", topic, commits: false, handoff: { needed: false, reason: null } } }));
      expect(d.auto, topic).toBe(false);
    }
  });

  it("a lista de assuntos automáticos é exatamente a que está escrita (mudar exige mudar este teste)", () => {
    expect([...AUTO_TOPICS].sort()).toEqual(
      ["answer", "audio", "busy", "compliment", "gatekeeper", "greeting", "has_provider", "has_site", "how_works", "media", "no_need_site", "not_interested", "not_now", "payment", "price", "source_of_contact", "status_check", "think", "thanks", "timeline", "wants_site", "who", "yes"].sort(),
    );
    for (const t of AUTO_TOPICS) expect(TOPICS).toContain(t);
  });

  it("dinheiro (oferta de fechamento, Pix) só com autoClose", () => {
    const money = { reply: "O sinal é de R$ 400.", topic: "compliment" as const, commits: true, handoff: { needed: true, reason: "Confirme" } };
    expect(decideAuto(base({ out: money })).reason).toMatch(/fechamento sozinho está desligado/);
    expect(decideAuto(base({ cfg: { ...base().cfg, autoClose: true }, out: money })).auto).toBe(true);
  });

  it("aviso de conferência do agente bloqueia, menos preço e 'já tenho site' (o aviso ali é para o dono, a resposta é segura)", () => {
    const warn = (topic: Topic) => ({ reply: "x", topic, commits: false, handoff: { needed: true, reason: "Confira" } });
    expect(decideAuto(base({ out: warn("how_works") })).auto).toBe(false);
    expect(decideAuto(base({ out: warn("price") })).auto).toBe(true);
    expect(decideAuto(base({ out: warn("has_site") })).auto).toBe(true);
    expect(decideAuto(base({ out: warn("audio") })).auto).toBe(true);
  });

  it("imagem: o agente pede para escrever sozinho e a conversa continua em 'Precisa de você'", () => {
    const d = decideAuto(base({ out: { reply: "Recebi, mas não consigo abrir arquivos por aqui. Pode me explicar por escrito?", topic: "media", commits: false, handoff: { needed: true, reason: "Ele mandou imagem." } } }));
    expect(d).toEqual({ auto: true, reason: "ok", notifyOwner: true });
  });

  it("a resposta que o dono escreveu em Configurações sai sozinha; sem ela, o assunto continua dele", () => {
    const answer = (authorized: boolean) => ({ reply: "x", topic: "guarantee" as const, commits: false, authorized, handoff: { needed: !authorized, reason: "Defina os termos" } });
    expect(decideAuto(base({ out: answer(true) })).auto).toBe(true);
    expect(decideAuto(base({ out: answer(false) })).auto).toBe(false);
    // authorized só vale nos assuntos que existem em Configurações
    expect(decideAuto(base({ out: { reply: "x", topic: "abusive", commits: false, authorized: true, handoff: { needed: false, reason: null } } })).auto).toBe(false);
  });

  it("pergunta livre respondida pela IA sai sozinha, e avisa o dono só quando a IA pediu", () => {
    const free = (aiAskedHuman: boolean) => ({
      reply: "Crio sim. Posso montar uma prévia?",
      topic: "other" as const,
      commits: false,
      freeform: true,
      aiAskedHuman,
      handoff: { needed: true, reason: "Resposta escrita pela IA fora do roteiro." },
    });
    expect(decideAuto(base({ out: free(false) }))).toEqual({ auto: true, reason: "ok", notifyOwner: false });
    expect(decideAuto(base({ out: free(true) }))).toEqual({ auto: true, reason: "ok", notifyOwner: true });
    const off = decideAuto(base({ cfg: { ...base().cfg, autoFreeform: false }, out: free(false) }));
    expect(off.auto).toBe(false);
    expect(off.reason).toMatch(/livres/);
  });

  it("pergunta livre continua sujeita aos tetos, ao dono assumindo e à mensagem longa", () => {
    const free = { reply: "Crio sim.", topic: "other" as const, commits: false, freeform: true, aiAskedHuman: false, handoff: { needed: true, reason: "x" } };
    expect(decideAuto(base({ out: free, humanTakenOver: true })).auto).toBe(false);
    expect(decideAuto(base({ out: free, autoInConversation: 10 })).auto).toBe(false);
    expect(decideAuto(base({ out: free, inboundText: "a".repeat(601) })).auto).toBe(false);
  });

  it("mensagem longa do lead vai para o dono", () => {
    expect(decideAuto(base({ inboundText: "a".repeat(601) })).reason).toMatch(/longa/);
    expect(decideAuto(base({ inboundText: "a".repeat(600) })).auto).toBe(true);
  });

  it("respeita os tetos por conversa e por dia", () => {
    expect(decideAuto(base({ autoInConversation: 10 })).reason).toMatch(/10 vezes/);
    expect(decideAuto(base({ autoInConversation: 9 })).auto).toBe(true);
    expect(decideAuto(base({ autoToday: 80 })).reason).toMatch(/80 respostas/);
  });

  it("falta a chave Pix: não sai sozinho mesmo com o fechamento ligado", () => {
    const d = decideAuto(base({ cfg: { ...base().cfg, autoClose: true }, out: { reply: "Ótimo! Já te passo a chave.", topic: "compliment", commits: true, handoff: { needed: true, reason: "x" }, missing: "pix_key" } }));
    expect(d).toEqual({ auto: false, reason: "falta a sua chave Pix em Configurações" });
  });

  it("a frase de confirmação está definida", () => {
    expect(AUTONOMY_CONFIRM).toBe("ATENDER SOZINHO");
  });
});

describe("madeClosingOffer", () => {
  const offer = { direction: "out" as const, status: "sent" as const, variant: "agente+auto:compliment", body: "Que bom! O site fica em R$ 800. O sinal é de 50%. Posso te passar o Pix?" };
  it("só vale a oferta com valor e Pix, já enviada ou agendada", () => {
    expect(madeClosingOffer([offer])).toBe(true);
    expect(madeClosingOffer([{ ...offer, status: "approved" }])).toBe(true);
    expect(madeClosingOffer([{ ...offer, status: "draft" }])).toBe(false);
    expect(madeClosingOffer([{ ...offer, status: "cancelled" }])).toBe(false);
    expect(madeClosingOffer([{ ...offer, body: "Obrigado! Posso te mostrar a prévia?" }])).toBe(false);
    expect(madeClosingOffer([{ ...offer, variant: "agente:who" }])).toBe(false);
    expect(madeClosingOffer([{ ...offer, direction: "in" as never }])).toBe(false);
    expect(madeClosingOffer([])).toBe(false);
  });
});

describe("o gabarito inteiro diante do nível 3", () => {
  it("só sai sozinho o que a lista permite, e tudo que sai passa de novo na trava de fatos", () => {
    let alone = 0;
    for (const sc of SCENARIOS) {
      const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup });
      const out = rulesReply(ctx);
      const d = decideAuto({
        cfg: { autonomy: "semi", autoClose: false, autoFreeform: true, autoMaxPerConversation: 10, autoMaxPerDay: 80, paused: false },
        out,
        humanTakenOver: false,
        blocked: false,
        inboundText: sc.text,
        autoInConversation: 0,
        autoToday: 0,
      });
      if (!d.auto) continue;
      alone++;
      expect(AUTO_TOPICS, sc.id).toContain(out.topic);
      expect(out.commits, sc.id).toBe(false);
      expect(finalCheck(out.reply!, { facts: ctx.facts, proposal: ctx.proposal, demoUrl: ctx.demoUrl ?? "https://painel.exemplo.com.br/p/abcdefghij0123456789" }).ok, sc.id).toBe(true);
    }
    expect(alone).toBeGreaterThan(20); // o agente de fato atende a maior parte da conversa
  });

  it("garantia, domínio, exemplos, golpe e fora do roteiro nunca saem sozinhos sem a resposta do dono", () => {
    for (const id of ["garantia", "dominio", "mensalidade", "exemplos", "email", "golpe", "fora-do-roteiro", "achou-caro", "parcelar", "mudar-a-cor"]) {
      const sc = SCENARIOS.find((s) => s.id === id)!;
      const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup });
      const out = rulesReply(ctx);
      const d = decideAuto({
        cfg: { autonomy: "semi", autoClose: true, autoFreeform: true, autoMaxPerConversation: 10, autoMaxPerDay: 80, paused: false },
        out,
        humanTakenOver: false,
        blocked: false,
        inboundText: sc.text,
        autoInConversation: 0,
        autoToday: 0,
      });
      expect(d.auto, id).toBe(false);
    }
  });
});

describe("o que o dono autorizou nas Configurações", () => {
  const policies = {
    guarantee: "Você só paga o restante se aprovar o site pronto. Uma rodada de ajustes está incluída.",
    hosting: "Sem mensalidade. O domínio .com.br custa cerca de R$ 40 por ano e fica no seu nome.",
    payment: "Aceito Pix e cartão em até 3x.",
    portfolio: "Meu portfólio está em https://jk.studio/portfolio e a prévia é o melhor exemplo.",
    price: "Entendo. Se fechar esta semana, faço por R$ 700.",
  };
  const cfg = { autonomy: "semi" as const, autoClose: false, autoFreeform: true, autoMaxPerConversation: 10, autoMaxPerDay: 80, paused: false };

  it.each(["garantia", "dominio", "mensalidade", "exemplos", "email", "achou-caro", "parcelar"])("%s sai sozinho com a resposta dele e passa na trava de fatos", (id) => {
    const sc = SCENARIOS.find((s) => s.id === id)!;
    const ctx = simulationContext({ text: sc.text, media: sc.media, ...sc.setup, facts: { policies } });
    const out = rulesReply(ctx);
    expect(out.authorized, id).toBe(true);
    const d = decideAuto({ cfg, out, humanTakenOver: false, blocked: false, inboundText: sc.text, autoInConversation: 0, autoToday: 0 });
    expect(d.auto, id).toBe(true);
    expect(d.notifyOwner, id).toBe(false);
    expect(finalCheck(out.reply!, { facts: ctx.facts, proposal: null, demoUrl: null }, { trusted: true }).ok, id).toBe(true);
  });

  it("o texto do dono não precisa passar pelo humanizador, mas número inventado continua barrado", () => {
    const ctx = simulationContext({ text: "Tem garantia?", facts: { policies } });
    // "garantia" é palavra proibida na IA, não no texto do dono
    expect(finalCheck(policies.guarantee, ctx, { trusted: true }).ok).toBe(true);
    expect(finalCheck("Você só paga o restante se aprovar. Garantia de 100%.", ctx, { trusted: false }).ok).toBe(false);
    // R$ 700 e R$ 40 existem nas respostas dele; R$ 650 não
    expect(finalCheck("Faço por R$ 700.", ctx, { trusted: true }).ok).toBe(true);
    expect(finalCheck("Faço por R$ 650.", ctx, { trusted: true }).ok).toBe(false);
  });

  it("links e prazos escritos pelo dono valem como fato; os inventados pela IA, não", () => {
    const ctx = simulationContext({ text: "Tem exemplos?", facts: { policies: { ...policies, guarantee: "Entrego em até 5 dias." } } });
    expect(finalCheck("Veja em https://jk.studio/portfolio", ctx).ok).toBe(true);
    expect(finalCheck("Veja em https://outro-site.com/trabalhos", ctx).ok).toBe(false);
    expect(finalCheck("Entrego em até 5 dias.", ctx).ok).toBe(true);
    expect(finalCheck("Entrego em até 9 dias.", ctx).ok).toBe(false);
  });
});

describe("variant com marca de 'sozinho'", () => {
  it("escreve e lê de volta", () => {
    expect(agentVariant({ source: "rules", topic: "price", asked: null })).toBe("agente:price");
    expect(agentVariant({ source: "ai", topic: "price", asked: null }, true)).toBe("agente-ia+auto:price");
    expect(parseAgentVariant("agente-ia+auto:price")).toEqual({ source: "ai", auto: true, topic: "price", question: false });
    expect(parseAgentVariant("agente+auto:q-objetivo")).toEqual({ source: "rules", auto: true, topic: "objetivo", question: true });
    expect(parseAgentVariant("agente:q-objetivo")).toMatchObject({ auto: false, question: true });
    expect(parseAgentVariant("abertura-none-1")).toBeNull();
    expect(parseAgentVariant(null)).toBeNull();
  });
});

describe("entrega ao dono (fila): prévia pedida e sistema", () => {
  const queued = (over: Record<string, unknown> = {}) => ({
    reply: "Claro! Vou montar a prévia da Clínica com cuidado e te mando por aqui.",
    topic: "wants_preview" as const,
    commits: false,
    queued: true,
    handoff: { needed: true, reason: "Ele pediu uma prévia." },
    ...over,
  });

  it("sai sozinho (é só um aviso curto ao lead) e a conversa segue em 'Precisa de você'", () => {
    expect(decideAuto(base({ out: queued() }))).toEqual({ auto: true, reason: "ok", notifyOwner: true });
  });

  it("sem o aviso de fila, o assunto continua só do dono", () => {
    expect(decideAuto(base({ out: queued({ queued: false }) })).auto).toBe(false);
  });

  it("continua respeitando pausa, dono assumiu e tetos", () => {
    expect(decideAuto(base({ out: queued(), humanTakenOver: true })).auto).toBe(false);
    expect(decideAuto(base({ out: queued(), cfg: { ...base().cfg, paused: true } })).auto).toBe(false);
    expect(decideAuto(base({ out: queued(), autoInConversation: 10 })).auto).toBe(false);
  });

  it("'quero um site' (assunto novo) já é automático: só pergunta o objetivo", () => {
    const out = { reply: "Ótimo! O que você mais quer que o site faça?", topic: "wants_site" as const, commits: false, handoff: { needed: false, reason: null } };
    expect(decideAuto(base({ out })).auto).toBe(true);
  });
});
