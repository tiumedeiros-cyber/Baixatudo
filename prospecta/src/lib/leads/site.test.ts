import { describe, expect, it, vi } from "vitest";
import { classifyWebsite } from "./site";
import { analyzeHtml, isPrivateAddress, isWeak, probeSite } from "./site-probe";

describe("classifyWebsite", () => {
  it("sem endereço é 'none'", () => {
    expect(classifyWebsite(null).kind).toBe("none");
    expect(classifyWebsite("").kind).toBe("none");
    expect(classifyWebsite("   ").kind).toBe("none");
    expect(classifyWebsite("https://oi").kind).toBe("none");
  });

  it("Instagram, Facebook, link de bio e WhatsApp contam como 'social'", () => {
    for (const url of [
      "instagram.com/clinica",
      "https://www.instagram.com/clinica/?hl=pt-br",
      "https://facebook.com/clinica",
      "https://linktr.ee/clinica",
      "https://wa.me/5585991234567",
      "https://beacons.ai/clinica",
    ]) {
      expect(classifyWebsite(url).kind, url).toBe("social");
    }
  });

  it("construtor gratuito é 'weak', inclusive sites.google.com", () => {
    expect(classifyWebsite("https://clinica.wixsite.com/inicio").kind).toBe("weak");
    expect(classifyWebsite("https://sites.google.com/view/clinica").kind).toBe("weak");
    expect(classifyWebsite("clinica.negocio.site").kind).toBe("weak");
  });

  it("domínio próprio é 'real'", () => {
    const c = classifyWebsite("https://www.clinicaaurora.com.br/contato");
    expect(c.kind).toBe("real");
    expect(c.host).toBe("clinicaaurora.com.br");
  });

  it("adiciona https quando falta o esquema", () => {
    expect(classifyWebsite("clinicaaurora.com.br").url).toBe("https://clinicaaurora.com.br/");
  });
});

describe("isPrivateAddress", () => {
  it("bloqueia endereços internos", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.9", "172.16.0.1", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1"]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });
  it("libera endereços públicos", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });
});

const GOOD_HTML = `<html><head><meta name="viewport" content="width=device-width"></head><body>${"texto de conteúdo ".repeat(120)}</body></html>`;

describe("analyzeHtml / isWeak", () => {
  it("página completa não gera sinais", () => {
    expect(analyzeHtml(GOOD_HTML, 2026)).toEqual([]);
  });
  it("sem viewport e pouco conteúdo viram sinais", () => {
    expect(analyzeHtml("<html><body>Em construção</body></html>", 2026)).toEqual(["sem_viewport", "pouco_conteudo"]);
  });
  it("rodapé com ano antigo", () => {
    expect(analyzeHtml(`${GOOD_HTML}<footer>© 2019 Clínica</footer>`, 2026)).toContain("desatualizado");
    expect(analyzeHtml(`${GOOD_HTML}<footer>© 2025 Clínica</footer>`, 2026)).not.toContain("desatualizado");
  });
  it("um sinal brando não basta, dois sim", () => {
    expect(isWeak(["sem_viewport"])).toBe(false);
    expect(isWeak(["sem_viewport", "pouco_conteudo"])).toBe(true);
    expect(isWeak(["sem_https"])).toBe(true);
  });
});

function fakeFetch(handler: (url: URL) => Response | Promise<Response>) {
  return vi.fn(async (input: URL | string | Request) => handler(new URL(String(input))));
}
const publicLookup = async () => ["93.184.216.34"];

describe("probeSite", () => {
  it("site bom: ok e sem sinais", async () => {
    const fetchImpl = fakeFetch(() => new Response(GOOD_HTML, { status: 200 }));
    const r = await probeSite("https://clinicaaurora.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup, year: 2026 });
    expect(r).toMatchObject({ ok: true, status: 200, signals: [], weak: false });
  });

  it("http sem viewport é fraco", async () => {
    const fetchImpl = fakeFetch(() => new Response("<html><body>oi</body></html>", { status: 200 }));
    const r = await probeSite("http://antigo.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup, year: 2026 });
    expect(r.signals).toContain("sem_https");
    expect(r.weak).toBe(true);
  });

  it("erro 500 conta como fora do ar", async () => {
    const fetchImpl = fakeFetch(() => new Response("erro", { status: 500 }));
    const r = await probeSite("https://caiu.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup });
    expect(r).toMatchObject({ ok: false, status: 500, weak: true });
    expect(r.signals).toContain("fora_do_ar");
  });

  it("certificado vencido", async () => {
    const fetchImpl = fakeFetch(() => {
      throw new Error("fetch failed: certificate has expired");
    });
    const r = await probeSite("https://vencido.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup });
    expect(r.signals).toContain("certificado_invalido");
    expect(r.weak).toBe(true);
  });

  it("segue redirecionamento e usa a URL final", async () => {
    const fetchImpl = fakeFetch((url) =>
      url.hostname === "velho.com.br"
        ? new Response(null, { status: 301, headers: { location: "https://novo.com.br/" } })
        : new Response(GOOD_HTML, { status: 200 }),
    );
    const r = await probeSite("https://velho.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup, year: 2026 });
    expect(r.finalUrl).toBe("https://novo.com.br/");
    expect(r.ok).toBe(true);
  });

  it("não acessa host interno (SSRF)", async () => {
    const fetchImpl = fakeFetch(() => new Response("segredo", { status: 200 }));
    const r = await probeSite("https://interno.exemplo.com", { fetchImpl: fetchImpl as never, lookupImpl: async () => ["10.0.0.5"] });
    expect(r.error).toBe("host_privado");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("não segue redirecionamento para host interno", async () => {
    const fetchImpl = fakeFetch(() => new Response(null, { status: 302, headers: { location: "http://localhost:3000/admin" } }));
    const r = await probeSite("https://exemplo.com.br", { fetchImpl: fetchImpl as never, lookupImpl: publicLookup });
    expect(r.error).toBe("host_privado");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("URL inválida", async () => {
    const r = await probeSite("isso não é url", {});
    expect(r.error).toBe("url_invalida");
  });
});
