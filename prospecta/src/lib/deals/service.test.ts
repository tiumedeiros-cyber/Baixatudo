import { describe, expect, it } from "vitest";
import { ingestPlaces } from "@/lib/leads/ingest";
import { mergeSettings } from "@/lib/leads/types";
import { createMemoryRepo } from "@/lib/repo/memory";
import {
  addChecklistItem,
  changeProposalStatus,
  createProposalFor,
  DealError,
  demoUrl,
  draftDemoMessage,
  draftProposalMessage,
  dueDateFrom,
  generateDemo,
  newSlug,
  saveBriefing,
  setProjectStatus,
  summarize,
  toggleChecklistItem,
} from "./service";
import { isDemoSlug } from "./types";

const opts = { niche: "Estética", city: "Fortaleza", searchId: null, source: "apify" } as const;
const NOW = new Date("2026-10-22T13:00:00.000Z");
const settings = mergeSettings({ contactPhone: "(85) 98888-7777" });

async function setup() {
  const repo = createMemoryRepo();
  const { leads } = await ingestPlaces(
    repo,
    [
      { title: "Clínica Bela", placeId: "a", phone: "(85) 99111-0001", totalScore: 4.9, reviewsCount: 164, neighborhood: "Aldeota" },
      { title: "Studio Fixo", placeId: "b", phone: "(85) 3322-0004", totalScore: 4.5, reviewsCount: 50 },
    ],
    opts,
  );
  return { repo, mobile: leads.find((l) => l.name === "Clínica Bela")!, landline: leads.find((l) => l.name === "Studio Fixo")! };
}

const input = (leadId: string) => ({ leadId, title: "Site de 1 página", amountCents: 80_000, entryPct: 50, deliveryDays: 7 });

describe("slug", () => {
  it("é longo, aleatório e válido", () => {
    const slugs = new Set(Array.from({ length: 200 }, () => newSlug()));
    expect(slugs.size).toBe(200);
    for (const s of slugs) expect(isDemoSlug(s)).toBe(true);
  });

  it("monta o endereço público sem barra duplicada", () => {
    expect(demoUrl("https://x.app/", "abc")).toBe("https://x.app/p/abc");
    expect(demoUrl("http://localhost:3000", "abc")).toBe("http://localhost:3000/p/abc");
  });
});

describe("prévia", () => {
  it("gera com o modelo do nicho, publica e registra o evento", async () => {
    const { repo, mobile } = await setup();
    const demo = await generateDemo(repo, mobile.id, { settings });
    expect(demo).toMatchObject({ leadId: mobile.id, template: "estetica", palette: "rose", status: "published", views: 0 });
    expect(demo.content.businessName).toBe("Clínica Bela");
    expect(demo.content.ownerWhatsappDigits).toBe("5585988887777");
    expect((await repo.listEvents({ types: ["demo_gerada"], limit: 5 })).length).toBe(1);
  });

  it("aceita escolher modelo e paleta", async () => {
    const { repo, mobile } = await setup();
    const demo = await generateDemo(repo, mobile.id, { template: "barbearia", palette: "ocean", settings });
    expect(demo).toMatchObject({ template: "barbearia", palette: "ocean" });
  });

  it("lead que não existe", async () => {
    const { repo } = await setup();
    await expect(generateDemo(repo, "00000000-0000-4000-8000-000000000000", { settings })).rejects.toBeInstanceOf(DealError);
  });

  it("a página pública só devolve o conteúdo, conta visitas e respeita o arquivamento", async () => {
    const { repo, mobile } = await setup();
    const demo = await generateDemo(repo, mobile.id, { settings });

    const first = await repo.viewDemo(demo.slug, true);
    expect(first).not.toBeNull();
    expect(Object.keys(first!).sort()).toEqual(["content", "palette", "template"]);
    await repo.viewDemo(demo.slug, true);
    await repo.viewDemo(demo.slug, false);
    const after = await repo.getDemo(demo.id);
    expect(after).toMatchObject({ views: 2 });
    expect(after!.firstViewedAt).not.toBeNull();

    await repo.updateDemo(demo.id, { status: "archived" });
    expect(await repo.viewDemo(demo.slug, true)).toBeNull();
    expect((await repo.getDemo(demo.id))!.views).toBe(2);
  });

  it("slug inválido ou inexistente devolve nulo", async () => {
    const { repo } = await setup();
    expect(await repo.viewDemo("curto", true)).toBeNull();
    expect(await repo.viewDemo("a".repeat(20), true)).toBeNull();
    expect(await repo.viewDemo("../etc/passwd", true)).toBeNull();
  });

  it("editar o conteúdo devolvido não altera o que está guardado", async () => {
    const { repo, mobile } = await setup();
    const demo = await generateDemo(repo, mobile.id, { settings });
    const view = await repo.viewDemo(demo.slug, false);
    view!.content.businessName = "alterado";
    expect((await repo.viewDemo(demo.slug, false))!.content.businessName).toBe("Clínica Bela");
  });
});

