import { describe, expect, it } from "vitest";
import { isLocalRequest } from "./local-request";
import { MIN_SECRET_LENGTH, signSession, verifySession } from "./session";

const SECRET = "a".repeat(MIN_SECRET_LENGTH);
const OTHER = "b".repeat(MIN_SECRET_LENGTH);
const NOW = Date.parse("2026-10-23T12:00:00Z");

describe("sessão assinada", () => {
  it("assina e verifica", () => {
    const token = signSession("dono@exemplo.com", SECRET, NOW);
    expect(verifySession(token, SECRET, NOW + 1000)).toBe("dono@exemplo.com");
  });

  it("expira", () => {
    const token = signSession("dono@exemplo.com", SECRET, NOW, 60);
    expect(verifySession(token, SECRET, NOW + 59_000)).toBe("dono@exemplo.com");
    expect(verifySession(token, SECRET, NOW + 60_000)).toBeNull();
    expect(verifySession(token, SECRET, NOW + 3_600_000)).toBeNull();
  });

  it("assinatura de outro segredo não vale", () => {
    expect(verifySession(signSession("dono@exemplo.com", OTHER, NOW), SECRET, NOW)).toBeNull();
  });

  it("não dá para trocar o e-mail ou o prazo do cookie", () => {
    const [payload, sig] = signSession("dono@exemplo.com", SECRET, NOW).split(".");
    const forged = Buffer.from(JSON.stringify({ v: 1, e: "outro@exemplo.com", x: Math.floor(NOW / 1000) + 1e9 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`, SECRET, NOW)).toBeNull();
    expect(verifySession(`${payload}.${sig.slice(0, -2)}AA`, SECRET, NOW)).toBeNull();
  });

  it.each([
    ["vazio", ""],
    ["só o e-mail (o cookie antigo inseguro)", "dono@exemplo.com"],
    ["sem assinatura", "abc."],
    ["três partes", "a.b.c"],
    ["lixo", "%%%.%%%"],
    ["assinatura de tamanho errado", "e30.AAAA"],
  ])("recusa cookie %s", (_label, token) => {
    expect(verifySession(token, SECRET, NOW)).toBeNull();
  });

  it("recusa sem cookie e sem segredo, e não assina com segredo fraco", () => {
    expect(verifySession(undefined, SECRET, NOW)).toBeNull();
    expect(verifySession(null, SECRET, NOW)).toBeNull();
    expect(verifySession(signSession("a@b.com", SECRET, NOW), "", NOW)).toBeNull();
    expect(verifySession(signSession("a@b.com", SECRET, NOW), "curto", NOW)).toBeNull();
    expect(() => signSession("a@b.com", "curto", NOW)).toThrow(/curto demais/);
  });
});

const req = (headers: Record<string, string>) => (name: string) => headers[name.toLowerCase()] ?? null;

describe("isLocalRequest (o 1 clique só vale neste computador)", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST", "localhost"])("aceita %s", (host) => {
    expect(isLocalRequest(req({ host }))).toBe(true);
  });

  it("aceita quando o Next só repassa IPs de loopback", () => {
    expect(isLocalRequest(req({ host: "localhost:3000", "x-forwarded-for": "127.0.0.1, ::1", "x-forwarded-host": "localhost:3000" }))).toBe(true);
    expect(isLocalRequest(req({ host: "localhost:3000", "x-real-ip": "::ffff:127.0.0.1" }))).toBe(true);
  });

  it.each([
    ["endereço de fora", { host: "painel.exemplo.com" }],
    ["IP da rede", { host: "192.168.0.10:3000" }],
    ["sem host", {}],
    ["truque no nome", { host: "localhost.evil.com" }],
    ["truque com arroba", { host: "evil.com@localhost" }],
    ["túnel que mantém o host mas informa o IP real", { host: "localhost:3000", "x-forwarded-for": "203.0.113.9" }],
    ["lista com um IP de fora no meio", { host: "localhost:3000", "x-forwarded-for": "127.0.0.1, 198.51.100.4" }],
    ["host encaminhado público", { host: "localhost:3000", "x-forwarded-host": "painel.exemplo.com" }],
    ["x-real-ip de fora", { host: "localhost:3000", "x-real-ip": "198.51.100.4" }],
    ["Cloudflare", { host: "localhost:3000", "cf-connecting-ip": "203.0.113.9" }],
    ["Cloudflare sem IP", { host: "localhost:3000", "cf-ray": "abc" }],
    ["Vercel", { host: "localhost:3000", "x-vercel-id": "gru1::x" }],
    ["Forwarded padrão", { host: "localhost:3000", forwarded: "for=203.0.113.9" }],
  ])("recusa: %s", (_label, headers) => {
    expect(isLocalRequest(req(headers as Record<string, string>))).toBe(false);
  });
});
