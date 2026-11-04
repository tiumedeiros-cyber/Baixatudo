import { describe, expect, it } from "vitest";
import { checkMessage, humanizeText, lintMessage, MAX_WARNINGS } from "./humanize";

const rules = (text: string, type: "opening" | "followup" | "reply" = "reply") => lintMessage(text, type).map((i) => i.rule);

describe("humanizeText (correções mecânicas)", () => {
  it("troca traço de ligação por vírgula, sem mexer em palavra com hífen", () => {
    expect(humanizeText("O site — rápido e leve — fica pronto")).toBe("O site, rápido e leve, fica pronto");
    expect(humanizeText("Fica pronto -- sem enrolação")).toBe("Fica pronto, sem enrolação");
    expect(humanizeText("Vale a pena - e muito")).toBe("Vale a pena, e muito");
    expect(humanizeText("Guarda-chuva e pós-venda")).toBe("Guarda-chuva e pós-venda");
  });

  it("tira emoji, negrito, título e marcador de lista", () => {
    expect(humanizeText("Oi 😀 tudo bem?")).toBe("Oi tudo bem?");
    expect(humanizeText("O site fica **pronto** em *7 dias*")).toBe("O site fica pronto em 7 dias");
    expect(humanizeText("## Proposta\n- site\n- domínio")).toBe("Proposta\nsite\ndomínio");
  });

  it("endireita aspas curvas, reticências e pontuação repetida", () => {
    expect(humanizeText("Responda “pode” e eu envio…")).toBe('Responda "pode" e eu envio...');
    expect(humanizeText("Legal!!! Quer ver???")).toBe("Legal! Quer ver?");
    expect(humanizeText("Oi ,  tudo bem ?")).toBe("Oi, tudo bem?");
  });

  it("não estraga texto limpo", () => {
    const t = "Oi! Aqui é o Jonathan, da Kelvin Studio.\n\nPosso te mostrar uma prévia? Para parar de receber, responda PARE.";
    expect(humanizeText(t)).toBe(t);
  });
});

describe("lintMessage (padrões do humanizer em português)", () => {
  it("texto natural passa limpo", () => {
    expect(lintMessage("Os sites partem de R$ 800. Posso montar a prévia da sua clínica antes? Aí você decide vendo.", "reply")).toEqual([]);
  });

  it("contraste 'não é X, é Y' é erro", () => {
    expect(rules("Isso não é só um site, é uma vitrine para o seu negócio.")).toContain("contraste-nao-e");
    expect(rules("Não apenas melhora o visual, mas também atrai clientes.")).toContain("contraste-nao-e");
    expect(rules("Isso não significa gastar muito. Significa começar pequeno.")).toContain("contraste-nao-e");
  });

  it("'não é' sem contraste não dispara", () => {
    expect(rules("A prévia não é cobrada.")).not.toContain("contraste-nao-e");
    expect(rules("Não é urgente, quando puder me responde.")).not.toContain("contraste-nao-e");
  });

  it("resto de chatbot é erro", () => {
    for (const t of ["Espero ter ajudado!", "Fico à disposição para qualquer dúvida.", "Ótima pergunta! O site fica pronto em 7 dias.", "Como posso ajudar?"]) {
      expect(rules(t), t).toContain("residuo-de-chatbot");
    }
  });

  it("palavras de vitrine são erro e palavras de IA são aviso", () => {
    expect(rules("Uma solução completa e incrível para sua empresa")).toContain("palavra-de-vitrine");
    expect(rules("Vamos potencializar suas vendas")).toContain("palavra-de-vitrine");
    expect(rules("É fundamental ter presença digital")).toContain("palavra-de-ia");
    const sev = lintMessage("É fundamental ter presença digital", "reply").find((i) => i.rule === "palavra-de-ia");
    expect(sev?.severity).toBe("warn");
  });

  it("anúncio do ponto, frase de efeito e defesa sem acusador são avisos", () => {
    expect(rules("Vou ser direto: o site fica em R$ 800.")).toContain("preparacao-de-ponto");
    expect(rules("No fundo, o que importa é aparecer.")).toContain("frase-de-efeito");
    expect(rules("Vale ressaltar que a prévia não custa nada.")).toContain("discute-com-ninguem");
  });

  it("traço, emoji, negrito, lista e rótulo", () => {
    expect(rules("O site — pronto em 7 dias")).toContain("traco-como-conector");
    expect(rules("Oi 😀")).toContain("emoji");
    expect(rules("Fica **pronto** logo")).toContain("negrito-ou-titulo");
    expect(rules("Inclui:\n- site\n- domínio")).toContain("lista");
    expect(rules("Prazo: 7 dias")).toContain("rotulo-com-dois-pontos");
  });

  it("fecho dramático em linha própria", () => {
    expect(rules("O site fica pronto em 7 dias.\n\nSimples assim.")).toContain("fecho-dramatico");
  });

  it("tamanho: aviso no limite macio, erro no duro", () => {
    const base = "Texto curto de teste. ";
    const mid = base.repeat(14); // ~308 caracteres
    expect(rules(mid, "reply")).toContain("longa");
    expect(rules(base.repeat(20), "reply")).toContain("longa-demais");
    expect(rules(base.repeat(16), "opening")).toContain("longa"); // 352 > 330 (limite macio da abertura)
    expect(rules(base.repeat(8), "opening")).not.toContain("longa"); // 176 cabe
  });

  it("uma pergunta por mensagem e pouca exclamação", () => {
    expect(rules("Quer ver a prévia? Pode ser amanhã?")).toContain("varias-perguntas");
    expect(rules("Legal! Perfeito! Show!")).toContain("exclamacao-demais");
    expect(rules("Oi! Posso te mostrar? Legal!", "opening")).toContain("exclamacao-demais");
  });

  it("número com vírgula e valor não contam como fim de frase", () => {
    expect(rules("Nota 4,9 no Google. O site custa R$ 1.200,50 e fica pronto logo.")).not.toContain("frases-demais");
    expect(rules("Primeira frase. Segunda frase. Terceira frase. Quarta frase. Quinta frase.")).toContain("frases-demais");
  });
});

describe("checkMessage", () => {
  it("corrige o mecânico e aprova", () => {
    const r = checkMessage("Oi 😀 — o site fica pronto em 7 dias", "reply");
    expect(r.text).toBe("Oi, o site fica pronto em 7 dias");
    expect(r.ok).toBe(true);
  });

  it("reprova quando sobra erro que não se conserta sozinho", () => {
    const r = checkMessage("Isso não é só um site, é uma vitrine. Espero ter ajudado!", "reply");
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.rule)).toEqual(expect.arrayContaining(["contraste-nao-e", "residuo-de-chatbot"]));
  });

  it("reprova texto com avisos demais", () => {
    const t = "Sinceramente, é fundamental ter presença digital, e vale ressaltar que a jornada começa agora.";
    const r = checkMessage(t, "reply");
    expect(r.issues.filter((i) => i.severity === "warn").length).toBeGreaterThan(MAX_WARNINGS);
    expect(r.ok).toBe(false);
  });
});
