import { describe, expect, it } from "vitest";
import { lintMessage } from "@/lib/agent/humanize";
import { buildFollowUp, buildOpening, pickVariant, shortName, type TemplateLead } from "./templates";

const ctx = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor" };

const lead = (over: Partial<TemplateLead> = {}): TemplateLead => ({
  id: "11111111-aaaa-4aaa-8aaa-000000000001",
  name: "Clínica Valéria Sousa",
  neighborhood: "Siqueira",
  city: "Fortaleza",
  category: "Spa de saúde",
  niche: "Estética",
  rating: 4.9,
  reviewsCount: 126,
  websiteKind: "none",
  ...over,
});

describe("shortName", () => {
  it("tira emoji, slogan e espaços", () => {
    expect(shortName("💖 Clínica de Estética Beauty Glamour")).toBe("Clínica de Estética Beauty Glamour");
    expect(shortName("Raquel Souza Estética - Limpeza de pele, peeling químico, microagulhamento")).toBe("Raquel Souza Estética");
    expect(shortName("Estética Fortaleza | Dra. Fran Braga")).toBe("Estética Fortaleza");
  });

  it("corta nomes enormes sem quebrar palavra", () => {
    const n = shortName("Centro Integrado de Estética Avançada e Bem-Estar Corporal do Nordeste Brasileiro");
    expect(n.length).toBeLessThanOrEqual(48);
    expect(n.endsWith(" ")).toBe(false);
  });

  it("não deixa 'de', 'da', 'e' pendurados no fim quando o corte cai no meio da frase", () => {
    // 49 caracteres: o corte cairia em "...Carolina Silva de"
    const n = shortName("Escritório Natália Gabriela Silva de Albuquerque Maranhão Lima");
    expect(n.length).toBeLessThanOrEqual(48);
    expect(/\s(de|da|do|das|dos|e|em)$/i.test(n)).toBe(false);
  });

  it("tira a forma jurídica do fim ('Sociedade Individual de Advocacia', 'LTDA') e guarda o resto do nome", () => {
    expect(shortName("Natália Gabriela Sociedade Individual de Advocacia")).toBe("Natália Gabriela");
    expect(shortName("Clínica Bela Vida LTDA")).toBe("Clínica Bela Vida");
    expect(shortName("Tavares Lopes Sociedade de Advogados")).toBe("Tavares Lopes");
    // só a forma jurídica sozinha não vira nome vazio
    expect(shortName("Sociedade Individual de Advocacia")).toBe("Sociedade Individual de Advocacia");
  });

  it("deixa 'Advogados Associados' (é parte do nome do escritório)", () => {
    expect(shortName("TORRE FIGUEIREDO Advogados Associados")).toBe("TORRE FIGUEIREDO Advogados Associados");
  });
});

describe("pickVariant", () => {
  it("é estável e fica no intervalo", () => {
    expect(pickVariant("abc", 3)).toBe(pickVariant("abc", 3));
    for (const id of ["a", "b", "c", "d", "e", "f"]) expect(pickVariant(id, 3)).toBeLessThan(3);
  });

  it("espalha entre as variações", () => {
    const seen = new Set(Array.from({ length: 60 }, (_, i) => pickVariant(`lead-${i}`, 3)));
    expect(seen.size).toBe(3);
  });
});

