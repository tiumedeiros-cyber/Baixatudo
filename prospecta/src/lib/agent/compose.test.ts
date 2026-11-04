import { describe, expect, it, vi } from "vitest";
import { composeReply, parseAiOutput } from "./compose";
import { simulationContext } from "./context";
import { geminiClient, LlmError, stripJsonFence, type LlmClient } from "./llm";
import { buildSystemPrompt, buildUserPrompt } from "./playbook";
import { rulesReply } from "./rules";

const fake = (reply: unknown | (() => Promise<string>)): LlmClient & { calls: number; lastUser: string; lastSystem: string } => {
  const c = {
    name: "fake",
    model: "fake-1",
    calls: 0,
    lastUser: "",
    lastSystem: "",
    async complete({ system, user }: { system: string; user: string }) {
      c.calls++;
      c.lastSystem = system;
      c.lastUser = user;
      if (typeof reply === "function") return (reply as () => Promise<string>)();
      return typeof reply === "string" ? reply : JSON.stringify(reply);
    },
  };
  return c;
};

const ok = (reply: string | null, extra: Record<string, unknown> = {}) => ({
  reply,
  topic: "other",
  asked: null,
  handoff: { needed: false, reason: null },
  ...extra,
});

describe("composeReply", () => {
  it("sem IA, devolve as regras", async () => {
    const ctx = simulationContext({ text: "quanto custa?" });
    const out = await composeReply(ctx, { llm: null });
    expect(out).toEqual(rulesReply(ctx));
    expect(out.source).toBe("rules");
  });

  it("assuntos fixos nunca vão para a IA (PARE, áudio, agressão, recusa)", async () => {
    const llm = fake(ok("qualquer coisa"));
    for (const [text, media] of [["PARE", null], [null, "audio"], ["isso é golpe", null], ["não tenho interesse", null], ["ok", null]] as const) {
      const out = await composeReply(simulationContext({ text, media }), { llm });
      expect(out.source).toBe("rules");
    }
    expect(llm.calls).toBe(0);
  });

  it("usa a resposta da IA quando passa na trava", async () => {
    const llm = fake(ok("Os sites partem de R$ 800. Quer ver a prévia da sua clínica antes de decidir?", { topic: "price" }));
    const out = await composeReply(simulationContext({ text: "quanto custa?" }), { llm });
    expect(out.source).toBe("ai");
    expect(out.reply).toMatch(/R\$\s?800/);
    expect(out.topic).toBe("price");
    expect(llm.calls).toBe(1);
  });

  it("a IA responde o que as regras não sabem, mas chama o dono para conferir", async () => {
    const llm = fake(ok("Fazemos sim sites com página de produtos. Quer que eu monte a prévia?", { handoff: { needed: true, reason: "Confirme se faz loja virtual" } }));
    const ctx = simulationContext({ text: "Vocês fazem loja virtual?" });
    expect(rulesReply(ctx).reply).toBeNull();
    const out = await composeReply(ctx, { llm });
    expect(out.source).toBe("ai");
    expect(out.reply).toMatch(/loja|produtos/);
    expect(out.handoff).toEqual({ needed: true, reason: expect.any(String) });
  });

  it("pergunta livre: marca a resposta como livre e guarda se a própria IA pediu o dono", async () => {
    const ctx = simulationContext({ text: "Vocês fazem loja virtual?" });
    const calm = await composeReply(ctx, { llm: fake(ok("Fazemos sim, posso montar uma prévia para você ver.")) });
    expect(calm).toMatchObject({ source: "ai", freeform: true, aiAskedHuman: false });
    const unsure = await composeReply(ctx, { llm: fake(ok("Sobre loja virtual preciso confirmar um detalhe.", { handoff: { needed: true, reason: "Confirme" } })) });
    expect(unsure).toMatchObject({ source: "ai", freeform: true, aiAskedHuman: true });
  });

  it("resposta das regras (mesmo reescrita pela IA) não é pergunta livre", async () => {
    const out = await composeReply(simulationContext({ text: "quanto custa?" }), { llm: fake(ok("Os sites partem de R$ 800. Posso montar a prévia antes de você decidir?", { topic: "price" })) });
    expect(out.source).toBe("ai");
    expect(out.freeform).toBeUndefined();
  });

  it("a resposta que o dono escreveu em Configurações nunca vai para a IA", async () => {
    const llm = fake(ok("Garantia total de 100%!"));
    const text = "Você só paga o restante se aprovar o site pronto.";
    const out = await composeReply(simulationContext({ text: "Tem garantia?", facts: { policies: { guarantee: text, hosting: "", payment: "", portfolio: "", price: "" } } }), { llm });
    expect(llm.calls).toBe(0);
    expect(out).toMatchObject({ source: "rules", authorized: true });
    expect(out.reply).toContain(text);
  });

  it("o prompt da IA leva as respostas do dono como fatos e a regra de calar fora do assunto", () => {
    const ctx = simulationContext({ text: "oi", facts: { policies: { guarantee: "Só paga o restante se aprovar.", hosting: "", payment: "", portfolio: "", price: "" } } });
    const system = buildSystemPrompt(ctx.facts);
    expect(system).toContain("Garantia (resposta do dono): Só paga o restante se aprovar.");
    expect(system).not.toContain("Formas de pagamento (resposta do dono)");
    expect(system).toMatch(/nada a ver com o serviço/);
  });

  it("IA fora do roteiro sem aviso próprio ainda chama o dono", async () => {
    const llm = fake(ok("Fazemos sim, posso montar uma prévia para você ver."));
    const out = await composeReply(simulationContext({ text: "Vocês fazem loja virtual?" }), { llm });
    expect(out.source).toBe("ai");
    expect(out.handoff.needed).toBe(true);
    expect(out.handoff.reason).toBeTruthy();
  });

  it("a trava derruba preço, prazo, desconto e link inventados e volta para as regras", async () => {
    const cases = [
      "Os sites custam R$ 450 e ficam prontos hoje. Posso montar a prévia?",
      "Fica pronto em 3 dias, combinado? Quer ver a prévia?",
      "Dou 20% de desconto se fechar agora. Quer ver a prévia?",
      "Veja exemplos em https://meusite.com.br e me diga o que acha.",
      "Garantimos o resultado ou devolvemos o dinheiro. Quer ver a prévia?",
      "Pode pagar na chave 11999998888, tudo bem?",
    ];
    for (const reply of cases) {
      const ctx = simulationContext({ text: "quanto custa?" });
      const out = await composeReply(ctx, { llm: fake(ok(reply)) });
      expect(out.source, reply).toBe("rules");
      expect(out.reply, reply).toEqual(rulesReply(ctx).reply);
      expect(out.notes.join(" "), reply).toMatch(/reprovada pela trava/);
    }
  });

  it("a trava derruba fala de assistente: 'confirmar com o dono', 'a equipe', 'sou uma IA'", async () => {
    for (const reply of [
      "Vou confirmar o valor com o dono e já te retorno. Quer que eu monte a prévia?",
      "A equipe vai montar a prévia da sua clínica. Pode ser?",
      "Sou uma IA e posso montar a prévia. Quer ver?",
      "Vou falar com o dono sobre isso, tudo bem?",
    ]) {
      const out = await composeReply(simulationContext({ text: "pode fechar" }), { llm: fake(ok(reply)) });
      expect(out.source, reply).toBe("rules");
      expect(out.notes.join(" "), reply).toMatch(/fala como assistente/);
    }
  });

  it("não confunde 'o dono' dito ao lead (dono do negócio) com fala de assistente", async () => {
    const out = await composeReply(simulationContext({ text: "pode sim" }), {
      llm: fake(ok("Perfeito! Você é o dono da clínica ou fala pela equipe de vocês? Já monto a prévia.")),
    });
    expect(out.notes.join(" ")).not.toMatch(/fala como assistente/);
  });

  it("a trava derruba a IA que nega algo por conta própria ('não tenho exemplos', 'não aceito cartão')", async () => {
    for (const reply of [
      "Ainda não tenho exemplos para te mandar. Posso montar uma prévia sem custo?",
      "Não aceito cartão, só Pix. Posso montar a prévia?",
      "Não fazemos loja virtual, só sites de uma página. Quer ver a prévia?",
    ]) {
      const out = await composeReply(simulationContext({ text: "tem exemplos?" }), { llm: fake(ok(reply)) });
      expect(out.source, reply).toBe("rules");
      expect(out.notes.join(" "), reply).toMatch(/não tem|não faz/);
    }
  });

  it("deixa passar quem promete confirmar, que é o certo quando falta informação", async () => {
    const out = await composeReply(simulationContext({ text: "tem mensalidade?" }), {
      llm: fake(ok("Sobre a mensalidade, vou confirmar e já te respondo.", { handoff: { needed: true, reason: "Defina se há mensalidade" } })),
    });
    expect(out.source).toBe("ai");
  });

  it("a trava derruba texto com cara de IA (humanizador)", async () => {
    const out = await composeReply(simulationContext({ text: "como funciona?" }), {
      llm: fake(ok("Ótima pergunta! Isso não é só um site, é uma vitrine digital. Espero ter ajudado!")),
    });
    expect(out.source).toBe("rules");
    expect(out.notes.join(" ")).toMatch(/reprovada pela trava/);
  });

  it("conserta o mecânico (traço, emoji) em vez de reprovar", async () => {
    const out = await composeReply(simulationContext({ text: "como funciona?" }), {
      llm: fake(ok("Eu monto uma prévia do site da sua clínica 😀 — sem custo. Você vê e decide. Posso montar?")),
    });
    expect(out.source).toBe("ai");
    expect(out.reply).not.toMatch(/—|😀/);
  });

  it("aceita o link da prévia e a chave Pix do dono, e só eles", async () => {
    const demoUrl = "https://painel.exemplo.com.br/p/abcdefghij0123456789";
    const ctx = simulationContext({ text: "pode mandar", demoUrl, facts: { pixKey: "dono@exemplo.com" } });
    const good = await composeReply(ctx, { llm: fake(ok(`Perfeito! Aqui está a prévia: ${demoUrl}\nO que você mudaria?`)) });
    expect(good.source).toBe("ai");
    const bad = await composeReply(ctx, { llm: fake(ok("Perfeito! Aqui está a prévia: https://outro.com/p/xyz. O que você mudaria?")) });
    expect(bad.source).toBe("rules");
    const pixOk = await composeReply(simulationContext({ text: "como eu pago?", facts: { pixKey: "dono@exemplo.com" } }), {
      llm: fake(ok("Por Pix: metade para começar, chave dono@exemplo.com, e o resto na entrega.")),
    });
    expect(pixOk.source).toBe("ai");
    const pixBad = await composeReply(simulationContext({ text: "como eu pago?", facts: { pixKey: "dono@exemplo.com" } }), {
      llm: fake(ok("Por Pix, chave outra@pessoa.com, metade para começar.")),
    });
    expect(pixBad.source).toBe("rules");
  });

  it("usa os valores da proposta de verdade", async () => {
    const proposal = { status: "sent", title: "Site", amountCents: 120_000, entryPct: 40, deliveryDays: 10 };
    const ctx = simulationContext({ text: "quanto era?", proposal, demoSent: true });
    // dinheiro é texto fixo das regras: a IA nem é chamada, então não tem como errar o valor
    const llm = fake(ok("Ficou em R$ 800, com sinal de R$ 400. Posso te passar o Pix?"));
    const out = await composeReply(ctx, { llm });
    expect(out.source).toBe("rules");
    expect(llm.calls).toBe(0);
    expect(out.reply).toMatch(/R\$\s?1\.200/);
    expect(out.reply).toMatch(/R\$\s?480/);
    expect(out.commits).toBe(true);
  });

  it("cai nas regras quando a IA falha: erro, JSON ruim, formato errado, demora", async () => {
    const ctx = simulationContext({ text: "como funciona?" });
    const expected = rulesReply(ctx).reply;
    const failures: LlmClient[] = [
      fake(async () => {
        throw new LlmError("O Gemini respondeu 429", 429);
      }),
      fake("isto não é json"),
      fake({ resposta: "formato errado" }),
      fake(() => new Promise<string>(() => {})), // nunca responde
    ];
    for (const llm of failures) {
      const out = await composeReply(ctx, { llm, timeoutMs: 30 });
      expect(out.source).toBe("rules");
      expect(out.reply).toBe(expected);
      expect(out.notes.length).toBeGreaterThan(0);
    }
  });

  it("se a IA manda 'null', o dono responde e as regras continuam valendo", async () => {
    const ctx = simulationContext({ text: "tem garantia?" });
    const out = await composeReply(ctx, { llm: fake(ok(null, { handoff: { needed: true, reason: "x" } })) });
    expect(out.source).toBe("rules");
    expect(out.handoff.needed).toBe(true);
  });

  it("a pergunta de descoberta só é registrada se a mensagem realmente pergunta", async () => {
    const ctx = simulationContext({ text: "pode sim" });
    const withQ = await composeReply(ctx, { llm: fake(ok("Perfeito! O que você mais quer que o site faça?", { asked: "objetivo" })) });
    expect(withQ.asked).toBe("objetivo");
    const noQ = await composeReply(ctx, { llm: fake(ok("Perfeito! Já monto a prévia.", { asked: "objetivo" })) });
    expect(noQ.asked).toBeNull();
  });

  it("aceita JSON dentro de cerca de código", async () => {
    const llm = fake("```json\n" + JSON.stringify(ok("Eu monto uma prévia do site sem custo. Posso montar a sua?")) + "\n```");
    const out = await composeReply(simulationContext({ text: "como funciona?" }), { llm });
    expect(out.source).toBe("ai");
  });
});

