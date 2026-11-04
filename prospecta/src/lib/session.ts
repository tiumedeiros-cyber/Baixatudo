import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão LOCAL do dono: um cookie assinado com HMAC-SHA256. Ninguém consegue inventar um (sem o
 * SESSION_SECRET do .env.local a assinatura não fecha), ele expira e só vale se o pedido vier do
 * próprio computador (veja local-request.ts). É o que permite o "1 clique" sem abrir mão da segurança.
 */

export const SESSION_COOKIE = "jk_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Segredo curto demais é fraco: recusamos em vez de assinar com ele. */
export const MIN_SECRET_LENGTH = 32;

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function signSession(email: string, secret: string, nowMs: number, ttlSeconds = SESSION_TTL_SECONDS): string {
  if (secret.length < MIN_SECRET_LENGTH) throw new Error("SESSION_SECRET curto demais (mínimo de 32 caracteres).");
  const payload = Buffer.from(JSON.stringify({ v: 1, e: email, x: Math.floor(nowMs / 1000) + ttlSeconds }), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret).toString("base64url")}`;
}

/** Devolve o e-mail da sessão, ou null se o cookie for falso, adulterado, vencido ou ilegível. */
export function verifySession(token: string | null | undefined, secret: string, nowMs: number): string | null {
  if (!token || secret.length < MIN_SECRET_LENGTH) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, signature] = parts;

  const expected = sign(payload, secret);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { v?: unknown; e?: unknown; x?: unknown };
    if (data.v !== 1 || typeof data.e !== "string" || typeof data.x !== "number") return null;
    if (data.x * 1000 <= nowMs) return null;
    return data.e;
  } catch {
    return null;
  }
}
