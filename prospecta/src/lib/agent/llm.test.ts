import { describe, expect, it, vi } from "vitest";
import type { AgentEnv } from "@/lib/env";
import { composeReply } from "./compose";
import { simulationContext } from "./context";
import {
  buildLlm,
  buildProviders,
  geminiClient,
  listOpenAiModels,
  LlmError,
  openaiClient,
  redactSecrets,
  withFallback,
  type LlmClient,
} from "./llm";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const as = (f: unknown) => f as unknown as typeof fetch;

function stub(name: string, behavior: () => Promise<string>, model = `${name}-m`): LlmClient & { calls: number } {
  const c = {
    name,
    model,
    id: `${name}:id`,
    calls: 0,
    async complete() {
      c.calls++;
      return behavior();
    },
  };
  return c;
}
const fails = (status?: number, message = "falhou") => async (): Promise<string> => {
  throw new LlmError(message, status);
};

describe("openaiClient", () => {
  it("manda o pedido certo e lê o texto", async () => {
    const fetchImpl = vi.fn(async () => json({ choices: [{ message: { content: '{"reply":"oi"}' } }] }));
    const llm = openaiClient({ apiKey: "sk-ABCDEF123456", model: "modelo-x", fetchImpl: as(fetchImpl) });
    expect(await llm.complete({ system: "S", user: "U" })).toBe('{"reply":"oi"}');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk-ABCDEF123456");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("modelo-x");
    expect(body.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "U" },
    ]);
    expect(body.response_format).toEqual({ type: "json_object" });
    // os modelos novos recusam estes campos
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("erro vira LlmError com o status e sem vazar a chave", async () => {
    const fetchImpl = async () => json({ error: { message: "Incorrect API key provided: sk-proj-SECRETSECRET123." } }, 401);
    const llm = openaiClient({ apiKey: "sk-proj-SECRETSECRET123", model: "m", fetchImpl: as(fetchImpl) });
    const err = await llm.complete({ system: "", user: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain("SECRETSECRET");
  });

  it("recusa e resposta vazia são erros claros", async () => {
    const refusal = openaiClient({ apiKey: "k", model: "m", fetchImpl: as(async () => json({ choices: [{ message: { content: null, refusal: "não posso" } }] })) });
    await expect(refusal.complete({ system: "", user: "" })).rejects.toThrow(/recusou/);
    const empty = openaiClient({ apiKey: "k", model: "m", fetchImpl: as(async () => json({ choices: [] })) });
    await expect(empty.complete({ system: "", user: "" })).rejects.toThrow(/vazia/);
  });
});

describe("listOpenAiModels", () => {
  it("lista só modelos de texto, em ordem", async () => {
    const data = ["whisper-1", "gpt-b", "text-embedding-x", "gpt-a", "o9-mini", "dall-e-3", "gpt-image-1", "gpt-4o-realtime", "tts-1", "babbage-002"].map((id) => ({ id }));
    const out = await listOpenAiModels("k", as(async () => json({ data })));
    expect(out).toEqual(["gpt-a", "gpt-b", "o9-mini"]);
  });

  it("chave inválida vira erro sem a chave", async () => {
    await expect(listOpenAiModels("sk-xxxxxxxxxxxx", as(async () => json({ error: { message: "bad sk-xxxxxxxxxxxx" } }, 401)))).rejects.toThrow(/401/);
  });
});

describe("redactSecrets", () => {
  it("esconde chaves da OpenAI e do Google", () => {
    expect(redactSecrets("erro com sk-proj-abcdefghijk e AIzaSyABCDEFGHIJKLMNOPQRSTU fim")).toBe("erro com sk-… e AIza… fim");
  });
});

describe("withFallback", () => {
  it("com um cliente só, devolve o próprio cliente", () => {
    const a = stub("a", async () => "x");
    expect(withFallback([a], { cooldowns: new Map() })).toBe(a);
  });

  it("o principal funcionando: a reserva nem é chamada", async () => {
    const a = stub("a", async () => "A");
    const b = stub("b", async () => "B");
    const llm = withFallback([a, b], { cooldowns: new Map() });
    expect(await llm.complete({ system: "", user: "" })).toBe("A");
    expect(b.calls).toBe(0);
  });

  it("o principal falhou: usa a reserva e avisa quem falhou", async () => {
    const a = stub("gemini", fails(429, "limite"));
    const b = stub("openai", async () => "B");
    const note = vi.fn();
    const llm = withFallback([a, b], { cooldowns: new Map() });
    expect(await llm.complete({ system: "", user: "", note })).toBe("B");
    expect(note).toHaveBeenCalledOnce();
    expect(note.mock.calls[0][0]).toMatch(/gemini falhou \(limite\)\. Usei openai/);
  });

  it("varre todas as chaves na ordem até uma funcionar", async () => {
    const a = stub("gemini 1", fails(429));
    const b = stub("gemini 2", fails(500));
    const c = stub("openai", async () => "C");
    expect(await withFallback([a, b, c], { cooldowns: new Map() }).complete({ system: "", user: "" })).toBe("C");
  });

  it("todas falharam: um erro só, com o motivo de cada uma", async () => {
    const llm = withFallback([stub("gemini", fails(429, "limite")), stub("openai", fails(401, "chave ruim"))], { cooldowns: new Map() });
    const err = await llm.complete({ system: "", user: "" }).catch((e) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect(err.message).toMatch(/gemini falhou \(limite\).*openai falhou \(chave ruim\)/);
  });

  it("chave que bateu o limite descansa 1 minuto e depois volta", async () => {
    let t = 1_000_000;
    const cooldowns = new Map<string, number>();
    const a = stub("gemini", fails(429, "limite"));
    const b = stub("openai", async () => "B");
    const llm = withFallback([a, b], { cooldowns, now: () => t });
    await llm.complete({ system: "", user: "" });
    await llm.complete({ system: "", user: "" });
    await llm.complete({ system: "", user: "" });
    expect(a.calls).toBe(1); // as outras vezes ela pulou a vez
    t += 61_000;
    await llm.complete({ system: "", user: "" });
    expect(a.calls).toBe(2); // passou o minuto: tenta de novo
  });

  it("chave inválida descansa mais tempo; erro comum não descansa", async () => {
    let t = 0;
    const cooldowns = new Map<string, number>();
    const bad = stub("gemini 1", fails(403));
    const flaky = stub("gemini 2", fails(500));
    const ok = stub("openai", async () => "B");
    const llm = withFallback([bad, flaky, ok], { cooldowns, now: () => t });
    await llm.complete({ system: "", user: "" });
    t += 120_000;
    await llm.complete({ system: "", user: "" });
    expect(bad.calls).toBe(1); // ainda de molho (10 min)
    expect(flaky.calls).toBe(2); // erro 500 não faz descansar
  });

  it("se todas estão descansando, tenta todas mesmo assim", async () => {
    const cooldowns = new Map<string, number>();
    const a = stub("a", fails(429));
    const b = stub("b", fails(429));
    const llm = withFallback([a, b], { cooldowns, now: () => 0 });
    await llm.complete({ system: "", user: "" }).catch(() => {});
    await llm.complete({ system: "", user: "" }).catch(() => {});
    expect(a.calls).toBe(2);
    expect(b.calls).toBe(2);
  });

  it("acabou o tempo: não tenta a reserva", async () => {
    const controller = new AbortController();
    const a = stub("a", async () => {
      controller.abort();
      throw new Error("abortado");
    });
    const b = stub("b", async () => "B");
    await expect(withFallback([a, b], { cooldowns: new Map() }).complete({ system: "", user: "", signal: controller.signal })).rejects.toThrow(/abortado/);
    expect(b.calls).toBe(0);
  });
});

describe("buildProviders e buildLlm", () => {
  const env = (over: Partial<AgentEnv> = {}): AgentEnv => ({ gemini: null, openai: null, order: ["openai", "gemini"], auto: true, ...over });

  it("sem chaves, sem IA", () => {
    expect(buildProviders(null)).toEqual([]);
    expect(buildLlm(env())).toBeNull();
  });

  it("padrão: OpenAI primeiro e depois as chaves do Google, que ganham número", () => {
    const e = env({ gemini: { apiKeys: ["g1", "g2"], model: null }, openai: { apiKeys: ["o1"], model: "gpt-x" } });
    expect(buildProviders(e).map((c) => `${c.name}|${c.model}`)).toEqual(["openai|gpt-x", "gemini 1|gemini-3.8-flash", "gemini 2|gemini-3.8-flash"]);
  });

  it("AGENT_ORDER troca a ordem", () => {
    const e = env({ order: ["gemini", "openai"], gemini: { apiKeys: ["g1", "g2"], model: null }, openai: { apiKeys: ["o1"], model: "gpt-x" } });
    expect(buildProviders(e).map((c) => c.name)).toEqual(["gemini 1", "gemini 2", "openai"]);
  });

  it("sem OpenAI utilizável (sem modelo), o Google assume a frente sozinho", () => {
    const e = env({ gemini: { apiKeys: ["g1", "g2"], model: null }, openai: { apiKeys: ["o1"], model: null } });
    expect(buildProviders(e).map((c) => c.name)).toEqual(["gemini 1", "gemini 2"]);
  });

  it("uma chave só não ganha número, e AGENT_MODEL vale para todas as do Google", () => {
    const e = env({ gemini: { apiKeys: ["g1"], model: "gemini-3.5-flash-lite" } });
    expect(buildProviders(e).map((c) => `${c.name}|${c.model}`)).toEqual(["gemini|gemini-3.5-flash-lite"]);
  });

  it("OpenAI sem modelo escolhido não é usada", () => {
    expect(buildProviders(env({ openai: { apiKeys: ["o1"], model: null } }))).toEqual([]);
    expect(buildLlm(env({ openai: { apiKeys: ["o1"], model: null } }))).toBeNull();
  });

  it("clientes de chaves diferentes têm ids diferentes e nenhum id contém a chave", () => {
    const providers = buildProviders(env({ gemini: { apiKeys: ["chave-um-secreta", "chave-dois-secreta"], model: null } }));
    expect(new Set(providers.map((p) => p.id)).size).toBe(2);
    for (const p of providers) expect(p.id).not.toContain("secreta");
  });

  it("a cadeia pede à OpenAI e, se ela falhar, às duas chaves do Google (pedidos reais simulados)", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url));
      if (String(url).includes("openai.com")) return json({ error: { message: "insufficient_quota" } }, 429);
      if (urls.filter((u) => u.includes("generativelanguage")).length === 1) return json({ error: { message: "quota" } }, 429);
      return json({ candidates: [{ content: { parts: [{ text: '{"reply":"vindo do Google 2"}' }] } }] });
    };
    const e = env({ gemini: { apiKeys: ["g1", "g2"], model: null }, openai: { apiKeys: ["o1"], model: "gpt-x" } });
    const llm = buildLlm(e, as(fetchImpl), new Map())!;
    const note = vi.fn();
    expect(await llm.complete({ system: "", user: "", note })).toBe('{"reply":"vindo do Google 2"}');
    expect(urls.filter((u) => u.includes("openai.com"))).toHaveLength(1);
    expect(urls.filter((u) => u.includes("generativelanguage"))).toHaveLength(2); // as duas chaves do Google
    expect(note.mock.calls[0][0]).toMatch(/openai falhou.*gemini 1 falhou.*Usei gemini 2/);
  });

  it("com a OpenAI funcionando, o Google nem é chamado (e nada da conversa vai para lá)", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url));
      return json({ choices: [{ message: { content: '{"reply":"ok"}' } }] });
    };
    const e = env({ gemini: { apiKeys: ["g1", "g2"], model: null }, openai: { apiKeys: ["o1"], model: "gpt-x" } });
    await buildLlm(e, as(fetchImpl), new Map())!.complete({ system: "", user: "" });
    expect(urls).toEqual(["https://api.openai.com/v1/chat/completions"]);
  });
});

