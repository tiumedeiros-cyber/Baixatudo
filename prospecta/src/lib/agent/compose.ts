import { z } from "zod";
import { isCustom } from "./discovery";
import { guardReply } from "./guard";
import { dropRepeatedGreeting } from "./greeting-strip";
import { attachPortfolio } from "./portfolio";
import { stripJsonFence, type LlmClient } from "./llm";
import { buildSystemPrompt, buildUserPrompt } from "./playbook";
import { rulesReply } from "./rules";
import { DETERMINISTIC_TOPICS, detectTopics } from "./topics";
import { TOPICS, type AgentContext, type AgentOutput, type Handoff } from "./types";
import { introducesSelf } from "./variant";

/**
 * Junta as duas camadas do agente:
 * 1. as regras SEMPRE rodam primeiro (grátis, instantâneas, testadas);
 * 2. se a IA estiver ligada e o assunto não for um dos fixos, ela reescreve/estende a resposta usando o
 *    playbook; o resultado só vale se passar na trava (fatos + humanizador). Qualquer falha (sem internet,
 *    JSON ruim, limite do plano grátis, texto reprovado) cai de volta na resposta das regras.
 * Este módulo só ESCREVE: quem decide se a resposta sai sozinha ou vira rascunho para o dono é `autonomy.ts`. Pergunta que
 * as regras não conhecem e a IA responde volta com `freeform` (e `aiAskedHuman` se a IA pediu o dono); a resposta que o dono
 * escreveu em Configurações volta com `authorized` e nunca passa pela IA.
 */

export const AI_TIMEOUT_MS = 20_000;

export interface ComposeDeps {
  llm?: LlmClient | null;
  timeoutMs?: number;
}

const AiOutput = z.object({
  reply: z.string().nullable(),
  topic: z.string().optional(),
  asked: z.string().nullable().optional(),
  handoff: z
    .object({ needed: z.boolean(), reason: z.string().nullable().optional() })
    .optional(),
});

export type ParsedAi = { ok: true; value: z.infer<typeof AiOutput> } | { ok: false; reason: string };

export function parseAiOutput(raw: string): ParsedAi {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(raw));
  } catch {
    return { ok: false, reason: "a IA não devolveu JSON" };
  }
  const parsed = AiOutput.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, reason: "JSON da IA fora do formato" };
}

function mergeHandoff(base: Handoff, ai: { needed: boolean; reason?: string | null } | undefined, aiFilledGap: boolean): Handoff {
  const needed = base.needed || !!ai?.needed || aiFilledGap;
  const reason =
    base.reason ??
    (ai?.needed ? (ai.reason ?? null) : null) ??
    (aiFilledGap ? "Resposta escrita pela IA fora do roteiro: leia com atenção antes de aprovar." : null);
  return { needed, reason: needed ? reason ?? "Confira esta resposta antes de aprovar." : null };
}

