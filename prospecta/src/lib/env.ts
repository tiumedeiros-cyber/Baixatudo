/**
 * Variáveis de ambiente, lidas sob demanda (nunca no topo do módulo, para o build
 * não depender delas). Veja `.env.example`.
 */

export type AppMode = "supabase" | "demo" | "misconfigured";

export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

/**
 * - `supabase`: produção/uso real, com login e banco.
 * - `demo`: SÓ fora de produção e sem Supabase configurado. Sem login, dados fictícios em memória.
 * - `misconfigured`: produção sem Supabase. O app recusa tudo em vez de abrir sem login.
 */
export function appMode(): AppMode {
  if (supabaseConfig()) return "supabase";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "demo";
}

export function ownerEmail(): string | null {
  const v = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return v ? v : null;
}

export function apifyToken(): string | null {
  const v = process.env.APIFY_TOKEN?.trim();
  return v ? v : null;
}

/** URL pública do painel, usada no link do e-mail de login. */
export function siteUrl(): string | null {
  const v = process.env.SITE_URL?.trim().replace(/\/$/, "");
  return v ? v : null;
}

/**
 * Chave SECRETA do Supabase (sb_secret_…). Só o worker e o webhook usam, no PC, porque eles
 * não têm sessão de usuário. Nunca vai para o navegador nem para o repositório.
 */
export function supabaseSecretKey(): string | null {
  const v = process.env.SUPABASE_SECRET_KEY?.trim();
  return v ? v : null;
}

/**
 * Segredo que assina o cookie do acesso de 1 clique neste computador (mín. 32 caracteres). Fica só no
 * .env.local. Sem ele o 1 clique não existe e o painel exige o login de verdade do Supabase.
 */
export function sessionSecret(): string | null {
  const v = process.env.SESSION_SECRET?.trim();
  return v && v.length >= 32 ? v : null;
}

/** Senha do worker (/api/worker/tick). Gerada pelo setup e guardada só no .env.local. */
export function workerToken(): string | null {
  const v = process.env.WORKER_TOKEN?.trim();
  return v ? v : null;
}

/** Segredo que assina o webhook do GOWA (X-Hub-Signature-256). */
export function webhookSecret(): string | null {
  const v = process.env.WA_WEBHOOK_SECRET?.trim();
  return v ? v : null;
}

export interface AgentProviderEnv {
  /** Uma ou mais chaves do mesmo provedor, na ordem de uso. */
  apiKeys: string[];
  /** Gemini: nulo = o modelo padrão. OpenAI: nulo = ainda sem modelo escolhido, então não é usada. */
  model: string | null;
}

export type AgentProviderName = "gemini" | "openai";

/** Níveis aceitos em OPENAI_REASONING. Cada modelo aceita um subconjunto: o teste (Testar a IA) mostra o erro. */
export const REASONING_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

/** Quem escreve primeiro. Os seguintes só entram se o anterior falhar (erro, limite, sem internet). */
export const DEFAULT_AGENT_ORDER: readonly AgentProviderName[] = ["openai", "gemini"];

/** OPENAI_REASONING: só aceita níveis conhecidos; qualquer outra coisa vira nulo (usa o padrão do modelo). */
export function readReasoning(raw: string | undefined): string | null {
  const v = raw?.trim().toLowerCase();
  return v && (REASONING_LEVELS as readonly string[]).includes(v) ? v : null;
}

/** Lê AGENT_ORDER ("openai,gemini"). Nome inválido é ignorado e o que faltar entra no fim, na ordem padrão. */
export function readOrder(raw: string | undefined): AgentProviderName[] {
  const asked = (raw ?? "")
    .toLowerCase()
    .split(/[\s,;>]+/)
    .filter((n): n is AgentProviderName => n === "gemini" || n === "openai");
  return [...new Set([...asked, ...DEFAULT_AGENT_ORDER])];
}

