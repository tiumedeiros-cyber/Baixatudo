import { parsePhoneBR } from "@/lib/brazil/phone";
import { localParts } from "@/lib/outreach/guardrails";
import type { Repo } from "@/lib/repo/types";
import { toLeadQuery, type LeadFilters } from "./filters";
import type { IneligibleReason, Lead, Search, WebsiteKind } from "./types";

/**
 * A triagem de leads em quadro (Kanban): uma coluna por BUSCA, das mais novas para as mais antigas, para o que entrou hoje
 * não se misturar com o de ontem. Cada coluna tem as ações em lote (aprovar os melhores, descartar os fracos) e cada
 * cartão pode ir sozinho para "Aprovar para a fila" ou "Descartar". Aqui fica só a montagem dos dados, sem tela.
 */

/** Nota a partir da qual o lead entra no "aprovar os melhores" da coluna. */
export const TRIAGE_BEST = 70;
/** Nota abaixo da qual o lead entra no "descartar os fracos" da coluna. */
export const TRIAGE_LOW = 40;
/** Quantos cartões cada coluna carrega (o resto fica na lista, filtrando por aquela busca). */
export const CARDS_PER_COLUMN = 80;
/** Quantas buscas recentes viram coluna. */
export const MAX_COLUMNS = 12;

export interface TriageCard {
  id: string;
  name: string;
  sub: string;
  score: number;
  websiteKind: WebsiteKind;
  phoneDisplay: string | null;
  isMobile: boolean;
  rating: number | null;
  reviewsCount: number;
  eligible: boolean;
  ineligibleReason: IneligibleReason | null;
  demo: boolean;
}

export interface TriageBatch {
  /** O id da busca, ou "outros" para o que veio de importação ou de buscas antigas. */
  id: string;
  title: string;
  /** "Hoje · 10:12", "Ontem · 16:40", "22/10 · 09:05". */
  kicker: string;
  /** Há quantos dias a busca foi feita (0 = hoje). Dá a cor da coluna. */
  daysAgo: number;
  /** Leads que casam com os filtros nesta busca (pode ser mais que os cartões carregados). */
  total: number;
  cards: TriageCard[];
  /** O id da busca, para abrir a lista só com ela; null em "outros". */
  searchId: string | null;
}

const ddmm = (ymd: string) => ymd.split("-").reverse().slice(0, 2).join("/");

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round((Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`)) / 86_400_000);
}

/** "Hoje · 10:12", "Ontem · 16:40" ou "22/10 · 09:05", no fuso do dono. */
export function whenLabel(iso: string, now: Date, timeZone: string): { label: string; daysAgo: number } {
  const at = localParts(new Date(iso), timeZone);
  const today = localParts(now, timeZone);
  const daysAgo = Math.max(0, daysBetween(at.ymd, today.ymd));
  const hhmm = `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
  const day = daysAgo === 0 ? "Hoje" : daysAgo === 1 ? "Ontem" : ddmm(at.ymd);
  return { label: `${day} · ${hhmm}`, daysAgo };
}

export function toTriageCard(l: Lead): TriageCard {
  return {
    id: l.id,
    name: l.name,
    sub: [l.category, l.neighborhood ?? l.city].filter(Boolean).join(" · "),
    score: l.score,
    websiteKind: l.websiteKind,
    phoneDisplay: parsePhoneBR(l.phoneRaw).display ?? l.phoneRaw,
    isMobile: l.isMobile,
    rating: l.rating,
    reviewsCount: l.reviewsCount,
    eligible: l.eligible,
    ineligibleReason: l.ineligibleReason,
    demo: l.source === "demo",
  };
}

/** Os cartões da coluna que o "aprovar os melhores" pega (elegíveis com nota alta). */
export function bestOf(cards: TriageCard[]): TriageCard[] {
  return cards.filter((c) => c.eligible && c.score >= TRIAGE_BEST);
}

/** Os cartões da coluna que o "descartar os fracos" pega. */
export function weakOf(cards: TriageCard[]): TriageCard[] {
  return cards.filter((c) => c.score < TRIAGE_LOW);
}

function batchTitle(s: Pick<Search, "niche" | "city">): string {
  return [s.niche, s.city].filter(Boolean).join(" · ") || "Busca";
}

/**
 * Monta as colunas: uma por busca concluída (as mais recentes primeiro), mais uma "Outras origens" para o que entrou por
 * importação ou por busca antiga. Respeita os filtros da tela (site, elegível, nota, etapa, texto, ordem) e esconde colunas
 * sem nenhum lead. Se o filtro "busca" estiver ligado, só aquela coluna aparece.
 */
export async function loadTriageBatches(repo: Repo, filters: LeadFilters, now: Date, timeZone: string): Promise<TriageBatch[]> {
  const base = { ...toLeadQuery(filters), limit: CARDS_PER_COLUMN, offset: 0 };
  const searches = (await repo.listSearches(MAX_COLUMNS)).filter((s) => s.status === "done" && (!filters.busca || s.id === filters.busca));

  const columns = await Promise.all(
    searches.map(async (s) => {
      const page = await repo.listLeads({ ...base, searchId: s.id });
      const when = whenLabel(s.finishedAt ?? s.createdAt, now, timeZone);
      return {
        s,
        batch: {
          id: s.id,
          title: batchTitle(s),
          kicker: when.label,
          daysAgo: when.daysAgo,
          total: page.total,
          cards: page.rows.map(toTriageCard),
          searchId: s.id,
        } satisfies TriageBatch,
      };
    }),
  );

  const batches: TriageBatch[] = columns.map((c) => c.batch).filter((b) => b.total > 0);

  // o que não pertence a nenhuma coluna acima (importação, ou busca mais antiga que as exibidas)
  if (!filters.busca) {
    const shown = new Set(searches.map((s) => s.id));
    const page = await repo.listLeads({ ...toLeadQuery(filters), searchId: undefined, limit: CARDS_PER_COLUMN * 2, offset: 0 });
    const others = page.rows.filter((l) => !l.searchId || !shown.has(l.searchId));
    const inColumns = columns.reduce((sum, c) => sum + c.batch.total, 0);
    const total = Math.max(others.length, page.total - inColumns);
    if (others.length > 0) {
      batches.push({
        id: "outros",
        title: "Outras origens",
        kicker: "Importados e buscas antigas",
        daysAgo: 99,
        total,
        cards: others.slice(0, CARDS_PER_COLUMN).map(toTriageCard),
        searchId: null,
      });
    }
  }
  return batches;
}
