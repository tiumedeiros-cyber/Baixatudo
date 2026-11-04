"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAgentLlm } from "@/lib/agent/runtime";
import { requireViewer } from "@/lib/auth";
import { prepareLeadsForAccount } from "@/lib/outreach/engine";
import { newDeviceId } from "@/lib/outreach/accounts";
import { describeMove, moveQueue } from "@/lib/outreach/move-queue";
import {
  addAccount,
  listReleasedGroups,
  relinkAccount,
  renameAccount,
  retireAccount,
  setAccountCaps,
  setAccountPaused,
} from "@/lib/outreach/numbers";
import { getGowaAdmin } from "@/lib/outreach/runtime";
import { gowaEnv } from "@/lib/env";
import { getRepo } from "@/lib/repo";
import type { ActionResult } from "./actions";

const ok = (message: string): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

function refresh() {
  for (const path of ["/", "/fila", "/conversas", "/numeros"]) revalidatePath(path);
}

/** Erro de regra (nome repetido, número que não existe) aparece como está; o resto vira um aviso genérico. */
function friendly(error: unknown): string {
  console.error(error);
  if (error instanceof Error && /^(Dê um nome|O nome pode|Já existe|Esse número|Esse aparelho|O número original|O número de destino|Escolha outro|O teto|Não consegui|O GOWA|GOWA )/.test(error.message)) return error.message;
  return "Algo deu errado do nosso lado. Tente de novo em instantes.";
}

const Id = z.uuid();
const NO_GOWA = "O GOWA não está configurado (GOWA_URL no .env.local). Sem ele não há como conectar números.";

// ───────────────────────── cadastro ─────────────────────────

/**
 * Descobre qual aparelho do GOWA é o do número original e o fixa nele. Com mais de um aparelho o GOWA deixa de ter "padrão":
 * sem isto o número que já funciona pararia de enviar no instante em que o segundo fosse criado.
 */
async function pinOriginalDevice(repo: Awaited<ReturnType<typeof getRepo>>) {
  const admin = getGowaAdmin({ timeoutMs: 8000 });
  if (!admin) return;
  const original = (await repo.listAccounts()).find((a) => a.legacy && !a.retired);
  if (!original || original.gowaDeviceId) return;
  const fromEnv = gowaEnv()?.deviceId ?? null;
  const devices = await admin.listDevices();
  const picked = fromEnv ?? (devices.length === 1 ? devices[0].id : null);
  if (!picked) throw new Error("Não consegui descobrir qual aparelho do GOWA é o do Número 1. Defina GOWA_DEVICE_ID no .env.local e tente de novo.");
  const device = devices.find((d) => d.id === picked);
  await repo.updateAccount(original.id, {
    gowaDeviceId: picked,
    ...(device?.jid ? { jid: device.jid } : {}),
    ...(device?.phone ? { phoneE164: `+${device.phone}` } : {}),
  });
}

