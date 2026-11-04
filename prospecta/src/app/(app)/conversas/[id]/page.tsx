import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { FichaPanel } from "@/components/agent/ficha-panel";
import { LeadDeals } from "@/components/deals/lead-deals";
import { SiteBadge, StageBadge } from "@/components/leads/badges";
import { ConversationList, conversationBadge } from "@/components/outreach/conversation-list";
import { numberOfConversation, pickNumberFilter } from "@/lib/outreach/conversation-numbers";
import { accountNames } from "@/lib/outreach/numbers";
import { loadRoster } from "@/lib/outreach/roster";
import { ConversationsBar } from "@/components/outreach/conversations-bar";
import { DraftCard, type DraftView } from "@/components/outreach/draft-card";
import { LeadCard } from "@/components/outreach/lead-card";
import { ScrollAnchor } from "@/components/outreach/scroll-anchor";
import { Composer, MarkRead, SimulateInbound, ThreadActions } from "@/components/outreach/thread-controls";
import { MessageList } from "@/components/outreach/thread-view";
import { Workspace } from "@/components/outreach/workspace";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { loadAgentView } from "@/lib/agent/view";
import { parsePhoneBR } from "@/lib/brazil/phone";
import { agentEnv } from "@/lib/env";
import { getRepo } from "@/lib/repo";

export const metadata: Metadata = { title: "Conversa" };

export default async function ConversationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { numero } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const repo = await getRepo();
  const conv = await repo.getConversation(id);
  if (!conv) notFound();
  const [lead, messages, settings] = await Promise.all([
    repo.getLead(conv.leadId),
    repo.listMessages({ conversationId: id, order: "asc", limit: 400 }),
    repo.getSettings(),
  ]);
  if (!lead) notFound();

  const now = new Date();
  const tz = settings.automation.timezone;
  const badge = conversationBadge(conv);
  const numberName = (await accountNames(repo)).nameOf(conv.accountId);
  const numberInfo = await numberOfConversation(repo, conv.accountId);
  const filter = pickNumberFilter(await loadRoster(repo), numero);
  const phone = parsePhoneBR(lead.phoneRaw);
  const phoneText = phone.display ?? lead.phoneRaw ?? "sem telefone";
  const drafts = messages.filter((m) => m.status === "draft");
  const thread = messages.filter((m) => m.status !== "draft" && m.status !== "cancelled");
  const cancelled = messages.filter((m) => m.status === "cancelled").length;
  const blocked = conv.status === "opted_out";
  const view = await loadAgentView(repo, conv, lead);
  const newestDraftId = drafts.filter((m) => m.kind === "reply").at(-1)?.id;
  const lastKey = messages.at(-1)?.id ?? "vazio";

  const draftViews: DraftView[] = drafts.map((m) => ({
    id: m.id,
    leadId: lead.id,
    leadName: lead.name,
    neighborhood: lead.neighborhood,
    websiteKind: lead.websiteKind,
    score: lead.score,
    kind: m.kind,
    step: m.step,
    intent: m.intent,
    body: m.body,
    variant: m.variant,
    attention: m.id === newestDraftId && view.handoff.needed ? view.handoff.reason : null,
  }));

  return (
    <>
      <MarkRead conversationId={conv.id} unread={conv.unread} />
      <Workspace
        hasThread
        bar={<ConversationsBar view="lista" numero={filter} />}
        list={<ConversationList activeId={conv.id} now={now.getTime()} accountId={filter} />}
        context={
          <div className="flex flex-col gap-3 p-3">
            <LeadCard lead={lead} phone={phoneText} touches={conv.touches} maxTouches={settings.automation.maxTouches} />
            <FichaPanel view={view} conversationId={conv.id} blocked={blocked} aiOn={agentEnv() !== null} />
            <LeadDeals leadId={lead.id} now={now.getTime()} />
            {repo.mode === "demo" ? <SimulateInbound conversationId={conv.id} /> : null}
          </div>
        }
      >
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line bg-surface-0 px-4 py-3 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/conversas?vista=lista"
              aria-label="Voltar para a lista"
              className="grid size-8 shrink-0 place-items-center border border-line text-muted transition-colors hover:border-line-strong hover:text-fg lg:hidden"
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <Avatar name={lead.name} size="lg" tone="accent" className="hidden sm:grid" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex min-w-0 flex-col">
                <h1 className="truncate text-[16px] leading-tight font-semibold tracking-[-0.02em]">{lead.name}</h1>
                <p className="truncate text-[12px] text-muted">
                  <span className="num">{phoneText}</span> · {[lead.neighborhood, lead.city].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone={badge.tone} dot>
                  {badge.label}
                </Badge>
                <StageBadge stage={lead.stage} />
                <SiteBadge kind={lead.websiteKind} />
                {numberName ? <Badge tone="ghost">{numberName}</Badge> : null}
              </div>
            </div>
          </div>
          <ThreadActions conversationId={conv.id} leadId={lead.id} humanTakenOver={conv.humanTakenOver} blocked={blocked} />
        </header>

        {numberInfo && (numberInfo.paused || numberInfo.retired) ? (
          <p role="status" className="shrink-0 border-b border-warn/35 bg-warn/10 px-4 py-2 text-[12.5px] leading-snug text-warn lg:px-6">
            <span className="label mr-2 text-[10px]">{numberInfo.name}</span>
            {numberInfo.retired
              ? "Este número foi aposentado: nada sai por ele. Se precisar responder, responda pelo celular."
              : "Este número está pausado: a automação não envia por ele (em Números). O que você escrever aqui sai na hora, como no celular."}
          </p>
        ) : null}

        <div data-thread-scroll className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-6">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6">
            <MessageList messages={thread} tz={tz} now={now} />

            {draftViews.length > 0 ? (
              <section aria-label="Rascunhos do agente" className="flex flex-col gap-3 border border-accent-line bg-accent-dim p-3">
                <p className="label kicker text-[10px] text-accent">Aguardando a sua aprovação</p>
                {draftViews.map((d) => (
                  <DraftCard key={d.id} draft={d} compact />
                ))}
              </section>
            ) : null}

            {cancelled > 0 ? (
              <p className="text-center text-[11px] text-faint">
                {cancelled} {cancelled === 1 ? "mensagem cancelada fica" : "mensagens canceladas ficam"} fora desta conversa.
              </p>
            ) : null}
            <ScrollAnchor key={lastKey} conversationId={conv.id} own={thread.at(-1)?.createdBy === "user"} />
          </div>
        </div>

        <div className="shrink-0 border-t border-line bg-surface-0 px-4 py-3 lg:px-6">
          <div className="mx-auto max-w-3xl">
            <Composer
              conversationId={conv.id}
              simulating={settings.automation.dryRun}
              disabled={
                blocked
                  ? "Este número pediu para não receber mensagens. Se ele voltou a escrever, use Desbloquear e devolver à automação."
                  : numberInfo?.retired
                    ? `${numberInfo.name} foi aposentado: nada sai por ele. Responda pelo celular.`
                    : undefined
              }
            />
          </div>
        </div>
      </Workspace>
    </>
  );
}
