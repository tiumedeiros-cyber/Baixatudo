import { describe, expect, it } from "vitest";
import { factsFromSettings } from "@/lib/agent/context";
import { guardReply } from "@/lib/agent/guard";
import { lintMessage } from "@/lib/agent/humanize";
import type { LlmClient, LlmRequest } from "@/lib/agent/llm";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { DEFAULT_SETTINGS } from "@/lib/leads/types";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { prepareBatch, rewriteOpenings, tick } from "./engine";
import { adaptGreeting, dayPeriod } from "./greeting";
import { openingSystemPrompt, shortOpeningSystemPrompt, validateShortOpening, writeOpening, writeOpenings, MAX_SHORT_CHARS } from "./opening";
import { ProviderError, type ProviderStatus, type WhatsAppProvider } from "./provider";
import { isShortVariant, STYLE_SIZES_SHORT, type OpeningStyle } from "./style";
import {
  addressee,
  availableShortAngles,
  buildFollowUp,
  buildOpening,
  callName,
  isCasual,
  SHORT_ANGLES,
  type TemplateContext,
  type TemplateLead,
} from "./templates";
import { parseOpeningVariant, variantLabel } from "./metrics";
import { chooseOpeningStyle, emptyHistory, historyFrom, remember, similarity } from "./variation";

const ctx: TemplateContext = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor", flow: "qualificar", mode: "curta" };
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

const LEADS: Record<string, TemplateLead> = {
  clinica: lead(),
  comTitulo: lead({ id: "liane", name: "Dra. Liane Sobral - Periodontista", rating: 5, reviewsCount: 80, websiteKind: "social" }),
  pessoa: lead({ id: "rafael", name: "Rafael Neves - ADVOCACIA", niche: "Advocacia", category: "Advogado", websiteKind: "weak" }),
  longo: lead({ id: "longo", name: "SS Odontologia Jangurussu: Prótese, Ortodontia, Dentista - Aqui voce fica Sorrindo Sempre!", niche: "Odontologia", rating: 4.3, reviewsCount: 40 }),
  barbearia: lead({ id: "barba", name: "Barber Shop Old Cut", niche: "Barbearia", category: "Barbearia", rating: 4.8, reviewsCount: 200, websiteKind: "social" }),
  semNota: lead({ id: "semnota", name: "Espaço Prime Estética", rating: null, reviewsCount: 0 }),
};

describe("callName", () => {
  it("corta o slogan e a lista de serviços e fica em até 30 caracteres", () => {
    expect(callName({ name: "SS Odontologia Jangurussu: Prótese, Ortodontia, Dentista - Aqui voce fica Sorrindo Sempre!" })).toBe("SS Odontologia Jangurussu");
    expect(callName({ name: "Clínica Valéria Sousa" })).toBe("Clínica Valéria Sousa");
    // os dados reais do Google têm de tudo: parênteses, lista de serviços com vírgula, nome em caixa alta
    expect(callName({ name: "Soriel Odontologia (UNIDADE 2)" })).toBe("Soriel Odontologia");
    expect(callName({ name: "Funilaria, Pintura e Estética Automotiva - Marcelo Martelo de Ouro" })).toBe("Marcelo Martelo de Ouro");
    expect(callName({ name: "Funilaria, Pintura e Estética Automotiva" })).toBe("Funilaria, Pintura e Estética");
    expect(callName({ name: "MDO SERVIÇOS AUTOMOTIVOS" })).toBe("MDO SERVIÇOS AUTOMOTIVOS");
    expect(callName({ name: "Clínica Dentista do Povo - Parangaba |Clinica Odontológica | Implantes Dentários e Prótese" })).toBe("Clínica Dentista do Povo");
    const long = callName({ name: "Centro Integrado de Estética Avançada e Bem-Estar Corporal do Nordeste Brasileiro" });
    expect(long.length).toBeLessThanOrEqual(30);
    expect(/\s(de|da|do|e)$/i.test(long)).toBe(false);
  });
});

