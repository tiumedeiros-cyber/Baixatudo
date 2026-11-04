import type { Metadata } from "next";
import Link from "next/link";
import { DemoActions } from "@/components/deals/deal-controls";
import { EmptyState, PageBody, PageHeader, Panel, Stat } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { publicBaseUrl } from "@/lib/deals/base-url";
import { demoUrl } from "@/lib/deals/service";
import { DEMO_PALETTE_LABEL, DEMO_TEMPLATE_LABEL } from "@/lib/deals/types";
import { getRepo } from "@/lib/repo";
import { formatInt, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Demos" };

export default async function DemosPage() {
  const repo = await getRepo();
  const [demos, base] = await Promise.all([repo.listDemos({ limit: 200 }), publicBaseUrl()]);
  const leads = await repo.getLeads([...new Set(demos.map((d) => d.leadId))]);
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const now = new Date().getTime();

  const live = demos.filter((d) => d.status === "published");
  const opened = demos.filter((d) => d.views > 0);
  const visits = demos.reduce((sum, d) => sum + d.views, 0);

  return (
    <>
      <PageHeader
        eyebrow="06 — Demos"
        title="Demos"
        description="As prévias de site que você gerou. O link é secreto: só quem o recebe consegue abrir. A mensagem com o link sempre passa pela sua aprovação."
      />
      <PageBody className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Prévias geradas" value={formatInt(demos.length)} sub={`${live.length} no ar`} index={0} />
          <Stat label="Já abertas" value={formatInt(opened.length)} sub={demos.length ? `${Math.round((opened.length / demos.length) * 100)}% das prévias` : "—"} index={1} accent />
          <Stat label="Visitas" value={formatInt(visits)} sub="robôs e você não contam" index={2} />
          <Stat label="Sem visita" value={formatInt(demos.length - opened.length)} sub="ainda ninguém abriu" index={3} />
        </div>

        {base.local ? (
          <p className="border border-warn/40 bg-warn/5 px-4 py-3 text-[13px] leading-relaxed text-warn">
            O endereço do painel é local ({base.url}): os links só abrem no seu computador. Para o lead conseguir abrir, publique o painel
            e defina SITE_URL no .env.local. Passo a passo em docs/PREVIAS.md.
          </p>
        ) : null}

        {demos.length === 0 ? (
          <Panel>
            <EmptyState
              glyph="06"
              title="Nenhuma prévia ainda"
              description="Abra um lead ou uma conversa e clique em “Gerar prévia do site”. Ela nasce pronta, com o nome, o bairro, a nota e o WhatsApp do negócio."
              action={
                <Link href="/conversas" className="label text-accent hover:underline">
                  Ir para as conversas →
                </Link>
              }
            />
          </Panel>
        ) : (
          <ul className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {demos.map((d) => {
              const lead = byLead.get(d.leadId);
              const url = demoUrl(base.url, d.slug);
              return (
                <li key={d.id} className="flex flex-col gap-3 border border-line bg-surface-1 p-4">
                  <div className="flex items-start gap-3">
                    <Avatar name={lead?.name ?? d.content.businessName} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/leads/${d.leadId}`} className="block truncate text-[14px] font-semibold tracking-[-0.01em] hover:text-accent">
                        {lead?.name ?? d.content.businessName}
                      </Link>
                      <p className="text-[12px] text-faint">
                        {DEMO_TEMPLATE_LABEL[d.template]} · {DEMO_PALETTE_LABEL[d.palette]} · criada {timeAgo(d.createdAt, now)}
                      </p>
                    </div>
                    <Badge tone={d.status === "published" ? "accent" : "ghost"}>{d.status === "published" ? "No ar" : "Fora do ar"}</Badge>
                  </div>
                  <p className="text-[13px] text-muted">
                    {d.views === 0
                      ? "Ninguém abriu ainda."
                      : `${d.views} ${d.views === 1 ? "visita" : "visitas"}${d.lastViewedAt ? `, a última ${timeAgo(d.lastViewedAt, now)}` : ""}.`}
                    {d.sentAt ? ` Link enviado ${timeAgo(d.sentAt, now)}.` : ""}
                  </p>
                  <p className="num truncate text-[11px] text-faint" title={url}>
                    {url}
                  </p>
                  <DemoActions demoId={d.id} slug={d.slug} fullUrl={url} published={d.status === "published"} />
                </li>
              );
            })}
          </ul>
        )}
      </PageBody>
    </>
  );
}
