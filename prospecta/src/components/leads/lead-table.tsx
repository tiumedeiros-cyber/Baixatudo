"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Smartphone, Sparkles, Star } from "lucide-react";
import { bulkStage } from "@/app/(app)/actions";
import { IneligibleBadge, ScoreChip, SiteBadge, StageBadge } from "@/components/leads/badges";
import { Button } from "@/components/ui/button";
import { filtersToSearch, PAGE_SIZE, type LeadFilters } from "@/lib/leads/filters";
import type { IneligibleReason, Stage, WebsiteKind } from "@/lib/leads/types";
import { cn, formatInt } from "@/lib/utils";

export interface LeadRowView {
  id: string;
  name: string;
  category: string | null;
  neighborhood: string | null;
  city: string | null;
  phoneDisplay: string | null;
  isMobile: boolean;
  websiteKind: WebsiteKind;
  rating: number | null;
  reviewsCount: number;
  score: number;
  stage: Stage;
  eligible: boolean;
  ineligibleReason: IneligibleReason | null;
  demo: boolean;
}

const HOT = 70;

export function LeadTable({
  rows,
  total,
  filters,
}: {
  rows: LeadRowView[];
  total: number;
  filters: LeadFilters;
}) {
  const pathname = usePathname();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectBest() {
    setSelected(new Set(rows.filter((r) => r.eligible && r.score >= HOT).map((r) => r.id)));
  }

  function run(stage: Stage) {
    const ids = [...selected];
    startTransition(async () => {
      const result = await bulkStage(ids, stage);
      setNotice({ ok: result.ok, text: result.message });
      if (result.ok) setSelected(new Set());
    });
  }

  const href = (page: number) => `${pathname}${filtersToSearch({ ...filters, pagina: page })}`;

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="num grid size-14 place-items-center border border-line-strong text-2xl text-faint">0</span>
        <p className="text-[15px] font-medium">Nenhum lead com esses filtros</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">
          Afrouxe os filtros ou rode uma nova busca. O padrão mostra só quem é elegível, está sem site e ainda não foi
          trabalhado.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <p className="label text-[10px] text-muted">
          <span className="num text-fg">{formatInt(total)}</span> leads
          {selected.size > 0 ? (
            <>
              {" "}
              · <span className="num text-accent">{selected.size}</span> selecionados
            </>
          ) : null}
        </p>
        <Button variant="ghost" size="sm" onClick={selectBest} title="Elegíveis com nota 70 ou mais, nesta página">
          <Sparkles className="size-3.5" aria-hidden />
          Selecionar os melhores
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <thead>
            <tr className="label border-b border-line text-[10px] text-faint">
              <th className="w-10 py-2.5 pl-4 font-medium">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos desta página"
                  checked={allOnPage}
                  onChange={() => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="size-3.5 accent-[var(--accent)]"
                />
              </th>
              <th className="w-14 py-2.5 font-medium">Nota</th>
              <th className="py-2.5 font-medium">Lead</th>
              <th className="py-2.5 font-medium">Site</th>
              <th className="py-2.5 font-medium">Contato</th>
              <th className="py-2.5 font-medium">Avaliação</th>
              <th className="py-2.5 pr-4 font-medium">Etapa</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const on = selected.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "rise group relative border-b border-line transition-colors last:border-b-0",
                    on ? "bg-accent-dim" : "hover:bg-surface-2",
                  )}
                  style={{ "--i": Math.min(i, 12) } as React.CSSProperties}
                >
                  <td className="relative py-2.5 pl-4">
                    {on ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${r.name}`}
                      checked={on}
                      onChange={() => toggle(r.id)}
                      className="size-3.5 accent-[var(--accent)]"
                    />
                  </td>
                  <td className="py-2.5">
                    <ScoreChip score={r.score} size="md" />
                  </td>
                  <td className="max-w-[320px] py-2.5 pr-4">
                    <Link href={`/leads/${r.id}`} className="block truncate text-[14px] font-medium hover:text-accent">
                      {r.name}
                    </Link>
                    <p className="truncate text-[12px] text-muted">
                      {[r.category, r.neighborhood ?? r.city].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <div className="flex flex-wrap gap-1">
                      <SiteBadge kind={r.websiteKind} />
                      {r.demo ? <span className="label border border-warn/40 px-1.5 py-0.5 text-[10px] text-warn">demo</span> : null}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    {r.phoneDisplay ? (
                      <p className="num flex items-center gap-1.5 text-[13px]">
                        <Smartphone className={cn("size-3.5", r.isMobile ? "text-accent" : "text-faint")} aria-hidden />
                        {r.phoneDisplay}
                      </p>
                    ) : (
                      <p className="text-[12px] text-faint">sem telefone</p>
                    )}
                    {r.ineligibleReason ? (
                      <div className="pt-1">
                        <IneligibleBadge reason={r.ineligibleReason} />
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4">
                    {r.rating != null ? (
                      <p className="num flex items-center gap-1 text-[13px]">
                        <Star className="size-3 fill-current text-warn" aria-hidden />
                        {r.rating.toFixed(1).replace(".", ",")}
                        <span className="text-faint">({formatInt(r.reviewsCount)})</span>
                      </p>
                    ) : (
                      <p className="text-[12px] text-faint">sem nota</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <StageBadge stage={r.stage} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <p className="label text-[10px] text-faint">
          Página <span className="num text-muted">{filters.pagina}</span> de <span className="num text-muted">{pageCount}</span>
        </p>
        <div className="flex gap-1">
          {filters.pagina > 1 ? (
            <Link href={href(filters.pagina - 1)} className="grid size-8 place-items-center border border-line text-muted hover:border-line-strong hover:text-fg" aria-label="Página anterior">
              <ChevronLeft className="size-4" aria-hidden />
            </Link>
          ) : null}
          {filters.pagina < pageCount ? (
            <Link href={href(filters.pagina + 1)} className="grid size-8 place-items-center border border-line text-muted hover:border-line-strong hover:text-fg" aria-label="Próxima página">
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          ) : null}
        </div>
      </div>

      {selected.size > 0 || notice ? (
        <div
          role="region"
          aria-label="Ações em lote"
          className="fixed inset-x-4 bottom-6 z-40 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 border border-line-strong bg-surface-2 p-2 shadow-none"
        >
          {selected.size > 0 ? (
            <>
              <span className="label px-2 text-[10px] text-muted">
                <span className="num text-accent">{selected.size}</span> selecionados
              </span>
              <Button variant="primary" size="sm" disabled={pending} onClick={() => run("qualificado")}>
                Aprovar para a fila
              </Button>
              <Button variant="danger" size="sm" disabled={pending} onClick={() => run("perdido")}>
                Descartar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </>
          ) : null}
          {notice ? (
            <button
              type="button"
              onClick={() => setNotice(null)}
              className={cn("px-2 text-left text-[12px]", notice.ok ? "text-accent" : "text-danger")}
            >
              {notice.text}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
