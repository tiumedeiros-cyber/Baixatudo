import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { handleMessageEvent } from "@/lib/outreach/engine";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { buildAgentReport } from "./report";

const NOW = new Date("2026-10-22T13:00:00Z"); // quinta, 10:00 em Fortaleza
const rng = () => 0.5;

async function world() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  await repo.saveAutomation({ autonomy: "semi", paused: false, dryRun: false });
  await repo.saveSettings({ agentFlow: "previa" });
  const contact = async (i: number) => {
    const lead = leads[i];
    const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
    await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "out", kind: "opening", body: "oi", status: "sent", createdBy: "system", sentAt: NOW.toISOString() }]);
    await repo.setStage(lead.id, "contatado");
    return { lead, conv };
  };
  const say = (phone: string, text: string | null, media: "audio" | null = null, at = NOW) =>
    handleMessageEvent(repo, { kind: "message", providerMessageId: `IN${Math.random().toString(36).slice(2, 9)}`, phoneE164: phone, fromMe: false, text, media, timestamp: null }, at, { rng });
  return { repo, contact, say };
}

describe("relatório do agente", () => {
  it("separa o que ele fez sozinho do que espera você", async () => {
    const { repo, contact, say } = await world();
    const a = await contact(0);
    const b = await contact(1);
    await say(a.lead.phoneE164!, "Como funciona?", null, new Date(NOW.getTime() + 60_000));
    await say(b.lead.phoneE164!, "Tem garantia?", null, new Date(NOW.getTime() + 120_000));

    const r = await buildAgentReport(repo, new Date(NOW.getTime() + 3 * 60_000));
    expect(r.autoToday).toBe(1);
    expect(r.autoWaiting).toBe(1);
    expect(r.recent).toHaveLength(1);
    expect(r.recent[0]).toMatchObject({ conversationId: a.conv.id, topic: "how_works", topicLabel: "Perguntou como funciona", source: "rules", status: "approved" });
    expect(r.recent[0].body).toMatch(/prévia/);
    expect(r.needYou).toHaveLength(1);
    expect(r.needYou[0]).toMatchObject({ conversationId: b.conv.id, preview: "Tem garantia?" });
    expect(r.stages.respondeu).toBeGreaterThanOrEqual(2);
  });

  it("no modo assistido não há respostas sozinho, e os rascunhos não entram na conta", async () => {
    const { repo, contact, say } = await world();
    await repo.saveAutomation({ autonomy: "copiloto" });
    const a = await contact(0);
    await say(a.lead.phoneE164!, "Como funciona?");
    const r = await buildAgentReport(repo, NOW);
    expect(r.autoToday).toBe(0);
    expect(r.recent).toHaveLength(0);
    expect(r.needYou).toHaveLength(1);
  });

  it("começa vazio", async () => {
    const { repo } = await world();
    const r = await buildAgentReport(repo, NOW);
    expect(r).toMatchObject({ autoToday: 0, autoWaiting: 0, recent: [], needYou: [] });
  });
});
