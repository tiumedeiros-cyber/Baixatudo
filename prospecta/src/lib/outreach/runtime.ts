import "server-only";
import { timingSafeEqual } from "node:crypto";
import { gowaEnv } from "@/lib/env";
import type { Repo } from "@/lib/repo/types";
import type { Account } from "./accounts";
import { GowaProvider } from "./gowa";
import { GowaAdmin } from "./gowa-admin";
import { SimulatedProvider, type WhatsAppProvider } from "./provider";
import { loadRoster } from "./roster";

/**
 * Qual WhatsApp está por trás. Sem GOWA_URL é SEMPRE o simulado, que não consegue enviar nada.
 * Não existe configuração que mande mensagem de verdade sem o GOWA estar apontado de propósito.
 */
export function getProvider(opts: { timeoutMs?: number } = {}): WhatsAppProvider {
  const env = gowaEnv();
  if (!env) return new SimulatedProvider();
  return new GowaProvider({
    baseUrl: env.baseUrl,
    basicAuth: env.basicAuth,
    deviceId: env.deviceId,
    timeoutMs: opts.timeoutMs,
  });
}

/**
 * O WhatsApp de UM número: o aparelho dele no GOWA (`gowaDeviceId`) ou, no número original que nunca foi fixado, o
 * `GOWA_DEVICE_ID` do .env.local. Sem GOWA_URL é sempre o simulado, como em `getProvider`.
 */
export function providerForAccount(account: Pick<Account, "gowaDeviceId">, opts: { timeoutMs?: number } = {}): WhatsAppProvider {
  const env = gowaEnv();
  // na demonstração, o número com este aparelho aparece como "apagado do GOWA" (veja demo-seed)
  if (!env) return new SimulatedProvider({ missing: account.gowaDeviceId === "demo-sem-aparelho" });
  return new GowaProvider({
    baseUrl: env.baseUrl,
    basicAuth: env.basicAuth,
    deviceId: account.gowaDeviceId ?? env.deviceId,
    timeoutMs: opts.timeoutMs,
  });
}

/**
 * O WhatsApp que as telas consultam (estado da conexão): com um número só é o de sempre; com vários, o do número original.
 * Cada número tem o seu estado na tela Números.
 */
export async function getDefaultProvider(repo: Repo, opts: { timeoutMs?: number } = {}): Promise<WhatsAppProvider> {
  const roster = await loadRoster(repo);
  const main = roster.multi ? roster.byId.get(roster.defaultId ?? "") : null;
  return main ? providerForAccount(main, opts) : getProvider(opts);
}

/** O administrador de aparelhos do GOWA, ou nulo sem GOWA_URL. */
export function getGowaAdmin(opts: { timeoutMs?: number } = {}): GowaAdmin | null {
  const env = gowaEnv();
  return env ? new GowaAdmin({ baseUrl: env.baseUrl, basicAuth: env.basicAuth, timeoutMs: opts.timeoutMs }) : null;
}

/** Compara segredos em tempo constante (cabeçalho Bearer contra o token do .env.local). */
export function secretsMatch(received: string | null | undefined, expected: string | null | undefined): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function bearerOf(header: string | null): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m ? m[1].trim() : null;
}