describe("rascunhos para o lead (nada sai sem aprovação)", () => {
  it("mensagem com o link entra como rascunho de resposta na conversa", async () => {
    const { repo, mobile } = await setup();
    const demo = await generateDemo(repo, mobile.id, { settings });
    const msg = await draftDemoMessage(repo, demo.id, "https://x.app");
    expect(msg).toMatchObject({ kind: "reply", status: "draft", direction: "out", createdBy: "user", leadId: mobile.id });
    expect(msg.body).toContain(`https://x.app/p/${demo.slug}`);
    expect((await repo.getConversation(msg.conversationId))!.phoneE164).toBe(mobile.phoneE164);
    // nada foi aprovado nem agendado
    expect(msg.approvedAt).toBeNull();
    expect(msg.scheduledFor).toBeNull();
  });

  it("não cria rascunho para fixo, para quem pediu para sair, nem de prévia arquivada", async () => {
    const { repo, mobile, landline } = await setup();
    const fixedDemo = await generateDemo(repo, landline.id, { settings });
    await expect(draftDemoMessage(repo, fixedDemo.id, "https://x.app")).rejects.toThrow(/celular/);

    const demo = await generateDemo(repo, mobile.id, { settings });
    await repo.updateDemo(demo.id, { status: "archived" });
    await expect(draftDemoMessage(repo, demo.id, "https://x.app")).rejects.toThrow(/arquivada/);

    await repo.updateDemo(demo.id, { status: "published" });
    await repo.addOptout(mobile.phoneE164!, "PARE");
    await expect(draftDemoMessage(repo, demo.id, "https://x.app")).rejects.toThrow(/não receber/);
  });

  it("proposta: rascunho com valor e Pix, ou aviso sem Pix", async () => {
    const { repo, mobile } = await setup();
    const proposal = await createProposalFor(repo, input(mobile.id));
    const withPix = await draftProposalMessage(repo, proposal.id, { key: "85988887777", holder: "Jonathan" });
    expect(withPix.body).toContain("chave 85988887777");
    expect(withPix.status).toBe("draft");
    const noPix = await draftProposalMessage(repo, proposal.id, null);
    expect(noPix.body).toContain("te passo a chave");
  });

  it("proposta cancelada não gera mensagem", async () => {
    const { repo, mobile } = await setup();
    const proposal = await createProposalFor(repo, input(mobile.id));
    await changeProposalStatus(repo, proposal.id, "cancelled", NOW);
    await expect(draftProposalMessage(repo, proposal.id, null)).rejects.toThrow(/cancelada/);
  });
});