describe("o tratamento não confunde a profissão com o nome", () => {
  it("'Dra dentista' (o nome do negócio no Google) não vira 'Dra. Dentista'; 'Dr. Leonardo' continua certo", () => {
    expect(addressee("Dra dentista")).toBeNull();
    expect(addressee("Dr. Leonardo Carvalho")).toBe("Dr. Leonardo");
    expect(addressee("Dra. Liane Sobral - Periodontista")).toBe("Dra. Liane");
    const o = buildOpening(lead({ id: "dra", name: "Dra dentista", niche: "Dentista, Clínica odontológica" }), { ...ctx, style: { greet: 0, intro: 0, ask: 0, angle: "c-google" } });
    expect(o.body).toMatch(/^Bom dia! Aqui é o Jonathan\. Vi o perfil de Dra dentista no Google\./);
  });
});

describe("a abertura curta (modelos)", () => {
  const STYLES: OpeningStyle[] = [];
  for (let greet = 0; greet < STYLE_SIZES_SHORT.greet; greet++)
    for (let intro = 0; intro < STYLE_SIZES_SHORT.intro; intro++)
      for (let ask = 0; ask < STYLE_SIZES_SHORT.ask; ask++) STYLES.push({ greet, intro, ask, angle: null });

  it.each(Object.keys(LEADS))("%s: uma mensagem só, uma pergunta, sem 'responda PARE', sem falar de site, em qualquer combinação", (key) => {
    const l = LEADS[key];
    for (const angle of availableShortAngles(l)) {
      for (const style of STYLES) {
        const o = buildOpening(l, { ...ctx, style: { ...style, angle: angle.id } });
        const label = `${angle.id} ${JSON.stringify(style)}: ${o.body}`;
        expect(o.parts, label).toHaveLength(1);
        expect(o.body, label).not.toMatch(/PARE|parar de receber/i);
        const withoutFooter = o.body;
        expect(withoutFooter.match(/\?/g), label).toHaveLength(1);
        expect(withoutFooter.trimEnd().endsWith("?"), label).toBe(true);
        expect(withoutFooter.length, label).toBeLessThanOrEqual(MAX_SHORT_CHARS);
        expect(o.body.length, label).toBeLessThanOrEqual(MAX_SHORT_CHARS);
        expect(o.body, label).toMatch(/Jonathan/);
        expect(o.body, label).not.toMatch(/Kelvin|\bsites?\b|prévia|R\$|\d/i);
        expect(withoutFooter.match(/!/g)?.length ?? 0, label).toBeLessThanOrEqual(1);
        expect(lintMessage(o.body, "opening"), label).toEqual([]);
        expect(guardReply(o.body, { facts, proposal: null, demoUrl: null }).reasons, label).toEqual([]);
        expect(o.variant, label).toMatch(/^abertura-(none|social|weak)-c-[a-z]+~g\d+i\d+q\d+$/);
        expect(isShortVariant(o.variant)).toBe(true);
        expect(o.group).toBe(l.websiteKind === "none" ? "none" : l.websiteKind === "social" ? "social" : "weak");
      }
    }
  });

  it("o tratamento vem dos dados: título e primeiro nome, ou só o negócio; nunca nome inventado", () => {
    const withTitle = buildOpening(LEADS.comTitulo, { ...ctx, style: { greet: 0, intro: 0, ask: 0, angle: "c-google" } });
    expect(withTitle.body).toMatch(/^Bom dia, Dra\. Liane! Aqui é o Jonathan\. Vi seu perfil no Google\./);
    const org = buildOpening(LEADS.clinica, { ...ctx, style: { greet: 1, intro: 1, ask: 0, angle: "c-google" } });
    expect(org.body).toMatch(/^Oi! Jonathan aqui\. Vi o perfil de Clínica Valéria Sousa no Google\./);
    // "confirmar o contato" não serve a quem tem nome de pessoa (já foi chamada pelo nome)
    expect(availableShortAngles(LEADS.comTitulo).some((a) => a.id === "c-confirma")).toBe(false);
    expect(availableShortAngles(LEADS.clinica).some((a) => a.id === "c-confirma")).toBe(true);
  });

  it("advocacia e contabilidade ficam sóbrias: sem 'oi', sem exclamação e sem gíria", () => {
    for (let greet = 0; greet < STYLE_SIZES_SHORT.greet; greet++) {
      const o = buildOpening(LEADS.pessoa, { ...ctx, style: { greet, intro: 0, ask: 0, angle: "c-google" } });
      expect(o.body, o.body).not.toMatch(/\boi\b|!|\bopa\b/i);
      expect(o.body, o.body).toMatch(/Rafael/);
    }
  });

  it("'Opa' só em negócio de balcão (barbearia, oficina...), nunca em clínica nem em advocacia", () => {
    expect(isCasual(LEADS.barbearia)).toBe(true);
    expect(isCasual(LEADS.clinica)).toBe(false);
    expect(isCasual(LEADS.pessoa)).toBe(false);
    expect(buildOpening(LEADS.barbearia, { ...ctx, style: { greet: 5, intro: 0, ask: 0, angle: "c-google" } }).body).toMatch(/^Opa, pessoal!/);
    expect(buildOpening(LEADS.clinica, { ...ctx, style: { greet: 5, intro: 0, ask: 0, angle: "c-google" } }).body).not.toMatch(/Opa/);
  });

  it("o nome longo do negócio vira um nome curto, que cabe numa linha", () => {
    const o = buildOpening(LEADS.longo, { ...ctx, style: { greet: 1, intro: 0, ask: 0, angle: "c-google" } });
    expect(o.body).toContain("SS Odontologia Jangurussu no Google");
    expect(o.body).not.toContain("Prótese");
  });

  it("sem estilo vale sempre o mesmo texto para o mesmo lead (estável) e o variante não tem código de estilo", () => {
    const a = buildOpening(LEADS.clinica, ctx);
    const b = buildOpening(LEADS.clinica, ctx);
    expect(a.body).toBe(b.body);
    expect(a.variant).toMatch(/^abertura-none-c-[a-z]+$/);
  });

  it("o modo completo continua igual: três mensagens, com a marca no roteiro antigo e o nome inteiro na apresentação", () => {
    const o = buildOpening(LEADS.clinica, { ...ctx, mode: "completa" });
    expect(o.parts.length).toBeGreaterThanOrEqual(2);
    expect(o.variant).not.toMatch(/-c-/);
    expect(isShortVariant(o.variant)).toBe(false);
  });
});

