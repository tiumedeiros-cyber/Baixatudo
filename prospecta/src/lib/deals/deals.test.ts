import { describe, expect, it } from "vitest";
import { buildDemoContent, defaultPalette, pickTemplate, safeSocialUrl, whatsappHref, ctaLabel } from "./demo-content";
import { isLocalUrl } from "./local-url";
import { demoLinkMessage, proposalMessage } from "./messages";
import { allowedNext, canTransition, stampsFor } from "./transitions";
import { isDemoSlug, PROPOSAL_STATUSES, type ProposalStatus } from "./types";
import type { Lead } from "@/lib/leads/types";

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    dedupeKey: "k",
    placeId: "p",
    name: "Clínica Bela Estética",
    category: "Clínica de estética",
    niche: "estetica",
    city: "Fortaleza",
    state: "CE",
    address: "Rua das Flores, 100",
    neighborhood: "Aldeota",
    phoneRaw: "(85) 99123-4567",
    phoneE164: "+5585991234567",
    isMobile: true,
    whatsappStatus: "unknown",
    websiteRaw: null,
    websiteKind: "none",
    websiteSignals: [],
    siteCheckedAt: null,
    rating: 4.9,
    reviewsCount: 164,
    mapsUrl: null,
    lat: null,
    lng: null,
    permanentlyClosed: false,
    score: 90,
    scoreBreakdown: [],
    eligible: true,
    ineligibleReason: null,
    stage: "novo",
    notes: "",
    dealValue: null,
    source: "apify",
    searchId: null,
    stageChangedAt: "2026-10-22T00:00:00.000Z",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T00:00:00.000Z",
    ...over,
  };
}

const ctx = { brandName: "Kelvin Studio", senderName: "Jonathan", ownerPhone: "(85) 98888-7777" };

describe("pickTemplate", () => {
  it.each([
    ["estetica", "Clínica de estética", "estetica"],
    [null, "Barbearia do Zé", "barbearia"],
    ["barbearia", null, "barbearia"],
    [null, "Clínica odontológica", "clinica"],
    [null, "Salão de beleza", "estetica"],
    [null, "Studio de depilação", "estetica"],
    [null, "Loja de bicicletas", "generico"],
    [null, null, "generico"],
  ])("niche %j category %j → %s", (niche, category, expected) => {
    expect(pickTemplate(niche, category)).toBe(expected);
  });

  it("clínica de estética é estética, não clínica", () => {
    expect(pickTemplate(null, "Clínica de Estética Avançada")).toBe("estetica");
  });
});

describe("buildDemoContent", () => {
  it("usa só dados públicos do lead e a marca do dono", () => {
    const c = buildDemoContent(lead(), ctx, "estetica");
    expect(c.businessName).toBe("Clínica Bela Estética");
    expect(c.phoneDisplay).toBe("(85) 99123-4567");
    expect(c.whatsappDigits).toBe("5585991234567");
    expect(c.ownerWhatsappDigits).toBe("5585988887777");
    expect(c.madeBy).toEqual({ brand: "Kelvin Studio", sender: "Jonathan" });
    expect(c.about).toContain("Aldeota, Fortaleza");
    expect(c.about).toContain("4,9");
    expect(c.about).toContain("164 avaliações");
    expect(c.services.length).toBeGreaterThanOrEqual(4);
  });

  it("celular vira botão de WhatsApp; fixo não", () => {
    const fixed = buildDemoContent(
      lead({ phoneRaw: "(85) 3222-1100", phoneE164: "+558532221100", isMobile: false }),
      ctx,
      "generico",
    );
    expect(fixed.whatsappDigits).toBeNull();
    expect(fixed.phoneDisplay).toBe("(85) 3222-1100");
    expect(fixed.highlights.join(" ")).not.toMatch(/WhatsApp/);
  });

  it("não cita nota quando não há dado, nem avaliação quando são poucas", () => {
    const none = buildDemoContent(lead({ rating: null, reviewsCount: 0 }), ctx, "estetica");
    expect(none.about).not.toMatch(/Nota/);
    expect(none.highlights.join(" ")).not.toMatch(/avalia/);
    const few = buildDemoContent(lead({ rating: 5, reviewsCount: 2 }), ctx, "estetica");
    expect(few.about).toContain("Nota 5,0 no Google.");
    expect(few.about).not.toMatch(/2 avaliações/);
  });

  it("nota baixa não vira vitrine: some a nota, fica o volume de avaliações", () => {
    const low = buildDemoContent(lead({ rating: 3.7, reviewsCount: 202 }), ctx, "estetica");
    expect(low.about).not.toMatch(/Nota/);
    expect(low.about).toContain("202 avaliações de clientes no Google.");
    expect(low.highlights.join(" ")).not.toMatch(/Nota/);
    expect(low.highlights.join(" ")).toContain("202 avaliações");
    const lowFew = buildDemoContent(lead({ rating: 3.2, reviewsCount: 8 }), ctx, "estetica");
    expect(lowFew.about).not.toMatch(/avaliações|Nota/);
    const border = buildDemoContent(lead({ rating: 4.0, reviewsCount: 40 }), ctx, "estetica");
    expect(border.about).toContain("Nota 4,0 no Google");
  });

  it("sem o telefone do dono, não há botão de contato dele", () => {
    expect(buildDemoContent(lead(), { ...ctx, ownerPhone: null }, "estetica").ownerWhatsappDigits).toBeNull();
    expect(buildDemoContent(lead(), { ...ctx, ownerPhone: "abc" }, "estetica").ownerWhatsappDigits).toBeNull();
  });

  it("as listas do modelo não são compartilhadas entre prévias", () => {
    const a = buildDemoContent(lead(), ctx, "estetica");
    a.services[0].name = "alterado";
    expect(buildDemoContent(lead(), ctx, "estetica").services[0].name).toBe("Limpeza de pele");
  });

  it("só linka Instagram ou Facebook (nada de javascript: ou sites estranhos)", () => {
    const social = lead({ websiteKind: "social", websiteRaw: "https://www.instagram.com/clinicabela/?hl=pt" });
    expect(buildDemoContent(social, ctx, "estetica").instagramUrl).toBe("https://instagram.com/clinicabela");
    expect(buildDemoContent(lead({ websiteKind: "social", websiteRaw: "javascript:alert(1)" }), ctx, "estetica").instagramUrl).toBeNull();
    expect(buildDemoContent(lead({ websiteKind: "social", websiteRaw: "https://evil.com/instagram.com" }), ctx, "estetica").instagramUrl).toBeNull();
    expect(buildDemoContent(lead({ websiteKind: "weak", websiteRaw: "https://instagram.com/x" }), ctx, "estetica").instagramUrl).toBeNull();
  });
});

