"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Check, Smartphone, Star, Undo2, X } from "lucide-react";
import { bulkStage } from "@/app/(app)/actions";
import { IneligibleBadge, ScoreChip, SiteBadge } from "@/components/leads/badges";
import { Button } from "@/components/ui/button";
import { filtersToSearch, type LeadFilters } from "@/lib/leads/filters";
import { TRIAGE_BEST, TRIAGE_LOW, bestOf, weakOf, type TriageBatch, type TriageCard } from "@/lib/leads/triage";
import { cn, formatInt } from "@/lib/utils";

type Target = "qualificado" | "perdido";
type Notice = { ok: boolean; text: string; undo?: string[] } | null;

const APPROVE = "zona-aprovar";
const DISCARD = "zona-descartar";

/** Os alvos de soltar valem mais que a coluna: o ponteiro decide, e o retângulo é o plano B. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : rectIntersection(args);
};

function CardBody({ card, selected, lifted, extra }: { card: TriageCard; selected?: boolean; lifted?: boolean; extra?: number }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 border bg-surface-2 p-2.5 transition-colors",
        lifted ? "border-accent" : selected ? "border-accent/60 bg-accent-dim" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start gap-2.5">
        <ScoreChip score={card.score} size="sm" />
        <div className="min-w-0 flex-1 pr-6">
          <Link
            href={`/leads/${card.id}`}
            className="block truncate text-[13px] leading-tight font-medium hover:text-accent"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {card.name}
          </Link>
          <p className="truncate pt-0.5 text-[11px] text-muted">{card.sub || "—"}</p>
        </div>
        {extra && extra > 0 ? <span className="num grid h-5 place-items-center bg-accent px-1.5 text-[11px] text-accent-ink">+{extra}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <SiteBadge kind={card.websiteKind} />
        {card.rating != null ? (
          <span className="num inline-flex items-center gap-1 text-[11px] text-muted">
            <Star className="size-3 fill-current text-warn" aria-hidden />
            {card.rating.toFixed(1).replace(".", ",")}
            <span className="text-faint">({formatInt(card.reviewsCount)})</span>
          </span>
        ) : null}
        {card.demo ? <span className="label border border-warn/40 px-1.5 py-0.5 text-[10px] text-warn">demo</span> : null}
        {card.ineligibleReason ? <IneligibleBadge reason={card.ineligibleReason} /> : null}
      </div>
      {card.phoneDisplay ? (
        <p className="num flex items-center gap-1 text-[11px] text-muted">
          <Smartphone className={cn("size-3", card.isMobile ? "text-accent" : "text-faint")} aria-hidden />
          {card.phoneDisplay}
        </p>
      ) : (
        <p className="text-[11px] text-faint">sem telefone</p>
      )}
    </div>
  );
}

function TriageCardItem({
  card,
  selected,
  onToggle,
  onMove,
}: {
  card: TriageCard;
  selected: boolean;
  onToggle: () => void;
  onMove: (to: Target) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id });
  return (
    <div ref={setNodeRef} className={cn("group relative touch-manipulation outline-offset-2", isDragging && "opacity-30")}>
      <div {...listeners} {...attributes}>
        <CardBody card={card} selected={selected} />
      </div>
      {/* ações do cartão: não disparam o arrastar */}
      <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => onMove("qualificado")}
          aria-label={`Aprovar ${card.name} para a fila`}
          title="Aprovar para a fila"
          className="grid size-7 place-items-center border border-accent/40 text-accent hover:bg-accent hover:text-accent-ink"
        >
          <Check className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onMove("perdido")}
          aria-label={`Descartar ${card.name}`}
          title="Descartar"
          className="grid size-7 place-items-center border border-danger/40 text-danger hover:bg-danger hover:text-fg"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
      <label
        className="absolute top-1.5 right-1.5 grid size-6 cursor-pointer place-items-center"
        onPointerDown={(e) => e.stopPropagation()}
        title="Selecionar para agir em vários de uma vez"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Selecionar ${card.name}`}
          className="size-3.5 accent-[var(--accent)]"
        />
      </label>
    </div>
  );
}

function DropZone({ id, tone, title, hint, count }: { id: string; tone: "accent" | "danger"; title: string; hint: string; count: number }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-1 items-center justify-between gap-3 border border-dashed px-4 py-3 transition-colors",
        tone === "accent" ? (isOver ? "border-accent bg-accent-dim" : "border-accent/40") : isOver ? "border-danger bg-danger/10" : "border-danger/40",
      )}
    >
      <div className="min-w-0">
        <p className={cn("label text-[11px]", tone === "accent" ? "text-accent" : "text-danger")}>{title}</p>
        <p className="truncate text-[12px] text-muted">{isOver ? "Solte para confirmar" : hint}</p>
      </div>
      <span className="num text-[18px] text-muted" title="Movidos nesta tela">
        {count}
      </span>
    </div>
  );
}

function Column({
  batch,
  cards,
  hiddenByMove,
  selected,
  onToggle,
  onToggleAll,
  onMove,
  listHref,
}: {
  batch: TriageBatch;
  cards: TriageCard[];
  hiddenByMove: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[], on: boolean) => void;
  onMove: (ids: string[], to: Target) => void;
  listHref: string | null;
}) {
  const best = bestOf(cards);
  const weak = weakOf(cards);
  const allOn = cards.length > 0 && cards.every((c) => selected.has(c.id));
  const total = Math.max(0, batch.total - hiddenByMove);
  const rest = Math.max(0, total - cards.length);
  const bar = batch.daysAgo === 0 ? "bg-accent" : batch.daysAgo === 1 ? "bg-accent/50" : "bg-surface-4";

  return (
    <section aria-label={`${batch.title}, ${batch.kicker}`} className="flex w-[300px] shrink-0 flex-col border border-line bg-surface-1">
      <header className="relative flex flex-col gap-2 border-b border-line px-3 py-3">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", bar)} />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[13px] font-medium">{batch.title}</h2>
            <p className="label text-[10px] text-faint">{batch.kicker}</p>
          </div>
          <span className="num text-[18px] leading-none text-muted" title="Leads nesta busca, com os filtros atuais">
            {formatInt(total)}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="primary"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            disabled={best.length === 0}
            onClick={() => onMove(best.map((c) => c.id), "qualificado")}
            title={`Aprova só os elegíveis com nota ${TRIAGE_BEST} ou mais`}
          >
            Aprovar {best.length} melhores
          </Button>
          <Button
            variant="danger"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            disabled={weak.length === 0}
            onClick={() => onMove(weak.map((c) => c.id), "perdido")}
            title={`Descarta quem tem nota abaixo de ${TRIAGE_LOW}`}
          >
            Descartar {weak.length} fracos
          </Button>
        </div>
        <label className="label flex w-fit cursor-pointer items-center gap-2 text-[10px] text-muted">
          <input
            type="checkbox"
            checked={allOn}
            onChange={() => onToggleAll(cards.map((c) => c.id), !allOn)}
            className="size-3.5 accent-[var(--accent)]"
          />
          Selecionar a coluna
        </label>
      </header>
      <div className="flex max-h-[calc(100dvh-380px)] min-h-32 flex-col gap-2 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p className="grid flex-1 place-items-center px-3 py-10 text-center text-[12px] text-faint">Tudo triado aqui.</p>
        ) : (
          cards.map((c) => (
            <TriageCardItem key={c.id} card={c} selected={selected.has(c.id)} onToggle={() => onToggle(c.id)} onMove={(to) => onMove([c.id], to)} />
          ))
        )}
        {rest > 0 ? (
          <p className="label px-1 py-2 text-center text-[10px] text-faint">
            +{formatInt(rest)} fora desta vista
            {listHref ? (
              <>
                {" · "}
                <Link href={listHref} className="text-accent hover:underline">
                  ver na lista
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function TriageBoard({ batches, filters }: { batches: TriageBatch[]; filters: LeadFilters }) {
  const pathname = usePathname();
  const [gone, setGone] = useState<Record<string, Target>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const byId = useMemo(() => new Map(batches.flatMap((b) => b.cards).map((c) => [c.id, c])), [batches]);
  const movedTo = (to: Target) => Object.values(gone).filter((t) => t === to).length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(ids: string[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function move(ids: string[], to: Target) {
    const fresh = ids.filter((id) => !gone[id]);
    if (fresh.length === 0) return;
    setGone((g) => ({ ...g, ...Object.fromEntries(fresh.map((id) => [id, to])) }));
    setSelected((prev) => new Set([...prev].filter((id) => !fresh.includes(id))));
    startTransition(async () => {
      const r = await bulkStage(fresh, to);
      if (!r.ok) {
        setGone((g) => Object.fromEntries(Object.entries(g).filter(([id]) => !fresh.includes(id))));
        setNotice({ ok: false, text: r.message });
        return;
      }
      setNotice({ ok: true, text: r.message, undo: fresh });
    });
  }

  function undo(ids: string[]) {
    startTransition(async () => {
      const r = await bulkStage(ids, "novo");
      if (r.ok) setGone((g) => Object.fromEntries(Object.entries(g).filter(([id]) => !ids.includes(id))));
      setNotice({ ok: r.ok, text: r.ok ? `${ids.length} ${ids.length === 1 ? "lead voltou" : "leads voltaram"} para a triagem.` : r.message });
    });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setNotice(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    if (target !== APPROVE && target !== DISCARD) return;
    // arrastar um cartão que está marcado leva todos os marcados junto
    const ids = selected.has(id) ? [...selected] : [id];
    move(ids, target === APPROVE ? "qualificado" : "perdido");
  }

  const active = activeId ? byId.get(activeId) : null;
  const dragCount = active && selected.has(active.id) ? selected.size - 1 : 0;
  const hasCards = batches.some((b) => b.cards.some((c) => !gone[c.id]));

  if (batches.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-line bg-surface-1 px-6 py-16 text-center">
        <span className="num grid size-14 place-items-center border border-line-strong text-2xl text-faint">0</span>
        <p className="text-[15px] font-medium">Nada para triar com esses filtros</p>
        <p className="max-w-sm text-[13px] leading-relaxed text-muted">
          Rode uma nova busca ou afrouxe os filtros. O padrão mostra só quem é elegível, está sem site e ainda não foi trabalhado.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <DndContext id="triagem" sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex flex-wrap gap-3">
          <DropZone id={APPROVE} tone="accent" title="Aprovar para a fila" hint="Arraste um cartão para cá, ou use o ✓ do cartão" count={movedTo("qualificado")} />
          <DropZone id={DISCARD} tone="danger" title="Descartar" hint="Arraste para cá o que não serve, ou use o ✕" count={movedTo("perdido")} />
        </div>

        <div className="flex items-start gap-3 overflow-x-auto pb-4">
          {batches.map((b) => (
            <Column
              key={b.id}
              batch={b}
              cards={b.cards.filter((c) => !gone[c.id])}
              hiddenByMove={b.cards.filter((c) => gone[c.id]).length}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              onMove={move}
              listHref={b.searchId ? `${pathname}${filtersToSearch({ ...filters, busca: b.searchId, vista: "lista", pagina: 1 })}` : null}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {active ? <CardBody card={active} lifted extra={dragCount} /> : null}
        </DragOverlay>
      </DndContext>

      {!hasCards ? <p className="text-center text-[13px] text-accent">Tudo triado. Os aprovados já estão na Fila.</p> : null}

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
              <Button variant="primary" size="sm" disabled={pending} onClick={() => move([...selected], "qualificado")}>
                Aprovar para a fila
              </Button>
              <Button variant="danger" size="sm" disabled={pending} onClick={() => move([...selected], "perdido")}>
                Descartar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Limpar
              </Button>
            </>
          ) : null}
          {notice ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNotice(null)}
                className={cn("px-2 text-left text-[12px]", notice.ok ? "text-accent" : "text-danger")}
              >
                {notice.text}
              </button>
              {notice.undo ? (
                <Button variant="secondary" size="sm" disabled={pending} onClick={() => undo(notice.undo!)}>
                  <Undo2 className="size-3.5" aria-hidden />
                  Desfazer
                </Button>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
