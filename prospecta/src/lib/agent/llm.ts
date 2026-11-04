import type { AgentEnv } from "@/lib/env";

/**
 * Clientes da IA do agente: OpenAI e Gemini (camada grátis do Google AI Studio, Flash), cada um com uma ou mais
 * chaves, usados na ordem de AGENT_ORDER (padrão: OpenAI primeiro). Os seguintes só são chamados quando o
 * anterior FALHA (erro, limite do plano grátis, sem internet). A interface é pequena de propósito
 * (`complete`): trocar ou acrescentar provedor é escrever outro `LlmClient`, sem mexer no resto do agente.
 *
 * Sem nenhuma chave o agente roda só com as regras (`rules.ts`) e nada sai do computador.
 */

export interface LlmRequest {
  system: string;
  user: string;
  signal?: AbortSignal;
  /** Quem chama quer saber de avisos (ex.: "o Gemini falhou, usei a OpenAI"). */
  note?: (text: string) => void;
}

export interface LlmClient {
  readonly name: string;
  readonly model: string;
  /** Identifica este cliente (provedor + chave) para lembrar quem está em pausa por limite. Nunca é a chave. */
  readonly id?: string;
  /** Devolve o texto cru da resposta (esperamos um JSON, mas quem valida é quem chama). */
  complete(req: LlmRequest): Promise<string>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Mensagens de erro dos provedores podem citar um pedaço da chave: nunca deixamos isso aparecer na tela ou no log. */
export function redactSecrets(text: string): string {
  return text.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-…").replace(/AIza[0-9A-Za-z_-]{16,}/g, "AIza…");
}

/** Impressão curta e irreversível da chave, só para diferenciar clientes. */
function keyId(key: string): string {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

async function errorDetail(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  return redactSecrets(raw.replace(/\s+/g, " ").slice(0, 200));
}

// ───────────────────────── Gemini ─────────────────────────

/**
 * Modelo padrão: Flash mais novo com camada grátis na página de preços do Google em 23/10/2026.
 * Troque com AGENT_MODEL no .env.local se o Google renomear (o painel "Testar a IA" mostra o erro).
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

interface GeminiPart {
  text?: string;
  thought?: boolean;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

export function geminiClient(opts: { apiKey: string; model?: string; label?: string; fetchImpl?: typeof fetch }): LlmClient {
  const model = opts.model?.trim() || DEFAULT_GEMINI_MODEL;
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: opts.label ?? "gemini",
    model,
    id: `gemini:${keyId(opts.apiKey)}:${model}`,
    async complete({ system, user, signal }) {
      const res = await doFetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST",
        // a chave vai no cabeçalho, nunca na URL (URL aparece em log)
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: user }] }],
          generationConfig: { temperature: 0.5, maxOutputTokens: 1500, responseMimeType: "application/json" },
        }),
        signal,
      });
      if (!res.ok) {
        const detail = await errorDetail(res);
        throw new LlmError(`O Gemini respondeu ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
      }
      const data = (await res.json()) as GeminiResponse;
      if (data.promptFeedback?.blockReason) throw new LlmError(`O Gemini bloqueou o pedido (${data.promptFeedback.blockReason}).`);
      const text = (data.candidates?.[0]?.content?.parts ?? [])
        .filter((p) => !p.thought)
        .map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) throw new LlmError(`O Gemini devolveu resposta vazia${data.candidates?.[0]?.finishReason ? ` (${data.candidates[0].finishReason})` : ""}.`);
      return text;
    },
  };
}

// ───────────────────────── OpenAI ─────────────────────────

interface OpenAiChat {
  choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[];
}

/**
 * Reserva. Não existe modelo padrão de propósito: os nomes mudam e não dá para conferir daqui. O dono
 * escolhe em OPENAI_MODEL (o "Testar a IA" lista o que a conta dele enxerga). Não enviamos `temperature` nem
 * limite de tokens porque os modelos mais novos recusam esses campos.
 */
/**
 * Esforço de raciocínio padrão por modelo. Os modelos GPT-6 raciocinam por padrão (nível "medium"): os tokens de
 * raciocínio são cobrados como saída e atrasam a resposta, e uma mensagem curta de WhatsApp não precisa disso.
 * Só enviamos o campo para modelos que conhecemos (a documentação da OpenAI, 24/10/2026: o Luna aceita "none";
 * Sol e Astra começam em "low"). Para outro modelo não enviamos nada, para não receber um erro 400.
 */
export function defaultReasoning(model: string): string | null {
  if (model === "gpt-6-luna") return "none";
  if (model === "gpt-6.1-sol" || model === "gpt-6-astra") return "low";
  return null;
}

export function openaiClient(opts: { apiKey: string; model: string; reasoning?: string | null; label?: string; fetchImpl?: typeof fetch }): LlmClient {
  const reasoning = opts.reasoning ?? defaultReasoning(opts.model);
  const doFetch = opts.fetchImpl ?? fetch;
  return {
    name: opts.label ?? "openai",
    model: opts.model,
    id: `openai:${keyId(opts.apiKey)}:${opts.model}`,
    async complete({ system, user, signal }) {
      const res = await doFetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          ...(reasoning ? { reasoning_effort: reasoning } : {}),
        }),
        signal,
      });
      if (!res.ok) {
        const detail = await errorDetail(res);
        throw new LlmError(`A OpenAI respondeu ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
      }
      const data = (await res.json()) as OpenAiChat;
      const choice = data.choices?.[0];
      if (choice?.message?.refusal) throw new LlmError("A OpenAI recusou o pedido.");
      const text = (choice?.message?.content ?? "").trim();
      if (!text) throw new LlmError(`A OpenAI devolveu resposta vazia${choice?.finish_reason ? ` (${choice.finish_reason})` : ""}.`);
      return text;
    },
  };
}

/** Modelos de texto que a conta da OpenAI enxerga (só leitura). Ajuda a escolher o OPENAI_MODEL. */
export async function listOpenAiModels(apiKey: string, fetchImpl: typeof fetch = fetch, signal?: AbortSignal): Promise<string[]> {
  const res = await fetchImpl("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` }, signal });
  if (!res.ok) {
    const detail = await errorDetail(res);
    throw new LlmError(`A OpenAI respondeu ${res.status}${detail ? `: ${detail}` : ""}`, res.status);
  }
  const data = (await res.json()) as { data?: { id: string }[] };
  const notText = /embed|whisper|tts|dall-e|image|audio|realtime|transcribe|moderation|search|computer|davinci|babbage|codex|instruct/i;
  return (data.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !notText.test(id))
    .sort();
}

