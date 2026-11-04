"use client";

import { useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Columns3, List, RotateCcw, Search } from "lucide-react";
import { Input, Select } from "@/components/ui/field";
import {
  DEFAULT_FILTERS,
  SITE_FILTER_LABEL,
  filtersToSearch,
  type LeadFilters,
  type SiteFilter,
} from "@/lib/leads/filters";
import { STAGES, STAGE_LABEL } from "@/lib/leads/types";
import { cn } from "@/lib/utils";

const SORTS = [
  ["score", "Melhor nota"],
  ["recent", "Mais recentes"],
  ["reviews", "Mais avaliações"],
  ["name", "Nome (A–Z)"],
] as const;

const MIN_SCORES = [0, 40, 60, 80] as const;

export function LeadFilterBar({ filters }: { filters: LeadFilters }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply(patch: Partial<LeadFilters>) {
    const next = { ...filters, ...patch, pagina: 1 };
    startTransition(() => router.replace(`${pathname}${filtersToSearch(next)}`, { scroll: false }));
  }

  const dirty = filtersToSearch(filters) !== "";

  return (
    <div className={cn("flex flex-wrap items-center gap-2 transition-opacity", pending && "opacity-60")}>
      <div role="group" aria-label="Forma de ver os leads" className="flex h-9 border border-line">
        {([
          ["kanban", "Por busca", Columns3],
          ["lista", "Lista", List],
        ] as const).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filters.vista === value}
            onClick={() => apply({ vista: value })}
            className={cn(
              "label inline-flex items-center gap-1.5 px-3 text-[11px] transition-colors",
              filters.vista === value ? "bg-accent-dim text-accent" : "text-muted hover:text-fg",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
        <Input
          type="search"
          defaultValue={filters.q}
          placeholder="Buscar nome, bairro, telefone…"
          aria-label="Buscar leads"
          className="h-9 pl-9"
          onChange={(e) => {
            const value = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => apply({ q: value }), 350);
          }}
        />
      </div>
      <Select
        aria-label="Filtro de site"
        value={filters.site}
        onChange={(e) => apply({ site: e.target.value as SiteFilter })}
        className="h-9 w-auto min-w-44"
      >
        {(Object.keys(SITE_FILTER_LABEL) as SiteFilter[]).map((k) => (
          <option key={k} value={k}>
            {SITE_FILTER_LABEL[k]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Etapa"
        value={filters.etapa}
        onChange={(e) => apply({ etapa: e.target.value as LeadFilters["etapa"] })}
        className="h-9 w-auto"
      >
        <option value="todas">Todas as etapas</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Elegibilidade"
        value={filters.elegivel}
        onChange={(e) => apply({ elegivel: e.target.value as LeadFilters["elegivel"] })}
        className="h-9 w-auto"
      >
        <option value="sim">Só elegíveis</option>
        <option value="nao">Não elegíveis</option>
        <option value="todos">Todos</option>
      </Select>
      <Select
        aria-label="Nota mínima"
        value={String(filters.min)}
        onChange={(e) => apply({ min: Number(e.target.value) })}
        className="h-9 w-auto"
      >
        {MIN_SCORES.map((n) => (
          <option key={n} value={n}>
            {n === 0 ? "Qualquer nota" : `Nota ${n}+`}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Ordenar"
        value={filters.ordem}
        onChange={(e) => apply({ ordem: e.target.value as LeadFilters["ordem"] })}
        className="h-9 w-auto"
      >
        {SORTS.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </Select>
      {dirty ? (
        <button
          type="button"
          onClick={() => apply({ ...DEFAULT_FILTERS })}
          className="label inline-flex h-9 items-center gap-1.5 px-2 text-muted hover:text-fg"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Padrão
        </button>
      ) : null}
    </div>
  );
}