describe("a reserva dentro do agente", () => {
  it("o aviso de que o Gemini falhou chega nas notas do rascunho", async () => {
    const primary = geminiClient({ apiKey: "g", fetchImpl: as(async () => json({ error: { message: "quota" } }, 429)) });
    const backup = openaiClient({
      apiKey: "o",
      model: "m",
      fetchImpl: as(async () => json({ choices: [{ message: { content: JSON.stringify({ reply: "Eu monto uma prévia do site sem custo. Posso montar a sua?", topic: "how_works", asked: null, handoff: { needed: false, reason: null } }) } }] })),
    });
    const out = await composeReply(simulationContext({ text: "como funciona?" }), { llm: withFallback([primary, backup], { cooldowns: new Map() }) });
    expect(out.source).toBe("ai");
    expect(out.notes.join(" ")).toMatch(/gemini falhou.*Usei openai/);
  });

  it("todas as chaves falharam: vale a resposta das regras", async () => {
    const down = (name: string) => stub(name, fails(429, "limite"));
    const ctx = simulationContext({ text: "como funciona?" });
    const out = await composeReply(ctx, { llm: withFallback([down("gemini 1"), down("gemini 2"), down("openai")], { cooldowns: new Map() }) });
    expect(out.source).toBe("rules");
    expect(out.notes.join(" ")).toMatch(/IA indisponível/);
  });
});