export interface AgentEnv {
  /** Todas as chaves do Google (Gemini). Modelo: AGENT_MODEL, ou o padrão. */
  gemini: AgentProviderEnv | null;
  /**
   * Todas as chaves da OpenAI. Só é usada com OPENAI_MODEL escolhido. `reasoning` (OPENAI_REASONING) é o
   * esforço de raciocínio; nulo = o padrão do modelo conhecido (veja `defaultReasoning` em llm.ts).
   */
  openai: (AgentProviderEnv & { reasoning?: string | null }) | null;
  /** Ordem de uso entre os provedores (AGENT_ORDER; padrão: OpenAI primeiro, depois o Google). */
  order: AgentProviderName[];
  /**
   * true: a IA escreve o rascunho de toda resposta que chega (a conversa do lead vai para o Google).
   * false (AGENT_AI_MODE=manual): as regras escrevem sozinhas e a IA só entra quando o dono clica em
   * "Pedir resposta ao agente", conversa por conversa.
   */
  auto: boolean;
}

/**
 * Tira o que costuma sobrar ao colar no .env: aspas e o próprio nome da variável repetido
 * ("OPENAI_MODEL=OPENAI_MODEL=gpt-6-luna" vira "gpt-6-luna"). Nunca devolve o nome da variável como valor.
 */
export function cleanEnvValue(name: string, raw: string | undefined): string {
  const unquote = (v: string) => v.trim().replace(/^["']+|["']+$/g, "").trim();
  let v = unquote(raw ?? "");
  const prefix = `${name.toUpperCase()}=`;
  while (v.toUpperCase().startsWith(prefix)) v = unquote(v.slice(prefix.length));
  return v;
}

const envValue = (name: string, env: Record<string, string | undefined> = process.env) => cleanEnvValue(name, env[name]);

/** No máximo 6 chaves por provedor: mais do que isso é sinal de erro de digitação. */
const MAX_KEYS = 6;

/**
 * Lê as chaves de um provedor: `NOME` (aceita várias separadas por vírgula) e `NOME_2`, `NOME_3`... até `NOME_6`.
 * Sem repetidas, na ordem em que aparecem.
 */
export function readKeys(base: string, env: Record<string, string | undefined> = process.env): string[] {
  const names = [base, ...Array.from({ length: MAX_KEYS - 1 }, (_, i) => `${base}_${i + 2}`)];
  const keys = names
    .flatMap((name) => cleanEnvValue(name, env[name]).split(/[\s,;]+/))
    .map((k) => cleanEnvValue(base, k))
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(keys)].slice(0, MAX_KEYS);
}

/**
 * Chaves da IA do agente: OpenAI e Gemini (camada grátis do Google AI Studio), cada um com uma ou mais
 * chaves, usados na ordem de `AGENT_ORDER` (padrão: OpenAI primeiro). Sem nenhuma o agente roda só com as
 * regras. `AGENT_PROVIDER=off` desliga a IA mesmo com as chaves no arquivo.
 */
export function agentEnv(): AgentEnv | null {
  if (envValue("AGENT_PROVIDER").toLowerCase() === "off") return null;
  const gemini = readKeys("GEMINI_API_KEY");
  const openai = readKeys("OPENAI_API_KEY");
  if (gemini.length === 0 && openai.length === 0) return null;
  return {
    gemini: gemini.length ? { apiKeys: gemini, model: envValue("AGENT_MODEL") || null } : null,
    openai: openai.length
      ? { apiKeys: openai, model: envValue("OPENAI_MODEL") || null, reasoning: readReasoning(envValue("OPENAI_REASONING")) }
      : null,
    order: readOrder(envValue("AGENT_ORDER")),
    auto: envValue("AGENT_AI_MODE").toLowerCase() !== "manual",
  };
}

export interface GowaEnv {
  baseUrl: string;
  basicAuth: string | null;
  deviceId: string | null;
}

/** Onde o GOWA está rodando. Sem GOWA_URL o painel usa o provedor simulado e nunca envia nada. */
export function gowaEnv(): GowaEnv | null {
  const baseUrl = process.env.GOWA_URL?.trim();
  if (!baseUrl) return null;
  return {
    baseUrl,
    basicAuth: process.env.GOWA_BASIC_AUTH?.trim() || null,
    deviceId: process.env.GOWA_DEVICE_ID?.trim() || null,
  };
}
