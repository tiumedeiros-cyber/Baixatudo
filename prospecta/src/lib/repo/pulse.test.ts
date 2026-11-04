import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { createMemoryRepo } from "./memory";

async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 5, offset: 0 });
  const lead = rows[0];
  const conv = await repo.ensureConversation(lead.id, lead.phoneE164!);
  return { repo, lead, conv };
}

describe("pulse: a tela só recarrega quando algo mudou", () => {
  it("é estável enquanto nada muda", async () => {
    const { repo } = await setup();
    expect(await repo.pulse()).toBe(await repo.pulse());
  });

  it("muda com mensagem nova, com recibo (enviada → lida) e com resposta do lead", async () => {
    const { repo, lead, conv } = await setup();
    const p0 = await repo.pulse();

    const [m] = await repo.createMessages([
      { conversationId: conv.id, leadId: lead.id, direction: "out", kind: "manual", body: "Oi", status: "sent", createdBy: "user", sentAt: new Date().toISOString() },
    ]);
    const p1 = await repo.pulse();
    expect(p1).not.toBe(p0);

    await repo.updateMessage(m.id, { status: "delivered" });
    const p2 = await repo.pulse();
    expect(p2).not.toBe(p1);

    await repo.updateMessage(m.id, { status: "read" });
    const p3 = await repo.pulse();
    expect(p3).not.toBe(p2);

    await repo.createMessages([{ conversationId: conv.id, leadId: lead.id, direction: "in", kind: "reply", body: "Pode mandar", status: "received", createdBy: "lead" }]);
    await repo.updateConversation(conv.id, { unread: 1 });
    expect(await repo.pulse()).not.toBe(p3);
  });

  it("muda com a etapa do lead e com a pausa da automação", async () => {
    const { repo, lead } = await setup();
    const p0 = await repo.pulse();
    await repo.setStage(lead.id, "contatado");
    const p1 = await repo.pulse();
    expect(p1).not.toBe(p0);
    await repo.saveAutomation({ paused: !(await repo.getSettings()).automation.paused });
    expect(await repo.pulse()).not.toBe(p1);
  });

  it("não muda com o estado interno do worker (ele grava a cada volta de ~20 s)", async () => {
    const { repo } = await setup();
    const p0 = await repo.pulse();
    await repo.saveAutomationState({ lastTickAt: new Date().toISOString() });
    expect(await repo.pulse()).toBe(p0);
  });
});
