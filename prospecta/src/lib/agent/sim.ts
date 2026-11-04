import { composeReply } from "./compose";
import { simulationContext, type SimulationInput } from "./context";
import type { LlmClient } from "./llm";
import { lintMessage, type LintIssue } from "./humanize";
import { TOPIC_LABEL, type Ficha, type Handoff, type NextAction, type Topic } from "./types";

/** O que o simulador da tela do agente mostra. Nada aqui grava no banco nem envia mensagem. */
export interface SimResult {
  topic: Topic;
  topicLabel: string;
  reply: string | null;
  source: "rules" | "ai";
  handoff: Handoff;
  nextAction: NextAction | null;
  notes: string[];
  issues: LintIssue[];
  ficha: Pick<Ficha, "heat" | "phase" | "need" | "authority" | "budget" | "timing" | "signals">;
}

export async function runSimulation(input: SimulationInput, llm: LlmClient | null = null): Promise<SimResult> {
  const ctx = simulationContext(input);
  const out = await composeReply(ctx, { llm });
  const { heat, phase, need, authority, budget, timing, signals } = ctx.ficha;
  return {
    topic: out.topic,
    topicLabel: TOPIC_LABEL[out.topic],
    reply: out.reply,
    source: out.source,
    handoff: out.handoff,
    nextAction: out.nextAction,
    notes: out.notes,
    issues: out.reply ? lintMessage(out.reply, "reply") : [],
    ficha: { heat, phase, need, authority, budget, timing, signals },
  };
}
