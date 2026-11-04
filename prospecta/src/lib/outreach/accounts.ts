import type { AutomationConfig } from "./config";

/**
 * Os números de WhatsApp que o sistema usa para prospectar. Cada número é um aparelho do GOWA, com nome, teto, aquecimento,
 * fila e pausa PRÓPRIOS. Quem escolhe para qual número vai cada grupo de leads é o dono (a escolha fica no lead); depois que a
 * primeira mensagem sai, a conversa pertence àquele número para sempre.
 *
 * O "Número 1" original (`legacy`) é o que já existia antes de haver mais de um: continua guardando o estado de envio no mesmo
 * lugar de sempre e usando o teto geral das Configurações, então com um número só nada muda.
 */

export interface AccountCaps {
  /** Teto de abordagens novas por dia, semana 1 e 2 do aquecimento (nulo = pula a rampa) e o teto normal. */
  week1: number | null;
  week2: number | null;
  steady: number;
}

/** O que o worker lembra de cada número entre uma volta e outra. */
export interface AccountState {
  lastSendAt: string | null;
  consecutiveFailures: number;
  lastResult: string | null;
}

export const EMPTY_ACCOUNT_STATE: AccountState = { lastSendAt: null, consecutiveFailures: 0, lastResult: null };

export interface Account {
  id: string;
  /** O nome que o dono dá ("Número 2", "Estética SP"). É o que aparece nas telas. */
  name: string;
  /** O que o painel manda ao GOWA no cabeçalho X-Device-Id. Nulo = o aparelho padrão (um número só, como sempre foi). */
  gowaDeviceId: string | null;
  phoneE164: string | null;
  /** O endereço do aparelho no WhatsApp (o webhook manda isto em `device_id`). */
  jid: string | null;
  legacy: boolean;
  /** O freio deste número. Número novo nasce pausado. */
  paused: boolean;
  pausedReason: string | null;
  /** Aposentado: não recebe mais leads nem envia. As conversas ficam como estão. */
  retired: boolean;
  position: number;
  /** Teto e aquecimento próprios. Nulo = vale o teto geral das Configurações. */
  caps: AccountCaps | null;
  /** Dia (AAAA-MM-DD) do primeiro envio real deste número; define a rampa de aquecimento dele. */
  warmupStart: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NewAccount = Pick<Account, "name"> &
  Partial<Pick<Account, "gowaDeviceId" | "phoneE164" | "jid" | "legacy" | "paused" | "pausedReason" | "caps" | "warmupStart">>;

export type AccountPatch = Partial<
  Pick<Account, "name" | "gowaDeviceId" | "phoneE164" | "jid" | "paused" | "pausedReason" | "retired" | "caps" | "warmupStart">
>;

/** Teto inicial de um número novo: devagar, com a rampa de aquecimento de sempre. O dono muda em Números. */
export const NEW_ACCOUNT_CAPS: AccountCaps = { week1: 8, week2: 15, steady: 25 };

/** Só os dígitos de um telefone ou de um endereço do WhatsApp ("5585…:12@s.whatsapp.net" → "5585…"). */
export function digitsOf(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("@")[0].split(":")[0].replace(/\D/g, "");
}

/** Este aparelho (o `device_id` do webhook, ou o id do GOWA) é o deste número? */
export function accountMatchesDevice(account: Pick<Account, "gowaDeviceId" | "phoneE164" | "jid">, device: string | null | undefined): boolean {
  if (!device) return false;
  const raw = device.trim();
  if (account.gowaDeviceId && account.gowaDeviceId === raw) return true;
  if (account.jid && account.jid === raw) return true;
  const digits = digitsOf(raw);
  if (!digits) return false;
  return [digitsOf(account.phoneE164), digitsOf(account.jid), digitsOf(account.gowaDeviceId)].some((d) => d !== "" && d === digits);
}

/**
 * As regras de envio deste número: as gerais (janelas, dias, intervalos) com o teto e o aquecimento DELE por cima. Nada aqui
 * muda a configuração geral. Sem teto próprio, vale o geral (é o caso do Número 1 original).
 */
export function effectiveConfig(account: Pick<Account, "caps" | "warmupStart">, cfg: AutomationConfig): AutomationConfig {
  if (!account.caps) return account.warmupStart ? { ...cfg, warmupStart: account.warmupStart } : cfg;
  return { ...cfg, caps: { ...account.caps }, warmupStart: account.warmupStart };
}

/** O número que cuida de tudo o que não tem número escolhido: o original, e na falta dele o primeiro. */
export function defaultAccount(accounts: Account[]): Account | null {
  const active = accounts.filter((a) => !a.retired);
  return active.find((a) => a.legacy) ?? active[0] ?? null;
}

/** Os números que podem receber leads e enviar (não aposentados). */
export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => !a.retired).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
}

/** Um id curto e seguro para o aparelho no GOWA ("num-k3f9x2"). */
export function newDeviceId(rand: () => number = Math.random): string {
  return `num-${Math.floor(rand() * 36 ** 6)
    .toString(36)
    .padStart(6, "0")}`;
}
