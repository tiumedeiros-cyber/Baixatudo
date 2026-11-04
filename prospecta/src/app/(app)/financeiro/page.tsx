import type { Metadata } from "next";
import Link from "next/link";
import { ProposalActions } from "@/components/deals/deal-controls";
import { PROPOSAL_TONE } from "@/components/deals/lead-deals";
import { EmptyState, PageBody, PageHeader, Panel, Stat } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { entryCents, formatCents, outstandingCents, receivedCents, remainingCents } from "@/lib/deals/money";
import { summarize } from "@/lib/deals/service";
import { allowedNext } from "@/lib/deals/transitions";
import { PROPOSAL_LABEL, type Proposal } from "@/lib/deals/types";
import type { Lead } from "@/lib/leads/types";
import { getRepo } from "@/lib/repo";
import { formatInt, formatWhen } from "@/lib/utils";

export const metadata: Metadata = { title: "Financeiro" };

const LIVE = new Set(["draft", "sent", "accepted", "entry_paid"]);

function ProposalRow({ p, lead, tz }: { p: Proposal; lead: Lead | undefined; tz: string }) {
  const when = p.paidAt ?? p.entryPaidAt ?? p.sentAt;
  return (
    <li className="flex flex-col gap-3 border-b border-line p-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={lead?.name ?? "Lead"} />
          <div className="min-w-0">
            <Link href={`/leads/${p.leadId}`} className="block truncate text-[14px] font-semibold tracking-[-0.01em] hover:text-accent">
              {lead?.name ?? "Lead"}
            </Link>
            <p className="text-[12px] text-faint">
              {p.title}
              {when ? ` · ${formatWhen(when, tz)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_LABEL[p.status]}</Badge>
          <p className="num text-[16px]">{formatCents(p.amountCents)}</p>
        </div>
      </div>
      <p className="text-[12px] text-muted">
        Sinal {p.entryPct}% ({formatCents(entryCents(p))}) · saldo {formatCents(remainingCents(p))} · entrada recebida{" "}
        <span className="text-fg">{formatCents(receivedCents(p))}</span>
        {outstandingCents(p) > 0 ? <> · falta receber <span className="text-fg">{formatCents(outstandingCents(p))}</span></> : null}
      </p>
      <ProposalActions proposalId={p.id} status={p.status} next={allowedNext(p.status)} />
    </li>
  );
}

export default async function FinancePage() {
  const repo = await getRepo();
  const [proposals, settings] = await Promise.all([repo.listProposals({ limit: 500 }), repo.getSettings()]);
  const leads = await repo.getLeads([...new Set(proposals.map((p) => p.leadId))]);
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const tz = settings.automation.timezone;

  const totals = summarize(proposals);
  const closed = proposals.filter((p) => p.status === "paid" || p.status === "entry_paid");
  const sentOrBeyond = proposals.filter((p) => p.status !== "draft" && p.status !== "cancelled");
  const conversion = sentOrBeyond.length ? Math.round((closed.length / sentOrBeyond.length) * 100) : null;
  const ticket = closed.length ? Math.round(closed.reduce((s, p) => s + p.amountCents, 0) / closed.length) : null;

  const open = proposals.filter((p) => LIVE.has(p.status));
  const done = proposals.filter((p) => !LIVE.has(p.status));

  return (
    <>
      <PageHeader
        eyebrow="08 — Financeiro"
        title="Financeiro"
        description="O Pix cai na sua conta, não no painel: aqui você marca o que recebeu e o sistema abre o projeto, move o lead para Ganho e soma o caixa."
      />
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Recebido" value={formatCents(totals.received)} sub={`${closed.length} ${closed.length === 1 ? "venda fechada" : "vendas fechadas"} (sinal ou total)`} accent index={0} />
          <Stat label="A receber" value={formatCents(totals.outstanding)} sub={`${totals.open} ${totals.open === 1 ? "proposta em aberto" : "propostas em aberto"}`} index={1} />
          <Stat label="Conversão" value={conversion === null ? "—" : `${conversion}%`} sub={`${closed.length} fechadas de ${sentOrBeyond.length} enviadas`} index={2} />
          <Stat label="Ticket médio" value={ticket === null ? "—" : formatCents(ticket)} sub="só propostas fechadas" index={3} />
        </div>

        {!settings.pixKey.trim() ? (
          <p className="border border-warn/40 bg-warn/5 px-4 py-3 text-[13px] leading-relaxed text-warn">
            Você ainda não cadastrou a sua chave Pix. Sem ela, a mensagem da proposta avisa que a chave vai depois.{" "}
            <Link href="/configuracoes" className="underline underline-offset-2">
              Cadastrar em Configurações
            </Link>
            .
          </p>
        ) : null}

        {proposals.length === 0 ? (
          <Panel>
            <EmptyState
              glyph="08"
              title="Nenhuma proposta ainda"
              description="Quando um lead pedir o preço, abra a conversa e clique em “Criar proposta”. O valor padrão vem do ticket médio das Configurações."
              action={
                <Link href="/conversas" className="label text-accent hover:underline">
                  Ir para as conversas →
                </Link>
              }
            />
          </Panel>
        ) : (
          <>
            <Panel title={`Em andamento (${formatInt(open.length)})`} eyebrow="Rascunho, enviada, aceita ou com sinal pago">
              {open.length === 0 ? (
                <p className="px-4 py-8 text-center text-[13px] text-faint">Nada em andamento.</p>
              ) : (
                <ul>
                  {open.map((p) => (
                    <ProposalRow key={p.id} p={p} lead={byLead.get(p.leadId)} tz={tz} />
                  ))}
                </ul>
              )}
            </Panel>
            {done.length > 0 ? (
              <Panel title={`Encerradas (${formatInt(done.length)})`} eyebrow="Pagas ou canceladas">
                <ul>
                  {done.map((p) => (
                    <ProposalRow key={p.id} p={p} lead={byLead.get(p.leadId)} tz={tz} />
                  ))}
                </ul>
              </Panel>
            ) : null}
          </>
        )}
      </PageBody>
    </>
  );
}
