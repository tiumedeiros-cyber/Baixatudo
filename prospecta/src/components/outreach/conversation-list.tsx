import { type BadgeTone } from "@/components/ui/badge";
import { getRepo } from "@/lib/repo";
import { conversationNumberTabs } from "@/lib/outreach/conversation-numbers";
import { accountNames } from "@/lib/outreach/numbers";
import { previewOf } from "@/lib/outreach/preview";
import type { Conversation } from "@/lib/outreach/types";
import { InboxList, type InboxItem } from "./inbox-list";
import { NumberTabs } from "./number-tabs";

export function conversationBadge(c: Conversation): { tone: BadgeTone; label: string } {
  if (c.status === "opted_out") return { tone: "danger", label: "Bloqueada" };
  if (c.status === "closed") return { tone: "ghost", label: "Encerrada" };
  if (c.status === "awaiting_human") return { tone: "warn", label: "Precisa de você" };
  if (c.humanTakenOver) return { tone: "info", label: "Com você" };
  return { tone: "ghost", label: c.lastInboundAt ? "Em andamento" : "Aguardando resposta" };
}

/**
 * Coluna da esquerda: quem precisa de você primeiro, depois a atividade mais recente. Os dados vêm daqui; busca e filtros ficam no
 * cliente. Com vários números, em cima fica o filtro por número (`accountId`): cada número lista as SUAS conversas, então nenhum
 * fica de fora por causa do limite da lista.
 */
export async function ConversationList({ activeId, now, accountId = null }: { activeId?: string; now: number; accountId?: string | null }) {
  const repo = await getRepo();
  const only = accountId ? { accountId } : {};
  const { rows } = await repo.listConversations({ limit: 80, ...only });
  const [leads, recent, tabs] = await Promise.all([
    repo.getLeads(rows.map((c) => c.leadId)),
    repo.listMessages({ order: "desc", limit: 400, ...only }),
    conversationNumberTabs(repo),
  ]);
  const byLead = new Map(leads.map((l) => [l.id, l]));
  const numbers = await accountNames(repo);
  const last = new Map<string, string>();
  for (const m of recent) {
    if (last.has(m.conversationId)) continue;
    const text = previewOf(m);
    if (text !== null) last.set(m.conversationId, text);
  }

  const items: InboxItem[] = rows.map((c) => {
    const badge = conversationBadge(c);
    return {
      id: c.id,
      name: byLead.get(c.leadId)?.name ?? "Lead",
      preview: last.get(c.id) ?? "Sem mensagens",
      at: c.lastInboundAt ?? c.lastOutboundAt ?? c.createdAt,
      tone: badge.tone,
      label: badge.label,
      unread: c.unread,
      attention: c.status === "awaiting_human",
      // com o filtro ligado todas são do mesmo número: não precisa repetir o crachá
      numberName: accountId ? null : numbers.nameOf(c.accountId),
    };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      {tabs.multi ? (
        <div className="shrink-0 border-b border-line p-3">
          <NumberTabs wrap data={tabs} activeId={accountId} hrefFor={(id) => (id ? `/conversas?vista=lista&numero=${id}` : "/conversas?vista=lista")} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <InboxList items={items} activeId={activeId} now={now} linkSuffix={accountId ? `?numero=${accountId}` : ""} />
      </div>
    </div>
  );
}