// ───────────────────────── reserva automática ─────────────────────────

/** Chaves que acabaram de bater o limite (ou são inválidas) ficam de molho um tempo, para não gastar tempo nelas a cada resposta. */
const globalCooldowns = new Map<string, number>();
const COOLDOWN_LIMIT_MS = 60_000; // 429: o limite do plano grátis é por minuto
const COOLDOWN_BAD_KEY_MS = 10 * 60_000; // 401/403: a chave não vai passar a funcionar sozinha

export interface FallbackOptions {
  now?: () => number;
  /** Para os testes não dependerem de estado global. */
  cooldowns?: Map<string, number>;
}

/**
 * Tenta cada cliente na ordem. Só cai para o próximo se o anterior FALHAR (erro, limite, sem internet); uma
 * resposta que o agente depois reprove na trava não chama a reserva (seria pagar de novo pelo mesmo pedido).
 * Cliente que acabou de dar limite ou chave inválida pula a vez por um tempo, a não ser que todos estejam assim.
 */
export function withFallback(clients: LlmClient[], opts: FallbackOptions = {}): LlmClient {
  if (clients.length === 0) throw new Error("withFallback precisa de pelo menos um cliente");
  if (clients.length === 1) return clients[0];
  const now = opts.now ?? Date.now;
  const cooldowns = opts.cooldowns ?? globalCooldowns;
  const idOf = (c: LlmClient) => c.id ?? `${c.name}:${c.model}`;
  return {
    name: clients.map((c) => c.name).join("+"),
    model: clients.map((c) => c.model).join(" → "),
    async complete(req) {
      const ready = clients.filter((c) => (cooldowns.get(idOf(c)) ?? 0) <= now());
      const order = ready.length > 0 ? ready : clients;
      const failures: string[] = [];
      for (const [i, client] of order.entries()) {
        try {
          const text = await client.complete(req);
          if (failures.length > 0) req.note?.(`${failures.join(" ")} Usei ${client.name} (${client.model}).`);
          return text;
        } catch (error) {
          if (req.signal?.aborted) throw error; // acabou o tempo: não adianta tentar outro
          const status = error instanceof LlmError ? error.status : undefined;
          if (status === 429) cooldowns.set(idOf(client), now() + COOLDOWN_LIMIT_MS);
          else if (status === 401 || status === 403) cooldowns.set(idOf(client), now() + COOLDOWN_BAD_KEY_MS);
          const why = error instanceof Error ? redactSecrets(error.message) : String(error);
          failures.push(`${client.name} falhou (${why}).`);
          if (i === order.length - 1) throw new LlmError(failures.join(" "));
        }
      }
      throw new LlmError(failures.join(" ")); // inalcançável; satisfaz o compilador
    },
  };
}

/**
 * Os clientes que as variáveis de ambiente liberam, na ordem de `env.order` (padrão: OpenAI primeiro e, se ela
 * falhar, as chaves do Google). Com mais de uma chave por provedor elas ganham número ("gemini 2") para as
 * mensagens dizerem qual falhou. A OpenAI só entra com OPENAI_MODEL escolhido.
 */
export function buildProviders(env: AgentEnv | null, fetchImpl?: typeof fetch): LlmClient[] {
  if (!env) return [];
  const label = (base: string, i: number, total: number) => (total > 1 ? `${base} ${i + 1}` : base);
  const make: Record<string, () => LlmClient[]> = {
    gemini: () =>
      (env.gemini?.apiKeys ?? []).map((apiKey, i, all) =>
        geminiClient({ apiKey, model: env.gemini?.model ?? undefined, label: label("gemini", i, all.length), fetchImpl }),
      ),
    openai: () => {
      const model = env.openai?.model;
      if (!model) return [];
      return (env.openai?.apiKeys ?? []).map((apiKey, i, all) => openaiClient({ apiKey, model, reasoning: env.openai?.reasoning, label: label("openai", i, all.length), fetchImpl }));
    },
  };
  return env.order.flatMap((name) => make[name]?.() ?? []);
}

export function buildLlm(env: AgentEnv | null, fetchImpl?: typeof fetch, cooldowns?: Map<string, number>): LlmClient | null {
  const providers = buildProviders(env, fetchImpl);
  return providers.length === 0 ? null : withFallback(providers, { cooldowns });
}

/** Tira a cerca de código que alguns modelos põem em volta do JSON. */
export function stripJsonFence(raw: string): string {
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(raw.trim());
  return (m ? m[1] : raw).trim();
}