describe("proposta", () => {
  it("nasce rascunho e valida os limites", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, { ...input(mobile.id), title: "  Site  " });
    expect(p).toMatchObject({ status: "draft", title: "Site", amountCents: 80_000, entryPct: 50, deliveryDays: 7 });
    expect((await repo.listEvents({ types: ["proposta_criada"], limit: 5 })).length).toBe(1);

    for (const bad of [
      { title: "" },
      { amountCents: 50 },
      { amountCents: 100_000_001 },
      { amountCents: 100.5 },
      { entryPct: -1 },
      { entryPct: 101 },
      { deliveryDays: 0 },
      { deliveryDays: 91 },
    ]) {
      await expect(createProposalFor(repo, { ...input(mobile.id), ...bad })).rejects.toBeInstanceOf(DealError);
    }
    await expect(createProposalFor(repo, input("00000000-0000-4000-8000-000000000000"))).rejects.toThrow(/Lead/);
  });

  it("enviar move o lead para Proposta, mas não rebaixa quem já está mais adiante", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, input(mobile.id));
    await changeProposalStatus(repo, p.id, "sent", NOW);
    expect((await repo.getLead(mobile.id))!.stage).toBe("proposta");

    const second = await createProposalFor(repo, input(mobile.id));
    await repo.setStage(mobile.id, "ganho");
    await changeProposalStatus(repo, second.id, "sent", NOW);
    expect((await repo.getLead(mobile.id))!.stage).toBe("ganho");
  });

  it("sinal pago: lead vira Ganho, valor é gravado e o projeto nasce com prazo e checklist", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, input(mobile.id));
    await changeProposalStatus(repo, p.id, "sent", NOW);
    const { proposal, project } = await changeProposalStatus(repo, p.id, "entry_paid", NOW);

    expect(proposal).toMatchObject({ status: "entry_paid", entryPaidAt: NOW.toISOString(), acceptedAt: NOW.toISOString() });
    const lead = (await repo.getLead(mobile.id))!;
    expect(lead.stage).toBe("ganho");
    expect(lead.dealValue).toBe(800);
    expect(project).toMatchObject({ leadId: mobile.id, proposalId: p.id, status: "briefing", dueDate: "2026-10-29" });
    expect(project!.checklist.length).toBeGreaterThanOrEqual(5);
    expect(project!.checklist.every((i) => i.done === false)).toBe(true);
    expect(new Set(project!.checklist.map((i) => i.id)).size).toBe(project!.checklist.length);
  });

  it("pagar o restante depois NÃO cria um segundo projeto", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, input(mobile.id));
    await changeProposalStatus(repo, p.id, "sent", NOW);
    const first = await changeProposalStatus(repo, p.id, "entry_paid", NOW);
    const second = await changeProposalStatus(repo, p.id, "paid", NOW);
    expect(second.project!.id).toBe(first.project!.id);
    expect(await repo.listProjects({ leadId: mobile.id, limit: 10 })).toHaveLength(1);
    expect(second.proposal.paidAt).toBe(NOW.toISOString());
  });

  it("valor do negócio soma todas as propostas fechadas do lead", async () => {
    const { repo, mobile } = await setup();
    const a = await createProposalFor(repo, input(mobile.id));
    const b = await createProposalFor(repo, { ...input(mobile.id), amountCents: 30_050 });
    await changeProposalStatus(repo, a.id, "sent", NOW);
    await changeProposalStatus(repo, a.id, "paid", NOW);
    await changeProposalStatus(repo, b.id, "sent", NOW);
    await changeProposalStatus(repo, b.id, "entry_paid", NOW);
    expect((await repo.getLead(mobile.id))!.dealValue).toBe(1100.5);
  });

  it("recusa mudanças proibidas e não mexe em nada quando recusa", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, input(mobile.id));
    await expect(changeProposalStatus(repo, p.id, "paid", NOW)).rejects.toBeInstanceOf(DealError);
    await changeProposalStatus(repo, p.id, "sent", NOW);
    await changeProposalStatus(repo, p.id, "entry_paid", NOW);
    await expect(changeProposalStatus(repo, p.id, "cancelled", NOW)).rejects.toBeInstanceOf(DealError);
    await changeProposalStatus(repo, p.id, "paid", NOW);
    await expect(changeProposalStatus(repo, p.id, "sent", NOW)).rejects.toThrow(/encerrada/);
    expect((await repo.getProposal(p.id))!.status).toBe("paid");
    await expect(changeProposalStatus(repo, "00000000-0000-4000-8000-000000000000", "sent", NOW)).rejects.toThrow(/Proposta/);
  });

  it("cancelar não mexe no lead nem cria projeto", async () => {
    const { repo, mobile } = await setup();
    const p = await createProposalFor(repo, input(mobile.id));
    await changeProposalStatus(repo, p.id, "sent", NOW);
    const out = await changeProposalStatus(repo, p.id, "cancelled", NOW);
    expect(out.project).toBeNull();
    expect((await repo.getLead(mobile.id))!.stage).toBe("proposta");
    expect(await repo.listProjects({ limit: 10 })).toHaveLength(0);
  });

  it("resumo do caixa: só conta o que foi marcado como pago", async () => {
    const { repo, mobile, landline } = await setup();
    const a = await createProposalFor(repo, input(mobile.id)); // enviada
    const b = await createProposalFor(repo, input(mobile.id)); // sinal pago
    const c = await createProposalFor(repo, input(landline.id)); // paga
    const d = await createProposalFor(repo, input(landline.id)); // cancelada
    await createProposalFor(repo, input(landline.id)); // rascunho
    await changeProposalStatus(repo, a.id, "sent", NOW);
    await changeProposalStatus(repo, b.id, "sent", NOW);
    await changeProposalStatus(repo, b.id, "entry_paid", NOW);
    await changeProposalStatus(repo, c.id, "sent", NOW);
    await changeProposalStatus(repo, c.id, "paid", NOW);
    await changeProposalStatus(repo, d.id, "cancelled", NOW);

    const all = await repo.listProposals({ limit: 50 });
    expect(summarize(all)).toEqual({
      received: 40_000 + 80_000, // sinal de b + total de c
      outstanding: 80_000 + 40_000, // a inteira + saldo de b
      open: 2,
      paid: 1,
    });
  });
});

