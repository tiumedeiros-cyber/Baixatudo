import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import type { RawPlace } from "@/lib/leads/to-place";
import { createMemoryRepo } from "@/lib/repo/memory";
import fixture from "@/lib/sources/fixtures/apify-estetica-fortaleza.anon.json";
import { loadConversationBoard } from "./board";
import { conversationNumberTabs, numberOfConversation, pickNumberFilter } from "./conversation-numbers";
import { prepareLeadsForAccount } from "./engine";
import { retireAccount } from "./numbers";
import { loadRoster } from "./roster";

const NOW = new Date("2026-10-22T13:00:00Z");

/** 3 números e conversas distribuídas: 4 no Número 1 (original), 3 no Número 2 e 2 no Número 3. */
async function setup() {
  const repo = createMemoryRepo();
  await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
  const { rows } = await repo.listLeads({ eligible: true, sort: "score", limit: 100, offset: 0 });
  await repo.bulkSetStage(rows.map((r) => r.id), "qualificado");
  await repo.saveSettings({ agentFlow: "qualificar" });
  const leads = (await repo.getLeads(rows.map((r) => r.id))).sort((a, b) => b.score - a.score);
  const one = await repo.createAccount({ name: "Número 1", legacy: true });
  const two = await repo.createAccount({ name: "Número 2", gowaDeviceId: "d2", paused: true });
  const three = await repo.createAccount({ name: "Número 3", gowaDeviceId: "d3" });
  const groups: [typeof one, number, number][] = [[one, 0, 4], [two, 4, 7], [three, 7, 9]];
  for (const [account, from, to] of groups) {
    await prepareLeadsForAccount(repo, NOW, { leadIds: leads.slice(from, to).map((l) => l.id), accountId: account.id, rng: () => 0.5 });
  }
  // o lead respondeu e espera por você: 1 no Número 1 e 2 no Número 2
  for (const index of [0, 4, 5]) {
    const conv = (await repo.findConversationByLead(leads[index].id))!;
    await repo.updateConversation(conv.id, { status: "awaiting_human", lastInboundAt: NOW.toISOString(), unread: 1 });
  }
  return { repo, leads, one, two, three };
}

describe("conversas por número", () => {
  it("listConversations filtra por número, e o original inclui as conversas sem número", async () => {
    const { repo, one, two, three } = await setup();
    expect((await repo.listConversations({ accountId: one.id, limit: 50 })).total).toBe(4);
    expect((await repo.listConversations({ accountId: two.id, limit: 50 })).total).toBe(3);
    expect((await repo.listConversations({ accountId: three.id, limit: 50 })).total).toBe(2);
    expect((await repo.listConversations({ limit: 50 })).total).toBe(9);
    // conversa criada antes dos números (sem número) é do original
    const lead = (await repo.listLeads({ stages: ["novo"], limit: 1, offset: 0 })).rows[0];
    await repo.ensureConversation(lead.id, lead.phoneE164!);
    expect((await repo.listConversations({ accountId: one.id, limit: 50 })).total).toBe(5);
    expect((await repo.listConversations({ accountId: two.id, limit: 50 })).total).toBe(3);
  });

  it("o filtro mostra quantas conversas cada número tem e quantas esperam por você", async () => {
    const { repo } = await setup();
    const tabs = await conversationNumberTabs(repo);
    expect(tabs.multi).toBe(true);
    expect(tabs.tabs.map((t) => [t.name, t.total, t.waiting, t.paused])).toEqual([
      ["Número 1", 4, 1, false],
      ["Número 2", 3, 2, true],
      ["Número 3", 2, 0, false],
    ]);
    expect(tabs.all).toEqual({ total: 9, waiting: 3 });
  });

  it("com um número só não há filtro nem selos", async () => {
    const repo = createMemoryRepo();
    await repo.createAccount({ name: "Número 1", legacy: true });
    expect(await conversationNumberTabs(repo)).toEqual({ multi: false, tabs: [], all: { total: 0, waiting: 0 } });
    expect(pickNumberFilter(await loadRoster(repo), "qualquer-coisa")).toBeNull();
    expect(await numberOfConversation(repo, null)).toBeNull();
  });

  it("o número escolhido na URL só vale se for de um número ativo", async () => {
    const { repo, two, three } = await setup();
    const roster = await loadRoster(repo);
    expect(pickNumberFilter(roster, two.id)).toBe(two.id);
    expect(pickNumberFilter(roster, [three.id, "x"])).toBe(three.id);
    expect(pickNumberFilter(roster, "nao-existe")).toBeNull();
    expect(pickNumberFilter(roster, undefined)).toBeNull();
    await retireAccount(repo, two.id);
    expect(pickNumberFilter(await loadRoster(repo), two.id)).toBeNull(); // aposentado não filtra
  });

  it("o quadro de um número traz só as conversas dele; sem filtro cada cartão diz de qual número é", async () => {
    const { repo, two } = await setup();
    const all = await loadConversationBoard(repo);
    const cards = all.lanes.flatMap((l) => l.cards);
    expect(all.total).toBe(9);
    expect(cards.map((c) => c.numberName).sort()).toEqual(["Número 1", "Número 1", "Número 1", "Número 1", "Número 2", "Número 2", "Número 2", "Número 3", "Número 3"]);

    const only = await loadConversationBoard(repo, { accountId: two.id });
    expect(only.total).toBe(3);
    const filtered = only.lanes.flatMap((l) => l.cards);
    expect(filtered).toHaveLength(3);
    expect(filtered.every((c) => c.numberName === null)).toBe(true); // já está filtrado: não repete o crachá
    // os dois que esperam por você caem nas raias do dono
    const mine = only.lanes.filter((l) => l.mine).reduce((n, l) => n + l.total, 0);
    expect(mine).toBe(2);
  });

  it("com um número só o quadro não ganha crachá nenhum", async () => {
    const repo = createMemoryRepo();
    await ingestPlaces(repo, fixture as unknown as RawPlace[], { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" });
    const { rows } = await repo.listLeads({ eligible: true, limit: 2, offset: 0 });
    await repo.createAccount({ name: "Número 1", legacy: true });
    for (const lead of rows) await repo.ensureConversation(lead.id, lead.phoneE164!);
    const board = await loadConversationBoard(repo);
    expect(board.lanes.flatMap((l) => l.cards).every((c) => !c.numberName)).toBe(true);
  });

  it("a conversa avisa quando o número dela está pausado ou foi aposentado", async () => {
    const { repo, leads, one, two } = await setup();
    const convTwo = (await repo.findConversationByLead(leads[4].id))!;
    expect(await numberOfConversation(repo, convTwo.accountId)).toMatchObject({ name: "Número 2", paused: true, retired: false });
    const convOne = (await repo.findConversationByLead(leads[0].id))!;
    expect(await numberOfConversation(repo, convOne.accountId)).toMatchObject({ name: "Número 1", paused: false });
    expect(one.id).toBe(convOne.accountId);
    await retireAccount(repo, two.id);
    // aposentado sai do elenco ativo, mas a conversa dele continua dele: o aviso diz que foi aposentado
    expect(await numberOfConversation(repo, convTwo.accountId)).toMatchObject({ name: "Número 2", retired: true });
  });
});
