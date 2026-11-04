import { describe, expect, it, vi } from "vitest";
import { GowaProvider } from "./gowa";
import { ProviderError, phoneFromJid, toJid } from "./provider";

type MockFetch = ReturnType<typeof mockFetch>;

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init ?? {}));
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const make = (fetchImpl: MockFetch, extra: Partial<ConstructorParameters<typeof GowaProvider>[0]> = {}) =>
  new GowaProvider({ baseUrl: "http://localhost:3001/", fetchImpl: fetchImpl as unknown as typeof fetch, ...extra });

/** Responde a consulta de contato (/user/info) como "registrado" e deixa o resto para o teste. */
const lookup = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  mockFetch((url, init) =>
    url.includes("/user/info") ? json({ results: { data: [{ name: "x", devices: [{ User: "x" }] }] } }) : handler(url, init),
  );

/** A última chamada (o envio de fato, depois da consulta). */
const lastCall = (f: MockFetch) => callOf(f, f.mock.calls.length - 1);

/** A i-ésima chamada ao fetch falso, já com url e init garantidos. */
function callOf(f: MockFetch, i = 0): { url: string; init: RequestInit } {
  const [url, init] = f.mock.calls[i];
  return { url: String(url), init: init ?? {} };
}

/** Espera a promessa falhar e devolve o erro (falha o teste se ela der certo). */
async function rejected(p: Promise<unknown>): Promise<ProviderError> {
  try {
    await p;
  } catch (e) {
    return e as ProviderError;
  }
  throw new Error("era para falhar");
}

describe("JID", () => {
  it("telefone → JID e de volta", () => {
    expect(toJid("+5585991234567")).toBe("5585991234567@s.whatsapp.net");
    expect(phoneFromJid("5585991234567@s.whatsapp.net")).toBe("+5585991234567");
    expect(phoneFromJid("5585991234567:12@s.whatsapp.net")).toBe("+5585991234567");
  });
  it("grupos, @lid e lixo não viram telefone", () => {
    for (const j of ["120363402106XXXXX@g.us", "251556368777322@lid", "status@broadcast", "", null, undefined, "abc"]) {
      expect(phoneFromJid(j as string | null | undefined)).toBeNull();
    }
  });
});

describe("GowaProvider.status", () => {
  it("conectado e logado", async () => {
    const f = mockFetch(() => json({ code: "SUCCESS", results: { is_connected: true, is_logged_in: true, device_id: "x" } }));
    const s = await make(f).status();
    expect(s).toMatchObject({ connected: true, loggedIn: true, mode: "gowa", detail: "WhatsApp conectado" });
    expect(callOf(f).url).toBe("http://localhost:3001/app/status");
  });

  it("no ar mas sem QR escaneado", async () => {
    const f = mockFetch(() => json({ results: { is_connected: true, is_logged_in: false } }));
    const s = await make(f).status();
    expect(s.connected).toBe(false);
    expect(s.detail).toMatch(/QR/);
  });

  it("desconectado do WhatsApp", async () => {
    const f = mockFetch(() => json({ results: { is_connected: false, is_logged_in: false } }));
    expect((await make(f).status()).detail).toMatch(/desconectado/);
  });

  it("GOWA 9.x sem nenhum aparelho responde 400: o painel manda ler o QR em vez de mostrar erro cru", async () => {
    const f = mockFetch(() => new Response("", { status: 400 }));
    const s = await make(f).status();
    expect(s.connected).toBe(false);
    expect(s.detail).toMatch(/nenhum WhatsApp conectado/);
    expect(s.detail).toContain("http://localhost:3001");
    expect(s.detail).toMatch(/QR/);
  });

  it("senha errada continua dizendo que a senha está errada", async () => {
    const f = mockFetch(() => new Response("", { status: 401 }));
    expect((await make(f).status()).detail).toMatch(/usuário e a senha/);
  });

  it("GOWA fora do ar não explode: devolve desconectado com o motivo", async () => {
    const f = mockFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const s = await make(f).status();
    expect(s.connected).toBe(false);
    expect(s.detail).toMatch(/GOWA/);
  });
});

