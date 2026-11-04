import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { ConversationBoard } from "@/components/outreach/conversation-board";
import { ConversationList } from "@/components/outreach/conversation-list";
import { ConversationsBar, conversationViewItems } from "@/components/outreach/conversations-bar";
import { NumberTabs } from "@/components/outreach/number-tabs";
import { RobotCleanup } from "@/components/outreach/robot-cleanup";
import { Workspace } from "@/components/outreach/workspace";
import { EmptyState, PageBody, PageHeader, Panel } from "@/components/shell/page";
import { Segmented } from "@/components/ui/segmented";
import { loadConversationBoard } from "@/lib/outreach/board";
import { conversationNumberTabs, pickNumberFilter } from "@/lib/outreach/conversation-numbers";
import { loadRoster } from "@/lib/outreach/roster";
import { findRobotConversations } from "@/lib/outreach/robot-cleanup";
import { getRepo } from "@/lib/repo";

export const metadata: Metadata = { title: "Conversas" };

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { vista, numero } = await searchParams;
  const view = vista === "lista" ? "lista" : "quadro";
  const now = new Date().getTime();
  const repo = await getRepo();
  // com vários números dá para ver as conversas de um número só (?numero=); sem eles não há filtro
  const accountId = pickNumberFilter(await loadRoster(repo), numero);

  if (view === "lista") {
    return (
      <Workspace
        hasThread={false}
        bar={<ConversationsBar view="lista" numero={accountId} />}
        list={<ConversationList now={now} accountId={accountId} />}
      >
        <div className="grid flex-1 place-items-center px-6">
          <div className="flex max-w-sm flex-col items-center gap-4 text-center">
            <span className="grid size-14 place-items-center border border-dashed border-line-strong bg-surface-2 text-faint">
              <MessageSquareText className="size-6" aria-hidden />
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-[15px] font-semibold tracking-[-0.01em]">Escolha uma conversa</p>
              <p className="text-[13px] leading-relaxed text-muted">
                Clique em uma conversa ao lado para ler o histórico, aprovar a resposta sugerida ou responder você mesmo. Quem respondeu aparece primeiro.
              </p>
            </div>
          </div>
        </div>
      </Workspace>
    );
  }

  const [{ lanes, total }, robots, tabs] = await Promise.all([
    loadConversationBoard(repo, { accountId }),
    findRobotConversations(repo),
    conversationNumberTabs(repo),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="05 — Conversas"
        title="Conversas"
        description="Cada conversa fica na coluna de quem precisa agir. A faixa “Sua vez” é só o que depende de você; o resto o agente conduz."
        actions={<Segmented label="Forma de ver as conversas" value={view} items={conversationViewItems(accountId)} />}
      />
      <PageBody>
        <NumberTabs data={tabs} activeId={accountId} hrefFor={(id) => (id ? `/conversas?numero=${id}` : "/conversas")} />
        <RobotCleanup items={robots} />
        {total === 0 ? (
          <Panel>
            <EmptyState
              glyph="05"
              title={accountId ? "Este número ainda não tem conversas" : "Nenhuma conversa ainda"}
              description={
                accountId
                  ? "Escolha este número para um grupo de leads na Fila: as conversas aparecem aqui assim que a abordagem for aprovada e enviada."
                  : "Elas aparecem aqui assim que a primeira abordagem for aprovada e o lead responder."
              }
            />
          </Panel>
        ) : (
          <ConversationBoard lanes={lanes} now={now} linkSuffix={accountId ? `?numero=${accountId}` : ""} />
        )}
      </PageBody>
    </>
  );
}