describe("abertura", () => {
  it.each(["none", "social", "weak", "real"] as const)("regras de ouro para site '%s'", (kind) => {
    for (let i = 0; i < 12; i++) {
      const { body, variant } = buildOpening(lead({ id: `id-${i}`, websiteKind: kind }), ctx);
      expect(body, variant).toContain("Jonathan");
      expect(body, variant).toContain("Kelvin Studio");
      expect(body, variant).toContain("Clínica Valéria Sousa");
      expect(body, variant).not.toMatch(/PARE/); // a primeira mensagem não leva a linha de saída
      expect(body, variant).not.toMatch(/https?:\/\//); // sem link na abertura
      expect(body, variant).not.toMatch(/\p{Extended_Pictographic}/u); // sem emoji
      expect(body.match(/\?/g)?.length, variant).toBe(1); // uma pergunta só
      expect(body.length, variant).toBeLessThanOrEqual(240); // curto de verdade
      expect(body, variant).not.toContain("undefined");
      expect(body, variant).not.toContain("null");
    }
  });

  it("todo modelo passa nas regras do humanizador", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      for (let i = 0; i < 30; i++) {
        const { body, variant } = buildOpening(lead({ id: `h-${kind}-${i}`, websiteKind: kind }), ctx);
        expect(lintMessage(body, "opening"), `${variant}: ${body}`).toEqual([]);
      }
    }
  });

  it("com nome de 48 letras só pode estourar o limite macio de tamanho, nunca o duro", () => {
    const longName = "Centro Integrado de Estética Avançada e Bem-Estar Corporal do Nordeste Brasileiro";
    for (const kind of ["none", "social", "weak"] as const) {
      for (let i = 0; i < 30; i++) {
        const { body, variant } = buildOpening(lead({ id: `l-${kind}-${i}`, websiteKind: kind, name: longName }), ctx);
        expect(lintMessage(body, "opening").filter((x) => x.rule !== "longa"), `${variant}: ${body}`).toEqual([]);
        expect(body.length, variant).toBeLessThanOrEqual(300);
      }
    }
  });

  it("cada grupo tem 3 variações distintas", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      const seen = new Set(Array.from({ length: 60 }, (_, i) => buildOpening(lead({ id: `v-${kind}-${i}`, websiteKind: kind }), ctx).variant));
      expect(seen.size).toBe(3);
    }
  });

  it("usa a prova social só quando ela é boa", () => {
    const good = Array.from({ length: 9 }, (_, i) => buildOpening(lead({ id: `g-${i}`, rating: 4.9, reviewsCount: 126 }), ctx).body);
    expect(good.every((b) => /\(nota 4,9\)/.test(b))).toBe(true);
    const weak = buildOpening(lead({ rating: 3.8, reviewsCount: 4 }), ctx).body;
    expect(weak).not.toMatch(/nota|avalia/);
  });

  it("diz 'Instagram' só para quem tem Instagram", () => {
    const instaOnly = Array.from({ length: 9 }, (_, i) => buildOpening(lead({ id: `s-${i}`, websiteKind: "social" }), ctx).body);
    expect(instaOnly.some((b) => /Instagram/.test(b))).toBe(true);
    const none = Array.from({ length: 9 }, (_, i) => buildOpening(lead({ id: `n-${i}`, websiteKind: "none" }), ctx).body);
    expect(none.every((b) => !/Instagram/.test(b))).toBe(true);
  });

  it("o ramo sai com acento e em minúsculas, e sem cidade vira 'na sua região'", () => {
    const bodies = Array.from({ length: 30 }, (_, i) => buildOpening(lead({ id: `r-${i}`, niche: "Estética" }), ctx).body);
    expect(bodies.some((b) => b.includes("estética em Fortaleza"))).toBe(true);
    expect(bodies.some((b) => /estetica/.test(b))).toBe(false);
    const noCity = Array.from({ length: 30 }, (_, i) => buildOpening(lead({ id: `c-${i}`, city: null, niche: null, category: null }), ctx).body);
    expect(noCity.some((b) => b.includes("negócios na sua região"))).toBe(true);
    expect(noCity.every((b) => !/undefined|null/.test(b))).toBe(true);
  });

  it("lead sem bairro nem cidade não vira 'undefined'", () => {
    const { body } = buildOpening(lead({ neighborhood: null, city: null, niche: null, category: null }), ctx);
    expect(body).not.toMatch(/undefined|null/);
  });

  it("é determinístico por lead", () => {
    const a = buildOpening(lead(), ctx);
    expect(buildOpening(lead(), ctx)).toEqual(a);
  });
});