describe("safeSocialUrl", () => {
  it.each([
    ["instagram.com/loja", "https://instagram.com/loja"],
    ["http://facebook.com/loja/", "https://facebook.com/loja"],
    ["https://m.instagram.com/loja", null],
    ["https://instagram.com.evil.io/x", null],
    ["ftp://instagram.com/x", null],
    ["javascript:alert(1)", null],
    ["", null],
  ])("%j → %j", (input, expected) => {
    expect(safeSocialUrl(input)).toBe(expected);
  });
});

describe("palette, cta e links", () => {
  it("cada modelo tem uma paleta padrão", () => {
    expect(defaultPalette("estetica")).toBe("rose");
    expect(defaultPalette("barbearia")).toBe("noir");
    expect(defaultPalette("clinica")).toBe("ocean");
    expect(defaultPalette("generico")).toBe("sage");
  });

  it("rótulo do botão", () => {
    expect(ctaLabel("estetica")).toBe("Agendar horário");
    expect(ctaLabel("clinica")).toBe("Agendar consulta");
    expect(ctaLabel("generico")).toBe("Pedir orçamento");
  });

  it("link do WhatsApp codifica o texto", () => {
    expect(whatsappHref("5585991234567")).toBe("https://wa.me/5585991234567");
    expect(whatsappHref("5585991234567", "Oi & tudo?")).toBe("https://wa.me/5585991234567?text=Oi%20%26%20tudo%3F");
  });
});

describe("isLocalUrl", () => {
  it.each([
    ["http://localhost:3000", true],
    ["http://127.0.0.1:3000/p/x", true],
    ["http://[::1]:3000", true],
    ["http://192.168.0.12:3000", true],
    ["http://10.0.0.5", true],
    ["http://172.20.1.1", true],
    ["http://meu-pc.local", true],
    ["https://jk-prospect.vercel.app", false],
    ["https://painel.kelvinstudio.com.br", false],
    ["http://172.32.0.1", false],
    ["lixo", true],
  ])("%s → %s", (url, expected) => {
    expect(isLocalUrl(url)).toBe(expected);
  });
});

describe("slug", () => {
  it("aceita só tokens longos em minúsculas e números", () => {
    expect(isDemoSlug("a1b2c3d4e5f6g7h8i9j0")).toBe(true);
    expect(isDemoSlug("curto")).toBe(false);
    expect(isDemoSlug("ABCDEFGHIJKLMNOPQRST")).toBe(false);
    expect(isDemoSlug("a1b2c3d4e5f6g7h8i9j0/../x")).toBe(false);
    expect(isDemoSlug(undefined)).toBe(false);
    expect(isDemoSlug("a".repeat(41))).toBe(false);
  });
});