describe("produção", () => {
  async function withProject() {
    const ctx = await setup();
    const p = await createProposalFor(ctx.repo, input(ctx.mobile.id));
    await changeProposalStatus(ctx.repo, p.id, "sent", NOW);
    const { project } = await changeProposalStatus(ctx.repo, p.id, "entry_paid", NOW);
    return { ...ctx, project: project! };
  }

  it("prazo conta a partir do dia local de Fortaleza", () => {
    expect(dueDateFrom(new Date("2026-10-22T13:00:00.000Z"), 7)).toBe("2026-10-29");
    // 01:30 UTC ainda é o dia anterior em Fortaleza (UTC-3)
    expect(dueDateFrom(new Date("2026-10-23T01:30:00.000Z"), 1)).toBe("2026-10-23");
  });

  it("avança o status e carimba a entrega só uma vez", async () => {
    const { repo, project } = await withProject();
    expect((await setProjectStatus(repo, project.id, "producao", NOW)).deliveredAt).toBeNull();
    const done = await setProjectStatus(repo, project.id, "entregue", NOW);
    expect(done).toMatchObject({ status: "entregue", deliveredAt: NOW.toISOString() });
    const later = new Date(NOW.getTime() + 3_600_000);
    expect((await setProjectStatus(repo, project.id, "entregue", later)).deliveredAt).toBe(NOW.toISOString());
    expect((await setProjectStatus(repo, project.id, "revisao", later)).deliveredAt).toBeNull();
  });

  it("marca e desmarca itens, adiciona itens e guarda o briefing", async () => {
    const { repo, project } = await withProject();
    const id = project.checklist[0].id;
    expect((await toggleChecklistItem(repo, project.id, id, true)).checklist[0].done).toBe(true);
    expect((await toggleChecklistItem(repo, project.id, id, false)).checklist[0].done).toBe(false);
    await expect(toggleChecklistItem(repo, project.id, "nao-existe", true)).rejects.toBeInstanceOf(DealError);

    const added = await addChecklistItem(repo, project.id, "  Trocar a foto do topo  ");
    expect(added.checklist.at(-1)).toMatchObject({ text: "Trocar a foto do topo", done: false });
    await expect(addChecklistItem(repo, project.id, "   ")).rejects.toBeInstanceOf(DealError);
    await expect(addChecklistItem(repo, project.id, "x".repeat(161))).rejects.toBeInstanceOf(DealError);

    expect((await saveBriefing(repo, project.id, "Cliente quer tons de rosa")).briefing).toBe("Cliente quer tons de rosa");
    await expect(saveBriefing(repo, project.id, "x".repeat(8001))).rejects.toBeInstanceOf(DealError);
  });

  it("o repositório recusa dois projetos para a mesma proposta", async () => {
    const { repo, project } = await withProject();
    await expect(repo.createProject({ leadId: project.leadId, proposalId: project.proposalId })).rejects.toThrow(/já tem/);
  });
});
