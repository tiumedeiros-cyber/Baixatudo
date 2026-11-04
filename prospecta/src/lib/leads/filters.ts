import { STAGES, type Stage, type WebsiteKind } from "./types";
import type { LeadQuery, LeadSort } from "@/lib/repo/types";

export const PAGE_SIZE = 40;

export type SiteFilter = "sem" | "fraco" | "oportunidade" | "tem" | "todos";
export type EligibleFilter = "sim" | "nao" | "todos";
/** kanban: um quadro com uma coluna por busca (para triar rápido); lista: a tabela de sempre. */
export type ViewMode = "kanban" | "lista";

export interface LeadFilters {
  q: string;
  site: SiteFilter;
  elegivel: EligibleFilter;
  min: number;
  etapa: Stage | "todas";
  busca: string;
  ordem: LeadSort;
  pagina: number;
  vista: ViewMode;
}

/** Padrão do Caçador: o que dá dinheiro primeiro (elegível, sem site, ainda não trabalhado). */
export const DEFAULT_FILTERS: LeadFilters = {
  q: "",
  site: "sem",
  elegivel: "sim",
  min: 0,
  etapa: "novo",
  busca: "",
  ordem: "score",
  pagina: 1,
  vista: "kanban",
};

export const SITE_FILTER_LABEL: Record<SiteFilter, string> = {
  sem: "Sem site ou só rede social",
  fraco: "Site fraco",
  oportunidade: "Sem site + site fraco",
  tem: "Já tem site",
  todos: "Todos",
};

const SITE_KINDS: Record<SiteFilter, WebsiteKind[] | undefined> = {
  sem: ["none", "social"],
  fraco: ["weak"],
  oportunidade: ["none", "social", "weak"],
  tem: ["real"],
  todos: undefined,
};

type Raw = Record<string, string | string[] | undefined>;

function one(raw: Raw, key: string): string {
  const v = raw[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

const oneOf = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

export function parseFilters(raw: Raw): LeadFilters {
  const min = Number(one(raw, "min"));
  const page = Number(one(raw, "pagina"));
  const busca = one(raw, "busca");
  return {
    q: one(raw, "q").slice(0, 80),
    site: oneOf(one(raw, "site"), ["sem", "fraco", "oportunidade", "tem", "todos"] as const, DEFAULT_FILTERS.site),
    elegivel: oneOf(one(raw, "elegivel"), ["sim", "nao", "todos"] as const, DEFAULT_FILTERS.elegivel),
    min: Number.isFinite(min) ? Math.min(100, Math.max(0, Math.round(min))) : 0,
    etapa: oneOf(one(raw, "etapa"), [...STAGES, "todas"] as const, DEFAULT_FILTERS.etapa),
    busca: /^[0-9a-f-]{36}$/i.test(busca) ? busca : "",
    ordem: oneOf(one(raw, "ordem"), ["score", "recent", "name", "reviews"] as const, DEFAULT_FILTERS.ordem),
    pagina: Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1,
    vista: oneOf(one(raw, "vista"), ["kanban", "lista"] as const, DEFAULT_FILTERS.vista),
  };
}

export function toLeadQuery(f: LeadFilters): LeadQuery {
  return {
    q: f.q || undefined,
    siteKinds: SITE_KINDS[f.site],
    eligible: f.elegivel === "todos" ? undefined : f.elegivel === "sim",
    minScore: f.min > 0 ? f.min : undefined,
    stages: f.etapa === "todas" ? undefined : [f.etapa],
    searchId: f.busca || undefined,
    sort: f.ordem,
    limit: PAGE_SIZE,
    offset: (f.pagina - 1) * PAGE_SIZE,
  };
}

/** Só grava na URL o que difere do padrão, para o endereço ficar limpo. */
export function filtersToSearch(f: LeadFilters): string {
  const params = new URLSearchParams();
  (Object.keys(DEFAULT_FILTERS) as (keyof LeadFilters)[]).forEach((key) => {
    if (f[key] !== DEFAULT_FILTERS[key]) params.set(key, String(f[key]));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}
