import "server-only";
import { agentEnv } from "@/lib/env";
import { buildLlm, buildProviders, type LlmClient } from "./llm";

/**
 * A IA do agente: Gemini primeiro e, se ele falhar, a OpenAI (quando há chave e OPENAI_MODEL). Sem chave
 * devolve nulo e o agente trabalha só com as regras. Nunca lança erro por falta de configuração.
 */
export function getAgentLlm(): LlmClient | null {
  return buildLlm(agentEnv());
}

/** Cada provedor liberado, separado (para o botão "Testar a IA" dizer qual funciona). */
export function getAgentProviders(): LlmClient[] {
  return buildProviders(agentEnv());
}

/**
 * A IA para o que acontece SEM o dono pedir (quando chega uma resposta de lead). Em AGENT_AI_MODE=manual
 * devolve nulo: o rascunho nasce pelas regras, nada da conversa sai do computador, e a IA só entra quando o
 * dono clica em "Pedir resposta ao agente".
 */
export function getAutoAgentLlm(): LlmClient | null {
  return agentEnv()?.auto ? getAgentLlm() : null;
}