describe("GowaProvider.sendText", () => {
  it("manda JSON no endpoint certo, com autenticação e aparelho", async () => {
    const f = lookup(() => json({ code: "SUCCESS", results: { message_id: "3EB0ABC" } }));
    const p = make(f, { basicAuth: "usuario:senha", deviceId: "meu-aparelho" });
    expect(await p.sendText("+5585991234567", "Olá!")).toEqual({ id: "3EB0ABC" });

    const { url, init } = lastCall(f);
    expect(url).toBe("http://localhost:3001/send/message");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ phone: "5585991234567@s.whatsapp.net", message: "Olá!" });
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe(`Basic ${Buffer.from("usuario:senha").toString("base64")}`);
    expect(h["x-device-id"]).toBe("meu-aparelho");
    expect(h["content-type"]).toBe("application/json");
  });

  it("sem senha nem aparelho, não manda esses cabeçalhos", async () => {
    const f = lookup(() => json({ results: { message_id: "ID" } }));
    await make(f).sendText("+5585991234567", "x");
    const h = lastCall(f).init.headers as Record<string, string>;
    expect(h.authorization).toBeUndefined();
    expect(h["x-device-id"]).toBeUndefined();
  });

  it("resposta sem message_id devolve id nulo", async () => {
    expect(await make(lookup(() => json({ results: {} }))).sendText("+5585991234567", "x")).toEqual({ id: null });
  });

  it("401 não vale repetir; 500, 429 e rede valem", async () => {
    const fail = (res: () => Response) => rejected(make(lookup(res)).sendText("+5585991234567", "x"));

    const e401 = await fail(() => json({ message: "unauthorized" }, 401));
    expect(e401).toBeInstanceOf(ProviderError);
    expect(e401.retryable).toBe(false);
    expect(e401.message).toMatch(/usuário e a senha/);

    expect((await fail(() => json({ message: "boom" }, 500))).retryable).toBe(true);
    expect((await fail(() => json({ message: "slow down" }, 429))).retryable).toBe(true);
    const e400 = await fail(() => json({ message: "invalid phone" }, 400));
    expect(e400.retryable).toBe(false);
    expect(e400.message).toMatch(/invalid phone/);

    const net = await rejected(
      make(
        mockFetch(() => {
          throw new Error("ECONNREFUSED");
        }),
      ).sendText("+5585991234567", "x"),
    );
    expect(net.retryable).toBe(true);
    expect(net.message).toMatch(/Não consegui falar com o GOWA/);
  });
});

describe("GowaProvider.typing e isOnWhatsApp", () => {
  it("liga e desliga o 'digitando…'", async () => {
    const f = lookup(() => json({ code: "SUCCESS" }));
    const p = make(f);
    await p.typing("+5585991234567", true);
    await p.typing("+5585991234567", false);
    const presence = f.mock.calls.map((_, i) => callOf(f, i)).filter((c) => c.url.includes("/send/chat-presence"));
    expect(presence.map((c) => [c.url, JSON.parse(String(c.init.body))])).toEqual([
      ["http://localhost:3001/send/chat-presence", { phone: "5585991234567@s.whatsapp.net", action: "start" }],
      ["http://localhost:3001/send/chat-presence", { phone: "5585991234567@s.whatsapp.net", action: "stop" }],
    ]);
  });

  it("falha no 'digitando…' não derruba nada", async () => {
    const f = mockFetch(() => json({ message: "x" }, 500));
    await expect(make(f).typing("+5585991234567", true)).resolves.toBeUndefined();
  });

  it("checa se o número tem WhatsApp", async () => {
    expect(await make(mockFetch(() => json({ results: { is_on_whatsapp: true } }))).isOnWhatsApp("+5585991234567")).toBe(true);
    expect(await make(mockFetch(() => json({ results: { is_on_whatsapp: false } }))).isOnWhatsApp("+5585991234567")).toBe(false);
    expect(await make(mockFetch(() => json({ results: {} }))).isOnWhatsApp("+5585991234567")).toBeNull();
    expect(await make(mockFetch(() => json({}, 500))).isOnWhatsApp("+5585991234567")).toBeNull();
    const f = mockFetch(() => json({ results: { is_on_whatsapp: true } }));
    await make(f).isOnWhatsApp("+5585991234567");
    expect(f.mock.calls.map((_, i) => callOf(f, i).url)).toContain("http://localhost:3001/user/check?phone=5585991234567");
  });
});
