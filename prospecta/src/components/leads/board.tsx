"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Smartphone, Star } from "lucide-react";
import { moveLead } from "@/app/(app)/actions";
import { ScoreChip, SiteBadge } from "@/components/leads/badges";
import { STAGE_LABEL, STAGES, isStage, type Stage, type WebsiteKind } from "@/lib/leads/types";
import { cn, formatBRL, formatInt } from "@/lib/utils";

export interface BoardCardView {
  id: string;
  name: string;
  sub: string;
  score: number;
  websiteKind: WebsiteKind;
  phoneDisplay: string | null;
  isMobile: boolean;
  rating: number | null;
  reviewsCount: number;
  dealValue: number | null;
  stage: Stage;
}

export type BoardColumns = Record<Stage, { rows: BoardCardView[]; total: number }>;

const COLUMN_ACCENT: Record<Stage, string> = {
  novo: "bg-surface-4",
  qualificado: "bg-accent/30",
  contatado: "bg-accent/50",
  respondeu: "bg-accent/70",
  proposta: "bg-accent/90",
  ganho: "bg-accent",
  perdido: "bg-danger/60",
};

function CardBody({ card, lifted }: { card: BoardCardView; lifted?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 border bg-surface-2 p-3 transition-colors",
        lifted ? "border-accent" : "border-line hover:border-line-strong",
      )}
    >
      <div className="flex items-start gap-3">
        <ScoreChip score={card.score} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/leads/${card.id}`}
            className="block truncate text-[13px] leading-tight font-medium hover:text-accent"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {card.name}
          </Link>
          <p className="truncate pt-0.5 text-[11px] text-muted">{card.sub || "—"}</p>
        </div>
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
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        {card.phoneDisplay ? (
          <span className="num inline-flex items-center gap-1 text-muted">
            <Smartphone className={cn("size-3", card.isMobile ? "text-accent" : "text-faint")} aria-hidden />
            {card.phoneDisplay}
          </span>
        ) : (
          <span className="text-faint">sem telefone</span>
        )}
        {card.dealValue ? <span className="num text-accent">{formatBRL(card.dealValue)}</span> : null}
      </div>
    </div>
  );
}

function DraggableCard({ card, stage }: { card: BoardCardView; stage: Stage }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { stage },
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("touch-manipulation outline-offset-2", isDragging && "opacity-30")}
      {...listeners}
      {...attributes}
    >
      <CardBody card={card} />
    </div>
  );
}

function Column({
  stage,
  cards,
  total,
  shown,
}: {
  stage: Stage;
  cards: BoardCardView[];
  total: number;
  shown: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const hidden = Math.max(0, total - shown);
  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_LABEL[stage]}
      className={cn(
        "flex w-[284px] shrink-0 flex-col border bg-surface-1 transition-colors",
        isOver ? "border-accent" : "border-line",
      )}
    >
      <header className="relative flex items-center justify-between gap-3 border-b border-line px-3 py-3">
        <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", COLUMN_ACCENT[stage])} />
        <h2 className="label text-[11px]">{STAGE_LABEL[stage]}</h2>
        <span className="num text-[13px] text-muted">{formatInt(total)}</span>
      </header>
      <div className="flex max-h-[calc(100dvh-300px)] min-h-40 flex-col gap-2 overflow-y-auto p-2">
        {cards.length === 0 ? (
          <p
            className={cn(
              "grid flex-1 place-items-center border border-dashed px-3 py-10 text-center text-[12px]",
              isOver ? "border-accent text-accent" : "border-line text-faint",
            )}
          >
            Solte um lead aqui
          </p>
        ) : (
          cards.map((card) => <DraggableCard key={card.id} card={card} stage={stage} />)
        )}
        {hidden > 0 ? (
          <p className="label px-1 py-2 text-center text-[10px] text-faint">
            +{formatInt(hidden)} fora desta vista
          </p>
        ) : null}
      </div>
    </section>
  );
}

export function Board({ columns }: { columns: BoardColumns }) {
  const [moves, setMoves] = useState<Record<string, Stage>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const { byStage, totals, byId } = useMemo(() => {
    const byId = new Map<string, BoardCardView>();
    const by: Record<Stage, BoardCardView[]> = {
      novo: [],
      qualificado: [],
      contatado: [],
      respondeu: [],
      proposta: [],
      ganho: [],
      perdido: [],
    };
    const totals = {} as Record<Stage, number>;
    for (const stage of STAGES) totals[stage] = columns[stage].total;

    for (const stage of STAGES) {
      for (const card of columns[stage].rows) {
        byId.set(card.id, card);
        const effective = moves[card.id] ?? card.stage;
        by[effective].push(card);
        if (effective !== card.stage) {
          totals[card.stage]--;
          totals[effective]++;
        }
      }
    }
    for (const stage of STAGES) by[stage].sort((a, b) => b.score - a.score);
    return { byStage: by, totals, byId };
  }, [columns, moves]);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setError(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over ? String(e.over.id) : null;
    const card = byId.get(id);
    if (!card || !target || !isStage(target)) return;
    const current = moves[id] ?? card.stage;
    if (current === target) return;

    setMoves((m) => ({ ...m, [id]: target }));
    startTransition(async () => {
      const result = await moveLead(id, target);
      if (!result.ok) {
        setMoves((m) => {
          const { [id]: _drop, ...rest } = m;
          void _drop;
          return rest;
        });
        setError(result.message);
      }
    });
  }

  const active = activeId ? byId.get(activeId) : null;

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
          Não consegui mover: {error}
        </p>
      ) : null}
      <DndContext
        id="funil"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              cards={byStage[stage]}
              total={totals[stage]}
              shown={byStage[stage].length}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}>
          {active ? <CardBody card={active} lifted /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
