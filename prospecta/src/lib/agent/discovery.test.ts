import { describe, expect, it } from "vitest";
import { simulationContext } from "./context";
import { ANSWER_LABEL, DISCOVERY_PLAN, MAX_ASKS, PRODUCT_LABEL, PRODUCT_WANTS, discoveryQuestion, discoverySummary, isCustom, isRefusal, nextStep } from "./discovery";
import { decideAuto, type AutoInput } from "./autonomy";
import { detectProduct, detectTopics } from "./topics";
import { askedQuestion } from "./variant";
import type { DiscoveryId, Product } from "./types";

describe("roteiro de perguntas", () => {
  it("site é curto, sistema e automação têm cinco passos", () => {
    expect(DISCOVERY_PLAN.site).toEqual(["objetivo", "material"]);
    expect(DISCOVERY_PLAN.sistema).toEqual(["escopo", "dor", "usuarios", "integracoes", "prazo"]);
    expect(DISCOVERY_PLAN.automacao).toEqual(DISCOVERY_PLAN.sistema);
  });

  it("todo passo do roteiro tem pergunta, com um único ponto de interrogação e sem número", () => {
    for (const product of ["site", "sistema", "automacao"] as Product[]) {
      for (const id of DISCOVERY_PLAN[product]) {
        const q = discoveryQuestion(product, id);
        expect(q, `${product}/${id}`).toBeTruthy();
        expect(q!.match(/\?/g)?.length, `${product}/${id}`).toBe(1);
        expect(q!, `${product}/${id}`).not.toMatch(/\d/); // o agente não inventa prazo nem valor
        expect(ANSWER_LABEL[id]).toBeTruthy();
      }
    }
  });

  it("a pergunta de automação fala de processo e canal, a de sistema de uso e integração", () => {
    expect(discoveryQuestion("automacao", "escopo")).toMatch(/automatizar/);
    expect(discoveryQuestion("automacao", "usuarios")).toMatch(/WhatsApp, Instagram ou telefone/);
    expect(discoveryQuestion("sistema", "usuarios")).toMatch(/equipe/);
    expect(discoveryQuestion("sistema", "integracoes")).toMatch(/WhatsApp, planilha, agenda ou pagamento/);
  });

  it("a próxima pergunta é a primeira sem resposta e ainda dentro do limite de tentativas", () => {
    const none = () => 0;
    expect(nextStep("sistema", {}, none)).toBe("escopo");
    expect(nextStep("sistema", { escopo: "x" }, none)).toBe("dor");
    expect(nextStep("sistema", { escopo: "x", dor: "y", usuarios: "z", integracoes: "w", prazo: "v" }, none)).toBeNull();
    // perguntou duas vezes e ele não respondeu: desiste dessa e segue para a próxima
    const asked = (id: DiscoveryId) => (id === "dor" ? MAX_ASKS : 0);
    expect(nextStep("sistema", { escopo: "x" }, asked)).toBe("usuarios");
  });

  it("o resumo para o dono segue o roteiro e mostra o que ficou sem resposta", () => {
    const summary = discoverySummary("sistema", { escopo: "agendamento online", prazo: "30 dias" });
    expect(summary).toMatch(/^Sistema\./);
    expect(summary).toMatch(/O que precisa fazer: “agendamento online”/);
    expect(summary).toMatch(/Como faz hoje e o que pesa: não respondeu/);
    expect(summary).toMatch(/Para quando quer: “30 dias”/);
    expect(summary.indexOf("O que precisa fazer")).toBeLessThan(summary.indexOf("Para quando quer"));
  });

  it("rótulos e produtos", () => {
    expect(PRODUCT_LABEL.automacao).toBe("Automação");
    expect(PRODUCT_WANTS.sistema).toBe("Quer sistema");
    expect(isCustom("site")).toBe(false);
    expect(isCustom("sistema")).toBe(true);
    expect(isCustom("automacao")).toBe(true);
    expect(isCustom(null)).toBe(false);
  });

  it("variante de pergunta reconhece todos os passos", () => {
    for (const id of ["objetivo", "tipo", "escopo", "material", "dor", "usuarios", "integracoes", "prazo"] as DiscoveryId[]) {
      expect(askedQuestion(`agente+auto:q-${id}`)).toBe(id);
    }
    expect(askedQuestion("agente:q-bobagem")).toBeNull();
  });
});

