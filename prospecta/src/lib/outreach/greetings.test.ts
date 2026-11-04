import { describe, expect, it } from "vitest";
import { composeReply } from "@/lib/agent/compose";
import { simulationContext } from "@/lib/agent/context";
import { dropRepeatedGreeting } from "@/lib/agent/greeting-strip";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { prepareBatch, rewriteOpenings, tick } from "./engine";
import type { ProviderStatus, WhatsAppProvider } from "./provider";
import { buildOpening, type TemplateContext, type TemplateLead } from "./templates";

/**
 * 29/10: a lista de rascunhos escritos às 14h55 abria TODA com "Bom dia", e a conversa mostrava "Bom dia" em mensagens que o WhatsApp
 * entregou como "Boa tarde"; e "Oi" abria a abertura, a apresentação e a cutucada da mesma conversa.
 */

const MORNING = new Date("2026-10-22T11:30:00Z"); // 08:30 em Fortaleza
const AFTERNOON = new Date("2026-10-22T17:55:00Z"); // 14:55
const NIGHT = new Date("2026-10-22T22:10:00Z"); // 19:10

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveSettings({ agentFlow: "qualificar" });
  return { repo, leads };
}

class Rec implements WhatsAppProvider {
  readonly mode = "gowa" as const;
  sent: string[] = [];
  async status(): Promise<ProviderStatus> {
    return { connected: true, loggedIn: true, mode: this.mode, detail: "WhatsApp conectado" };
  }
  async typing() {}
  async sendText(_phone: string, text: string) {
    this.sent.push(text);
    return { id: `ID${this.sent.length}` };
  }
  async isOnWhatsApp() {
    return true;
  }
}

describe("o rascunho já nasce com o cumprimento do horário em que foi escrito", () => {
  it("à tarde: nenhum 'Bom dia' na lista; de manhã e à noite, o do horário", async () => {
    for (const [now, right, wrong] of [
      [AFTERNOON, /boa tarde/i, /bom dia|boa noite/i],
      [MORNING, /bom dia/i, /boa tarde|boa noite/i],
      [NIGHT, /boa noite/i, /bom dia|boa tarde/i],
    ] as const) {
      const { repo } = await setup();
      await prepareBatch(repo, now, { limit: 20 });
      const drafts = await repo.listMessages({ kinds: ["opening"], statuses: ["draft"], limit: 50 });
      expect(drafts.length).toBeGreaterThan(10);
      for (const m of drafts) expect(m.body, m.body).not.toMatch(wrong);
      expect(drafts.some((m) => right.test(m.body))).toBe(true);
    }
  });

  it("Reescrever também escreve com o cumprimento da hora", async () => {
    const { repo } = await setup();
    await prepareBatch(repo, MORNING, { limit: 8 });
    await rewriteOpenings(repo, null, { rng: () => 0.2, now: AFTERNOON });
    for (const m of await repo.listMessages({ kinds: ["opening"], statuses: ["draft"], limit: 50 })) expect(m.body, m.body).not.toMatch(/bom dia/i);
  });
});

describe("no envio, o texto guardado é o que saiu", () => {
  const send = async (over: { kind: "opening" | "reply" | "manual"; createdBy: "system" | "user"; body: string }) => {
    const { repo, leads } = await setup();
    await repo.saveAutomation({ paused: false, dryRun: false });
    const lead = leads[0];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    const [m] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: over.kind, body: over.body, status: "approved", createdBy: over.createdBy, approvedAt: AFTERNOON.toISOString(), scheduledFor: new Date(AFTERNOON.getTime() - 60_000).toISOString() },
    ]);
    const provider = new Rec();
    const at = new Date("2026-10-22T18:30:00Z"); // 15:30
    const res = await tick({ repo, provider, now: at, rng: () => 0.5, sleep: async () => {} });
    return { res, provider, stored: (await repo.getMessage(m.id))!.body };
  };

  it("abertura", async () => {
    const { res, provider, stored } = await send({ kind: "opening", createdBy: "system", body: "Bom dia! Aqui é o Jonathan. Posso fazer uma pergunta rápida?" });
    expect(res.action).toBe("sent");
    expect(provider.sent[0]).toBe("Boa tarde! Aqui é o Jonathan. Posso fazer uma pergunta rápida?");
    expect(stored).toBe(provider.sent[0]);
  });

  it("resposta do agente escrita de manhã e enviada à tarde", async () => {
    const { res, provider, stored } = await send({ kind: "reply", createdBy: "system", body: "Bom dia! Você já tem logo, fotos e textos do negócio?" });
    expect(res.action).toBe("sent");
    expect(provider.sent[0]).toBe("Boa tarde! Você já tem logo, fotos e textos do negócio?");
    expect(stored).toBe(provider.sent[0]);
  });

  it("o que o dono escreve não é mexido", async () => {
    const { provider, stored } = await send({ kind: "manual", createdBy: "user", body: "Bom dia! Vocês teriam interesse?" });
    expect(provider.sent[0]).toBe("Bom dia! Vocês teriam interesse?");
    expect(stored).toBe("Bom dia! Vocês teriam interesse?");
  });
});

