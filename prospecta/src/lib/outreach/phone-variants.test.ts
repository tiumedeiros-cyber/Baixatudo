import { describe, expect, it } from "vitest";
import { GowaProvider } from "./gowa";
import { ProviderError, phoneVariants } from "./provider";
import { parseWebhook, shapeOf } from "./webhook";

describe("phoneVariants (o 9 depois do DDD)", () => {
  it("celular com 9 devolve a forma original e a sem o 9", () => {
    expect(phoneVariants("+5546991287444")).toEqual(["+5546991287444", "+554691287444"]);
    expect(phoneVariants("+5581998528017")).toEqual(["+5581998528017", "+558198528017"]);
  });

  it("celular sem o 9 devolve a original e a com o 9", () => {
    expect(phoneVariants("+554691287444")).toEqual(["+554691287444", "+5546991287444"]);
  });

  it("fixo, outro país e lixo voltam como estão", () => {
    expect(phoneVariants("+558532221100")).toEqual(["+558532221100"]); // fixo começa com 2 a 5
    expect(phoneVariants("+14155550123")).toEqual(["+14155550123"]);
    expect(phoneVariants("+55")).toEqual(["+55"]);
  });

  it("aceita número com símbolos", () => {
    expect(phoneVariants("55 (85) 99123-4567")).toEqual(["+5585991234567", "+558591234567"]);
  });
});

/** GOWA falso: só tem aparelhos registrados para os números da lista. */
function fakeGowa(registered: string[]) {
  const calls: { url: string; body?: unknown }[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200 });
    const info = /\/user\/info\?phone=(\d+)/.exec(url);
    if (info) {
      const ok = registered.includes(info[1]);
      return json({ results: { data: [{ name: ok ? "Fulano" : "", devices: ok ? [{ User: info[1] }] : null }] } });
    }
    if (url.includes("/user/check")) return json({ results: { is_on_whatsapp: registered.length > 0 } });
    if (url.endsWith("/send/message")) return json({ results: { message_id: "MSG1" } });
    return json({ results: {} });
  }) as unknown as typeof fetch;
  return { provider: new GowaProvider({ baseUrl: "http://gowa", fetchImpl }), calls };
}

describe("GowaProvider: envia para a forma REAL do número", () => {
  it("o painel guardou com o 9, mas o WhatsApp tem sem o 9: envia sem o 9", async () => {
    const { provider, calls } = fakeGowa(["554691287444"]);
    const r = await provider.sendText("+5546991287444", "oi");
    expect(r.id).toBe("MSG1");
    const send = calls.find((c) => c.url.endsWith("/send/message"))!;
    expect(send.body).toEqual({ phone: "554691287444@s.whatsapp.net", message: "oi" });
  });

  it("registrado com o 9: envia com o 9 e nem consulta a outra forma", async () => {
    const { provider, calls } = fakeGowa(["5585991234567"]);
    await provider.sendText("+5585991234567", "oi");
    expect(calls.filter((c) => c.url.includes("/user/info"))).toHaveLength(1);
    expect(calls.find((c) => c.url.endsWith("/send/message"))!.body).toMatchObject({ phone: "5585991234567@s.whatsapp.net" });
  });

  it("o 'digitando…' e o envio usam a mesma forma e consultam o GOWA uma vez só", async () => {
    const { provider, calls } = fakeGowa(["554691287444"]);
    await provider.typing("+5546991287444", true);
    await provider.sendText("+5546991287444", "oi");
    const infos = calls.filter((c) => c.url.includes("/user/info"));
    expect(infos).toHaveLength(2); // com 9 (vazio) e sem 9 (achou); a segunda chamada usa o resultado guardado
    const sent = calls.filter((c) => c.url.endsWith("/send/chat-presence") || c.url.endsWith("/send/message"));
    expect(sent.map((c) => (c.body as { phone: string }).phone)).toEqual(["554691287444@s.whatsapp.net", "554691287444@s.whatsapp.net"]);
  });

  it("número que não está no WhatsApp em nenhuma forma: falha SEM repetir", async () => {
    const { provider, calls } = fakeGowa([]);
    const error = await provider.sendText("+5546991287444", "oi").catch((e: unknown) => e as ProviderError);
    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).retryable).toBe(false);
    expect((error as ProviderError).message).toMatch(/não aparece no WhatsApp/);
    expect(calls.some((c) => c.url.endsWith("/send/message"))).toBe(false);
  });

  it("se a consulta falhar, segue com o número original em vez de travar", async () => {
    const f = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/user/info")) throw new Error("rede caiu");
      return new Response(JSON.stringify({ results: { message_id: "M2" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new GowaProvider({ baseUrl: "http://gowa", fetchImpl: f });
    expect((await provider.sendText("+5585991234567", "oi")).id).toBe("M2");
  });

  it("isOnWhatsApp acha o número pelas duas formas e diz falso quando nenhuma existe", async () => {
    expect(await fakeGowa(["554691287444"]).provider.isOnWhatsApp("+5546991287444")).toBe(true);
    expect(await fakeGowa([]).provider.isOnWhatsApp("+5546991287444")).toBe(false);
  });
});

describe("webhook: a resposta chega no endereço registrado", () => {
  const msg = (payload: Record<string, unknown>) =>
    parseWebhook({ event: "message", payload: { id: "ABC", body: "pode", ...payload } });

  it("chat com o telefone (sem o 9) vira o telefone", () => {
    expect(msg({ chat_id: "554691287444@s.whatsapp.net", from: "554691287444@s.whatsapp.net" })).toMatchObject({
      kind: "message",
      phoneE164: "+554691287444",
    });
  });

  it("chat escondido atrás de @lid usa o telefone de outro campo, inclusive no formato 'quem in chat'", () => {
    expect(msg({ chat_id: "279718737768542@lid", from: "554691287444@s.whatsapp.net in 279718737768542@lid" })).toMatchObject({
      kind: "message",
      phoneE164: "+554691287444",
    });
    expect(msg({ chat_id: "279718737768542@lid", sender_pn: "554691287444@s.whatsapp.net" })).toMatchObject({
      kind: "message",
      phoneE164: "+554691287444",
    });
  });

  it("só @lid, sem telefone em lugar nenhum: ignora e explica com os NOMES dos campos, sem o texto", () => {
    const evt = msg({ chat_id: "279718737768542@lid", from: "279718737768542@lid", secreto: "x" });
    expect(evt.kind).toBe("ignored");
    if (evt.kind !== "ignored") return;
    expect(evt.reason).toMatch(/^sem telefone/);
    expect(evt.reason).toContain("chat_id=@lid");
    expect(evt.reason).toContain("from=@lid");
    expect(evt.reason).not.toContain("pode");
    expect(evt.reason).not.toContain("279718737768542");
  });

  it("shapeOf nunca inclui o corpo da mensagem", () => {
    expect(shapeOf({ body: "segredo", chat_id: "1@lid", id: "A" })).toBe("chat_id=@lid, id");
  });
});
