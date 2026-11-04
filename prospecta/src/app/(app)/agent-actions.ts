"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { composeReply } from "@/lib/agent/compose";
import { factsFromSettings, loadAgentContext } from "@/lib/agent/context";
import { listOpenAiModels, redactSecrets, type LlmClient } from "@/lib/agent/llm";
import { getAgentLlm, getAgentProviders } from "@/lib/agent/runtime";
import { runSimulation, type SimResult } from "@/lib/agent/sim";
import { AUTONOMY_CONFIRM } from "@/lib/agent/autonomy";
import { agentVariant } from "@/lib/agent/variant";
import { requireViewer } from "@/lib/auth";
import { publicBaseUrl } from "@/lib/deals/base-url";
import { agentEnv } from "@/lib/env";
import { classifyReply, type InboundMedia } from "@/lib/outreach/classify";
import { lastLeadMessage } from "@/lib/outreach/last-inbound";
import { getRepo } from "@/lib/repo";
import type { ActionResult } from "./actions";

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function friendly(error: unknown): string {
  console.error(error);
  return "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

const MEDIA_BODY = /^\((audio|image|video|document|sticker|contact|location)\)$/;

/**
 * "Pedir resposta ao agente": escreve de novo o rascunho para a última mensagem do lead (com a IA, se
 * estiver ligada). Substitui os rascunhos de resposta que estavam esperando; nada sai antes de aprovar.
 */
export async function askAgentAction(conversationId: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(conversationId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const conv = await repo.getConversation(conversationId);
    if (!conv) return fail("Conversa não encontrada.");
    if (conv.status === "opted_out") return fail("Esse número pediu para não receber mensagens.");
    const optouts = await repo.findOptouts([conv.phoneE164]);
    if (optouts.has(conv.phoneE164)) return fail("Esse número está na lista de bloqueio.");
    const lead = await repo.getLead(conv.leadId);
    if (!lead) return fail("Lead não encontrado.");

    const last = await lastLeadMessage(repo, conversationId);
    if (!last) return fail("O lead ainda não escreveu nada para responder (só chegou resposta automática do negócio).");

    const media = (MEDIA_BODY.exec(last.body)?.[1] as InboundMedia | undefined) ?? null;
    const text = media ? null : last.body;
    const base = await publicBaseUrl();
    const ctx = await loadAgentContext(repo, conv, lead, { text, media, intent: last.intent ?? classifyReply(text, media).intent }, {
      publicBaseUrl: base.local ? null : base.url,
    });
    const out = await composeReply(ctx, { llm: getAgentLlm() });
    if (!out.reply) {
      return fail(`${out.handoff.reason ?? "O agente não tem resposta para isso."} Escreva você mesmo na caixa abaixo.`);
    }

    // troca os rascunhos de resposta antigos pelo novo
    const old = await repo.listMessages({ conversationId, direction: "out", kinds: ["reply"], statuses: ["draft"], limit: 20 });
    await repo.bulkUpdateMessages(old.map((m) => m.id), ["draft"], { status: "cancelled", error: "substituído por um novo rascunho do agente" });
    await repo.createMessages([
      {
        conversationId,
        leadId: lead.id,
        direction: "out",
        kind: "reply",
        body: out.reply,
        status: "draft",
        intent: last.intent,
        variant: agentVariant(out),
        createdBy: "system",
      },
    ]);
    for (const path of ["/fila", "/conversas", `/conversas/${conversationId}`]) revalidatePath(path);
    const who = out.source === "ai" ? "com a IA" : "pelas regras";
    const why = out.notes.length > 0 ? ` ${out.notes.join(" ")}` : "";
    return ok(`Rascunho escrito ${who}. Leia, ajuste se quiser e aprove.${why}`);
  } catch (error) {
    return fail(friendly(error));
  }
}

const SimInput = z.object({
  text: z.string().trim().min(1, "Escreva a mensagem do lead.").max(500, "Mensagem longa demais."),
  websiteKind: z.enum(["none", "social", "weak", "real"]),
  demoSent: z.boolean(),
  useAi: z.boolean(),
});

export type SimulateOutcome = { ok: true; result: SimResult; aiAvailable: boolean } | { ok: false; message: string };

/** Simulador da tela do agente: mostra o que ele responderia, sem gravar nada e sem enviar nada. */
export async function simulateAgentAction(input: z.input<typeof SimInput>): Promise<SimulateOutcome> {
  await requireViewer();
  const parsed = SimInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  try {
    const repo = await getRepo();
    const llm = getAgentLlm();
    const v = parsed.data;
    const result = await runSimulation(
      {
        text: v.text,
        websiteKind: v.websiteKind,
        demoSent: v.demoSent,
        facts: factsFromSettings(await repo.getSettings()),
      },
      v.useAi ? llm : null,
    );
    return { ok: true, result, aiAvailable: !!llm };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/** Uma chamada mínima a um provedor: devolve uma linha dizendo se funcionou. */
async function ping(llm: LlmClient): Promise<{ ok: boolean; line: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const started = Date.now();
  try {
    const raw = await llm.complete({
      system: "Responda somente com JSON.",
      user: 'Devolva exatamente {"ok":true}.',
      signal: controller.signal,
    });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    return /"ok"\s*:\s*true/.test(raw)
      ? { ok: true, line: `${llm.name} (${llm.model}): funcionando, respondeu em ${seconds}s.` }
      : { ok: false, line: `${llm.name} (${llm.model}): respondeu fora do formato esperado: ${raw.slice(0, 100)}` };
  } catch (error) {
    const why = controller.signal.aborted ? "demorou mais de 15 segundos" : error instanceof Error ? redactSecrets(error.message) : String(error);
    return { ok: false, line: `${llm.name} (${llm.model}): ${why}` };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Botão "Testar a IA": chama cada chave de cada provedor separadamente e diz qual funciona. Se há chave da
 * OpenAI mas falta o OPENAI_MODEL, lista os modelos que a conta dela enxerga para o dono escolher.
 */
export async function testAgentAiAction(): Promise<ActionResult> {
  await requireViewer();
  const env = agentEnv();
  if (!env) return fail("A IA está desligada: não há GEMINI_API_KEY nem OPENAI_API_KEY no .env.local (ou AGENT_PROVIDER=off). O agente usa só as regras.");

  const lines: string[] = [];
  let allOk = true;
  for (const llm of getAgentProviders()) {
    const r = await ping(llm);
    lines.push(r.line);
    allOk &&= r.ok;
  }

  if (env.openai && !env.openai.model) {
    allOk = false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      const models = await listOpenAiModels(env.openai.apiKeys[0], fetch, controller.signal).finally(() => clearTimeout(timer));
      lines.push(
        `openai: a chave funciona, mas falta o OPENAI_MODEL no .env.local. Modelos de texto da sua conta: ${models.slice(0, 25).join(", ") || "nenhum encontrado"}.`,
      );
    } catch (error) {
      lines.push(`openai: a chave não passou (${error instanceof Error ? redactSecrets(error.message) : "erro"}). Falta também o OPENAI_MODEL.`);
    }
  }
  const text = lines.join("\n");
  return allOk ? ok(text) : fail(text);
}

const AutonomyInput = z.object({
  mode: z.enum(["copiloto", "semi"]),
  confirm: z.string().default(""),
  autoClose: z.boolean(),
  autoFreeform: z.boolean(),
  autoBatch: z.boolean(),
  maxPerConversation: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo de 1 por conversa.").max(30, "Máximo de 30 por conversa."),
  maxPerDay: z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo de 1 por dia.").max(300, "Máximo de 300 por dia."),
});

/**
 * Liga ou desliga o nível 3 (o agente responde sozinho o que é seguro) e o fechamento sozinho. Ligar exige digitar a
 * frase; voltar ao modo assistido não exige nada. Não mexe em pausa, simulação nem em nenhuma trava de envio.
 */
export async function saveAutonomyAction(input: z.input<typeof AutonomyInput>): Promise<ActionResult> {
  await requireViewer();
  const parsed = AutonomyInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const v = parsed.data;
  try {
    const repo = await getRepo();
    const cfg = (await repo.getSettings()).automation;
    const semi = v.mode === "semi";
    const turningOn =
      semi &&
      (cfg.autonomy !== "semi" || (v.autoClose && !cfg.autoClose) || (v.autoFreeform && !cfg.autoFreeform) || (v.autoBatch && !cfg.autoBatch));
    if (turningOn && v.confirm.trim().toUpperCase() !== AUTONOMY_CONFIRM) {
      return fail(`Para ligar, digite ${AUTONOMY_CONFIRM}. É o seu OK de que o agente pode responder sozinho.`);
    }
    await repo.saveAutomation({
      autonomy: v.mode,
      autoClose: semi ? v.autoClose : false,
      autoFreeform: semi ? v.autoFreeform : cfg.autoFreeform,
      autoBatch: semi ? v.autoBatch : false,
      autoMaxPerConversation: v.maxPerConversation,
      autoMaxPerDay: v.maxPerDay,
    });
    await repo.addEvents([
      {
        leadId: null,
        type: "automacao",
        payload: {
          text:
            v.mode === "semi"
              ? `atendimento sozinho ligado (fechamento sozinho ${v.autoClose ? "ligado" : "desligado"}; perguntas livres ${v.autoFreeform ? "ligadas" : "desligadas"}; lote do dia ${v.autoBatch ? "sozinho" : "com a sua aprovação"}; até ${v.maxPerConversation} por conversa e ${v.maxPerDay} por dia)`
              : "voltou ao modo assistido (você aprova tudo)",
        },
      },
    ]);
    for (const path of ["/", "/agente", "/conversas", "/fila", "/configuracoes"]) revalidatePath(path);

    if (v.mode !== "semi") return ok("Voltou ao modo assistido: o agente só escreve rascunhos e você aprova tudo.");
    const notes: string[] = [];
    if (cfg.paused) notes.push("A automação está PAUSADA: nada sai até você clicar em Retomar.");
    if (cfg.dryRun) notes.push("Está em SIMULAÇÃO: as respostas só são registradas, não saem de verdade.");
    return ok(`Atendimento sozinho ligado. ${notes.join(" ")}`.trim());
  } catch (error) {
    return fail(friendly(error));
  }
}