describe("recusa de verdade x resposta curta", () => {
  it("só 'sem interesse', 'dispenso' e parecidos são recusa; 'não' solto não é", () => {
    for (const t of ["não tenho interesse", "Sem interesse, obrigado", "dispenso", "não obrigado", "não quero mais conversar", "deixa pra lá"]) {
      expect(isRefusal(t), t).toBe(true);
    }
    for (const t of ["não", "não preciso de integração", "só eu", "uns 15 dias", "sim, com o WhatsApp", "não quero integrar com nada"]) {
      expect(isRefusal(t), t).toBe(false);
    }
  });
});

describe("sistema e automação", () => {
  it("reconhece automação, e sistema vence quando ele fala dos dois", () => {
    expect(detectProduct("quero automatizar o atendimento")).toBe("automacao");
    expect(detectProduct("preciso de um robô para o WhatsApp")).toBe("automacao");
    expect(detectProduct("quero um chatbot")).toBe("automacao");
    expect(detectProduct("um sistema com automação de cobrança")).toBe("sistema");
    expect(detectProduct("quero um site")).toBe("site");
    // sem confundir palavras que só contêm 'bot' ou 'robo'
    expect(detectProduct("o botão do meu site não funciona")).toBe("site");
    expect(detectProduct("já tenho uma automação")).toBeNull();
  });

  it("automação é assunto fora do roteiro no fluxo antigo e pedido de sistema no novo", () => {
    expect(detectTopics("quero um robô para atender")[0]).not.toBe("system_request");
    expect(detectTopics("quero um robô para atender", null, "qualificar")).toContain("system_request");
  });

  it("a primeira mensagem completa já vira a resposta do escopo (sem perguntar de novo)", () => {
    const ctx = simulationContext({ text: "preciso de um sistema de agendamento online para a minha clínica", facts: { flow: "qualificar" } });
    expect(ctx.ficha.product).toBe("sistema");
    expect(ctx.ficha.answers.escopo).toMatch(/sistema de agendamento online/);
  });

  it("resposta curta no meio do roteiro vale; pergunta do lead não é resposta", () => {
    const history = [
      { from: "us" as const, text: "Oi!" },
      { from: "lead" as const, text: "quero um sistema" },
      { from: "us" as const, text: "Entendi! Quem vai usar: só você, a sua equipe ou os seus clientes também?", variant: "agente+auto:q-usuarios" },
    ];
    const short = simulationContext({ text: "só eu", history, facts: { flow: "qualificar" } }).ficha;
    expect(short.lastAnswered).toBe("usuarios");
    expect(short.answers.usuarios).toBe("só eu");
    const asking = simulationContext({ text: "quanto custa?", history, facts: { flow: "qualificar" } }).ficha;
    expect(asking.lastAnswered).toBeNull();
    expect(asking.answers.usuarios).toBeUndefined();
    // "sim" solto só responde pergunta de sim ou não
    const yes = simulationContext({ text: "sim", history, facts: { flow: "qualificar" } }).ficha;
    expect(yes.lastAnswered).toBeNull();
  });
});

describe("autonomia: pergunta do roteiro", () => {
  const base = (over: Partial<AutoInput["out"]> = {}): AutoInput => ({
    cfg: { autonomy: "semi", autoClose: false, autoFreeform: true, autoMaxPerConversation: 10, autoMaxPerDay: 80, paused: false },
    out: { reply: "Entendi! Como vocês fazem isso hoje e o que mais dá trabalho?", topic: "system_request", commits: false, handoff: { needed: false, reason: null }, discovery: true, ...over },
    humanTakenOver: false,
    blocked: false,
    inboundText: "preciso de um sistema",
    autoInConversation: 0,
    autoToday: 0,
  });

  it("sai sozinha em qualquer assunto e NÃO chama o dono ainda", () => {
    expect(decideAuto(base())).toEqual({ auto: true, reason: "ok", notifyOwner: false });
    expect(decideAuto(base({ topic: "price" })).notifyOwner).toBe(false);
  });

  it("continua respeitando pausa, dono assumiu e tetos", () => {
    expect(decideAuto({ ...base(), humanTakenOver: true }).auto).toBe(false);
    expect(decideAuto({ ...base(), cfg: { ...base().cfg, paused: true } }).auto).toBe(false);
    expect(decideAuto({ ...base(), autoInConversation: 10 }).auto).toBe(false);
  });

  it("sem o aviso do roteiro, o assunto fora da lista continua só do dono", () => {
    expect(decideAuto(base({ discovery: false })).auto).toBe(false);
  });
});
