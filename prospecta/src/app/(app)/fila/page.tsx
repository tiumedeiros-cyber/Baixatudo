import type { Metadata } from "next";
import Link from "next/link";
import { AutomationCard } from "@/components/outreach/automation-card";
import { DraftCard, type DraftView } from "@/components/outreach/draft-card";
import { CancelButton, QueueToolbar, ReopenButton } from "@/components/outreach/queue-toolbar";
import { ReleasedLeads } from "@/components/outreach/released-leads";
import { SkipDays } from "@/components/outreach/skip-days";
import { EmptyState, PageBody, PageHeader, Panel } from "@/components/shell/page";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { localParts } from "@/lib/outreach/guardrails";
import { getOverview } from "@/lib/outreach/engine";
import { getNumbersOverview, listReleasedGroups } from "@/lib/outreach/numbers";
import { loadRoster, ownerOf } from "@/lib/outreach/roster";
import { dayLabelLong, queueDays } from "@/lib/outreach/skip-days";
import { getDefaultProvider, providerForAccount } from "@/lib/outreach/runtime";
import { kindLabel, type Message, type MessageStatus } from "@/lib/outreach/types";
import { getRepo } from "@/lib/repo";
import { formatWhen, timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "Fila" };

/** Uma mensagem em "enviando" por mais de 10 minutos depois da hora marcada não está sendo enviada: o envio parou. */
const STUCK_SENDING_MS = 10 * 60_000;

const STATUS_TONE: Partial<Record<MessageStatus, { tone: BadgeTone; label: string }>> = {
  sent: { tone: "accent", label: "Enviada" },
  delivered: { tone: "accent", label: "Entregue" },
  read: { tone: "accent", label: "Lida" },
  simulated: { tone: "info", label: "Simulada" },
  failed: { tone: "danger", label: "Falhou" },
  cancelled: { tone: "ghost", label: "Cancelada" },
};