/** Cria o aparelho no GOWA e cadastra o número no painel, pausado. Depois é só conectar (QR ou código). */
export async function addNumberAction(name: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const admin = getGowaAdmin({ timeoutMs: 10_000 });
    if (!admin) return fail(NO_GOWA);
    const parsed = z.string().trim().min(1, "Dê um nome ao número (por exemplo, Número 2).").max(60).safeParse(name);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Nome inválido.");
    await pinOriginalDevice(repo);
    const device = await admin.addDevice(newDeviceId());
    const account = await addAccount(repo, { name: parsed.data, gowaDeviceId: device.id });
    refresh();
    return ok(`${account.name} cadastrado. Conecte o WhatsApp dele (QR code ou código) e depois libere o envio.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function renameNumberAction(id: string, name: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const account = await renameAccount(repo, Id.parse(id), name);
    refresh();
    return ok(`Agora é ${account.name}.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function setNumberPausedAction(id: string, paused: boolean): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const account = await setAccountPaused(repo, Id.parse(id), paused);
    refresh();
    return ok(paused ? `${account.name} pausado. Os outros números seguem.` : `${account.name} liberado: ele envia o que estiver aprovado, dentro das regras.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

const Caps = z.object({
  week1: z.number().int().min(1).max(1000).nullable(),
  week2: z.number().int().min(1).max(1000).nullable(),
  steady: z.number().int().min(1).max(1000),
});

export async function setNumberCapsAction(id: string, caps: { week1: number | null; week2: number | null; steady: number }): Promise<ActionResult> {
  await requireViewer();
  try {
    const parsed = Caps.safeParse(caps);
    if (!parsed.success) return fail("Use números inteiros de 1 em diante (ou deixe em branco as primeiras semanas).");
    const repo = await getRepo();
    const account = await setAccountCaps(repo, Id.parse(id), parsed.data);
    refresh();
    return ok(`Teto de ${account.name}: ${parsed.data.steady} por dia.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

export async function retireNumberAction(id: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const r = await retireAccount(repo, Id.parse(id));
    refresh();
    return ok(`${r.account.name} aposentado.${r.cancelled > 0 ? ` ${r.cancelled} mensagens que não tinham saído foram canceladas e os leads voltaram para a lista de liberados.` : ""}`);
  } catch (error) {
    return fail(friendly(error));
  }
}

/**
 * O número caiu, foi restringido ou vai descansar: passa para outro as aberturas que ainda não saíram, junto com as conversas.
 * As aprovadas ganham horário novo no fim da fila do destino. Nada é enviado nem apagado.
 */
export async function moveQueueAction(fromId: string, toId: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const r = await moveQueue(repo, Id.parse(fromId), Id.parse(toId), new Date(), Math.random);
    refresh();
    const d = describeMove(r);
    return d.ok ? ok(d.message) : fail(d.message);
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── conectar o WhatsApp ─────────────────────────

export type ConnectResult =
  | { ok: true; message: string; qr?: string | null; seconds?: number; code?: string }
  | { ok: false; message: string };

async function deviceOf(id: string) {
  const repo = await getRepo();
  const account = await repo.getAccount(Id.parse(id));
  if (!account || account.retired) throw new Error("Esse número não existe mais.");
  if (!account.gowaDeviceId) throw new Error("Esse número ainda não tem aparelho no GOWA. Cadastre de novo.");
  const admin = getGowaAdmin({ timeoutMs: 10_000 });
  if (!admin) throw new Error(NO_GOWA);
  return { repo, account, admin, deviceId: account.gowaDeviceId };
}

/**
 * Troca o aparelho de um número: cria um aparelho NOVO no GOWA e liga este número a ele (a conexão antiga caiu, foi restringida ou
 * foi apagada lá). Nome, conversas e fila ficam. O número fica pausado até você conectar e liberar. O aparelho antigo, se ainda
 * existir no GOWA, NÃO é apagado: o painel nunca apaga nada no GOWA. Já devolve o QR para escanear.
 */
export async function replaceNumberDeviceAction(id: string): Promise<ConnectResult> {
  await requireViewer();
  try {
    const repo = await getRepo();
    const account = await repo.getAccount(Id.parse(id));
    if (!account || account.retired) return { ok: false, message: "Esse número não existe mais." };
    const admin = getGowaAdmin({ timeoutMs: 10_000 });
    if (!admin) return { ok: false, message: NO_GOWA };
    const old = account.gowaDeviceId;
    const device = await admin.addDevice(newDeviceId());
    await relinkAccount(repo, account.id, { id: device.id, jid: null, phone: null });
    refresh();
    const kept = old ? ` O aparelho antigo (${old.slice(0, 8)}…) continua no GOWA se ainda existir; apague-o lá quando quiser.` : "";
    const qr = await admin.loginQr(device.id).catch(() => null);
    if (!qr?.qrDataUrl) return { ok: true, message: `${account.name} agora usa um aparelho novo. Clique em Conectar por QR.${kept}` };
    return { ok: true, message: `${account.name} agora usa um aparelho novo. Escaneie o QR com o WhatsApp do celular e depois libere o envio.${kept}`, qr: qr.qrDataUrl, seconds: qr.seconds };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/** Liga o número a um aparelho que já existe no GOWA e nenhum outro número usa. Fica pausado até você liberar. */
export async function linkExistingDeviceAction(id: string, deviceId: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const parsed = z.string().trim().min(1).max(120).safeParse(deviceId);
    if (!parsed.success) return fail("Escolha o aparelho.");
    const repo = await getRepo();
    const admin = getGowaAdmin({ timeoutMs: 10_000 });
    if (!admin) return fail(NO_GOWA);
    const device = (await admin.listDevices()).find((d) => d.id === parsed.data);
    if (!device) return fail("Esse aparelho não existe mais no GOWA. Atualize a página.");
    const account = await relinkAccount(repo, Id.parse(id), { id: device.id, jid: device.jid, phone: device.phone });
    refresh();
    return ok(`${account.name} agora usa o aparelho ${device.id}. Conecte o WhatsApp (se ainda não estiver) e libere o envio.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Mostra o QR code para escanear em WhatsApp > Aparelhos conectados > Conectar um aparelho. */
export async function connectNumberQrAction(id: string): Promise<ConnectResult> {
  await requireViewer();
  try {
    const { admin, deviceId } = await deviceOf(id);
    const r = await admin.loginQr(deviceId);
    if (!r.qrDataUrl) return { ok: false, message: r.qrLink ? "O GOWA gerou o QR mas não consegui trazer a imagem. Tente de novo." : "O GOWA não devolveu o QR code. Tente de novo." };
    return { ok: true, message: "Escaneie com o WhatsApp do celular deste número.", qr: r.qrDataUrl, seconds: r.seconds };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/** Pareamento por código: o dono digita o código no celular (WhatsApp > Aparelhos conectados > Conectar com número de telefone). */
export async function connectNumberCodeAction(id: string, phone: string): Promise<ConnectResult> {
  await requireViewer();
  try {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return { ok: false, message: "Digite o telefone com DDD (e o 55 do Brasil)." };
    const { admin, deviceId } = await deviceOf(id);
    const code = await admin.loginCode(deviceId, digits);
    return { ok: true, message: "No celular: WhatsApp > Aparelhos conectados > Conectar com número de telefone, e digite o código.", code };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

/** Confere se o WhatsApp do número já conectou e guarda o telefone e o endereço dele (é por eles que a resposta acha o número). */
export async function checkNumberAction(id: string): Promise<ConnectResult> {
  await requireViewer();
  try {
    const { repo, account, admin, deviceId } = await deviceOf(id);
    const status = await admin.deviceStatus(deviceId);
    if (!status.loggedIn) return { ok: false, message: status.connected ? "O GOWA está de pé, mas o WhatsApp ainda não foi pareado." : "Ainda não conectou." };
    const device = (await admin.listDevices()).find((d) => d.id === deviceId);
    await repo.updateAccount(account.id, {
      ...(device?.jid ? { jid: device.jid } : {}),
      ...(device?.phone ? { phoneE164: `+${device.phone}` } : {}),
    });
    refresh();
    return { ok: true, message: `${account.name} conectado${device?.phone ? ` (+${device.phone})` : ""}.` };
  } catch (error) {
    return { ok: false, message: friendly(error) };
  }
}

export async function reconnectNumberAction(id: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const { admin, deviceId, account } = await deviceOf(id);
    await admin.reconnect(deviceId);
    refresh();
    return ok(`Reconectando ${account.name}…`);
  } catch (error) {
    return fail(friendly(error));
  }
}

/** Desconecta o WhatsApp do número (o lugar dele continua, dá para conectar de novo). Pausa o número antes, para nada falhar à toa. */
export async function disconnectNumberAction(id: string): Promise<ActionResult> {
  await requireViewer();
  try {
    const { repo, admin, deviceId, account } = await deviceOf(id);
    await setAccountPaused(repo, account.id, true, "WhatsApp desconectado por você.");
    await admin.logout(deviceId);
    refresh();
    return ok(`${account.name} desconectado e pausado.`);
  } catch (error) {
    return fail(friendly(error));
  }
}

// ───────────────────────── leads liberados → número ─────────────────────────

/**
 * O dono escolheu o número de um grupo de leads liberados: o agente escreve a abertura de cada um como conversa DESTE número e
 * os rascunhos esperam o OK na Fila. `count` pega os melhores do grupo (maior nota primeiro). Nada sai.
 */
export async function prepareForNumberAction(input: { accountId: string; groupKey: string; count: number }): Promise<ActionResult> {
  await requireViewer();
  try {
    const parsed = z.object({ accountId: z.uuid(), groupKey: z.string().min(1).max(200), count: z.number().int().min(1).max(500) }).safeParse(input);
    if (!parsed.success) return fail("Escolha o número e quantos leads.");
    const repo = await getRepo();
    const groups = await listReleasedGroups(repo);
    const group = groups.find((g) => g.key === parsed.data.groupKey);
    if (!group) return fail("Esse grupo de leads não está mais liberado (já foi para a Fila?). Atualize a página.");
    const ids = group.leadIds.slice(0, parsed.data.count);
    // o dono clicou: a IA escreve as aberturas mesmo em AGENT_AI_MODE=manual
    const r = await prepareLeadsForAccount(repo, new Date(), { leadIds: ids, accountId: parsed.data.accountId, llm: getAgentLlm() });
    refresh();
    if (r.prepared === 0) {
      const why = Object.entries(r.skipped).map(([k, n]) => `${n}× ${k}`).join(", ");
      return fail(`Nenhuma abertura escrita.${why ? ` Ficaram de fora: ${why}.` : ""}`);
    }
    const days = Math.max(1, Math.ceil(r.prepared / Math.max(1, r.capPerDay)));
    const how =
      r.written.ia > 0
        ? ` O agente escreveu ${r.written.ia} com IA${r.written.modelo > 0 ? ` e ${r.written.modelo} pelos modelos${r.written.notes[0] ? ` (${r.written.notes[0]})` : ""}` : ""}, cada uma com saudação, apresentação e pergunta diferentes.`
        : ` Cada uma saiu com saudação, apresentação e pergunta diferentes das recentes.`;
    const skipped = Object.keys(r.skipped).length ? ` Ficaram de fora: ${Object.entries(r.skipped).map(([k, n]) => `${n}× ${k}`).join(", ")}.` : "";
    return ok(`${r.prepared} ${r.prepared === 1 ? "abertura pronta" : "aberturas prontas"} para o ${r.account}, esperando seu OK na Fila. Com o teto de ${r.capPerDay} por dia, saem em ${days} ${days === 1 ? "dia útil" : "dias úteis"}.${how}${skipped}`);
  } catch (error) {
    return fail(friendly(error));
  }
}