describe("variação da abertura curta", () => {
  it("quarenta leads seguidos saem com textos diferentes, usando todos os ângulos", () => {
    const history = emptyHistory();
    const bodies: string[] = [];
    const angles = new Map<string, number>();
    let seed = 7;
    const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    let worst = 0;
    for (let i = 0; i < 40; i++) {
      const l = lead({ id: `lead-${i}`, name: `Clínica Aurora ${i}`, rating: 4.7, reviewsCount: 50 });
      const choice = chooseOpeningStyle({ lead: l, ctx, history, recentBodies: bodies, rng });
      expect(choice).not.toBeNull();
      expect(choice!.style.role).toBeUndefined(); // a curta não tem o "o que faz"
      const text = buildOpening(l, { ...ctx, style: choice!.style });
      worst = Math.max(worst, ...bodies.slice(-30).map((b) => similarity(text.body, b)));
      remember(history, bodies, choice!, text.body);
      angles.set(choice!.style.angle!, (angles.get(choice!.style.angle!) ?? 0) + 1);
    }
    expect(new Set(bodies.map((b) => b.replace(/Clínica Aurora \d+/g, "X"))).size).toBeGreaterThanOrEqual(30);
    expect(angles.size).toBe(availableShortAngles(lead()).length);
    for (const n of angles.values()) expect(n).toBeGreaterThanOrEqual(3);
    expect(worst).toBeLessThan(0.85);
  });

  it("o histórico de cada modo é separado (o número da saudação da curta não é o da completa)", () => {
    const variants = ["abertura-none-c-google~g1i2q0", "abertura-none-elogio~g4i3q2r1", "abertura-social-c-quem-ia~g2i1q1"];
    expect(historyFrom(variants, "curta").greet).toEqual([1, 2]);
    expect(historyFrom(variants, "completa").greet).toEqual([4]);
    expect(historyFrom(variants).greet).toEqual([1, 4, 2]);
  });

  it("a taxa de resposta por ângulo reconhece a abertura curta", () => {
    expect(parseOpeningVariant("abertura-none-c-google~g1i2q0")).toEqual({ group: "none", angle: "c-google", ia: false });
    expect(parseOpeningVariant("abertura-weak-c-quem-ia~g1i2q0")).toEqual({ group: "weak", angle: "c-quem", ia: true });
    expect(variantLabel("abertura-none-c-google")).toBe("Sem site · Vi no Google");
    expect(SHORT_ANGLES.every((a) => a.id.startsWith("c-"))).toBe(true);
  });
});

