import type { Metadata } from "next";
import Link from "next/link";
import { BriefingEditor, Checklist, ProjectStatusButtons } from "@/components/deals/project-controls";
import { EmptyState, PageBody, PageHeader, Panel, Stat } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/deals/money";
import { PROJECT_LABEL, PROJECT_STATUSES, type Project, type Proposal } from "@/lib/deals/types";
import type { Lead } from "@/lib/leads/types";
import { localParts } from "@/lib/outreach/guardrails";
import { getRepo } from "@/lib/repo";
import { cn, formatInt } from "@/lib/utils";

export const metadata: Metadata = { title: "Produção" };

const ddmm = (ymd: string) => ymd.split("-").reverse().join("/");

function ProjectCard({ p, lead, proposal, today }: { p: Project; lead: Lead | undefined; proposal: Proposal | null | undefined; today: string }) {
  const overdue = p.status !== "entregue" && !!p.dueDate && p.dueDate < today;
  return (
    <li className="flex flex-col gap-3 border border-line bg-surface-2 p-3">
      <div className="flex items-start gap-2.5">
        <Avatar name={lead?.name ?? "Lead"} size="sm" />
        <div className="min-w-0 flex-1">
          <Link href={`/leads/${p.leadId}`} className="block truncate text-[14px] font-semibold tracking-[-0.01em] hover:text-accent">
            {lead?.name ?? "Lead"}
          </Link>
          <p className="text-[12px] text-faint">
            {proposal ? `${proposal.title} · ${formatCents(proposal.amountCents)}` : "Sem proposta ligada"}
          </p>
        </div>
        {p.dueDate ? (
          <Badge tone={overdue ? "danger" : p.status === "entregue" ? "ghost" : "neutral"}>
            {p.status === "entregue" ? "Entregue" : `${overdue ? "Atrasado · " : "Até "}${ddmm(p.dueDate)}`}
          </Badge>
        ) : null}
      </div>
      <ProjectStatusButtons projectId={p.id} status={p.status} />
      <details className="group">
        <summary className="label block min-h-8 cursor-pointer py-2 text-[10px] text-muted marker:content-none hover:text-fg">
          Lista e briefing ({p.checklist.filter((i) => i.done).length}/{p.checklist.length})
        </summary>
        <div className="flex flex-col gap-4 pt-3">
          <Checklist projectId={p.id} items={p.checklist} />
          <BriefingEditor projectId={p.id} initial={p.briefing} />
        </div>
      </details>
    </li>
  );
}

export default async function ProductionPage() {
  const repo = await getRepo();
  const [projects, settings] = await Promise.all([repo.listProjects({ limit: 200 }), repo.getSettings()]);
  const leads = await repo.getLeads([...new Set(projects.map((p) => p.leadId))]);
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const proposals = await Promise.all(projects.map((p) => (p.proposalId ? repo.getProposal(p.proposalId) : Promise.resolve(null))));
  const proposalOf = new Map(projects.map((p, i) => [p.id, proposals[i]]));

  const today = localParts(new Date(), settings.automation.timezone).ymd;
  const active = projects.filter((p) => p.status !== "entregue");
  const late = active.filter((p) => p.dueDate && p.dueDate < today);
  const columns = PROJECT_STATUSES.map((status) => ({ status, items: projects.filter((p) => p.status === status) }));

  return (
    <>
      <PageHeader
        eyebrow="07 — Produção"
        title="Produção"
        description="Cada venda com sinal pago abre um projeto aqui, com prazo e uma lista do que falta. Você só produz o site."
      />
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Em andamento" value={formatInt(active.length)} sub="ainda não entregues" accent index={0} />
          <Stat label="Atrasados" value={formatInt(late.length)} sub={late.length ? "passaram do prazo" : "tudo no prazo"} index={1} />
          <Stat label="Entregues" value={formatInt(projects.length - active.length)} sub="projetos fechados" index={2} />
          <Stat label="Aguardando briefing" value={formatInt(projects.filter((p) => p.status === "briefing").length)} sub="falta material do cliente" index={3} />
        </div>

        {projects.length === 0 ? (
          <Panel>
            <EmptyState
              glyph="07"
              title="Nenhum projeto ainda"
              description="Quando você marcar o sinal de uma proposta como recebido, o projeto aparece aqui sozinho, com o prazo combinado e a lista de tarefas."
              action={
                <Link href="/financeiro" className="label text-accent hover:underline">
                  Ir para o Financeiro →
                </Link>
              }
            />
          </Panel>
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-4">
            {columns.map(({ status, items }) => (
              <section key={status} className={cn("flex flex-col border border-line bg-surface-1", status === "entregue" && "opacity-80")}>
                <div className="flex items-center justify-between border-b border-line px-4 py-3">
                  <h2 className="label text-[11px]">{PROJECT_LABEL[status]}</h2>
                  <span className="num text-[12px] text-muted">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[12px] text-faint">Vazio</p>
                ) : (
                  <ul className="flex flex-col gap-3 p-3">
                    {items.map((p) => (
                      <ProjectCard key={p.id} p={p} lead={byLead.get(p.leadId)} proposal={proposalOf.get(p.id)} today={today} />
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
