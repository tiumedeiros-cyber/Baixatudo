import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { agentEnv } from "@/lib/env";
import { composeReply } from "./compose";
import { simulationContext } from "./context";
import { buildProviders } from "./llm";
import { SCENARIOS } from "./scenarios";
import { DETERMINISTIC_TOPICS, detectTopics } from "./topics";

/**
 * Avaliação da IA contra o gabarito. NÃO roda no `npm test`: gasta chamadas reais (OpenAI paga, Gemini com
 * limite por minuto). Rode com:  npm run agent:eval
 *
 * Mede, para CADA provedor liberado no .env.local (um por vez, sem a fila de reserva): quantas respostas passam
 * na trava (fatos + humanizador), o tempo de resposta e, na OpenAI, os tokens e o custo estimado por resposta.
 * Serve para escolher o modelo e para ver se uma mudança no playbook ajudou ou atrapalhou.
 *
 * Variáveis opcionais (na linha de comando, antes do npm):
 *   AGENT_EVAL_PROVIDER=openai|gemini   só esse provedor
 *   AGENT_EVAL_LIMIT=12                 só N casos, espaçados pelo gabarito (padrão: todos)
 *   AGENT_EVAL_IDS=garantia,parcelar    só estes casos do gabarito (ids de scenarios.ts)
 *   AGENT_EVAL_OUT=caminho.json         grava as respostas para você ler
 *   OPENAI_MODEL=gpt-6-luna             compara outro modelo sem mexer no .env.local
 */
const live = process.env.AGENT_EVAL === "1" && !!agentEnv();

/** US$ por 1 milhão de tokens (entrada, saída), da página de preços da OpenAI em 23/10/2026. */
const PRICE: Record<string, { in: number; out: number }> = {
  "gpt-6-astra": { in: 10, out: 50 },
  "gpt-6.1-sol": { in: 2, out: 10 },
  "gpt-6-luna": { in: 0.1, out: 0.5 },
};

interface Usage {
  calls: number;
  input: number;
  output: number;
  reasoning: number;
}

describe.skipIf(!live)("avaliação da IA (chamadas reais)", () => {
  it(
    "mede cada provedor contra o gabarito",
    async () => {
      const usage = new Map<string, Usage>();
      let current = "";
      const spy = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        const res = await fetch(input, init);
        if (String(input).includes("api.openai.com/v1/chat/completions")) {
          const data = (await res.clone().json().catch(() => null)) as { usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } } } | null;
          if (data?.usage) {
            const row = usage.get(current) ?? { calls: 0, input: 0, output: 0, reasoning: 0 };
            row.calls++;
            row.input += data.usage.prompt_tokens ?? 0;
            row.output += data.usage.completion_tokens ?? 0;
            row.reasoning += data.usage.completion_tokens_details?.reasoning_tokens ?? 0;
            usage.set(current, row);
          }
        }
        return res;
      }) as typeof fetch;

      const only = process.env.AGENT_EVAL_PROVIDER;
      const limit = Number(process.env.AGENT_EVAL_LIMIT) || Infinity;
      const base = (p: { name: string }) => p.name.split(" ")[0];
      const providers = buildProviders(agentEnv(), spy)
        .filter((p) => !only || base(p) === only)
        .filter((p, i, all) => all.findIndex((q) => base(q) === base(p)) === i); // uma chave de cada provedor basta

      const ids = (process.env.AGENT_EVAL_IDS ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      const pool = SCENARIOS.filter((sc) => (ids.length === 0 || ids.includes(sc.id)) && !DETERMINISTIC_TOPICS.includes(detectTopics(sc.text, sc.media ?? null)[0]));
      const step = pool.length / Math.min(limit, pool.length);
      const chosen = Array.from({ length: Math.min(limit, pool.length) }, (_, i) => pool[Math.floor(i * step)]);

      const report: Record<string, unknown>[] = [];
      const summary: Record<string, unknown>[] = [];
      for (const p of providers) {
        const label = `${p.name}:${p.model}`;
        current = label;
        const times: number[] = [];
        let accepted = 0;
        for (const sc of chosen) {
          const started = Date.now();
          const out = await composeReply(simulationContext({ text: sc.text, media: sc.media, ...sc.setup }), { llm: p, timeoutMs: 90_000 });
          const ms = Date.now() - started;
          times.push(ms);
          if (out.source === "ai") accepted++;
          report.push({ provider: label, scenario: sc.id, lead: sc.text, source: out.source, ms, reply: out.reply, notes: out.notes });
          if (base(p) === "gemini") await new Promise((r) => setTimeout(r, 5_000)); // limite por minuto do plano grátis
        }
        times.sort((a, b) => a - b);
        const u = usage.get(label);
        const price = PRICE[p.model];
        const costPerReply = u && price ? ((u.input * price.in + u.output * price.out) / 1_000_000) / u.calls : null;
        summary.push({
          provedor: label,
          casos: chosen.length,
          "passou na trava": `${accepted} (${Math.round((accepted / chosen.length) * 100)}%)`,
          "tempo médio (s)": +(times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(1),
          "tempo p95 (s)": +(times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)] / 1000).toFixed(1),
          "tokens de entrada/resposta": u ? Math.round(u.input / u.calls) : "-",
          "tokens de saída/resposta": u ? Math.round(u.output / u.calls) : "-",
          "dos quais raciocínio": u ? Math.round(u.reasoning / u.calls) : "-",
          "custo por resposta (US$)": costPerReply === null ? "-" : +costPerReply.toFixed(5),
        });
      }
      console.table(summary);
      if (process.env.AGENT_EVAL_OUT) fs.writeFileSync(process.env.AGENT_EVAL_OUT, JSON.stringify({ summary, report }, null, 2));
      expect(report.length).toBeGreaterThan(0);
    },
    1_800_000,
  );
});
