import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Crosshair, ListChecks, MessageSquare, Send } from "lucide-react";
import { ActivityFeed } from "@/components/leads/activity";
import { NumbersStrip } from "@/components/numbers/numbers-strip";
import { AutomationCard } from "@/components/outreach/automation-card";
import { NextSteps, type NextStep } from "@/components/shell/next-steps";
import { formatCents } from "@/lib/deals/money";
import { summarize } from "@/lib/deals/service";
import { getOverview } from "@/lib/outreach/engine";
import { openingVariantStats } from "@/lib/outreach/metrics";
import { getNumbersOverview } from "@/lib/outreach/numbers";
import { loadRoster } from "@/lib/outreach/roster";
import { getDefaultProvider, providerForAccount } from "@/lib/outreach/runtime";
import { EmptyState, PageBody, PageHeader, Panel, Stat } from "@/components/shell/page";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { getRepo } from "@/lib/repo";
import { STAGE_LABEL, STAGES, type SearchStatus, type Stage } from "@/lib/leads/types";
import { cn, formatBRL, formatInt, formatWhen, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Comando" };

const STAGE_BAR: Record<Stage, string> = {
  novo: "bg-surface-4",
  qualificado: "bg-accent/25",
  contatado: "bg-accent/45",
  respondeu: "bg-accent/65",
  proposta: "bg-accent/85",
  ganho: "bg-accent",
  perdido: "bg-danger/50",
};

const SEARCH_TONE: Record<SearchStatus, { tone: BadgeTone; label: string }> = {
  running: { tone: "info", label: "Buscando" },
  ingesting: { tone: "info", label: "Importando" },
  done: { tone: "accent", label: "Concluída" },
  failed: { tone: "danger", label: "Falhou" },
};

export default async function CommandPage() {
  const repo = await getRepo();
  const now = new Date();
  const [stats, searches, events, settings, overview, proposals, demos, variants, waiting] = await Promise.all([
    repo.stats(),
    repo.listSearches(5),
    repo.listEvents({
      limit: 12,
      types: [
        "etapa",
        "busca_iniciada",
        "busca_concluida",
        "busca_falhou",
        "importacao",
        "site_analisado",
        "lote_preparado",
        "lote_aprovado",
        "mensagem_enviada",
        "mensagem_falhou",
        "resposta_recebida",
        "optout",
        "automacao",
        "demo_gerada",
        "proposta_status",
        "projeto_criado",
      ],
    }),
    repo.getSettings(),
    getOverview(repo, await getDefaultProvider(repo, { timeoutMs: 3000 }), now),
    repo.listProposals({ limit: 500 }),
    repo.listDemos({ limit: 500 }),
    openingVariantStats(repo),
    repo.listConversations({ statuses: ["awaiting_human"], limit: 1 }),
  ]);
  const money = summarize(proposals);
  // com vários números, cada um aparece com o seu estado e a sua fila
  const numbers = (await loadRoster(repo)).multi ? await getNumbersOverview(repo, (a) => providerForAccount(a, { timeoutMs: 3000 }), now) : [];
  const drafts = overview.counts.draft;
  const nextSteps: NextStep[] = [
    {
      href: "/conversas",
      icon: MessageSquare,
      label: "Conversas esperando você",
      value: formatInt(waiting.total),
      hint: waiting.total > 0 ? "Abra, leia e responda, ou assuma a conversa." : "Todas em dia, o agente conduz o resto.",
      tone: waiting.total > 0 ? "warn" : "ok",
    },
    {
      href: "/fila",
      icon: ListChecks,
      label: "Rascunhos para aprovar",
      value: formatInt(drafts),
      hint: drafts > 0 ? "Nada sai sem a sua aprovação." : "A fila está limpa.",
      tone: drafts > 0 ? "warn" : "ok",
    },
    {
      href: "/fila",
      icon: Send,
      label: "Envios de hoje",
      value: `${formatInt(overview.sentToday)}/${formatInt(overview.capToday)}`,
      hint: overview.cfg.paused ? "Automação pausada." : overview.nextAt ? `Próximo: ${formatWhen(overview.nextAt, overview.cfg.timezone)}` : "Nada agendado.",
      tone: "neutral",
    },
  ];
  const demosOpened = demos.filter((d) => d.views > 0).length;

  const inConversation = stats.stages.contatado + stats.stages.respondeu + stats.stages.proposta;
  const funnelTotal = Math.max(1, Object.values(stats.stages).reduce((a, b) => a + b, 0));

  return (
    <>
      <PageHeader
        eyebrow="01 — Comando"
        title="Visão geral"
        description="O que está acontecendo na sua prospecção, em um olhar."
        actions={
          <Link href="/cacador" className={buttonClass("primary", "md")}>
            <Crosshair className="size-4" aria-hidden />
            Nova busca
          </Link>
        }
      />
      <PageBody className="flex flex-col gap-6">
        {stats.total === 0 ? (
          <Panel>
            <EmptyState
              glyph="00"
              title="Nenhum lead ainda"
              description="Escolha uma cidade e um nicho no Caçador. O sistema busca no Google Maps, tira quem já tem site e ranqueia os melhores."
              action={
                <Link href="/cacador" className={buttonClass("primary", "md")}>
                  Ir para o Caçador
                </Link>
              }
            />
          </Panel>
        ) : (
          <>
            <NextSteps items={nextSteps} />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat index={0} label="Leads na base" value={formatInt(stats.total)} sub={`nota média ${stats.avgScore}`} />
              <Stat
                index={1}
                label="Elegíveis"
                value={formatInt(stats.eligible)}
                sub={`${formatInt(stats.eligibleNoSite)} sem site`}
              />
              <Stat index={2} label="Na fila" value={formatInt(stats.stages.qualificado)} sub="aprovados para abordar" />
              <Stat index={3} label="Em conversa" value={formatInt(inConversation)} sub="contatado, respondeu, proposta" />
              <Stat
                index={4}
                accent
                label="Fechados"
                value={formatInt(stats.stages.ganho)}
                sub={stats.wonValue > 0 ? formatBRL(stats.wonValue) : `ticket médio ${formatBRL(settings.ticketAverage)}`}
              />
            </div>

            <Panel title="Funil" eyebrow="Onde estão os leads">
              <div className="flex flex-col gap-4 p-4">
                <div className="flex h-3 w-full gap-px bg-line" role="img" aria-label="Distribuição dos leads por etapa">
                  {STAGES.map((stage) =>
                    stats.stages[stage] > 0 ? (
                      <div
                        key={stage}
                        className={cn("h-full transition-[flex-grow]", STAGE_BAR[stage])}
                        style={{ flexGrow: stats.stages[stage] / funnelTotal, flexBasis: 2 }}
                        title={`${STAGE_LABEL[stage]}: ${stats.stages[stage]}`}
                      />
                    ) : null,
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-7">
                  {STAGES.map((stage) => (
                    <div key={stage} className="flex flex-col gap-1">
                      <dt className="flex items-center gap-2 text-[12px] text-muted">
                        <span aria-hidden className={cn("size-2 shrink-0", STAGE_BAR[stage])} />
                        {STAGE_LABEL[stage]}
                      </dt>
                      <dd className="num text-[22px] leading-none">{formatInt(stats.stages[stage])}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Panel>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              <Panel
                title="Caixa e prévias"
                eyebrow="Do “pode” ao Pix"
                action={
                  <Link href="/financeiro" className="label inline-flex items-center gap-1 text-muted hover:text-fg">
                    Financeiro <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                }
              >
                <dl className="grid grid-cols-2 gap-x-6 gap-y-5 p-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                  <div className="flex flex-col gap-1">
                    <dt className="text-[12px] text-muted">Recebido</dt>
                    <dd className="num text-[22px] leading-none text-accent">{formatCents(money.received)}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-[12px] text-muted">A receber</dt>
                    <dd className="num text-[22px] leading-none">{formatCents(money.outstanding)}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-[12px] text-muted">Prévias geradas</dt>
                    <dd className="num text-[22px] leading-none">{formatInt(demos.length)}</dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-[12px] text-muted">Já abertas</dt>
                    <dd className="num text-[22px] leading-none">{formatInt(demosOpened)}</dd>
                  </div>
                </dl>
              </Panel>

              <Panel title="O que está funcionando" eyebrow="Resposta por abertura">
                {variants.length === 0 ? (
                  <p className="px-4 py-8 text-center text-[13px] text-faint">
                    Aparece aqui assim que as primeiras aberturas saírem: qual variação de texto recebe mais resposta.
                  </p>
                ) : (
                  <>
                    <ul className="flex flex-col">
                      {variants.map((v) => (
                        <li key={v.variant} className="flex flex-col gap-1.5 border-b border-line px-4 py-3 last:border-b-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="truncate text-[13px]">{v.label}</p>
                            <p className="num shrink-0 text-[12px] text-muted">
                              {v.replied}/{v.sent}
                              <span className="pl-2 text-fg">{v.rate === null ? "—" : `${Math.round(v.rate * 100)}%`}</span>
                            </p>
                          </div>
                          <div className="h-1 bg-surface-3" role="presentation">
                            <div className="h-full bg-accent" style={{ width: `${Math.round((v.rate ?? 0) * 100)}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <p className="border-t border-line px-4 py-2 text-[11px] text-faint">
                      Amostra pequena engana: só confie numa variação a partir de umas 30 aberturas enviadas.
                    </p>
                  </>
                )}
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
              <Panel
                title="Atividade recente"
                eyebrow="Ao vivo"
                action={
                  <Link href="/funil" className="label inline-flex items-center gap-1 text-muted hover:text-fg">
                    Funil <ArrowUpRight className="size-3" aria-hidden />
                  </Link>
                }
              >
                <ActivityFeed events={events} />
              </Panel>

              <div className="flex flex-col gap-6">
                <AutomationCard o={overview} now={now.getTime()} />
                {numbers.length > 1 ? <NumbersStrip numbers={numbers} /> : null}

                <Panel title="Últimas buscas" eyebrow="Caçador">
                  {searches.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-faint">Nenhuma busca ainda.</p>
                  ) : (
                    <ul className="flex flex-col">
                      {searches.map((s) => (
                        <li
                          key={s.id}
                          className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-[13px]">
                              {s.niche} · {s.city}
                            </p>
                            <p className="label text-[10px] text-faint">
                              {timeAgo(s.createdAt)} · {s.inserted} novos
                            </p>
                          </div>
                          <Badge tone={SEARCH_TONE[s.status].tone}>{SEARCH_TONE[s.status].label}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              </div>
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
