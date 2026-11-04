import type { Repo } from "@/lib/repo/types";
import { loadRoster, ownerOf, type Roster } from "./roster";

/**
 * Conversas por número: com vários números a aba Conversas ganha um filtro (Todos, Número 1, Número 2…) com quantas conversas cada
 * um tem e quantas esperam por você. Com um número só nada disso aparece.
 */

export interface NumberTab {
  id: string;
  name: string;
  total: number;
  /** Conversas esperando por você neste número. */
  waiting: number;
  /** O número está pausado: o que for aprovado nele só sai quando ele for liberado. */
  paused: boolean;
}

export interface NumberTabs {
  multi: boolean;
  tabs: NumberTab[];
  all: { total: number; waiting: number };
}

export async function conversationNumberTabs(repo: Repo): Promise<NumberTabs> {
  const roster = await loadRoster(repo);
  if (!roster.multi) return { multi: false, tabs: [], all: { total: 0, waiting: 0 } };
  const tabs = await Promise.all(
    roster.active.map(async (a): Promise<NumberTab> => {
      const [total, waiting] = await Promise.all([
        repo.listConversations({ accountId: a.id, limit: 1 }),
        repo.listConversations({ accountId: a.id, statuses: ["awaiting_human"], limit: 1 }),
      ]);
      return { id: a.id, name: a.name, total: total.total, waiting: waiting.total, paused: a.paused };
    }),
  );
  return { multi: true, tabs, all: { total: tabs.reduce((n, t) => n + t.total, 0), waiting: tabs.reduce((n, t) => n + t.waiting, 0) } };
}

/** O número escolhido na URL (`?numero=`), se for de um número ativo; senão nulo (todos). Sem vários números não há filtro. */
export function pickNumberFilter(roster: Roster, raw: string | string[] | undefined): string | null {
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!roster.multi || !id) return null;
  return roster.active.some((a) => a.id === id) ? id : null;
}

/** Tudo o que a página de uma conversa precisa saber do número dela. */
export async function numberOfConversation(repo: Repo, accountId: string | null) {
  const roster = await loadRoster(repo);
  const owner = roster.multi ? ownerOf(roster, accountId) : null;
  return owner ? { name: owner.name, paused: owner.paused, retired: owner.retired, pausedReason: owner.pausedReason } : null;
}