describe("transições da proposta", () => {
  it("todo status tem uma lista de destinos e nunca aponta para si mesmo", () => {
    for (const s of PROPOSAL_STATUSES) {
      expect(allowedNext(s)).not.toContain(s);
    }
  });

  it("caminho feliz e atalhos", () => {
    expect(canTransition("draft", "sent")).toBe(true);
    expect(canTransition("sent", "accepted")).toBe(true);
    expect(canTransition("accepted", "entry_paid")).toBe(true);
    expect(canTransition("entry_paid", "paid")).toBe(true);
    expect(canTransition("sent", "entry_paid")).toBe(true);
    expect(canTransition("sent", "paid")).toBe(true);
  });

  it("não volta, não pula rascunho e não cancela com dinheiro recebido", () => {
    expect(canTransition("paid", "sent")).toBe(false);
    expect(canTransition("paid", "cancelled")).toBe(false);
    expect(canTransition("entry_paid", "cancelled")).toBe(false);
    expect(canTransition("entry_paid", "sent")).toBe(false);
    expect(canTransition("draft", "paid")).toBe(false);
    expect(canTransition("draft", "entry_paid")).toBe(false);
  });

  it("cancelada pode virar rascunho de novo", () => {
    expect(canTransition("cancelled", "draft")).toBe(true);
    expect(canTransition("cancelled", "sent")).toBe(false);
  });

  it("carimbos: pular passos preenche os anteriores com a mesma data", () => {
    const now = "2026-10-22T10:00:00.000Z";
    const empty = { sentAt: null, acceptedAt: null, entryPaidAt: null };
    expect(stampsFor("sent", empty, now)).toEqual({ status: "sent", sentAt: now });
    expect(stampsFor("accepted", empty, now)).toEqual({ status: "accepted", sentAt: now, acceptedAt: now });
    expect(stampsFor("entry_paid", empty, now)).toEqual({
      status: "entry_paid",
      sentAt: now,
      acceptedAt: now,
      entryPaidAt: now,
    });
    expect(stampsFor("paid", empty, now)).toMatchObject({ status: "paid", sentAt: now, acceptedAt: now, paidAt: now });
  });

  it("carimbos: não sobrescreve datas que já existem", () => {
    const earlier = "2026-10-20T09:00:00.000Z";
    const now = "2026-10-22T10:00:00.000Z";
    const out = stampsFor("paid", { sentAt: earlier, acceptedAt: earlier, entryPaidAt: earlier }, now);
    expect(out.sentAt).toBe(earlier);
    expect(out.acceptedAt).toBe(earlier);
    expect(out.paidAt).toBe(now);
    expect(out.entryPaidAt).toBeUndefined();
  });

  it("nenhum destino leva a um status desconhecido", () => {
    const known = new Set<ProposalStatus>(PROPOSAL_STATUSES);
    for (const s of PROPOSAL_STATUSES) for (const n of allowedNext(s)) expect(known.has(n)).toBe(true);
  });
});

describe("mensagens", () => {
  const p = { title: "Site de 1 página", amountCents: 80_000, entryPct: 50, deliveryDays: 7 };

  it("link da prévia avisa que é um primeiro desenho", () => {
    const m = demoLinkMessage({ leadName: "Clínica Bela Estética - Aldeota", url: "https://x.app/p/abc" });
    expect(m).toContain("site da Clínica Bela Estética:");
    expect(m).toContain("https://x.app/p/abc");
    expect(m).toMatch(/exemplos/);
    expect(m.length).toBeLessThanOrEqual(220);
  });

  it("proposta com Pix cadastrado", () => {
    const m = proposalMessage(p, { leadName: "Clínica Bela", pix: { key: "85988887777", holder: "Jonathan K." } });
    expect(m).toMatch(/R\$\s?800/);
    expect(m).toMatch(/sinal é de R\$\s?400 \(50%\)/);
    expect(m).toContain("chave 85988887777 (Jonathan K.)");
    expect(m).toMatch(/restante, R\$\s?400/);
    expect(m).toContain("7 dias");
  });

  it("sem chave Pix não inventa uma", () => {
    const m = proposalMessage(p, { leadName: "Clínica Bela", pix: null });
    expect(m).toContain("te passo a chave assim que você confirmar");
    expect(m).not.toMatch(/chave \d/);
  });

  it("sem sinal e com pagamento à vista", () => {
    expect(proposalMessage({ ...p, entryPct: 0 }, { leadName: "A", pix: null })).toMatch(/só na entrega/);
    const full = proposalMessage({ ...p, entryPct: 100 }, { leadName: "A", pix: { key: "k", holder: "" } });
    expect(full).toMatch(/à vista, por Pix, chave k\./);
    expect(full).not.toMatch(/restante/);
  });
});
