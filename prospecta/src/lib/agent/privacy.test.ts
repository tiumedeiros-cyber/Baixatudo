import { afterEach, describe, expect, it, vi } from "vitest";
import { agentEnv, cleanEnvValue, readKeys } from "@/lib/env";
import { simulationContext } from "./context";
import { buildSystemPrompt, buildUserPrompt } from "./playbook";
import { rulesReply } from "./rules";

describe("o que vai para a IA", () => {
  const SECRET_KEY = "chave-pix-secreta@kelvin.example";
  const PHONE = "(85) 98888-7777";

  it("nunca leva a chave Pix, o telefone do dono nem número do lead", () => {
    const ctx = simulationContext({
      text: "como eu pago?",
      facts: { pixKey: SECRET_KEY, pixHolder: "Jonathan Kelvin", contactPhone: PHONE },
      history: [
        { from: "us", text: "Oi! Aqui é o Jonathan." },
        { from: "lead", text: "como eu pago?" },
      ],
    });
    const sent = `${buildSystemPrompt(ctx.facts)}\n${buildUserPrompt(ctx, rulesReply(ctx))}`;
    expect(sent).not.toContain(SECRET_KEY);
    expect(sent).not.toContain("Jonathan Kelvin"); // titular do Pix
    expect(sent).not.toContain("98888");
    expect(sent).not.toMatch(/\+?55\d{10,11}/); // telefone no formato do WhatsApp
    expect(sent).toMatch(/nunca escreva uma chave/i);
  });

  it("o prompt manda falar como o próprio Jonathan, nunca como assistente", () => {
    const ctx = simulationContext({ text: "oi" });
    const system = buildSystemPrompt(ctx.facts);
    expect(system).toMatch(/como o próprio Jonathan/);
    expect(system).toMatch(/Nunca diga "o dono"/);
    expect(system).toMatch(/vou confirmar e já te respondo/);
    expect(system).toMatch(/Nunca afirme que você NÃO tem ou NÃO faz algo/);
  });

  it("leva só as últimas 12 mensagens da conversa", () => {
    const history = Array.from({ length: 30 }, (_, i) => ({ from: (i % 2 ? "lead" : "us") as "lead" | "us", text: `mensagem-numero-${i}` }));
    const ctx = simulationContext({ text: "oi", history });
    const user = buildUserPrompt(ctx, rulesReply(ctx));
    expect(user).toContain("mensagem-numero-29");
    expect(user).not.toContain("mensagem-numero-5\n");
    expect(user.match(/mensagem-numero-/g)?.length).toBeLessThanOrEqual(12);
  });
});

describe("readKeys", () => {
  it("lê NOME e NOME_2..NOME_6, sem repetidas e sem espaço", () => {
    const env = { K: " a1 ", K_2: "b2", K_3: "", K_4: "c3", K_6: "d4", K_7: "ignorada" };
    expect(readKeys("K", env)).toEqual(["a1", "b2", "c3", "d4"]);
  });

  it("aceita várias chaves separadas por vírgula, ponto e vírgula ou espaço", () => {
    expect(readKeys("K", { K: "a1, b2;c3  d4", K_2: "b2" })).toEqual(["a1", "b2", "c3", "d4"]);
  });

  it("não quebra chave com a letra 's' nem com hífen e sublinhado", () => {
    const key = "AIzaSyD-estaSChave_com_letras_s";
    expect(readKeys("K", { K: key })).toEqual([key]);
  });

  it("limita a 6 chaves e ignora variável ausente", () => {
    const env = { K: "1,2,3,4,5,6,7,8" };
    expect(readKeys("K", env)).toHaveLength(6);
    expect(readKeys("NAO_EXISTE", env)).toEqual([]);
  });
});