export default async function QueuePage() {
  const repo = await getRepo();
  const now = new Date();
  const [overview, drafts, scheduled, recent, cancelled] = await Promise.all([
    getOverview(repo, await getDefaultProvider(repo, { timeoutMs: 3000 }), now),
    repo.listMessages({ statuses: ["draft"], direction: "out", order: "asc", limit: 100 }),
    repo.listMessages({ statuses: ["approved", "sending"], direction: "out", order: "asc", limit: 100 }),
    repo.listMessages({ statuses: ["sent", "delivered", "read", "simulated", "failed"], direction: "out", order: "desc", limit: 15 }),
    repo.listMessages({ statuses: ["cancelled"], direction: "out", order: "desc", limit: 20 }),
  ]);

  const leadIds = [...new Set([...drafts, ...scheduled, ...recent, ...cancelled].map((m) => m.leadId))];
  const leads = new Map((await repo.getLeads(leadIds)).map((l) => [l.id, l]));
  const tz = overview.cfg.timezone;
  const today = localParts(now, tz).ymd;

  // Com vários números: o dono escolhe para qual vai cada grupo de leads liberados, e cada mensagem mostra o número dela
  const roster = await loadRoster(repo);
  const numbers = roster.multi ? await getNumbersOverview(repo, (a) => providerForAccount(a, { timeoutMs: 3000 }), now) : [];
  const groups = roster.multi ? await listReleasedGroups(repo) : [];
  const numberOf = (accountId: string | null) => (roster.multi ? (ownerOf(roster, accountId)?.name ?? null) : null);

  // segurar um dia: o próximo dia com fila marcada e os dias já sem envio
  const qd = await queueDays(repo, now);
  const nextDay = qd.days.find((d) => !qd.skipDates.includes(d.ymd)) ?? null;
  const skipView = {
    today: qd.today,
    next: nextDay ? { ymd: nextDay.ymd, label: dayLabelLong(nextDay.ymd, qd.today), count: nextDay.count } : null,
    skipped: qd.skipDates.map((ymd) => ({ ymd, label: dayLabelLong(ymd, qd.today) })),
  };

  const draftViews: DraftView[] = drafts.flatMap((m) => {
    const l = leads.get(m.leadId);
    if (!l) return [];
    return [
      {
        id: m.id,
        leadId: l.id,
        leadName: l.name,
        neighborhood: l.neighborhood,
        websiteKind: l.websiteKind,
        score: l.score,
        kind: m.kind,
        step: m.step,
        intent: m.intent,
        body: m.body,
        variant: m.variant,
        numberName: numberOf(m.accountId),
        // resposta do agente que ficou velha na pausa volta com o motivo; rascunho de outro dia ganha o selo da data
        attention: m.error,
        oldDay: localParts(new Date(m.createdAt), tz).ymd < today ? localParts(new Date(m.createdAt), tz).ymd.slice(5).split("-").reverse().join("/") : null,
      },
    ];
  });

  const sortedScheduled = [...scheduled].sort((a: Message, b: Message) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? ""));

  return (
    <>
      <PageHeader
        eyebrow="04 — Fila"
        title="Fila de envio"
        description="O sistema escreve, você revisa e aprova, e os envios são espalhados nos melhores horários. Nada sai sem a sua aprovação."
      />
      <PageBody className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-6">
          <QueueToolbar drafts={drafts.length} openings={drafts.filter((m) => m.kind === "opening").length} simulated={overview.counts.simulated} multi={roster.multi} />

          {roster.multi ? (
            <Panel title={`Leads liberados (${groups.reduce((n, g) => n + g.count, 0)})`} eyebrow="Escolha o número de cada grupo">
              <ReleasedLeads
                groups={groups.map((g) => ({ key: g.key, label: g.label, count: g.count, topScore: g.topScore, sample: g.sample }))}
                numbers={numbers.map((n) => ({ id: n.id, name: n.name, paused: n.paused, connected: n.connected, capToday: n.capToday }))}
              />
            </Panel>
          ) : null}

          <Panel title={`Para aprovar (${draftViews.length})`} eyebrow="Rascunhos" bodyClassName="flex flex-col gap-3 p-4">
            {draftViews.length === 0 ? (
              <EmptyState
                glyph="00"
                title="Nada esperando aprovação"
                description={
                  roster.multi
                    ? "Escolha o número de um grupo em Leads liberados, logo acima, e o agente escreve as mensagens."
                    : "Clique em Preparar lote de hoje para escrever as mensagens dos leads que você aprovou como Qualificados no Caçador."
                }
                action={
                  <Link href="/cacador" className="label text-accent hover:underline">
                    Ir para o Caçador
                  </Link>
                }
              />
            ) : (
              // o texto entra na chave: quando o agente reescreve, o cartão abre com o texto novo
              draftViews.map((d) => <DraftCard key={`${d.id}:${d.body}`} draft={d} />)
            )}
          </Panel>

          <Panel title="Segurar um dia" eyebrow="Dias sem envio">
            <SkipDays view={skipView} />
          </Panel>

          <Panel title={`Agendadas (${sortedScheduled.length})`} eyebrow="Aprovadas, esperando a hora">
            {sortedScheduled.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-faint">Nenhum envio agendado.</p>
            ) : (
              <ul className="flex flex-col">
                {sortedScheduled.map((m) => {
                  const l = leads.get(m.leadId);
                  const sending = m.status === "sending";
                  // o worker pega e envia em segundos; "enviando" há mais que isso é envio que parou no meio
                  const stuck = sending && !!m.scheduledFor && now.getTime() - Date.parse(m.scheduledFor) > STUCK_SENDING_MS;
                  return (
                    <li key={m.id} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
                      <div className="w-[150px] shrink-0">
                        <p className="num text-[13px]">{formatWhen(m.scheduledFor, tz)}</p>
                        <p className="label text-[10px] text-faint">{kindLabel(m.kind, m.step)}</p>
                        {numberOf(m.accountId) ? <Badge tone="ghost">{numberOf(m.accountId)}</Badge> : null}
                        {sending ? <Badge tone={stuck ? "warn" : "info"}>{stuck ? "Presa em enviando" : "Enviando…"}</Badge> : null}
                      </div>
                      <Avatar name={l?.name ?? "Lead"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{l?.name ?? "Lead"}</p>
                        <p className="truncate text-[12px] text-muted">{m.body}</p>
                        {stuck ? (
                          <p className="text-[11px] text-warn">Está em “enviando” há tempo demais. Se o painel reiniciou no meio do envio, ele parou: confira no WhatsApp se saiu; cancelar tira da fila.</p>
                        ) : m.error ? (
                          <p className="truncate text-[11px] text-warn">Adiada: {m.error}</p>
                        ) : null}
                      </div>
                      <CancelButton id={m.id} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          {cancelled.length > 0 ? (
            <Panel title={`Canceladas (${cancelled.length})`} eyebrow="Não saíram. Reabra para voltar como rascunho">
              <ul className="flex flex-col">
                {cancelled.map((m) => (
                  <li key={m.id} className="flex items-center gap-4 border-b border-line px-4 py-3 last:border-b-0">
                    <div className="w-[150px] shrink-0">
                      <p className="num text-[13px]">{formatWhen(m.createdAt, tz)}</p>
                      <p className="label text-[10px] text-faint">{kindLabel(m.kind, m.step)}</p>
                    </div>
                    <Avatar name={leads.get(m.leadId)?.name ?? "Lead"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">{leads.get(m.leadId)?.name ?? "Lead"}</p>
                      <p className="truncate text-[12px] text-muted">{m.body}</p>
                      {m.error ? <p className="truncate text-[11px] text-faint">Motivo: {m.error}</p> : null}
                    </div>
                    <ReopenButton id={m.id} />
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <AutomationCard o={overview} now={now.getTime()} />
          <Panel title="Últimos envios" eyebrow="Enviadas e simuladas">
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-[13px] text-faint">Nada saiu ainda.</p>
            ) : (
              <ul className="flex flex-col">
                {recent.map((m) => {
                  const s = STATUS_TONE[m.status] ?? { tone: "ghost" as const, label: m.status };
                  return (
                    <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <Avatar name={leads.get(m.leadId)?.name ?? "Lead"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">{leads.get(m.leadId)?.name ?? "Lead"}</p>
                        <p className="label text-[10px] text-faint">
                          {numberOf(m.accountId) ? `${numberOf(m.accountId)} · ` : ""}
                          {kindLabel(m.kind, m.step)} · {m.sentAt ? timeAgo(m.sentAt, now.getTime()) : "—"}
                        </p>
                      </div>
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
