import { NextResponse, type NextRequest } from "next/server";
import { getAutoAgentLlm } from "@/lib/agent/runtime";
import { workerToken } from "@/lib/env";
import { tickAll } from "@/lib/outreach/engine";
import { bearerOf, getProvider, providerForAccount, secretsMatch } from "@/lib/outreach/runtime";
import { MissingSecretKeyError } from "@/lib/supabase/admin";
import { getAdminRepo } from "@/lib/repo";

export const dynamic = "force-dynamic";

/**
 * Uma volta do worker de envio. Quem chama é o `npm run worker`, no PC, a cada ~20 s, com
 * `Authorization: Bearer <WORKER_TOKEN>`. Sem o token certo não faz nada. No máximo UMA
 * mensagem sai por chamada (de qualquer número) e só passando por todas as travas do motor.
 */
export async function POST(request: NextRequest) {
  const expected = workerToken();
  if (!expected) return NextResponse.json({ error: "WORKER_TOKEN não configurado" }, { status: 503 });
  if (!secretsMatch(bearerOf(request.headers.get("authorization")), expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await tickAll({
      repo: await getAdminRepo(),
      provider: getProvider(),
      // com vários números, cada um envia pelo aparelho dele
      providerFor: (account) => providerForAccount(account),
      now: new Date(),
      rng: Math.random,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      // só o lote do dia sozinho usa a IA aqui; em AGENT_AI_MODE=manual ela fica de fora e valem os modelos
      llm: getAutoAgentLlm(),
    });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof MissingSecretKeyError) {
      return NextResponse.json({ action: "offline", reason: error.message }, { status: 200 });
    }
    console.error("worker tick:", error);
    return NextResponse.json({ error: "falha ao rodar o worker" }, { status: 500 });
  }
}