describe("o cumprimento certo na hora do envio", () => {
  const TZ = "America/Fortaleza"; // UTC-3
  const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 29, hh + 3, mm));

  it("de manhã, de tarde e de noite", () => {
    expect(dayPeriod(at(8), TZ)).toBe("bom dia");
    expect(dayPeriod(at(11, 59), TZ)).toBe("bom dia");
    expect(dayPeriod(at(12), TZ)).toBe("boa tarde");
    expect(dayPeriod(at(17, 59), TZ)).toBe("boa tarde");
    expect(dayPeriod(at(18), TZ)).toBe("boa noite");
  });

  it("troca o 'Bom dia' do começo pelo do horário, mantendo o resto e a caixa", () => {
    expect(adaptGreeting("Bom dia, Dra. Liane! Aqui é o Jonathan.", at(14), TZ)).toBe("Boa tarde, Dra. Liane! Aqui é o Jonathan.");
    expect(adaptGreeting("Dra. Liane, bom dia! Aqui é o Jonathan.", at(14), TZ)).toBe("Dra. Liane, boa tarde! Aqui é o Jonathan.");
    expect(adaptGreeting("Oi, bom dia! Jonathan aqui.", at(19), TZ)).toBe("Oi, boa noite! Jonathan aqui.");
    expect(adaptGreeting("Bom dia, pessoal!", at(9), TZ)).toBe("Bom dia, pessoal!");
  });

  it("não mexe em 'Oi', em texto sem cumprimento nem em 'bom dia' no meio da mensagem", () => {
    expect(adaptGreeting("Oi, Dra. Liane! Jonathan aqui.", at(15), TZ)).toBe("Oi, Dra. Liane! Jonathan aqui.");
    const long = `Aqui é o Jonathan, e eu queria ${"falar bastante ".repeat(4)}desejar um bom dia para você.`;
    expect(adaptGreeting(long, at(15), TZ)).toBe(long);
  });
});

