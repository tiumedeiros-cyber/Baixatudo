import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MapPin, MessageCircle, MessageSquare } from "lucide-react";
import { LeadDeals } from "@/components/deals/lead-deals";
import { ActivityFeed } from "@/components/leads/activity";
import { IneligibleBadge, ScoreChip, SiteBadge, StageBadge } from "@/components/leads/badges";
import { NotesEditor, ProbeSiteButton, StageControl } from "@/components/leads/lead-actions";
import { PageBody, PageHeader, Panel } from "@/components/shell/page";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { parsePhoneBR, waLink } from "@/lib/brazil/phone";
import { PROBE_SIGNAL_LABEL, type ProbeSignal } from "@/lib/leads/site-probe";
import { getRepo } from "@/lib/repo";
import { z } from "zod";
import { cn, formatBRL, formatInt } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead" };

const SOURCE_LABEL = { apify: "Google Maps (Apify)", json: "Importação JSON", manual: "Manual", demo: "Demonstração" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <dt className="label pt-0.5 text-[10px] text-faint">{label}</dt>
      <dd className="min-w-0 text-[13px] break-words">{children}</dd>
    </div>
  );
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const repo = await getRepo();
  const lead = await repo.getLead(id);
  if (!lead) notFound();
  const events = await repo.listEvents({ leadId: id, limit: 30 });
  const conversation = await repo.findConversationByLead(id);

  const phone = parsePhoneBR(lead.phoneRaw);
  const wa = waLink(phone.isMobile ? phone.e164 : null);
  const canProbe = lead.websiteKind === "weak" || lead.websiteKind === "real";

  return (
    <>
      <PageHeader
        eyebrow="Lead"
        title={lead.name}
        description={[lead.category, lead.address].filter(Boolean).join(" · ") || undefined}
        actions={
          <>
            <Link href="/cacador" className={buttonClass("ghost", "md")}>
              <ArrowLeft className="size-4" aria-hidden />
              Caçador
            </Link>
            {conversation ? (
              <Link href={`/conversas/${conversation.id}`} className={buttonClass("secondary", "md")}>
                <MessageSquare className="size-4" aria-hidden />
                Conversa
              </Link>
            ) : null}
            {lead.mapsUrl ? (
              <a href={lead.mapsUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md")}>
                <MapPin className="size-4" aria-hidden />
                Maps
              </a>
            ) : null}
            {wa ? (
              <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "md")}>
                <MessageCircle className="size-4" aria-hidden />
                Abrir no WhatsApp
              </a>
            ) : null}
          </>
        }
      />
      <PageBody className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Por que essa nota" eyebrow="Nota de 0 a 100">
            <div className="flex flex-col gap-6 p-4 sm:flex-row">
              <div className="flex shrink-0 flex-col items-start gap-3">
                <ScoreChip score={lead.score} size="lg" />
                <div className="flex flex-wrap gap-1.5">
                  <StageBadge stage={lead.stage} />
                  {lead.source === "demo" ? <Badge tone="warn">Demo</Badge> : null}
                  {lead.ineligibleReason ? <IneligibleBadge reason={lead.ineligibleReason} /> : <Badge tone="accent">Elegível</Badge>}
                </div>
              </div>
              <ul className="flex min-w-0 flex-1 flex-col gap-3">
                {lead.scoreBreakdown.map((item) => (
                  <li key={item.key} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[13px]">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-muted"> · {item.detail}</span>
                      </p>
                      <p className="num shrink-0 text-[12px] text-muted">
                        <span className={cn(item.points > 0 && "text-fg")}>{item.points}</span>/{item.max}
                      </p>
                    </div>
                    <div className="h-1 bg-surface-3" role="presentation">
                      <div className="h-full bg-accent" style={{ width: `${(item.points / item.max) * 100}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <LeadDeals leadId={lead.id} now={new Date().getTime()} />

          <Panel title="Dados do lead" eyebrow="Google Maps">
            <dl>
              <Row label="Telefone">
                {phone.display ?? lead.phoneRaw ?? <span className="text-faint">sem telefone</span>}
                {phone.e164 ? <span className="num pl-2 text-[12px] text-faint">{phone.e164}</span> : null}
                <span className="pl-2 text-[12px] text-muted">
                  {phone.isMobile ? "celular" : phone.e164 ? "fixo" : ""}
                </span>
              </Row>
              <Row label="Site">
                <div className="flex flex-col items-start gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SiteBadge kind={lead.websiteKind} />
                    {lead.websiteRaw ? (
                      <a
                        href={/^https?:\/\//i.test(lead.websiteRaw) ? lead.websiteRaw : `https://${lead.websiteRaw}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-[12px] text-muted hover:text-accent"
                      >
                        <span className="truncate">{lead.websiteRaw}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                      </a>
                    ) : null}
                  </div>
                  {lead.websiteSignals.length > 0 ? (
                    <ul className="flex flex-wrap gap-1.5">
                      {lead.websiteSignals.map((s) => (
                        <li key={s}>
                          <Badge tone="warn">{PROBE_SIGNAL_LABEL[s as ProbeSignal] ?? s}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {canProbe ? <ProbeSiteButton leadId={lead.id} /> : null}
                </div>
              </Row>
              <Row label="Avaliação">
                {lead.rating != null ? (
                  <span className="num">
                    {lead.rating.toFixed(1).replace(".", ",")} <span className="text-faint">({formatInt(lead.reviewsCount)} avaliações)</span>
                  </span>
                ) : (
                  <span className="text-faint">sem nota</span>
                )}
              </Row>
              <Row label="Endereço">
                {lead.address ??
                  ([lead.neighborhood, lead.city, lead.state].filter(Boolean).join(", ") || (
                    <span className="text-faint">—</span>
                  ))}
              </Row>
              <Row label="Nicho">{lead.niche ?? <span className="text-faint">—</span>}</Row>
              <Row label="Origem">{SOURCE_LABEL[lead.source]}</Row>
              {lead.dealValue ? <Row label="Valor fechado">{formatBRL(lead.dealValue)}</Row> : null}
            </dl>
          </Panel>

          <Panel title="Anotações" eyebrow="Só você vê">
            <NotesEditor leadId={lead.id} initial={lead.notes} />
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Etapa" eyebrow="Funil">
            <StageControl leadId={lead.id} stage={lead.stage} />
          </Panel>
          <Panel title="Histórico" eyebrow="Linha do tempo">
            <ActivityFeed events={events} withName={false} />
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