describe("prompt do agente", () => {
  it("leva os fatos do dono e a conversa, e nada além", () => {
    const ctx = simulationContext({
      text: "quanto custa?",
      facts: { priceFrom: 1000, deliveryDays: 5, entryPct: 30, offer: "Sites para clínicas", proof: "Portfólio em exemplo.com" },
    });
    const system = buildSystemPrompt(ctx.facts);
    expect(system).toMatch(/site simples fica em R\$\s?1\.000/);
    expect(system).not.toMatch(/Os sites partem de/);
    expect(system).toMatch(/até 5 dias/);
    expect(system).toMatch(/Sinal de 30%/);
    expect(system).toMatch(/Sites para clínicas/);
    expect(system).toMatch(/Portfólio em exemplo\.com/);
    expect(system).toMatch(/Nunca invente preço/);
    const user = buildUserPrompt(ctx, rulesReply(ctx));
    expect(user).toMatch(/quanto custa\?/);
    expect(user).toMatch(/Não há link de prévia/);
    expect(user).toMatch(/RASCUNHO DAS REGRAS/);
  });

  it("não vaza o texto livre do dono quando ele está vazio", () => {
    const system = buildSystemPrompt(simulationContext({ text: "oi" }).facts);
    expect(system).not.toMatch(/O que o dono vende/);
  });
});