describe("validateShortOpening (a trava da IA)", () => {
  const ok = (messages: string[], l = LEADS.clinica) => validateShortOpening(messages, l, ctx, facts);
  const reasons = (messages: string[], l = LEADS.clinica) => {
    const r = ok(messages, l);
    return r.ok ? [] : r.reasons;
  };

  it("aceita a abertura boa, sem a linha 'responda PARE'", () => {
    const r = ok(["Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Valéria Sousa no Google. Posso te fazer uma pergunta rápida?"]);
    expect(r).toEqual({ ok: true, parts: ["Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Valéria Sousa no Google. Posso te fazer uma pergunta rápida?"] });
  });

  it("a IA escreveu a linha 'responda PARE' por conta própria: o sistema tira", () => {
    const r = ok(["Oi! Jonathan aqui. Esse é o WhatsApp de Clínica Valéria Sousa? Para parar de receber, responda PARE."]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parts[0]).not.toMatch(/PARE/);
  });

  it.each([
    ["duas mensagens", ["Oi! Jonathan aqui.", "Posso te perguntar uma coisa?"], /UMA mensagem/],
    ["fala de site", ["Oi! Jonathan aqui. Faço sites para clínicas. Posso te contar?"], /vende/],
    ["fala de sistema", ["Oi! Jonathan aqui. Desenvolvo sistemas. Posso te contar?"], /vende/],
    ["elogia a nota", ["Oi! Jonathan aqui. Sua nota no Google é ótima. Posso te perguntar uma coisa?"], /elogia ou cita nota/],
    ["tem número", ["Oi! Jonathan aqui. Vi 126 avaliações. Posso te perguntar uma coisa?"], /número/],
    ["sem pergunta", ["Oi! Jonathan aqui. Vi o perfil de Clínica Valéria Sousa."], /única pergunta/],
    ["duas perguntas", ["Oi! Jonathan aqui. Tudo bem? Posso te perguntar uma coisa?"], /única pergunta/],
    ["longa demais", [`Oi! Jonathan aqui. ${"Vi o perfil de Clínica Valéria Sousa no Google e gostei muito de ver. ".repeat(2)}Posso te perguntar uma coisa?`], /passa de/],
    ["sem cumprimento", ["Jonathan aqui. Posso te perguntar uma coisa rápida sobre o negócio?"], /cumprimento/],
    ["sem o nome", ["Oi! Posso te fazer uma pergunta rápida sobre o negócio?"], /primeiro nome/],
    ["cita a marca", ["Oi! Jonathan da Kelvin Studio aqui. Posso te perguntar uma coisa?"], /marca/],
    ["fala de preço", ["Oi! Jonathan aqui. Posso te mandar um orçamento?"], /preço|prévia|garantia/],
  ] as const)("reprova: %s", (_name, messages, why) => {
    expect(reasons([...messages]).join(" | ")).toMatch(why);
  });

  it("emoji e travessão são tirados sozinhos (é conserto mecânico, não motivo para reprovar)", () => {
    const r = ok(["Oi! Jonathan aqui 😀. Posso te perguntar uma coisa?"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parts[0]).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("chamar de 'Dra. Liane' é obrigatório quando o nome traz o título, e falar dela em terceira pessoa não vale", () => {
    const l = LEADS.comTitulo;
    expect(reasons(["Bom dia! Aqui é o Jonathan. Vi seu perfil no Google. Posso te perguntar uma coisa?"], l).join(" | ")).toMatch(/não trata a pessoa por Dra\. Liane/);
    expect(reasons(["Bom dia, Dra. Liane! Aqui é o Jonathan. Posso te perguntar uma coisa?"], l)).toEqual([]);
    expect(reasons(["Bom dia, Dra. Liane! Jonathan aqui. Falo com a Liane?"], l).join(" | ")).toMatch(/terceira pessoa/);
  });

  it("nome de gente que não vem dos dados é reprovado", () => {
    expect(reasons(["Oi, Carla! Jonathan aqui. Posso te perguntar uma coisa?"]).join(" | ")).toMatch(/"carla"/);
  });
});

/** Uma IA de mentira que devolve o exemplo do pedido (a estrutura certa) ou o que mandarem. */
function fake(reply: (req: LlmRequest, call: number) => string): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return { name: "fake", model: "fake-1", calls, complete: async (req) => reply(req, calls.push(req) - 1) };
}
const exampleOf = (req: LlmRequest) => req.user.split("\n").filter(Boolean).at(-1)!;
const json = (messages: string[]) => JSON.stringify({ messages });
const obedient = () => fake((req) => json([exampleOf(req)]));

describe("writeOpening na abertura curta", () => {
  const style: OpeningStyle = { greet: 0, intro: 0, ask: 0, angle: "c-google" };

  it("o pedido à IA não deixa falar do que vende, pede uma mensagem só e traz o exemplo do estilo sorteado", async () => {
    const llm = obedient();
    await writeOpening(LEADS.clinica, { ...ctx, style }, { llm, facts });
    const system = llm.calls[0].system;
    expect(system).toBe(shortOpeningSystemPrompt({ ...ctx, style }));
    expect(system).toMatch(/UMA única mensagem/);
    expect(system).toMatch(/Não fale do que você vende/);
    expect(system).not.toBe(openingSystemPrompt({ ...ctx, style }));
    expect(llm.calls[0].user).toMatch(/- Nome: Clínica Valéria Sousa/);
    expect(llm.calls[0].user).toContain("Bom dia! Aqui é o Jonathan. Vi o perfil de Clínica Valéria Sousa no Google.");
    // nada de telefone, e a marca não vai
    expect(llm.calls[0].user).not.toMatch(/Kelvin Studio|\+55|\d{8}/);
  });

  it("a IA obediente vale: uma mensagem, a saída uma vez, variante com -ia e o estilo", async () => {
    const w = await writeOpening(LEADS.clinica, { ...ctx, style }, { llm: obedient(), facts });
    expect(w.source).toBe("ia");
    expect(w.note).toBeNull();
    expect(w.parts).toHaveLength(1);
    expect(w.variant).toBe("abertura-none-c-google-ia~g0i0q0");
    expect(w.body).not.toMatch(/PARE/);
  });

  it("a IA reprovada duas vezes: vale o modelo do mesmo estilo e diz por quê", async () => {
    const llm = fake(() => json(["Oi! Jonathan aqui. Faço sites para clínicas. Posso te contar como funciona?"]));
    const w = await writeOpening(LEADS.clinica, { ...ctx, style }, { llm, facts });
    expect(llm.calls).toHaveLength(2); // uma volta de correção
    expect(llm.calls[1].user).toMatch(/foi reprovada por: .*vende/);
    expect(w.source).toBe("modelo");
    expect(w.note).toMatch(/IA reprovada pela trava/);
    expect(w.variant).toBe("abertura-none-c-google~g0i0q0");
    expect(w.body).toBe(buildOpening(LEADS.clinica, { ...ctx, style }).body);
  });

  it("IA fora do ar: modelo, sem tentar de novo", async () => {
    const llm = fake(() => {
      throw new Error("429");
    });
    const w = await writeOpening(LEADS.clinica, { ...ctx, style }, { llm, facts });
    expect(llm.calls).toHaveLength(1);
    expect(w.source).toBe("modelo");
    expect(w.note).toMatch(/IA indisponível/);
  });

  it("um lote de 20: todos válidos e diferentes entre si", async () => {
    const leads = Array.from({ length: 20 }, (_, i) => lead({ id: `lead-${i}`, name: `Clínica Aurora ${i}` }));
    const history = emptyHistory();
    const bodies: string[] = [];
    let seed = 3;
    const rng = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const styles = leads.map((l) => {
      const c = chooseOpeningStyle({ lead: l, ctx, history, recentBodies: bodies, rng })!;
      remember(history, bodies, c, c.body);
      return c.style;
    });
    const out = await writeOpenings(leads, ctx, { llm: obedient(), facts }, { styles });
    expect(out.filter((o) => o.source !== "ia").map((o) => `${o.body} => ${o.note}`)).toEqual([]);
    expect(new Set(out.map((o) => o.body.replace(/Clínica Aurora \d+/g, "X"))).size).toBeGreaterThanOrEqual(14);
  });
});

// ───────────────────────── no motor ─────────────────────────

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza (dentro da janela)
const DAY = 24 * 3_600_000;
const plus = (base: Date, ms: number) => new Date(base.getTime() + ms);

async function setup(mode?: "curta" | "completa") {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar", ...(mode ? { openingMode: mode } : {}) });
  return { repo, leads };
}

class Rec implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  sent: { phone: string; text: string }[] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: true, loggedIn: true, mode: this.mode, detail: "WhatsApp conectado" };
  }
  async typing() {}
  async sendText(phone: string, text: string) {
    if (!text) throw new ProviderError("vazio", false);
    this.sent.push({ phone, text });
    return { id: `ID${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

describe("a abertura curta no motor", () => {
  it("o padrão do painel é a curta: cada abertura é uma mensagem só, com a saída, e nenhuma cita a marca", async () => {
    expect(DEFAULT_SETTINGS.openingMode).toBe("curta");
    const { repo } = await setup();
    const r = await prepareBatch(repo, NOW, { limit: 10 });
    expect(r.openings).toBe(10);
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    for (const m of drafts) {
      expect(m.status).toBe("draft");
      expect(m.body.split("\n\n")).toHaveLength(1);
      expect(isShortVariant(m.variant), m.variant ?? "").toBe(true);
      expect(m.body).toMatch(/Jonathan/);
      expect(m.body).not.toMatch(/Kelvin|site/i);
      expect(m.body).not.toMatch(/PARE/);
    }
    // com o estilo gravado, as dez são diferentes entre si
    expect(new Set(drafts.map((m) => m.body)).size).toBeGreaterThanOrEqual(8);
  });

  it("'completa' nas Configurações volta às três mensagens de sempre", async () => {
    const { repo } = await setup("completa");
    await prepareBatch(repo, NOW, { limit: 5 });
    const drafts = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    for (const m of drafts) {
      expect(isShortVariant(m.variant)).toBe(false);
      expect(m.body.split("\n\n").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("Reescrever troca as aberturas antigas (em três partes) pelas curtas, sem mexer no que já foi aprovado", async () => {
    const { repo } = await setup("completa");
    await prepareBatch(repo, NOW, { limit: 6 });
    const before = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    expect(before.every((m) => !isShortVariant(m.variant))).toBe(true);

    await repo.saveSettings({ openingMode: "curta" });
    const r = await rewriteOpenings(repo, null, { rng: () => 0.37 });
    expect(r.rewritten).toBe(6);
    const after = await repo.listMessages({ kinds: ["opening"], limit: 50 });
    for (const m of after) {
      expect(isShortVariant(m.variant), m.variant ?? "").toBe(true);
      expect(m.body.split("\n\n")).toHaveLength(1);
      expect(m.status).toBe("draft");
    }
  });

  it("no envio, o 'Bom dia' vira o cumprimento do horário em que sai (a abertura foi escrita de madrugada)", async () => {
    const { repo, leads } = await setup();
    await repo.saveAutomation({ paused: false, dryRun: false });
    const lead = leads[0];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const body = `Bom dia, pessoal! Jonathan aqui. Esse é o WhatsApp de ${lead.name}?`;
    const [m] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body, variant: "abertura-none-c-confirma~g0i1q0", status: "approved", createdBy: "system", scheduledFor: plus(NOW, -60_000).toISOString(), approvedAt: NOW.toISOString() },
    ]);
    // 15h30 em Fortaleza
    const afternoon = new Date("2026-10-22T18:30:00Z");
    const provider = new Rec();
    const res = await tick({ repo, provider, now: afternoon, rng: () => 0.5, sleep: async () => {} });
    expect(res.action).toBe("sent");
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].text.startsWith("Boa tarde, pessoal! Jonathan aqui.")).toBe(true);
    // o texto guardado passa a ser o que saiu: a conversa não mostra "Bom dia" numa mensagem entregue como "Boa tarde"
    expect((await repo.getMessage(m.id))!.body).toBe(body.replace("Bom dia", "Boa tarde"));
  });
});

describe("follow-ups depois da abertura curta", () => {
  it("quem não respondeu à curta recebe uma cutucada que já traz o assunto, em uma mensagem e uma pergunta", () => {
    for (const key of Object.keys(LEADS)) {
      const { body, variant } = buildFollowUp(LEADS[key], 1, ctx);
      expect(variant).toBe("followup-1");
      expect(body.split("\n\n"), body).toHaveLength(1);
      expect(body.match(/\?/g), body).toHaveLength(1);
      expect(body.match(/PARE/g), body).toHaveLength(1);
      expect(body, body).toMatch(/site|Instagram/);
      expect(body, body).not.toMatch(/prévia|R\$/i);
      expect(body, body).not.toMatch(/Kelvin Studio/);
      expect(lintMessage(body, "followup"), body).toEqual([]);
      expect(guardReply(body, { facts, proposal: null, demoUrl: null }).reasons, body).toEqual([]);
    }
    expect(buildFollowUp(LEADS.comTitulo, 1, ctx).body).toMatch(/^Bom dia, Dra\. Liane! Jonathan aqui de novo\./);
    expect(buildFollowUp(LEADS.pessoa, 1, ctx).body).toMatch(/^Olá, Rafael\. Retomo uma única vez/);
  });

  it("o 2º follow-up e o modo completo seguem como eram", () => {
    expect(buildFollowUp(LEADS.clinica, 2, ctx).body).toMatch(/^Última mensagem, prometo\./);
    expect(buildFollowUp(LEADS.clinica, 1, { ...ctx, mode: "completa" }).body).toMatch(/viram minha mensagem sobre o site/);
  });

  it("o motor escolhe o follow-up pela abertura que o lead recebeu, não pelo que está nas Configurações hoje", async () => {
    const { repo, leads } = await setup("curta");
    const mk = async (lead: (typeof leads)[number], variant: string) => {
      const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
      const [m] = await repo.createMessages([
        { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "Oi! Jonathan aqui.", variant, status: "sent", createdBy: "system", sentAt: NOW.toISOString() },
      ]);
      await repo.setStage(lead.id, "contatado");
      await repo.updateConversation(conv.id, { touches: 1, lastOutboundAt: NOW.toISOString() });
      return { conv, m };
    };
    const curta = await mk(leads[0], "abertura-none-c-google~g1i0q0");
    const antiga = await mk(leads[1], "abertura-none-elogio-ia~g1i0q0r1");
    const r = await prepareBatch(repo, plus(NOW, 2 * DAY), { limit: 5 });
    expect(r.followUps).toBe(2);
    const [fuCurta] = await repo.listMessages({ conversationId: curta.conv.id, kinds: ["followup"], limit: 5 });
    const [fuAntiga] = await repo.listMessages({ conversationId: antiga.conv.id, kinds: ["followup"], limit: 5 });
    expect(fuCurta.body).toMatch(/aqui de novo/);
    expect(fuCurta.body).not.toMatch(/viu minha mensagem|viram minha mensagem/);
    expect(fuAntiga.body).toMatch(/viu minha mensagem|viram minha mensagem/);
  });
});
