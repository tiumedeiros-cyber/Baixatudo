import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseWebhook, verifySignature } from "./webhook";

const sign = (body: string, secret: string) => `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;

describe("verifySignature", () => {
  const body = JSON.stringify({ event: "message", payload: { id: "1" } });

  it("aceita a assinatura certa", () => {
    expect(verifySignature(body, sign(body, "segredo"), "segredo")).toBe(true);
  });

  it("recusa segredo errado, corpo alterado e cabeçalho ausente ou malformado", () => {
    expect(verifySignature(body, sign(body, "outro"), "segredo")).toBe(false);
    expect(verifySignature(body + " ", sign(body, "segredo"), "segredo")).toBe(false);
    expect(verifySignature(body, null, "segredo")).toBe(false);
    expect(verifySignature(body, "", "segredo")).toBe(false);
    expect(verifySignature(body, "sha256=zzzz", "segredo")).toBe(false);
    expect(verifySignature(body, "sha256=abcd", "segredo")).toBe(false);
    expect(verifySignature(body, sign(body, "segredo"), "")).toBe(false);
  });

  it("aceita o prefixo em qualquer caixa", () => {
    expect(verifySignature(body, sign(body, "s").replace("sha256=", "SHA256="), "s")).toBe(true);
  });
});

describe("parseWebhook: mensagem", () => {
  const text = (over: Record<string, unknown> = {}, root: Record<string, unknown> = {}) => ({
    event: "message",
    device_id: "5585988887777@s.whatsapp.net",
    payload: {
      id: "3EB0C127D7BACC83D6A1",
      chat_id: "5585991234567@s.whatsapp.net",
      from: "5585991234567@s.whatsapp.net",
      from_name: "Fulano",
      timestamp: "2026-10-22T13:05:00Z",
      is_from_me: false,
      body: "Pode sim",
      ...over,
    },
    ...root,
  });

  it("texto simples (formato da documentação do GOWA)", () => {
    expect(parseWebhook(text())).toEqual({
      kind: "message",
      providerMessageId: "3EB0C127D7BACC83D6A1",
      phoneE164: "+5585991234567",
      fromMe: false,
      text: "Pode sim",
      media: null,
      timestamp: "2026-10-22T13:05:00Z",
      deviceId: "5585988887777@s.whatsapp.net", // em qual número a mensagem chegou
    });
  });

  it("sem device_id no evento, o campo não existe (um número só)", () => {
    const body = text() as { device_id?: string };
    delete body.device_id;
    expect(parseWebhook(body)).not.toHaveProperty("deviceId");
  });

  it("o recibo também diz em qual número chegou", () => {
    const evt = parseWebhook({ event: "message.ack", device_id: "5585988887777@s.whatsapp.net", payload: { ids: ["A1"], receipt_type: "read" } });
    expect(evt).toEqual({ kind: "ack", providerMessageIds: ["A1"], receipt: "read", deviceId: "5585988887777@s.whatsapp.net" });
  });

  it("mensagem enviada pelo próprio dono", () => {
    expect(parseWebhook(text({ is_from_me: true }))).toMatchObject({ kind: "message", fromMe: true });
  });

  it("áudio e imagem viram mídia, sem texto", () => {
    expect(parseWebhook(text({ body: undefined, audio: { path: "x.ogg" } }))).toMatchObject({ media: "audio", text: null });
    expect(parseWebhook(text({ body: undefined, image: { path: "x.jpg" }, caption: "foto" }))).toMatchObject({ media: "image" });
  });

  it("se o chat vier como @lid, usa o campo 'from'", () => {
    const evt = parseWebhook(text({ chat_id: "251556368777322@lid", from: "5585991234567@s.whatsapp.net" }));
    expect(evt).toMatchObject({ kind: "message", phoneE164: "+5585991234567" });
  });

  it("grupo, canal, status, enquete e reação são ignorados", () => {
    expect(parseWebhook(text({ chat_id: "120363402106XXXXX@g.us" })).kind).toBe("ignored");
    expect(parseWebhook(text({ chat_id: "status@broadcast" })).kind).toBe("ignored");
    expect(parseWebhook(text({ poll: { type: "vote" } })).kind).toBe("ignored");
    expect(parseWebhook(text({ reaction: "👍" })).kind).toBe("ignored");
  });

  it("sem id ou sem telefone, ignora", () => {
    expect(parseWebhook(text({ id: undefined })).kind).toBe("ignored");
    expect(parseWebhook(text({ chat_id: "251556368777322@lid", from: "251556368777322@lid" })).kind).toBe("ignored");
  });
});

describe("parseWebhook: recibos e lixo", () => {
  const ack = (receipt: string, ids: unknown = ["3EB00106E8BE0F407E88EC"]) => ({
    event: "message.ack",
    payload: { ids, chat_id: "5585991234567@s.whatsapp.net", receipt_type: receipt },
  });

  it("entregue e lida", () => {
    expect(parseWebhook(ack("delivered"))).toEqual({ kind: "ack", providerMessageIds: ["3EB00106E8BE0F407E88EC"], receipt: "delivered" });
    expect(parseWebhook(ack("read"))).toMatchObject({ kind: "ack", receipt: "read" });
    expect(parseWebhook(ack("played"))).toMatchObject({ kind: "ack", receipt: "read" });
  });

  it("recibo estranho ou sem ids é ignorado", () => {
    expect(parseWebhook(ack("sender")).kind).toBe("ignored");
    expect(parseWebhook(ack("read", [])).kind).toBe("ignored");
    expect(parseWebhook(ack("read", "x")).kind).toBe("ignored");
  });

  it("outros eventos e entradas inválidas são ignorados", () => {
    expect(parseWebhook({ event: "chat_presence", payload: { state: "composing" } }).kind).toBe("ignored");
    expect(parseWebhook({ event: "group.participants", payload: {} }).kind).toBe("ignored");
    for (const bad of [null, undefined, 42, "x", [], {}, { event: "message" }, { payload: {} }]) {
      expect(parseWebhook(bad).kind, JSON.stringify(bad)).toBe("ignored");
    }
  });
});
