import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Panel } from "@/components/shell/page";
import { publicBaseUrl } from "@/lib/deals/base-url";
import { defaultPalette, pickTemplate } from "@/lib/deals/demo-content";
import { entryCents, formatCents, remainingCents } from "@/lib/deals/money";
import { demoUrl } from "@/lib/deals/service";
import { allowedNext } from "@/lib/deals/transitions";
import { DEMO_PALETTE_LABEL, DEMO_TEMPLATE_LABEL, PROJECT_LABEL, PROPOSAL_LABEL, type ProposalStatus } from "@/lib/deals/types";
import { getRepo } from "@/lib/repo";
import { formatWhen, timeAgo } from "@/lib/utils";
import { DemoActions, GenerateDemoForm, NewProposalForm, ProposalActions } from "./deal-controls";

export const PROPOSAL_TONE: Record<ProposalStatus, BadgeTone> = {
  draft: "ghost",
  sent: "info",
  accepted: "info",
  entry_paid: "accent",
  paid: "accent",
  cancelled: "danger",
};

/** Prévia do site, proposta e projeto de UM lead, para a página do lead e a da conversa. */
export async function LeadDeals({ leadId, now }: { leadId: string; now: number }) {
  const repo = await getRepo();
  const [lead, settings, demos, proposals, projects, base] = await Promise.all([
    repo.getLead(leadId),
    repo.getSettings(),
    repo.listDemos({ leadId, limit: 20 }),
    repo.listProposals({ leadId, limit: 20 }),
    repo.listProjects({ leadId, limit: 5 }),
    publicBaseUrl(),
  ]);
  if (!lead) return null;

  const suggested = (() => {
    const template = pickTemplate(lead.niche, lead.category);
    return { template, palette: defaultPalette(template) };
  })();
  const tz = settings.automation.timezone;
  const published = demos.filter((d) => d.status === "published");
  const defaultAmount = String(settings.ticketAverage || 800);

  return (
    <Panel title="Prévia do site e proposta" eyebrow="Do “pode” ao Pix">
      <div className="flex flex-col divide-y divide-line">
        {/* ───── prévias ───── */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium">Prévias</h3>
            <Link href="/demos" className="label text-[10px] text-faint hover:text-fg">
              Ver todas →
            </Link>
          </div>
          {demos.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-muted">
              Gere um primeiro desenho do site com os dados do negócio. Só depois do “pode” do lead você manda o link, e a
              mensagem passa pela sua aprovação.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {demos.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 border border-line bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={d.status === "published" ? "accent" : "ghost"}>{d.status === "published" ? "No ar" : "Fora do ar"}</Badge>
                    <span className="text-[13px]">{DEMO_TEMPLATE_LABEL[d.template]}</span>
                    <span className="text-[12px] text-faint">· {DEMO_PALETTE_LABEL[d.palette]}</span>
                    <span className="ml-auto text-[12px] text-muted">
                      {d.views === 0 ? "Ninguém abriu ainda" : `${d.views} ${d.views === 1 ? "visita" : "visitas"}${d.lastViewedAt ? `, última ${timeAgo(d.lastViewedAt, now)}` : ""}`}
                    </span>
                  </div>
                  <p className="num truncate text-[11px] text-faint" title={demoUrl(base.url, d.slug)}>
                    {demoUrl(base.url, d.slug)}
                  </p>
                  <DemoActions demoId={d.id} slug={d.slug} fullUrl={demoUrl(base.url, d.slug)} published={d.status === "published"} />
                </li>
              ))}
            </ul>
          )}
          {base.local ? (
            <p className="text-[12px] leading-snug text-warn">
              O endereço do painel é local ({base.url}): o link só abre no seu computador. Para o lead abrir, publique o painel e defina
              SITE_URL (veja docs/PREVIAS.md).
            </p>
          ) : null}
          <details open={demos.length === 0} className="group">
            <summary className="label block min-h-8 cursor-pointer py-2 text-[10px] text-muted marker:content-none hover:text-fg">
              {demos.length === 0 ? "Gerar prévia" : "+ Gerar outra prévia"}
            </summary>
            <div className="pt-3">
              <GenerateDemoForm leadId={lead.id} suggested={suggested} />
            </div>
          </details>
        </div>

        {/* ───── propostas ───── */}
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium">Propostas</h3>
            <Link href="/financeiro" className="label text-[10px] text-faint hover:text-fg">
              Financeiro →
            </Link>
          </div>
          {proposals.length === 0 ? (
            <p className="text-[13px] leading-relaxed text-muted">
              Valor, sinal e prazo num só lugar. O Pix cai na sua conta: você marca aqui quando receber.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {proposals.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 border border-line bg-surface-2 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_LABEL[p.status]}</Badge>
                    <span className="text-[13px] font-medium">{p.title}</span>
                    <span className="num ml-auto text-[14px]">{formatCents(p.amountCents)}</span>
                  </div>
                  <p className="text-[12px] text-muted">
                    Sinal {p.entryPct}% ({formatCents(entryCents(p))}) · saldo {formatCents(remainingCents(p))} · entrega em {p.deliveryDays} dias
                    {p.paidAt
                      ? ` · paga ${formatWhen(p.paidAt, tz)}`
                      : p.entryPaidAt
                        ? ` · sinal ${formatWhen(p.entryPaidAt, tz)}`
                        : p.sentAt
                          ? ` · enviada ${formatWhen(p.sentAt, tz)}`
                          : ""}
                  </p>
                  <ProposalActions proposalId={p.id} status={p.status} next={allowedNext(p.status)} />
                </li>
              ))}
            </ul>
          )}
          <details open={proposals.length === 0} className="group">
            <summary className="label block min-h-8 cursor-pointer py-2 text-[10px] text-muted marker:content-none hover:text-fg">
              {proposals.length === 0 ? "Criar proposta" : "+ Nova proposta"}
            </summary>
            <div className="pt-3">
              <NewProposalForm
                leadId={lead.id}
                demoId={published[0]?.id}
                defaultAmount={defaultAmount}
                defaultEntryPct={settings.entryPct}
                defaultDays={settings.deliveryDays}
              />
            </div>
          </details>
        </div>

        {/* ───── projeto ───── */}
        {projects.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px] text-muted">
              Projeto aberto: <span className="text-fg">{PROJECT_LABEL[projects[0].status]}</span>
              {projects[0].dueDate ? ` · entrega até ${projects[0].dueDate.split("-").reverse().join("/")}` : ""}
            </p>
            <Link href="/producao" className="label inline-flex items-center gap-1 text-[10px] text-accent hover:underline">
              Abrir em Produção <ArrowUpRight className="size-3" aria-hidden />
            </Link>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
