"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAgentLlm, getAutoAgentLlm } from "@/lib/agent/runtime";
import { OWNER_PREVIEW_VARIANT } from "@/lib/agent/variant";
import { requireViewer } from "@/lib/auth";
import { isLocalUrl } from "@/lib/deals/local-url";
import { siteUrl } from "@/lib/env";
import type { AutomationConfig } from "@/lib/outreach/config";
import {
  approveMessages,
  blockLead,
  cancelMessages,
  handleMessageEvent,
  isPreviewDelivery,
  prepareBatch,
  reopenMessages,
  requeueSimulated,
  resumeNow,
  rewriteOpenings,
  sendManualNow,
  syncQueueWithRules,
  unblockLead,
} from "@/lib/outreach/engine";
import { parseHHMM } from "@/lib/outreach/guardrails";
import { cleanRobotConversations } from "@/lib/outreach/robot-cleanup";
import { loadRoster, ownerOf } from "@/lib/outreach/roster";
import { applySkipDay, dayLabelLong } from "@/lib/outreach/skip-days";
import { getDefaultProvider, getProvider, providerForAccount } from "@/lib/outreach/runtime";
import { getRepo } from "@/lib/repo";
import { formatWhen } from "@/lib/utils";
import type { ActionResult } from "./actions";

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function refresh() {
  for (const path of ["/", "/fila", "/conversas", "/configuracoes", "/funil", "/cacador"]) revalidatePath(path);
}

