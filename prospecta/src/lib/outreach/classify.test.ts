import { describe, expect, it } from "vitest";
import { classifyReply } from "./classify";

const intent = (text: string) => classifyReply(text).intent;

describe("classifyReply", () => {
  it("pedido para parar tem prioridade e bloqueia", () => {
    for (const t of [
      "PARE",
      "Pare",
      "pare por favor",
      "Pode parar",
      "para de me mandar mensagem",
      "não quero mais receber mensagens",
      "Não quero receber contato",
      "me tira da lista",
      "remover meu número",
      "isso é spam, vou denunciar",
      "nao me envie mais nada",
      "chega de mensagem",
      "número errado",
      "foi engano",
      "pessoa errada",
    ]) {
      const c = classifyReply(t);
      expect(c.intent, t).toBe("optout");
      expect(c.optout, t).toBe(true);
    }
  });

  it("interessado", () => {
    for (const t of ["Pode sim", "pode mandar", "Quero ver", "Tenho interesse", "bora", "sim", "Sim!", "manda aí", "Claro"]) {
      expect(intent(t), t).toBe("interested");
    }
  });

  it("pergunta de preço vence o interesse e precisa do dono", () => {
    for (const t of ["Quanto custa?", "qual o valor", "Quero sim, quanto é?", "me passa um orçamento", "custa quanto"]) {
      const c = classifyReply(t);
      expect(c.intent, t).toBe("price");
      expect(c.needsHuman, t).toBe(true);
    }
  });

  it("recusa firme fecha a conversa sem precisar do dono", () => {
    for (const t of ["Não tenho interesse", "não, obrigado", "nao", "Não", "dispenso", "não preciso", "sem interesse"]) {
      const c = classifyReply(t);
      expect(c.intent, t).toBe("not_interested");
      expect(c.optout, t).toBe(false);
      expect(c.needsHuman, t).toBe(false);
    }
  });

  it("adiamento e objeção NÃO fecham a conversa: o agente ainda tem o que responder", () => {
    for (const t of ["Agora não", "talvez depois", "no momento não", "já tenho site", "já tenho um programador", "vou pensar"]) {
      const c = classifyReply(t);
      expect(c.intent, t).not.toBe("not_interested");
      expect(c.optout, t).toBe(false);
      expect(c.needsHuman, t).toBe(true);
    }
  });

  it("'quanto tempo' é prazo, não preço", () => {
    expect(intent("Quanto tempo demora?")).toBe("question");
    expect(intent("quanto tempo leva pra ficar pronto")).toBe("question");
    expect(intent("quanto custa e quanto tempo demora")).toBe("price");
  });

  it("'não' dentro de outra frase não vira desinteresse", () => {
    expect(intent("Não entendi, pode explicar?")).toBe("question");
    expect(intent("não sei se entendi")).not.toBe("not_interested");
  });

  it("dúvidas e conversa fora do roteiro vão para o dono", () => {
    for (const t of ["Como funciona?", "vocês fazem loja virtual?", "Quem é você?", "onde fica a empresa"]) {
      const c = classifyReply(t);
      expect(c.intent, t).toBe("question");
      expect(c.needsHuman, t).toBe(true);
    }
    expect(classifyReply("hmm").intent).toBe("other");
    expect(classifyReply("   ").intent).toBe("other");
    expect(classifyReply(null).needsHuman).toBe(true);
  });

  it("áudio e mídia vão para o dono", () => {
    expect(classifyReply(null, "audio")).toMatchObject({ intent: "audio", needsHuman: true });
    expect(classifyReply("", "image")).toMatchObject({ intent: "media", needsHuman: true });
    // se veio imagem com legenda, a legenda manda
    expect(classifyReply("pode sim", "image").intent).toBe("interested");
  });

  it("ignora acento, caixa e pontuação", () => {
    expect(intent("PREÇO???")).toBe("price");
    expect(intent("Não QUERO mais RECEBER mensagens!!!")).toBe("optout");
  });
});