describe("parseAiOutput e stripJsonFence", () => {
  it("lê o formato esperado e recusa o resto", () => {
    expect(parseAiOutput(JSON.stringify(ok("oi")))).toMatchObject({ ok: true });
    expect(parseAiOutput("não é json")).toMatchObject({ ok: false });
    expect(parseAiOutput(JSON.stringify({ reply: 3 }))).toMatchObject({ ok: false });
    expect(stripJsonFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFence('{"a":1}')).toBe('{"a":1}');
  });
});

describe("geminiClient", () => {
  const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("manda o pedido certo (chave no cabeçalho, JSON de saída) e lê o texto", async () => {
    const fetchImpl = vi.fn(async () => response({ candidates: [{ content: { parts: [{ text: '{"reply":"oi"}' }] } }] }));
    const llm = geminiClient({ apiKey: "KEY123", model: "gemini-teste", fetchImpl: fetchImpl as unknown as typeof fetch });
    const text = await llm.complete({ system: "S", user: "U" });
    expect(text).toBe('{"reply":"oi"}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-teste:generateContent");
    expect(url).not.toContain("KEY123");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("KEY123");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("S");
    expect(body.contents[0].parts[0].text).toBe("U");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("ignora o texto de raciocínio do modelo", async () => {
    const fetchImpl = async () => response({ candidates: [{ content: { parts: [{ text: "pensando...", thought: true }, { text: '{"reply":null}' }] } }] });
    const llm = geminiClient({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await llm.complete({ system: "", user: "" })).toBe('{"reply":null}');
  });

  it("erros viram LlmError com o status, sem vazar a chave", async () => {
    const fetchImpl = async () => response({ error: { message: "quota" } }, 429);
    const llm = geminiClient({ apiKey: "SEGREDO", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(llm.complete({ system: "", user: "" })).rejects.toMatchObject({ name: "LlmError", status: 429 });
    await expect(llm.complete({ system: "", user: "" })).rejects.not.toThrow(/SEGREDO/);
  });

  it("resposta vazia e pedido bloqueado são erros claros", async () => {
    const empty = geminiClient({ apiKey: "k", fetchImpl: (async () => response({ candidates: [] })) as unknown as typeof fetch });
    await expect(empty.complete({ system: "", user: "" })).rejects.toThrow(/vazia/);
    const blocked = geminiClient({ apiKey: "k", fetchImpl: (async () => response({ promptFeedback: { blockReason: "SAFETY" } })) as unknown as typeof fetch });
    await expect(blocked.complete({ system: "", user: "" })).rejects.toThrow(/bloqueou/);
  });
});

describe("composeReply no fluxo qualificar", () => {
  const Q = { flow: "qualificar" as const };
  const OPENING = { from: "us" as const, text: "Oi! Aqui é o Jonathan, da Kelvin Studio. Vocês já pensaram em ter um site?" };

  it("resposta livre da IA vale, mas oferecer prévia é reprovado (as prévias são feitas à mão)", async () => {
    const ctx = simulationContext({ text: "Vocês trabalham aos sábados?", facts: Q });
    const good = await composeReply(ctx, { llm: fake(ok("Atendo de segunda a sexta, mas combinamos o melhor horário. Quer me contar o que você precisa?")) });
    expect(good).toMatchObject({ source: "ai", freeform: true });

    const bad = await composeReply(ctx, { llm: fake(ok("Atendo de segunda a sexta. Posso montar uma prévia para você ver?")) });
    expect(bad.source).toBe("rules");
    expect(bad.reply).toBeNull();
    expect(bad.notes.join(" ")).toMatch(/oferece prévia/);
  });

  it("quem pediu prévia ou quer um sistema está com o dono: a IA nem é chamada", async () => {
    const llm = fake(ok("qualquer coisa"));
    const waiting = simulationContext({
      text: "e o valor?",
      history: [OPENING, { from: "lead", text: "quero ver uma prévia" }, { from: "us", text: "Claro! Vou montar a prévia com cuidado.", variant: "agente+auto:wants_preview" }],
      facts: Q,
    });
    const system = simulationContext({ text: "preciso de um sistema de agendamento online para a minha clínica de estética", facts: Q });
    for (const ctx of [waiting, system]) expect((await composeReply(ctx, { llm })).source).toBe("rules");
    expect(llm.calls).toBe(0);
  });

  it("o aviso curto que entrega o lead ao dono é texto fixo, sem IA", async () => {
    const llm = fake(ok("qualquer coisa"));
    const out = await composeReply(simulationContext({ text: "quero ver uma prévia", facts: Q }), { llm });
    expect(out).toMatchObject({ source: "rules", queued: true, topic: "wants_preview" });
    expect(llm.calls).toBe(0);
  });

  it("o prompt da IA não manda oferecer prévia e a ficha vai com o que ele quer", () => {
    const ctx = simulationContext({ text: "quero um sistema", facts: Q });
    const system = buildSystemPrompt(ctx.facts);
    expect(system).toMatch(/NUNCA ofereça prévia/);
    expect(system).not.toMatch(/A prévia do site não tem custo/);
    expect(buildUserPrompt(ctx, rulesReply(ctx))).toMatch(/Quer: um sistema/);
    const old = buildSystemPrompt(simulationContext({ text: "oi" }).facts);
    expect(old).toMatch(/A prévia do site não tem custo/);
    expect(old).not.toMatch(/NUNCA ofereça prévia/);
  });
});