describe("cleanEnvValue (deslizes de colagem no .env)", () => {
  it("tira aspas, espaços e o nome da variável repetido", () => {
    expect(cleanEnvValue("OPENAI_MODEL", "OPENAI_MODEL=gpt-6-luna")).toBe("gpt-6-luna");
    expect(cleanEnvValue("OPENAI_MODEL", ' "openai_model=gpt-6-luna" ')).toBe("gpt-6-luna");
    expect(cleanEnvValue("OPENAI_MODEL", "OPENAI_MODEL=OPENAI_MODEL=gpt-6-luna")).toBe("gpt-6-luna");
    expect(cleanEnvValue("X", "'abc'")).toBe("abc");
  });

  it("não mexe em valor normal, vazio ou ausente", () => {
    expect(cleanEnvValue("OPENAI_MODEL", "gpt-6-luna")).toBe("gpt-6-luna");
    expect(cleanEnvValue("OPENAI_MODEL", "")).toBe("");
    expect(cleanEnvValue("OPENAI_MODEL", undefined)).toBe("");
    expect(cleanEnvValue("OPENAI_MODEL", "OPENAI_MODEL=")).toBe("");
  });

  it("vale também para chaves coladas com o nome na frente", () => {
    expect(readKeys("GEMINI_API_KEY", { GEMINI_API_KEY: "GEMINI_API_KEY=AIzaKEY1", GEMINI_API_KEY_2: ' "AIzaKEY2" ' })).toEqual(["AIzaKEY1", "AIzaKEY2"]);
  });
});

describe("agentEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  const clear = () => {
    for (const k of ["GEMINI_API_KEY", "GEMINI_API_KEY_2", "OPENAI_API_KEY", "OPENAI_API_KEY_2", "OPENAI_MODEL", "AGENT_MODEL", "AGENT_PROVIDER", "AGENT_AI_MODE", "AGENT_ORDER"]) vi.stubEnv(k, "");
  };

  it("sem chave a IA está desligada", () => {
    clear();
    expect(agentEnv()).toBeNull();
  });

  it("com chave liga em modo automático; AGENT_AI_MODE=manual deixa a IA só para o clique", () => {
    clear();
    vi.stubEnv("GEMINI_API_KEY", "k-teste");
    expect(agentEnv()).toMatchObject({ gemini: { apiKeys: ["k-teste"], model: null }, openai: null, order: ["openai", "gemini"], auto: true });
    vi.stubEnv("AGENT_AI_MODE", "manual");
    expect(agentEnv()?.auto).toBe(false);
    vi.stubEnv("AGENT_AI_MODE", " MANUAL ");
    expect(agentEnv()?.auto).toBe(false);
  });

  it("várias chaves do Google e a da OpenAI com o modelo escolhido", () => {
    clear();
    vi.stubEnv("GEMINI_API_KEY", "g1");
    vi.stubEnv("GEMINI_API_KEY_2", "g2");
    vi.stubEnv("OPENAI_API_KEY", "o1");
    vi.stubEnv("OPENAI_MODEL", "modelo-x");
    expect(agentEnv()).toMatchObject({ gemini: { apiKeys: ["g1", "g2"] }, openai: { apiKeys: ["o1"], model: "modelo-x" } });
  });

  it("OPENAI_MODEL colado duas vezes ainda funciona", () => {
    clear();
    vi.stubEnv("OPENAI_API_KEY", "o1");
    vi.stubEnv("OPENAI_MODEL", "OPENAI_MODEL=gpt-6-luna");
    expect(agentEnv()?.openai?.model).toBe("gpt-6-luna");
  });

  it("AGENT_ORDER escolhe quem vai primeiro; nome inválido é ignorado e o que faltar entra no fim", () => {
    clear();
    vi.stubEnv("GEMINI_API_KEY", "g1");
    expect(agentEnv()?.order).toEqual(["openai", "gemini"]);
    vi.stubEnv("AGENT_ORDER", "gemini, openai");
    expect(agentEnv()?.order).toEqual(["gemini", "openai"]);
    vi.stubEnv("AGENT_ORDER", "gemini");
    expect(agentEnv()?.order).toEqual(["gemini", "openai"]);
    vi.stubEnv("AGENT_ORDER", "claude,openai");
    expect(agentEnv()?.order).toEqual(["openai", "gemini"]);
  });

  it("só com a chave da OpenAI e sem modelo, ela existe mas ainda não tem modelo", () => {
    clear();
    vi.stubEnv("OPENAI_API_KEY", "o1");
    expect(agentEnv()).toMatchObject({ gemini: null, openai: { model: null } });
  });

  it("AGENT_PROVIDER=off desliga mesmo com chave, e AGENT_MODEL troca o modelo do Gemini", () => {
    clear();
    vi.stubEnv("GEMINI_API_KEY", "k-teste");
    vi.stubEnv("AGENT_MODEL", "gemini-3.5-flash-lite");
    expect(agentEnv()?.gemini?.model).toBe("gemini-3.5-flash-lite");
    vi.stubEnv("AGENT_PROVIDER", "off");
    expect(agentEnv()).toBeNull();
  });
});
