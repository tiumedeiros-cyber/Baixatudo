import { describe, expect, it } from "vitest";
import { factsFromSettings } from "@/lib/agent/context";
import type { LlmClient, LlmRequest } from "@/lib/agent/llm";
import { DEFAULT_SETTINGS } from "@/lib/leads/types";
import { MAX_PART_CHARS, openingSystemPrompt, openingUserPrompt, validateOpening, writeOpening, writeOpenings } from "./opening";
import { ANGLES, addressee, angleFor, buildOpening, positioning, type TemplateLead } from "./templates";

const ctx = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor", flow: "qualificar" as const };
const facts = factsFromSettings({ ...DEFAULT_SETTINGS, agentFlow: "qualificar" });

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

const HELOISA = lead({ id: "heloisa", name: "Dra. Heloisa Lima - Estética Avançada", rating: 5, reviewsCount: 80, websiteKind: "social", neighborhood: "Álvaro Weyne" });

/** A abertura boa no formato novo: quem sou, elogio com dado real e dor, solução com uma pergunta. */
const GOOD = [
  "Oi! Sou o Jonathan Kelvin, desenvolvedor.",
  "Vi o perfil de Clínica Valéria Sousa no Google (nota 4,9), mas vocês ainda não têm site: quem chega lá não tem onde conhecer os serviços e agendar.",
  "Eu crio o site que resolve isso. Posso te explicar como funciona?",
];
const GOOD_HELOISA = [
  "Oi, Dra. Heloisa! Sou o Jonathan Kelvin, desenvolvedor.",
  "Sua nota 5,0 no Google é excelente. Mas hoje está só no Instagram: quem pesquisa no Google não acha um site para conhecer e agendar.",
  "Eu crio esse site. Posso te explicar como funciona?",
];