function friendly(error: unknown): string {
  console.error(error);
  return error instanceof Error && /SUPABASE_SECRET_KEY/.test(error.message)
    ? error.message
    : "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

const Ids = z.array(z.uuid()).min(1).max(500);
const rng = Math.random;

// ───────────────────────── lote do dia ─────────────────────────

export async function prepareBatchAction(): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    // o dono clicou em "Preparar lote": a IA escreve as aberturas mesmo em AGENT_AI_MODE=manual
    const r = await prepareBatch(repo, new Date(), { llm: getAgentLlm() });
    refresh();
    const total = r.openings + r.followUps;
    if (total === 0) {
      const why = Object.entries(r.skipped)
        .map(([k, n]) => `${n}× ${k}`)
        .join(", ");
      return fail(
        r.alreadyPrepared + r.carriedOver >= r.cap
          ? r.carriedOver > 0
            ? `O lote de hoje já está completo: sobraram ${r.carriedOver} ${r.carriedOver === 1 ? "mensagem" : "mensagens"} de dias anteriores (aprovadas ou rascunhos) que contam no teto de ${r.cap}. Aprove os rascunhos antigos ou descarte o que não quer mais.`
            : `O lote de hoje já está completo (${r.alreadyPrepared} de ${r.cap}).`
          : `Nenhum lead disponível. Aprove leads para a fila no Caçador (etapa Qualificado).${why ? ` Ficaram de fora: ${why}.` : ""}`,
      );
    }
    const how =
      r.openings === 0
        ? ""
        : r.written.ia > 0
          ? ` O agente escreveu ${r.written.ia} ${r.written.ia === 1 ? "abertura" : "aberturas"} com IA${r.written.modelo > 0 ? ` e ${r.written.modelo} saíram dos modelos${r.written.notes[0] ? ` (${r.written.notes[0]})` : ""}` : ""}.`
          : r.written.notes[0]
            ? ` As aberturas saíram dos modelos: ${r.written.notes[0]}`
            : " As aberturas saíram dos modelos.";
    const carried = r.carriedOver > 0 ? ` Já havia ${r.carriedOver} de dias anteriores esperando (contam no teto de hoje).` : "";
    return ok(
      `${total} mensagens preparadas (${r.openings} aberturas e ${r.followUps} follow-ups).${how}${carried} Revise, ajuste o texto se quiser e aprove. Nada sai antes da aprovação.`,
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Reescreve com o agente os rascunhos de abertura (todos, ou só os escolhidos). Nada sai: continuam rascunhos. */
export async function rewriteOpeningsAction(ids?: string[]): Promise<ActionResult> {
  await requireViewer();
  const parsed = ids === undefined ? null : Ids.safeParse(ids);
  if (parsed && !parsed.success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const llm = getAgentLlm();
    if (!llm) return fail("A IA não está ligada: falta a chave no .env.local. Sem ela o agente usa os modelos, que já são os do rascunho.");
    if ((await repo.getSettings()).agentFlow !== "qualificar") {
      return fail('No fluxo com prévia o agente usa os modelos. Troque o campo "Como o agente conduz a conversa" para "qualificar" nas Configurações.');
    }
    const r = await rewriteOpenings(repo, parsed ? parsed.data : null, { llm });
    refresh();
    if (r.rewritten === 0) return fail("Não há rascunhos de abertura para reescrever.");
    const kept = r.rewritten - r.ia;
    return ok(
      `${r.ia} ${r.ia === 1 ? "abertura reescrita" : "aberturas reescritas"} pelo agente${kept > 0 ? `; ${kept} ficaram nos modelos${r.notes[0] ? ` (${r.notes[0]})` : ""}` : ""}. Continuam rascunhos: revise e aprove.`,
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

/**
 * Conserta as conversas antigas em que quem "respondeu" foi um robô (saudação do WhatsApp Business, menu, ausência): marca a
 * mensagem como automática, devolve a conversa a "sem resposta" e cancela o rascunho que o agente escreveu para o robô. Não apaga nada
 * e não envia nada.
 */
export async function cleanRobotConversationsAction(): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const r = await cleanRobotConversations(repo);
    refresh();
    if (r.fixed === 0) return fail("Não encontrei nenhuma conversa para consertar.");
    const drafts = r.repliesCancelled > 0 ? ` e ${r.repliesCancelled} ${r.repliesCancelled === 1 ? "resposta do agente foi cancelada" : "respostas do agente foram canceladas"}` : "";
    return ok(`${r.fixed} ${r.fixed === 1 ? "conversa voltou" : "conversas voltaram"} para “Sem resposta”${drafts}. Os textos dos robôs continuam gravados, só com a marca de automática.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function approveAction(ids: string[]): Promise<ActionResult> {
  await requireViewer();
  const parsed = Ids.safeParse(ids);
  if (!parsed.success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const r = await approveMessages(repo, parsed.data, new Date(), rng);
    refresh();
    if (r.approved === 0) return fail("Nada para aprovar: essas mensagens já foram tratadas.");
    return ok(
      `${r.approved} ${r.approved === 1 ? "mensagem aprovada" : "mensagens aprovadas"}. Os envios ficam espalhados pelos horários permitidos.`,
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function approveAllDraftsAction(): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const drafts = await repo.listMessages({ statuses: ["draft"], direction: "out", limit: 500 });
    if (drafts.length === 0) return fail("Não há rascunhos para aprovar.");
    const r = await approveMessages(repo, drafts.map((m) => m.id), new Date(), rng);
    refresh();
    return ok(`${r.approved} mensagens aprovadas. Os envios ficam espalhados pelos horários permitidos.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function cancelAction(ids: string[]): Promise<ActionResult> {
  await requireViewer();
  const parsed = Ids.safeParse(ids);
  if (!parsed.success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const n = await cancelMessages(repo, parsed.data);
    refresh();
    // antes, "0 canceladas" voltava como sucesso e a tela não dizia nada: parecia que o botão não fazia nada
    if (n === 0) return fail("Essa mensagem já saiu ou já tinha sido cancelada. Atualizei a lista.");
    return ok(`${n} ${n === 1 ? "mensagem cancelada" : "mensagens canceladas"}.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function reopenAction(ids: string[]): Promise<ActionResult> {
  await requireViewer();
  const parsed = Ids.safeParse(ids);
  if (!parsed.success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const r = await reopenMessages(repo, parsed.data);
    refresh();
    if (r.reopened === 0) return fail("Não deu para reabrir: a mensagem já foi tratada ou o número pediu para não receber mensagens.");
    return ok("Mensagem reaberta como rascunho. Leia e aprove de novo; nada sai antes disso.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function editDraftAction(id: string, body: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(id).success) return fail("Pedido inválido.");
  const text = body.trim();
  if (text.length < 5) return fail("A mensagem está curta demais.");
  if (text.length > 1000) return fail("A mensagem passa de 1.000 caracteres.");
  try {
    const repo = await getRepo();
    const m = await repo.getMessage(id);
    if (!m || m.status !== "draft") return fail("Só dá para editar rascunhos.");
    // o follow-up (só sai para quem não respondeu) continua dando a saída; a primeira abordagem não precisa: é só conversa
    if (m.kind === "followup" && !/\bPARE\b/i.test(text)) {
      return fail('O follow-up precisa avisar como parar: inclua "responda PARE".');
    }
    await repo.updateMessage(id, { body: text });
    revalidatePath("/fila");
    return ok("Texto salvo.");
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── pausa geral e simulação ─────────────────────────

export async function setPausedAction(paused: boolean): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    if (!paused) {
      const r = await resumeNow(repo, new Date(), rng);
      refresh();
      const timezone = (await repo.getSettings()).automation.timezone;
      const notes = [
        r.rescheduled > 0 ? `${r.rescheduled} ${r.rescheduled === 1 ? "mensagem aprovada ganhou" : "mensagens aprovadas ganharam"} horário novo${r.firstAt ? `, a primeira ${formatWhen(r.firstAt, timezone)}` : ""}` : null,
        r.staleReplies > 0 ? `${r.staleReplies} ${r.staleReplies === 1 ? "resposta antiga voltou" : "respostas antigas voltaram"} como rascunho para você conferir` : null,
        r.oldDrafts > 0 ? `${r.oldDrafts} ${r.oldDrafts === 1 ? "rascunho de dia anterior espera" : "rascunhos de dias anteriores esperam"} a sua aprovação` : null,
      ].filter(Boolean);
      return ok(`Automação retomada.${notes.length > 0 ? ` ${notes.join("; ")}.` : " Não havia nada parado."}`);
    }
    await repo.saveAutomation({ paused, pausedReason: "Pausada manualmente pelo dono." });
    await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: "pausada pelo dono" } }]);
    refresh();
    return ok("Automação pausada. Nada mais sai; o que estava aprovado fica esperando e é reagendado quando você retomar.");
  } catch (error) {
    return fail(friendly(error));
  }
}

/**
 * Ligar a simulação é sempre seguro. DESLIGAR (envio real) exige GOWA configurado e conectado
 * e a palavra ENVIAR digitada. E, ao desligar, a automação fica PAUSADA: o dono precisa clicar
 * em "Retomar" de propósito. São duas decisões, não uma.
 */
export async function setDryRunAction(dryRun: boolean, confirm = ""): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    if (dryRun) {
      await repo.saveAutomation({ dryRun: true });
      await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: "simulação ligada" } }]);
      refresh();
      return ok("Simulação ligada: o worker só registra o que enviaria.");
    }

    if (confirm.trim().toUpperCase() !== "ENVIAR") return fail('Digite ENVIAR para confirmar o envio real.');
    const provider = await getDefaultProvider(repo);
    if (provider.mode !== "gowa") return fail("O GOWA não está configurado (GOWA_URL no .env.local). Sem ele não existe envio real.");
    const status = await provider.status();
    if (!status.connected) return fail(`O WhatsApp não está conectado: ${status.detail}.`);

    await repo.saveAutomation({
      dryRun: false,
      paused: true,
      pausedReason: "Envio real ligado: confira a fila e clique em Retomar.",
    });
    await repo.addEvents([{ leadId: null, type: "automacao", payload: { text: "envio real ligado (automação segue pausada até o dono retomar)" } }]);
    refresh();
    return ok("Envio real ligado. A automação continua PAUSADA: confira a fila e clique em Retomar quando quiser começar.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function requeueSimulatedAction(): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const n = await requeueSimulated(repo, new Date(), rng);
    refresh();
    return n === 0 ? fail("Não há mensagens simuladas.") : ok(`${n} mensagens voltaram para a fila com horário novo.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── regras de envio (configurações) ─────────────────────────

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Teto diário de abordagens: o número é do dono, sem máximo. */
const dailyCap = z.coerce.number().int("Use um número inteiro.").min(1, "Mínimo de 1 por dia.");
/** A rampa de aquecimento é opcional: em branco vira "sem rampa nesta semana". */
const optionalCap = z.preprocess((v) => (v === "" || v == null ? null : v), z.union([z.null(), dailyCap]));

const AutomationForm = z
  .object({
    morningFrom: z.string().regex(HHMM, "Horário inválido."),
    morningTo: z.string().regex(HHMM, "Horário inválido."),
    afternoonFrom: z.string().regex(HHMM, "Horário inválido."),
    afternoonTo: z.string().regex(HHMM, "Horário inválido."),
    week1: optionalCap,
    week2: optionalCap,
    steady: dailyCap,
    gapMin: z.coerce.number().min(1, "Intervalo mínimo de 1 minuto.").max(60),
    gapMax: z.coerce.number().min(1).max(120),
    maxTouches: z.coerce.number().int().min(1).max(4),
    followUp1: z.coerce.number().int().min(1).max(30),
    followUp2: z.coerce.number().int().min(1).max(60),
    senderName: z.string().trim().min(2, "Informe seu nome.").max(40),
    brandName: z.string().trim().min(2, "Informe o nome da marca.").max(40),
    senderFullName: z.string().trim().min(2, "Informe seu nome completo.").max(60),
    senderRole: z.string().trim().min(3, "Diga o que você é (ex.: desenvolvedor).").max(90),
  })
  .refine((v) => v.gapMax >= v.gapMin, { message: "O intervalo máximo não pode ser menor que o mínimo.", path: ["gapMax"] })
  // só confere a ordem do que foi preenchido: semana 1 ≤ semana 2 ≤ ritmo normal
  .refine(
    (v) => {
      const tiers = [v.week1, v.week2, v.steady].filter((n): n is number => n !== null);
      return tiers.every((n, i) => i === 0 || n >= tiers[i - 1]);
    },
    { message: "Os tetos devem crescer: semana 1 ≤ semana 2 ≤ ritmo normal.", path: ["steady"] },
  )
  .refine((v) => parseHHMM(v.morningTo) > parseHHMM(v.morningFrom) && parseHHMM(v.afternoonTo) > parseHHMM(v.afternoonFrom), {
    message: "Em cada janela, o fim precisa ser depois do começo.",
    path: ["morningTo"],
  })
  .refine((v) => v.followUp2 > v.followUp1, { message: "O 2º follow-up precisa vir depois do 1º.", path: ["followUp2"] });

export async function saveAutomationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requireViewer();
  const days = formData.getAll("weekdays").map(Number).filter((d) => d >= 1 && d <= 7);
  const parsed = AutomationForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  if (days.length === 0) return fail("Escolha pelo menos um dia da semana.");
  const v = parsed.data;

  const patch: Partial<AutomationConfig> = {
    windows: [
      { from: v.morningFrom, to: v.morningTo },
      { from: v.afternoonFrom, to: v.afternoonTo },
    ],
    weekdays: [...new Set(days)].sort(),
    caps: { week1: v.week1, week2: v.week2, steady: v.steady },
    gapMinSec: Math.round(v.gapMin * 60),
    gapMaxSec: Math.round(v.gapMax * 60),
    maxTouches: v.maxTouches,
    followUpDays: [v.followUp1, v.followUp2],
  };
  try {
    const repo = await getRepo();
    const before = (await repo.getSettings()).automation;
    const saved = await repo.saveAutomation(patch);
    await repo.saveSettings({ senderName: v.senderName, brandName: v.brandName, senderFullName: v.senderFullName, senderRole: v.senderRole });

    // as mensagens já aprovadas têm horário marcado com as regras antigas: a fila é planejada de novo com as novas
    try {
      const sync = await syncQueueWithRules(repo, before, saved.automation, new Date(), rng);
      refresh();
      if (sync.reorganized) {
        const tz = saved.automation.timezone;
        const n = sync.rescheduled;
        return ok(
          `Regras de envio salvas. ${n} ${n === 1 ? "mensagem da fila foi reorganizada" : "mensagens da fila foram reorganizadas"} com os horários novos${sync.firstAt && sync.lastAt ? `: a primeira ${formatWhen(sync.firstAt, tz)} e a última ${formatWhen(sync.lastAt, tz)}` : ""}.`,
        );
      }
      return ok(sync.queue > 0 ? "Regras de envio salvas. A fila já estava dentro das regras, então os horários continuam os mesmos." : "Regras de envio salvas. Valem para os próximos agendamentos.");
    } catch (error) {
      console.error("reorganizar a fila:", error);
      refresh();
      return fail("As regras foram salvas, mas não consegui reorganizar a fila agora. Nada se perdeu: as mensagens continuam aprovadas. Clique em salvar de novo para tentar outra vez.");
    }
  } catch (error) {
    return fail(friendly(error));
  }
}

/**
 * Marca (ou desmarca) um dia como SEM ENVIO e reorganiza a fila aprovada: nada de prospecção sai nesse dia, a fila pula para o
 * próximo dia útil na mesma ordem. Não pausa a automação, então as respostas do agente continuam. Nada é cancelado nem enviado.
 */
export async function setSkipDayAction(ymd: string, skip: boolean): Promise<ActionResult> {
  await requireViewer();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return fail("Escolha uma data.");
  try {
    const repo = await getRepo();
    const now = new Date();
    const r = await applySkipDay(repo, ymd, skip, now, rng);
    if (!r.ok) return fail(r.reason);
    refresh();
    const cfg = (await repo.getSettings()).automation;
    const today = new Date(now).toLocaleDateString("sv-SE", { timeZone: cfg.timezone });
    const label = dayLabelLong(ymd, today);
    if (!r.changed) return ok(skip ? `${label} já estava marcado como sem envio.` : `${label} não estava marcado como sem envio.`);
    const tz = cfg.timezone;
    const s = r.sync;
    const moved =
      s && s.reorganized
        ? ` ${s.rescheduled} ${s.rescheduled === 1 ? "mensagem da fila foi reorganizada" : "mensagens da fila foram reorganizadas"}${s.firstAt && s.lastAt ? `: a primeira ${formatWhen(s.firstAt, tz)} e a última ${formatWhen(s.lastAt, tz)}` : ""}.`
        : s && s.queue > 0
          ? " A fila já estava fora desse dia, então os horários continuam os mesmos."
          : " Não havia nada na fila.";
    if (skip) {
      const off = r.weekdayAlreadyOff ? " (esse dia da semana já não estava entre os dias de envio, então nada muda na prática)" : "";
      return ok(`Sem envio em ${label}${off}.${moved} As respostas do agente a quem escrever continuam normais.`);
    }
    return ok(`${label} voltou a ser dia de envio.${moved}`);
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── conversas ─────────────────────────

export async function setHumanAction(conversationId: string, takenOver: boolean): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(conversationId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const conv = await repo.getConversation(conversationId);
    if (!conv) return fail("Conversa não encontrada.");
    await repo.updateConversation(conversationId, { humanTakenOver: takenOver });
    if (takenOver) {
      const pending = await repo.listMessages({ conversationId, direction: "out", kinds: ["opening", "followup"], statuses: ["draft", "approved"], limit: 100 });
      await repo.bulkUpdateMessages(pending.map((m) => m.id), ["draft", "approved"], { status: "cancelled", error: "o dono assumiu a conversa" });
    }
    refresh();
    revalidatePath(`/conversas/${conversationId}`);
    return ok(takenOver ? "Você assumiu a conversa: a automação não escreve mais aqui." : "Conversa devolvida para a automação.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function markReadAction(conversationId: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(conversationId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    await repo.updateConversation(conversationId, { unread: 0 });
    revalidatePath("/conversas");
    return ok("Marcada como lida.");
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function sendManualReplyAction(conversationId: string, text: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(conversationId).success) return fail("Pedido inválido.");
  const body = text.trim();
  if (body.length < 1) return fail("Escreva a mensagem.");
  if (body.length > 1000) return fail("A mensagem passa de 1.000 caracteres.");
  try {
    const repo = await getRepo();
    const conv = await repo.getConversation(conversationId);
    if (!conv) return fail("Conversa não encontrada.");
    if (conv.status === "opted_out") return fail("Esse número pediu para não receber mensagens.");
    const optouts = await repo.findOptouts([conv.phoneE164]);
    if (optouts.has(conv.phoneE164)) return fail("Esse número está na lista de bloqueio.");

    const lead = await repo.getLead(conv.leadId);
    if (!lead) return fail("Lead não encontrado.");

    // com vários números, sai pelo aparelho do número que abordou o lead (a pausa dele não vale: quem escreve é o dono)
    const roster = await loadRoster(repo);
    const owner = roster.multi ? ownerOf(roster, conv.accountId) : null;
    if (roster.multi && (!owner || owner.retired)) return fail("Este número foi aposentado: nada sai por ele. Responda pelo celular.");

    const now = new Date();
    // a prévia que o lead pediu (fluxo "qualificar"): o dono manda o link e o agente continua quando o lead responder
    const delivery = await isPreviewDelivery(repo, conv, lead, body);
    const r = await sendManualNow(
      { repo, provider: owner ? providerForAccount(owner) : getProvider(), now, account: owner },
      { conv, lead, body, variant: delivery ? OWNER_PREVIEW_VARIANT : null },
    );
    if (!r.sent) {
      refresh();
      revalidatePath(`/conversas/${conversationId}`);
      return fail(r.reason.endsWith(".") ? r.reason : `${r.reason}.`);
    }

    // Saiu: a conversa passa a ser do dono e o que a automação tinha na fila para esse lead não sai mais. Se isto falhar a
    // mensagem JÁ está com o lead, então não vira erro (o dono reenviaria e o lead receberia duas vezes).
    let caveat = "";
    try {
      await repo.updateConversation(conversationId, delivery ? { humanTakenOver: false, status: "active", unread: 0 } : { humanTakenOver: true, unread: 0 });
      const pending = await repo.listMessages({ conversationId, direction: "out", kinds: ["opening", "followup"], statuses: ["draft", "approved"], limit: 100 });
      await repo.bulkUpdateMessages(pending.map((m) => m.id), ["draft", "approved"], { status: "cancelled", error: "o dono assumiu a conversa" });
    } catch (error) {
      console.error("depois do envio manual:", error);
      caveat = " Não consegui marcar a conversa como sua: use Assumir conversa para a automação não escrever aqui.";
    }
    refresh();
    revalidatePath(`/conversas/${conversationId}`);
    return ok(r.simulated ? "Simulação ligada: a resposta foi registrada, mas não saiu de verdade." : `Enviada.${caveat}`);
  } catch (error) {
    return fail(friendly(error));
  }
}

/**
 * Libera um número que estava bloqueado (pediu para parar, ou bloqueado à mão) porque ele voltou a escrever ou pediu para
 * falar. Devolve a conversa à automação e, se ele deixou uma mensagem sem resposta, o agente a responde.
 */
export async function unblockLeadAction(leadId: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(leadId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const site = siteUrl();
    const r = await unblockLead(repo, leadId, new Date(), {
      publicBaseUrl: site && !isLocalUrl(site) ? site : null,
      agent: { llm: getAutoAgentLlm() },
    });
    if (!r.unblocked) return fail(r.reason ?? "Não consegui liberar este número.");
    const conv = await repo.findConversationByLead(leadId);
    refresh();
    revalidatePath(`/leads/${leadId}`);
    if (conv) revalidatePath(`/conversas/${conv.id}`);
    return ok(
      r.answered
        ? r.repliedAlone
          ? "Número liberado. O agente já respondeu à mensagem dele e a resposta sai no horário de envio."
          : "Número liberado. O agente deixou a resposta como rascunho para você aprovar."
        : "Número liberado. O agente volta a atender quando ele escrever.",
    );
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function blockLeadAction(leadId: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(leadId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    const done = await blockLead(repo, leadId, "bloqueado manualmente pelo dono");
    refresh();
    revalidatePath(`/leads/${leadId}`);
    return done ? ok("Número bloqueado. Ninguém mais escreve para ele.") : fail("Esse lead não tem celular para bloquear.");
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Só no modo demonstração: simula uma resposta do lead para ver o fluxo sem WhatsApp. */
export async function simulateInboundAction(conversationId: string, text: string): Promise<ActionResult> {
  await requireViewer();
  if (!z.uuid().safeParse(conversationId).success) return fail("Pedido inválido.");
  try {
    const repo = await getRepo();
    if (repo.mode !== "demo") return fail("A simulação de resposta só existe no modo demonstração.");
    const conv = await repo.getConversation(conversationId);
    if (!conv) return fail("Conversa não encontrada.");
    const r = await handleMessageEvent(
      repo,
      {
        kind: "message",
        providerMessageId: `SIM${crypto.randomUUID().slice(0, 8)}`,
        phoneE164: conv.phoneE164,
        fromMe: false,
        text: text.trim() || "oi",
        media: null,
        timestamp: null,
      },
      new Date(),
      { agent: { llm: getAutoAgentLlm() } },
    );
    refresh();
    revalidatePath(`/conversas/${conversationId}`);
    return r.handled ? ok(`Resposta simulada (${r.intent}).`) : fail(r.reason);
  } catch (error) {
    return fail(friendly(error));
  }
}