describe("follow-ups", () => {
  it("1º e 2º têm a saída, são curtos e não têm link", () => {
    for (const step of [1, 2] as const) {
      const { body } = buildFollowUp(lead(), step, ctx);
      expect(body).toMatch(/PARE/);
      expect(body).toContain("Clínica Valéria Sousa");
      expect(body).not.toMatch(/https?:\/\//);
      expect(body.length).toBeLessThanOrEqual(190);
      expect(lintMessage(body, "followup")).toEqual([]);
    }
  });

  it("o último avisa que é o último", () => {
    expect(buildFollowUp(lead(), 2, ctx).body).toMatch(/Última mensagem/);
  });
});

describe("fluxo qualificar: abordagens sem prévia", () => {
  const qctx = { ...ctx, flow: "qualificar" as const };

  it.each(["none", "social", "weak"] as const)("a abertura para site '%s' não oferece prévia e segue as regras de ouro", (kind) => {
    for (let i = 0; i < 12; i++) {
      const { body, variant } = buildOpening(lead({ id: `q-${kind}-${i}`, websiteKind: kind }), qctx);
      expect(body, variant).not.toMatch(/pr[eé]via/i);
      expect(body, variant).toContain("Clínica Valéria Sousa");
      expect(body, variant).not.toMatch(/PARE/);
      expect(body, variant).not.toMatch(/https?:\/\//);
      expect(body.match(/\?/g)?.length, variant).toBe(1);
      expect(body.length, variant).toBeLessThanOrEqual(330); // o limite macio da abertura: quem sou, elogio e dor, solução e pergunta
      expect(body, variant).not.toMatch(/Kelvin Studio/); // a marca não aparece na abertura
      expect(body, variant).toMatch(/Sou o Jonathan Kelvin, desenvolvedor/);
      expect(lintMessage(body, "opening"), `${variant}: ${body}`).toEqual([]);
    }
  });

  it("os dois follow-ups também não falam de prévia nem da marca", () => {
    for (const step of [1, 2] as const) {
      const { body } = buildFollowUp(lead(), step, qctx);
      expect(body).not.toMatch(/pr[eé]via/i);
      expect(body).not.toMatch(/Kelvin Studio/);
      expect(body).toMatch(/PARE/);
      expect(lintMessage(body, "followup")).toEqual([]);
    }
  });

  it("sem informar o fluxo, valem as abordagens com prévia de sempre", () => {
    expect(buildOpening(lead(), ctx).body).toMatch(/pr[eé]via/i);
  });
});

describe("follow-up do fluxo qualificar: o que 26/10 mostrou", () => {
  const qctx = { ...ctx, flow: "qualificar" as const };

  it("chama a pessoa pelo nome em vez de repetir o nome inteiro da empresa", () => {
    const fernanda = lead({ name: "Dra. Fernanda Teixeira Advogados Associados", niche: "ADVOCACIA", category: "Advogado" });
    const { body, variant } = buildFollowUp(fernanda, 1, qctx);
    expect(variant).toBe("followup-1");
    expect(body).toContain("Dra. Fernanda");
    expect(body).not.toMatch(/Advogados Associados|Ferreira/);
    expect(body).toMatch(/PARE/);
    expect(lintMessage(body, "followup")).toEqual([]);
  });

  it("advocacia e contabilidade ficam sóbrias: sem 'de novo', sem intimidade, uma retomada só", () => {
    const bazzi = lead({ name: "TORRE FIGUEIREDO Advogados Associados", niche: "ADVOCACIA", category: "Escritório de advocacia" });
    const first = buildFollowUp(bazzi, 1, qctx).body;
    expect(first).toMatch(/^Olá\./);
    expect(first).toContain("TORRE FIGUEIREDO");
    expect(first).not.toMatch(/de novo/);
    expect(lintMessage(first, "followup")).toEqual([]);
    const last = buildFollowUp(bazzi, 2, qctx).body;
    expect(last).toMatch(/última mensagem/);
    expect(last).toMatch(/PARE/);
    expect(lintMessage(last, "followup")).toEqual([]);
  });

  it("negócio com nome de gente no meio ('Embelezar por Bruna') chama pelo primeiro nome, e quem não tem nome de gente continua com o nome do negócio", () => {
    const bruna = lead({ name: "Embelezar por Bruna Prado Clinica Estética" });
    expect(buildFollowUp(bruna, 1, qctx).body).toMatch(/^Bom dia, Bruna!/);
    const casa = lead({ name: "Casa Maré Estética" });
    expect(buildFollowUp(casa, 1, qctx).body).toContain("Casa Maré Estética");
  });

  it("os dois passos seguem as regras de ouro, para qualquer tipo de lead", () => {
    for (const name of ["Dra. Fernanda Teixeira Advogados Associados", "Rafael Neves - ADVOCACIA", "Clínica Valéria Sousa", "Barbearia Vitra barber - Parangaba"]) {
      for (const step of [1, 2] as const) {
        const { body } = buildFollowUp(lead({ name }), step, qctx);
        expect(body, name).toMatch(/PARE/);
        expect(body, name).not.toMatch(/https?:\/\/|pr[eé]via|Kelvin Studio/i);
        expect(body.length, name).toBeLessThanOrEqual(190);
        expect(lintMessage(body, "followup"), `${name}: ${body}`).toEqual([]);
      }
    }
  });

  it("o nome do escritório continua inteiro quando não há uma pessoa para chamar", () => {
    const bazzi = lead({ name: "TORRE FIGUEIREDO Advogados Associados", niche: "ADVOCACIA", category: "Escritório de advocacia" });
    expect(buildFollowUp(bazzi, 1, qctx).body).toContain("TORRE FIGUEIREDO Advogados Associados");
  });
});
