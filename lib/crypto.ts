import crypto from 'node:crypto';
import { APP_SECRET } from '@/lib/env';

/**
 * Guarda dados sensíveis (chaves de gateway) no banco já cifrados com AES-256-GCM.
 * A chave vem do APP_SECRET do ambiente — quem lê o banco não consegue usar a chave.
 */
const KEY = crypto.createHash('sha256').update(`${APP_SECRET}:settings`).digest();

export function encryptSecret(plain: string) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptSecret(value?: string | null) {
  if (!value) return '';
  if (!value.startsWith('v1:')) return value; // valor antigo em texto puro
  try {
    const [, ivB64, tagB64, dataB64] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** Mostra só o final da chave para o admin conferir sem expor o segredo. */
export function maskSecret(value?: string | null) {
  const plain = decryptSecret(value);
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return `••••••${plain.slice(-4)}`;
}

/**
 * Assinatura curta para URLs internas (callbacks, links de download).
 * Usa HMAC com o APP_SECRET: qualquer coisa sem assinatura válida é recusada.
 */
export function signPayload(value: string, scope: string, ttlSeconds = 60 * 60 * 48) {
  const payload = `${value}.${Math.floor(Date.now() / 1000) + ttlSeconds}`;
  const sig = crypto.createHmac('sha256', `${APP_SECRET}:${scope}`).update(payload).digest('base64url').slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyPayload(token: string, scope: string) {
  const parts = String(token || '').split('.');
  if (parts.length < 3) return null;
  const sig = parts.pop() as string;
  const expires = Number(parts.pop());
  const value = parts.join('.');
  if (!value || !Number.isFinite(expires) || expires * 1000 < Date.now()) return null;
  const expected = crypto
    .createHmac('sha256', `${APP_SECRET}:${scope}`)
    .update(`${value}.${expires}`)
    .digest('base64url')
    .slice(0, 32);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value;
}

/** Comparação em tempo constante (evita descobrir segredo por tempo de resposta). */
export function safeEqual(a: string, b: string) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