async function composeCore(ctx: AgentContext, deps: ComposeDeps): Promise<AgentOutput> {
  const base = rulesReply(ctx, detectTopics(ctx.inbound.text, ctx.inbound.media, ctx.facts.flow));
  const llm = deps.llm;
  // Oferta de fechamento, Pix e as respostas que o dono escreveu são texto fixo: a IA não mexe nelas.
  // No fluxo "qualificar", quem pediu prévia ou quer um sistema está com o dono: a IA não escreve nada por cima disso.
  const withOwner = ctx.facts.flow === "qualificar" && (ctx.ficha.previewPending || isCustom(ctx.ficha.product));
  if (!llm || ctx.ficha.phase === "bloqueado" || DETERMINISTIC_TOPICS.includes(base.topic) || base.commits || base.authorized || base.queued || base.discovery || withOwner) return base;

  const controller = new AbortController();
  const aiNotes: string[] = []; // avisos do provedor (ex.: "o Gemini falhou, usei a OpenAI")
  let timer: ReturnType<typeof setTimeout> | undefined;
  // O prazo vale mesmo para um cliente que ignore o sinal de cancelamento.
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("demorou demais"));
    }, deps.timeoutMs ?? AI_TIMEOUT_MS);
  });
  try {
    const raw = await Promise.race([
      llm.complete({ system: buildSystemPrompt(ctx.facts), user: buildUserPrompt(ctx, base), signal: controller.signal, note: (t) => aiNotes.push(t) }),
      timeout,
    ]);
    const parsed = parseAiOutput(raw);
    if (!parsed.ok) return { ...base, notes: [...base.notes, ...aiNotes, `IA ignorada: ${parsed.reason}.`] };
    const ai = parsed.value;

    // a IA decidiu que quem escreve é o dono
    if (ai.reply === null || !ai.reply.trim()) {
      return {
        ...base,
        handoff: mergeHandoff(base.handoff, ai.handoff, base.reply === null),
        notes: [...base.notes, ...aiNotes, "A IA preferiu deixar para o dono responder."],
      };
    }

    const guard = guardReply(ai.reply, ctx);
    // no fluxo "qualificar" a prévia é feita à mão pelo dono: a IA não pode oferecê-la por conta própria
    if (guard.ok && ctx.facts.flow === "qualificar" && /pr[eé]via/i.test(guard.text) && !ctx.ficha.previewAsked && !ctx.ficha.previewSentByOwner) {
      guard.ok = false;
      guard.reasons.push("oferece prévia, mas as prévias são feitas à mão pelo dono");
    }
    // quem já disse "sou o Jonathan" (a abertura, a apresentação das regras ou o próprio dono) não o diz de novo, a não ser que
    // perguntem quem é: foi assim que o lead recebeu duas apresentações seguidas
    if (
      guard.ok &&
      ctx.facts.flow === "qualificar" &&
      base.topic !== "who" &&
      introducesSelf(guard.text, ctx.facts.senderName) &&
      ctx.messages.some((m) => m.direction === "out" && introducesSelf(m.body, ctx.facts.senderName))
    ) {
      guard.ok = false;
      guard.reasons.push("se apresenta de novo: o lead já sabe quem você é");
    }
    if (!guard.ok) return { ...base, notes: [...base.notes, ...aiNotes, `IA reprovada pela trava: ${guard.reasons.join("; ")}.`] };

    const asked = ai.asked === "objetivo" && !ctx.ficha.asked.includes("objetivo") && guard.text.includes("?") ? "objetivo" : null;
    const aiTopic = TOPICS.find((t) => t === ai.topic);
    return {
      reply: guard.text,
      topic: base.topic === "other" && aiTopic && aiTopic !== "optout" ? aiTopic : base.topic,
      source: "ai",
      handoff: mergeHandoff(base.handoff, ai.handoff, base.reply === null),
      nextAction: base.nextAction,
      asked,
      // quem decide se compromete dinheiro é o assunto (regras), não o que a IA resolveu escrever
      commits: base.commits,
      ...(base.reply === null ? { freeform: true, aiAskedHuman: !!ai.handoff?.needed } : {}),
      notes: [...base.notes, ...aiNotes],
    };
  } catch (error) {
    const why = controller.signal.aborted ? "demorou demais" : error instanceof Error ? error.message : String(error);
    return { ...base, notes: [...base.notes, ...aiNotes, `IA indisponível (${why}). Usei as regras.`] };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** A resposta do agente (regras e, se ligada, IA), já com o convite a ver o portfólio quando é a hora (veja portfolio.ts). */
export async function composeReply(ctx: AgentContext, deps: ComposeDeps = {}): Promise<AgentOutput> {
  const out = attachPortfolio(ctx, await composeCore(ctx, deps));
  // A abertura já cumprimentou: a resposta vai direto ao assunto, sem outro "Oi!" ou "Bom dia!" (no fluxo "qualificar")
  if (out.reply && ctx.facts.flow === "qualificar" && ctx.messages.some((m) => m.direction === "out")) return { ...out, reply: dropRepeatedGreeting(out.reply) };
  return out;
}