describe("'Oi' só abre a conversa, uma vez", () => {
  const ctx: TemplateContext = { senderName: "Jonathan", brandName: "Kelvin Studio", senderFullName: "Jonathan Kelvin", senderRole: "desenvolvedor", flow: "qualificar", mode: "curta" };
  const lead = (name: string): TemplateLead =>
    ({ id: "x1", name, neighborhood: null, city: "Fortaleza", category: "Dentista", niche: "Dentista", rating: 4.8, reviewsCount: 40, websiteKind: "none" }) as unknown as TemplateLead;

  it("só um dos 6 cumprimentos da abertura começa com 'Oi' (antes eram 3), e 'Oi, bom dia' não existe mais", () => {
    for (const name of ["Clínica Styllo", "Dra. Liane Sobral - Periodontista"]) {
      const starts = [0, 1, 2, 3, 4, 5].map((greet) => buildOpening(lead(name), { ...ctx, style: { greet, intro: 0, ask: 0, angle: "c-google" } }).body);
      expect(starts.filter((b) => /^Oi\b/.test(b)), starts.join("\n")).toHaveLength(1);
      expect(starts.some((b) => /Oi, (Dra\. \w+, )?bom dia/.test(b))).toBe(false);
      expect(new Set(starts).size).toBe(6);
    }
  });

  it("tira o cumprimento repetido do começo da resposta e guarda o nome de quem lê", () => {
    expect(dropRepeatedGreeting("Oi! Sou o Jonathan Kelvin, desenvolvedor de sites.")).toBe("Sou o Jonathan Kelvin, desenvolvedor de sites.");
    expect(dropRepeatedGreeting("Oi, bom dia! Vi que a Alpha ainda não tem site.")).toBe("Vi que a Alpha ainda não tem site.");
    expect(dropRepeatedGreeting("Boa tarde! Você já tem logo e fotos?")).toBe("Você já tem logo e fotos?");
    expect(dropRepeatedGreeting("Oi, Dra. Liane! Sou o Jonathan Kelvin.")).toBe("Dra. Liane, sou o Jonathan Kelvin.");
    expect(dropRepeatedGreeting("Bom dia, Letícia. Eu sou o Jonathan.")).toBe("Letícia, eu sou o Jonathan.");
    expect(dropRepeatedGreeting("Olá, bom dia! Aqui é o Jonathan.")).toBe("Aqui é o Jonathan.");
  });

  it("não mexe no que não é cumprimento no começo", () => {
    for (const t of ["Perfeito! Em até 7 dias eu monto uma página.", "Obrigado! Se mudar de ideia, é só me chamar.", "Oi", "Oi!", "Sou o Jonathan, bom dia para vocês.", "Entendo! Não precisa ser um site grande."]) {
      expect(dropRepeatedGreeting(t)).toBe(t);
    }
  });

  it("a resposta do agente não cumprimenta de novo depois da abertura", async () => {
    const out = await composeReply(simulationContext({ text: "Oi", facts: { flow: "qualificar" } }), { llm: null });
    expect(out.reply).toMatch(/^Tudo bem! Para a /);
    expect(out.reply).not.toMatch(/^(Oi|Olá|Bom dia|Boa tarde)/);
  });

  it("a apresentação abre direto: 'Sou o Jonathan Kelvin' ou 'Dra. Liane, sou o Jonathan Kelvin'", async () => {
    const opening = { from: "us" as const, text: "Bom dia! Aqui é o Jonathan. Vi o perfil no Google. Posso fazer uma pergunta rápida?", variant: "abertura-none-c-google~g0i0q0" };
    const plain = await composeReply(simulationContext({ text: "Bom dia", name: "Clínica Styllo", history: [opening], facts: { flow: "qualificar" } }), { llm: null });
    expect(plain.reply).toMatch(/^Sou o Jonathan Kelvin, desenvolvedor de sites\./);
    const dra = await composeReply(simulationContext({ text: "Bom dia", name: "Dra. Liane Sobral - Periodontista", history: [opening], facts: { flow: "qualificar" } }), { llm: null });
    expect(dra.reply).toMatch(/^Dra\. Liane, sou o Jonathan Kelvin, desenvolvedor de sites\./);
  });
});