/** Uma IA de mentira: devolve o que mandarem, na ordem, e guarda os pedidos. */
function fake(replies: (string | Error)[] | ((req: LlmRequest, call: number) => string | Promise<string>)): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: "fake",
    model: "fake-1",
    calls,
    async complete(req) {
      const i = calls.push(req) - 1;
      if (typeof replies === "function") return replies(req, i);
      const r = replies[Math.min(i, replies.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
}

const json = (messages: string[]) => JSON.stringify({ messages });
const nameIn = (req: LlmRequest) => /- Nome: (.*)/.exec(req.user)![1].trim();
/** Uma IA que escreve uma abertura boa para o lead do pedido. */
const smart = () =>
  fake((req) =>
    json([
      "Oi! Sou o Jonathan Kelvin, desenvolvedor.",
      `Vi o perfil de ${nameIn(req)} no Google, mas vocês ainda não têm site: quem chega lá não tem onde conhecer os serviços e agendar.`,
      "Eu crio o site que resolve isso. Posso te explicar como funciona?",
    ]),
  );

describe("o que ele faz: a IA segue a forma sorteada", () => {
  const styled = { ...ctx, senderRole: "desenvolvedor e ajudo empresas a se posicionarem na internet", style: { greet: 0, intro: 0, ask: 0, angle: "elogio", role: 3 } };
  const withRole = (role: string) => [`Oi! Sou o Jonathan Kelvin, ${role}.`, GOOD[1], GOOD[2]];

  it("aceita a abertura que usa a forma indicada", () => {
    expect(validateOpening(withRole("desenvolvedor de sites"), lead(), styled, facts)).toMatchObject({ ok: true });
  });

  it("recusa a que volta para a frase fixa das Configurações (o texto que se repetia em todas)", () => {
    const r = validateOpening(withRole("desenvolvedor e ajudo empresas a se posicionarem na internet"), lead(), styled, facts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(" ")).toMatch(/não diz o que faz como indicado \("desenvolvedor de sites"\)/);
  });

  it("sem estilo (fluxo de sempre) nada muda: não exige forma nenhuma", () => {
    expect(validateOpening(withRole("desenvolvedor"), lead(), ctx, facts)).toMatchObject({ ok: true });
  });

  it("o pedido à IA traz a forma sorteada no lugar da frase longa das Configurações", () => {
    const sys = openingSystemPrompt(styled);
    expect(sys).toContain("Jonathan Kelvin, desenvolvedor de sites,");
    expect(sys).not.toContain("ajudo empresas a se posicionarem na internet,");
    const user = openingUserPrompt(lead(), styled, angleFor(lead(), styled.style));
    expect(user).toContain('EXATAMENTE como "desenvolvedor de sites"');
  });

  it("IA que ignora a forma e fica na frase fixa cai no modelo, que sempre a usa", async () => {
    const llm = fake(() => json(withRole("desenvolvedor e ajudo empresas a se posicionarem na internet")));
    const w = await writeOpening(lead(), styled, { llm, facts });
    expect(w.source).toBe("modelo");
    expect(w.note).toMatch(/não diz o que faz como indicado/);
    expect(w.parts[0]).toMatch(/desenvolvedor de sites/);
    expect(w.variant).toMatch(/~g0i0q0r3$/);
  });
});

describe("validateOpening", () => {
  it("texto bom passa, e a abertura não leva a linha 'responda PARE'", () => {
    const r = validateOpening(GOOD, lead(), ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.parts).toHaveLength(3);
    expect(r.parts.join(" ")).not.toMatch(/PARE|parar de receber/i);
  });

  it("falando com a Dra. pelo nome, em segunda pessoa, passa", () => {
    const r = validateOpening(GOOD_HELOISA, HELOISA, ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("se a IA escrever a linha 'responda PARE' por conta própria, ela é tirada", () => {
    const r = validateOpening([...GOOD.slice(0, 2), `${GOOD[2]} Para parar de receber, responda PARE.`], lead(), ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.parts.join(" ")).not.toMatch(/PARE/);
  });

  const reject = (messages: string[], reason: RegExp, l: TemplateLead = lead()) => {
    const r = validateOpening(messages, l, ctx, facts);
    expect(r.ok, messages.join(" | ")).toBe(false);
    if (!r.ok) expect(r.reasons.join("; ")).toMatch(reason);
  };

  it("exige se apresentar como pessoa e NÃO citar a marca", () => {
    reject(["Oi! Vi o perfil de Clínica Valéria Sousa no Google e vocês não têm site.", "Eu crio o site. Posso te explicar?"], /não se apresenta como Jonathan Kelvin/);
    reject(["Oi! Sou o Jonathan, da Kelvin Studio.", GOOD[1], GOOD[2]], /não se apresenta como Jonathan Kelvin|cita a marca/);
    reject(["Oi! Sou o Jonathan Kelvin, da Kelvin Studio.", GOOD[1], GOOD[2]], /cita a marca \(Kelvin Studio\)/);
  });

  it("exige o negócio ou a pessoa pelo nome dos dados, site e uma pergunta só, na última mensagem", () => {
    reject([GOOD[0], "Vi o perfil de vocês no Google e não achei site.", GOOD[2]], /não cita o negócio nem a pessoa/);
    reject([GOOD[0], "Vi o perfil de Clínica Valéria Sousa no Google, mas vocês não têm onde agendar.", "Eu crio isso. Posso te explicar?"], /não fala de site/);
    reject([GOOD[0], GOOD[1], "Eu crio o site que resolve isso. Posso te explicar? Vale a conversa?"], /única pergunta/);
    reject(["Oi! Sou o Jonathan Kelvin, desenvolvedor. Já pensaram em ter um site?", GOOD[1], "Eu crio o site que resolve isso."], /única pergunta/);
  });

  it("a Dra. precisa ser chamada pelo título e pelo nome, e nunca em terceira pessoa (o erro do print)", () => {
    // errado: "Achei a Dra. Heloisa no Google", sendo que é ela quem está lendo
    reject(["Oi! Sou o Jonathan Kelvin, desenvolvedor.", "Achei a Dra. Heloisa Lima no Google, com nota 5,0. Vi que divulga pelo Instagram e ainda não tem site.", "Eu crio esse site. Posso te explicar como funciona?"], /não trata a pessoa por Dra\. Heloisa|terceira pessoa/, HELOISA);
    reject(["Oi, Dra. Heloisa! Sou o Jonathan Kelvin, desenvolvedor.", "Vi que a Dra. Heloisa tem nota 5,0 no Google, mas o trabalho está só no Instagram e sem site.", "Eu crio esse site. Posso te explicar como funciona?"], /terceira pessoa/, HELOISA);
    // sem o tratamento
    reject(["Oi! Sou o Jonathan Kelvin, desenvolvedor.", "Seu perfil tem nota 5,0 no Google, mas hoje ele está só no Instagram e sem site.", "Eu crio esse site. Posso te explicar como funciona?"], /não trata a pessoa por Dra\. Heloisa/, HELOISA);
  });

  it("não inventa o nome de ninguém", () => {
    reject(["Oi, Maria! Sou o Jonathan Kelvin, desenvolvedor.", GOOD[1], GOOD[2]], /nome que não vem dos dados/);
    // mas chamar a pessoa pelo primeiro nome do negócio vale
    const larissa = lead({ id: "c", name: "Larissa Mendes Estética e Beleza", websiteKind: "social", rating: 4.9, reviewsCount: 40 });
    const ok = validateOpening(["Oi, Larissa! Sou o Jonathan Kelvin, desenvolvedor.", "Sua nota 4,9 no Google mostra que o seu trabalho é bem avaliado. Mas ele está só no Instagram, sem site para conhecer e agendar.", "Eu crio esse site. Posso te explicar?"], larissa, ctx, facts);
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
  });

  it('não precisa de "tudo bem"', () => {
    reject(["Oi, tudo bem. Sou o Jonathan Kelvin, desenvolvedor.", GOOD[1], GOOD[2]], /tudo bem/);
  });

  it("não deixa passar prévia, preço, desconto, garantia nem link", () => {
    reject([GOOD[0], GOOD[1], "Eu crio o site que resolve isso. Posso te mostrar uma prévia?"], /prévia, preço/);
    reject([GOOD[0], GOOD[1], "Faço por R$ 800. Posso te explicar como funciona?"], /prévia, preço|dinheiro/);
    reject([GOOD[0], GOOD[1], "Tenho desconto para quem fecha logo. Posso te explicar?"], /prévia, preço/);
    reject([GOOD[0], GOOD[1], "Veja kelvin.com.br. Posso te explicar como funciona?"], /link|endereço/);
    reject([GOOD[0], GOOD[1], "Garantimos resultado com o site. Posso te explicar?"], /garanti|promessa|vitrine/);
  });

  it("só cita número que vem dos dados: a nota boa, e nunca avaliações inventadas", () => {
    reject([GOOD[0], "Vi o perfil de Clínica Valéria Sousa com 200 avaliações e vocês não têm site.", GOOD[2]], /número que não vem dos dados: 200/);
    reject([GOOD[0], "Vi o perfil de Clínica Valéria Sousa (nota 4,2) e vocês não têm site.", GOOD[2]], /número que não vem dos dados: 4,2/);
    // nota ruim não se cita nunca
    reject(GOOD, /número que não vem dos dados: 4,9/, lead({ rating: 3.8, reviewsCount: 4 }));
    reject([GOOD[0], "Vi o perfil de Clínica Valéria Sousa, bem avaliada, e vocês não têm site.", GOOD[2]], /nota ou avaliações/, lead({ rating: 3.8, reviewsCount: 4 }));
  });

  it("os números do próprio nome do negócio não contam", () => {
    const l = lead({ name: "Studio 21 Estética", rating: null, reviewsCount: 0 });
    const r = validateOpening([GOOD[0], "Vi o perfil de Studio 21 Estética no Google, mas vocês ainda não têm site para agendar.", GOOD[2]], l, ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it("negócio sem rede social nos dados não ganha Instagram", () => {
    const text = [GOOD[0], "Vi o Instagram de Clínica Valéria Sousa, mas vocês ainda não têm site para agendar.", GOOD[2]];
    reject(text, /rede social/);
    expect(validateOpening(text, lead({ websiteKind: "social", rating: null, reviewsCount: 0 }), ctx, facts).ok).toBe(true);
  });

  it("mensagem longa demais, mensagens demais e texto vazio", () => {
    reject([GOOD[0], `Vi o perfil de Clínica Valéria Sousa no Google e vocês ainda não têm site, e pesquisando por aqui na internet notei que ${"muita gente ".repeat(8)}procura.`, GOOD[2]], /caracteres/);
    reject([GOOD[0], "Vi o perfil de Clínica Valéria Sousa.", "Vocês não têm site.", GOOD[2]], /mais de 3 mensagens/);
    reject([], /vazia/);
    reject(["   ", ""], /vazia/);
  });

  it("emoji e traço são corrigidos antes de conferir (não reprovam)", () => {
    const r = validateOpening(["Oi! 😊 Sou o Jonathan Kelvin, desenvolvedor.", "Vi o perfil de Clínica Valéria Sousa no Google — mas vocês ainda não têm site para agendar.", GOOD[2]], lead({ rating: null, reviewsCount: 0 }), ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.parts.join(" ")).not.toMatch(/😊|—/);
  });

  it(`cada mensagem tem no máximo ${MAX_PART_CHARS} caracteres e o conjunto cabe no limite do humanizador`, () => {
    const r = validateOpening(GOOD, lead(), ctx, facts);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.parts.join("\n\n").length).toBeLessThanOrEqual(340);
  });
});

describe("tratamento direto", () => {
  it("o título e o primeiro nome viram o jeito de chamar; sem título não se inventa nome", () => {
    expect(addressee("Dra. Heloisa Lima - Estética Avançada")).toBe("Dra. Heloisa");
    expect(addressee("Dr Carlos Lima Odontologia")).toBe("Dr. Carlos");
    expect(addressee("DOUTORA ANA PAULA | Dermatologia")).toBe("Dra. Ana");
    expect(addressee("Estética Fortaleza | Dra. Fran Braga")).toBe("Dra. Fran");
    // o nome da pessoa no nome do negócio: primeiro nome, sem título
    expect(addressee("Rafael Neves - ADVOCACIA")).toBe("Rafael");
    expect(addressee("Embelezar por Bruna Prado Clinica Estética")).toBe("Bruna");
    expect(addressee("Clínica Valéria Sousa")).toBeNull();
    expect(addressee("Espaço Prime - Odontologia")).toBeNull();
    expect(addressee("Drogaria Central")).toBeNull();
    expect(addressee("Espaço Prime Estética")).toBeNull();
  });

  it("o posicionamento no Google decide se há o que elogiar", () => {
    expect(positioning(lead({ rating: 5, reviewsCount: 126 }))).toBe("forte");
    expect(positioning(lead({ rating: 4.4, reviewsCount: 12 }))).toBe("bom");
    expect(positioning(lead({ rating: 4.0, reviewsCount: 200 }))).toBe("discreto");
    expect(positioning(lead({ rating: null, reviewsCount: 0 }))).toBe("discreto");
  });
});

describe("pedido à IA", () => {
  it("o sistema diz quem escreve (a pessoa, sem a marca), a estrutura e o que não pode; não pede a linha de saída", () => {
    const s = openingSystemPrompt(ctx);
    expect(s).toContain("Jonathan Kelvin, desenvolvedor");
    expect(s).not.toContain("Kelvin Studio");
    expect(s).toMatch(/JSON/);
    expect(s).toMatch(/Elogio e dor/);
    expect(s).toMatch(/Solução e pergunta/);
    expect(s).toMatch(/terceira pessoa/);
    expect(s).toMatch(/Não escreva a linha/);
    expect(s).toMatch(/prévia/);
  });

  it("o pedido leva só dados públicos, o posicionamento, o ângulo e o tratamento; sem telefone", () => {
    const l = lead();
    const u = openingUserPrompt(l, ctx, angleFor(l));
    expect(u).toContain("Nome: Clínica Valéria Sousa");
    expect(u).toContain("Bairro: Siqueira");
    expect(u).toContain("Posicionamento no Google: forte (nota 4,9");
    expect(u).toContain("não tem site");
    expect(u).toContain(angleFor(l).brief);
    expect(u).toContain("Tratamento: o nome não traz título");
    expect(u).not.toMatch(/\+?55\d{8,}|\d{8,}/);
  });

  it("para a Dra., o pedido manda chamar pelo título e nome", () => {
    const u = openingUserPrompt(HELOISA, ctx, angleFor(HELOISA));
    expect(u).toMatch(/Tratamento: chame de “Dra\. Heloisa”/);
    expect(u).toMatch(/segunda pessoa/);
  });

  it("nota ruim não é oferecida à IA para elogiar", () => {
    const l = lead({ rating: 3.5, reviewsCount: 3 });
    const u = openingUserPrompt(l, ctx, angleFor(l));
    expect(u).toContain("discreto");
    expect(u).toContain("não elogie nota");
  });

  it("na repetição, a IA recebe o motivo da reprovação", () => {
    const l = lead();
    expect(openingUserPrompt(l, ctx, angleFor(l), ["fala de prévia"])).toMatch(/reprovada por: fala de prévia/);
  });
});

describe("writeOpening", () => {
  it("sem IA, vale o modelo do ângulo do lead, já em partes e com a saída", async () => {
    const r = await writeOpening(lead(), ctx, { llm: null, facts });
    const model = buildOpening(lead(), ctx);
    expect(r).toMatchObject({ source: "modelo", note: null, body: model.body, variant: model.variant });
    expect(r.parts.at(-1)).not.toMatch(/PARE/);
  });

  it("no fluxo antigo (com prévia) a IA nem é chamada", async () => {
    const llm = smart();
    const r = await writeOpening(lead(), { ...ctx, flow: "previa" }, { llm, facts });
    expect(llm.calls).toHaveLength(0);
    expect(r.source).toBe("modelo");
  });

  it("com IA e texto bom: escrita pela IA, variante marca o ângulo e o '-ia'", async () => {
    const llm = smart();
    const l = lead();
    const r = await writeOpening(l, ctx, { llm, facts });
    expect(llm.calls).toHaveLength(1);
    expect(r.source, JSON.stringify(r.note)).toBe("ia");
    expect(r.variant).toBe(`abertura-none-${angleFor(l).id}-ia`);
    expect(r.parts).toHaveLength(3);
    expect(r.body).toBe(r.parts.join("\n\n"));
    expect(r.body).not.toMatch(/PARE/);
  });

  it("JSON em cerca de código também vale", async () => {
    const llm = fake(["```json\n" + json(GOOD) + "\n```"]);
    expect((await writeOpening(lead(), ctx, { llm, facts })).source).toBe("ia");
  });

  it("texto reprovado: tenta mais uma vez dizendo o motivo, e se passar vale a segunda", async () => {
    const llm = fake([json([GOOD[0], GOOD[1], "Eu crio o site que resolve isso. Posso te mostrar uma prévia?"]), json(GOOD)]);
    const r = await writeOpening(lead(), ctx, { llm, facts });
    expect(llm.calls).toHaveLength(2);
    expect(llm.calls[1].user).toMatch(/reprovada por/);
    expect(r.source).toBe("ia");
  });

  it("reprovado duas vezes: cai no modelo e diz por quê", async () => {
    const bad = json([GOOD[0], GOOD[1], "Faço por R$ 800. Posso te explicar como funciona?"]);
    const llm = fake([bad]);
    const r = await writeOpening(lead(), ctx, { llm, facts });
    expect(llm.calls).toHaveLength(2);
    expect(r.source).toBe("modelo");
    expect(r.note).toMatch(/reprovada pela trava/);
    expect(r.body).toBe(buildOpening(lead(), ctx).body);
  });

  it("o erro do print (falar da Dra. em terceira pessoa) é reprovado e vira o modelo, que já fala com ela", async () => {
    const bad = json(["Oi! Sou o Jonathan, da Kelvin Studio.", "Achei a Dra. Heloisa Lima no Google, com nota 5,0. Vi que divulga pelo Instagram e ainda não tem site. Vale uma conversa rápida?"]);
    const r = await writeOpening(HELOISA, ctx, { llm: fake([bad]), facts });
    expect(r.source).toBe("modelo");
    expect(r.body).toMatch(/Dra\. Heloisa/);
    expect(r.body).not.toMatch(/Achei a Dra/);
    expect(r.body).not.toMatch(/Kelvin Studio/);
  });

  it("resposta que não é JSON ou vem fora do formato também cai no modelo", async () => {
    expect((await writeOpening(lead(), ctx, { llm: fake(["Olá, tudo bem?"]), facts })).source).toBe("modelo");
    expect((await writeOpening(lead(), ctx, { llm: fake([JSON.stringify({ texto: "oi" })]), facts })).note).toMatch(/reprovada/);
  });

  it("erro do provedor ou tempo esgotado: usa o modelo na hora, sem repetir", async () => {
    const llm = fake([new Error("O Gemini respondeu 429")]);
    const r = await writeOpening(lead(), ctx, { llm, facts });
    expect(llm.calls).toHaveLength(1);
    expect(r).toMatchObject({ source: "modelo" });
    expect(r.note).toMatch(/indisponível.*429/);

    const slow = fake(() => new Promise<string>(() => {}));
    const t = await writeOpening(lead(), ctx, { llm: slow, facts, timeoutMs: 20 });
    expect(t.source).toBe("modelo");
    expect(t.note).toMatch(/demorou demais/);
  });
});

describe("writeOpenings", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => lead({ id: `lead-${i}`, name: `Estética Aurora ${String.fromCharCode(65 + i)}` }));

  it("devolve cada abertura no lugar do seu lead, mesmo escrevendo várias ao mesmo tempo", async () => {
    const leads = many(9);
    const out = await writeOpenings(leads, ctx, { llm: smart(), facts });
    expect(out).toHaveLength(9);
    for (const [i, o] of out.entries()) {
      expect(o.source, JSON.stringify(o.note)).toBe("ia");
      expect(o.body, leads[i].name).toContain(leads[i].name);
    }
  });

  it("não passa do número de chamadas simultâneas", async () => {
    let active = 0;
    let peak = 0;
    const llm = fake(async (req) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return json([
        "Oi! Sou o Jonathan Kelvin, desenvolvedor.",
        `Vi o perfil de ${nameIn(req)} no Google, mas vocês ainda não têm site: quem chega lá não tem onde conhecer os serviços e agendar.`,
        "Eu crio o site que resolve isso. Posso te explicar como funciona?",
      ]);
    });
    await writeOpenings(many(12), ctx, { llm, facts }, { concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("passou do prazo do lote: o resto sai pelos modelos, sem chamar a IA", async () => {
    let t = 0;
    const llm = fake((req) => {
      t += 100;
      return json([
        "Oi! Sou o Jonathan Kelvin, desenvolvedor.",
        `Vi o perfil de ${nameIn(req)} no Google, mas vocês ainda não têm site: quem chega lá não tem onde conhecer os serviços e agendar.`,
        "Eu crio o site que resolve isso. Posso te explicar como funciona?",
      ]);
    });
    const out = await writeOpenings(many(6), ctx, { llm, facts }, { concurrency: 1, deadlineMs: 250, now: () => t });
    expect(out.map((o) => o.source)).toEqual(["ia", "ia", "ia", "modelo", "modelo", "modelo"]);
    expect(out[5].note).toMatch(/Tempo do lote/);
    expect(llm.calls).toHaveLength(3);
  });

  it("lista vazia não quebra", async () => {
    expect(await writeOpenings([], ctx, { llm: smart(), facts })).toEqual([]);
  });
});

describe("banco de ângulos", () => {
  it("cada grupo tem 5 ângulos: 4 de sempre (um deles a versão direta e curta) e o simples, que só entra pelo estilo", () => {
    for (const group of ["none", "social", "weak"] as const) {
      const ids = ANGLES[group].map((a) => a.id);
      expect(ids).toHaveLength(5);
      expect(new Set(ids).size).toBe(5);
      expect(ids).toContain("direta");
      expect(ids).toContain("simples");
    }
  });

  it("todo modelo se apresenta como pessoa, sem a marca, mostra o que viu, oferece o site e faz UMA pergunta", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      for (const [i, angle] of ANGLES[kind].entries()) {
        const l = lead({ websiteKind: kind, id: `angulo-${kind}-${i}` });
        const parts = angle.build(l, ctx, l.name);
        const all = parts.join(" ");
        expect(parts.length, angle.id).toBeLessThanOrEqual(3);
        expect(all, angle.id).not.toMatch(/PARE/);
        expect(all, angle.id).not.toMatch(/Kelvin Studio/);
        expect(parts[0], angle.id).toMatch(/Sou o Jonathan Kelvin, desenvolvedor\./);
        expect(all.match(/\?/g)?.length, angle.id).toBe(1);
        expect(parts.at(-1), angle.id).toMatch(/\?$/);
        expect(all, angle.id).toMatch(/\bsite\b/);
        expect(all, angle.id).not.toMatch(/tudo bem/i);
        for (const p of parts) expect(p.length, `${angle.id}: ${p}`).toBeLessThanOrEqual(MAX_PART_CHARS);
      }
    }
  });

  it("com a Dra., o modelo fala COM ela e nunca sobre ela", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      for (const angle of ANGLES[kind]) {
        const parts = angle.build({ ...HELOISA, websiteKind: kind }, ctx, "Dra. Heloisa Lima");
        expect(parts[0], angle.id).toMatch(/^(Oi|Olá), Dra\. Heloisa!/);
        expect(parts.join(" "), angle.id).not.toMatch(/(achei|vi|conheci|encontr\w+) (a|o) Dra/i);
        expect(parts.join(" "), angle.id).toMatch(/(?<![\p{L}])(seu|sua|você|te)(?![\p{L}])/iu);
      }
    }
  });

  it("os leads se espalham pelos quatro ângulos de cada grupo, e o mesmo lead cai sempre no mesmo", () => {
    for (const kind of ["none", "social", "weak"] as const) {
      const seen = new Set(Array.from({ length: 80 }, (_, i) => buildOpening(lead({ websiteKind: kind, id: `espalha-${kind}-${i}` }), ctx).angle));
      expect(seen.size).toBe(4);
    }
    const l = lead();
    expect(buildOpening(l, ctx)).toEqual(buildOpening(l, ctx));
  });

  it("o texto-modelo leva a saída uma vez só e junta os parágrafos com linha em branco", () => {
    const o = buildOpening(lead(), ctx);
    expect(o.parts.join("\n\n")).toBe(o.body);
    expect(o.body).not.toMatch(/PARE/);
    expect(o.variant).toMatch(/^abertura-none-[a-z-]+$/);
  });

  it("sem nota boa o modelo não elogia a nota", () => {
    for (const angle of ANGLES.none) {
      const l = lead({ rating: 3.9, reviewsCount: 5 });
      expect(angle.build(l, ctx, l.name).join(" "), angle.id).not.toMatch(/nota|avalia/);
    }
  });

  it("com nota boa, o ângulo de elogio elogia", () => {
    const l = lead();
    expect(ANGLES.none[0].build(l, ctx, l.name).join(" ")).toMatch(/A nota 4,9 de Clínica Valéria Sousa no Google é excelente\. Mas sem site/);
  });
});
