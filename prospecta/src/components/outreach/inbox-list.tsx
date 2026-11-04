"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn, norm, timeAgo } from "@/lib/utils";

export interface InboxItem {
  id: string;
  name: string;
  preview: string;
  at: string;
  tone: BadgeTone;
  label: string;
  unread: number;
  /** Precisa de você: a conversa está esperando uma ação do dono. */
  attention: boolean;
  /** O número de WhatsApp desta conversa (só com vários números). */
  numberName?: string | null;
}

type Filter = "todas" | "voce" | "nao_lidas";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "todas", label: "Todas" },
  { id: "voce", label: "Sua vez" },
  { id: "nao_lidas", label: "Não lidas" },
];

/** Coluna da esquerda da caixa de entrada: busca, três filtros e a lista, com o item aberto marcado. */
export function InboxList({ items, activeId, now, linkSuffix = "" }: { items: InboxItem[]; activeId?: string; now: number; /** Ex.: "?numero=…", para o filtro por número continuar ao abrir uma conversa. */ linkSuffix?: string }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("todas");

  const counts = useMemo(
    () => ({
      todas: items.length,
      voce: items.filter((i) => i.attention).length,
      nao_lidas: items.filter((i) => i.unread > 0).length,
    }),
    [items],
  );

  const shown = useMemo(() => {
    const q = norm(query);
    return items.filter((i) => {
      if (filter === "voce" && !i.attention) return false;
      if (filter === "nao_lidas" && i.unread === 0) return false;
      return q === "" || norm(i.name).includes(q) || norm(i.preview).includes(q);
    });
  }, [items, query, filter]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-3 border-b border-line p-3">
        <label className="relative block">
          <span className="sr-only">Buscar conversa</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou mensagem"
            className="h-9 w-full border border-line bg-surface-1 pr-8 pl-9 text-[13px] text-fg placeholder:text-faint transition-colors hover:border-line-strong focus:border-accent focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Limpar busca"
              className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center text-muted hover:text-fg"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          ) : null}
        </label>
        <div role="group" aria-label="Filtrar conversas" className="grid grid-cols-3 gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "label flex h-8 items-center justify-center gap-1.5 border text-[10px] transition-colors",
                filter === f.id ? "border-accent-line bg-accent-dim text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {f.label}
              <span className="num text-[10px] opacity-70">{counts[f.id]}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-6 py-12 text-center text-[13px] leading-relaxed text-faint">
          {items.length === 0 ? "Nenhuma conversa ainda. Elas aparecem aqui assim que a primeira abordagem for aprovada." : "Nada com esse filtro."}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto" aria-label={`${shown.length} conversas`}>
          {shown.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id}>
                <Link
                  href={`/conversas/${c.id}${linkSuffix}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex gap-3 border-b border-line-soft px-4 py-3.5 transition-colors",
                    active ? "bg-surface-2" : "hover:bg-surface-1",
                  )}
                >
                  {active ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                  <Avatar name={c.name} tone={c.attention ? "warn" : c.unread > 0 ? "accent" : "neutral"} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={cn("truncate text-[13px] tracking-[-0.01em]", c.unread > 0 ? "font-semibold text-fg" : "font-medium text-fg/90")}>{c.name}</p>
                      <span className="label shrink-0 text-[10px] text-faint">{timeAgo(c.at, now)}</span>
                    </div>
                    <p className={cn("truncate text-[12px]", c.unread > 0 ? "text-fg-soft" : "text-muted")}>{c.preview}</p>
                    <div className="flex items-center gap-1.5 pt-0.5">
                      <Badge tone={c.tone} dot>
                        {c.label}
                      </Badge>
                      {c.numberName ? <Badge tone="ghost">{c.numberName}</Badge> : null}
                      {c.unread > 0 ? (
                        <span className="num ml-auto grid h-5 min-w-5 place-items-center bg-accent px-1 text-[11px] font-medium text-accent-ink" title={`${c.unread} sem ler`}>
                          {c.unread}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
