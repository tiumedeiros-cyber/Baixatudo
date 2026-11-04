import Link from "next/link";
import { ArrowRight, Check, Clock } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { SectionLabel } from "@/components/shell/page";
import { HEAT_LABEL } from "@/lib/agent/ficha";
import { PRODUCT_LABEL } from "@/lib/agent/discovery";
import type { Heat } from "@/lib/agent/types";
import { formatCents } from "@/lib/deals/money";
import { BANDS, type BoardCard, type BoardLane, type LaneId } from "@/lib/outreach/board";
import { cn, formatInt, timeAgo } from "@/lib/utils";

const HEAT_TONE: Record<Heat, BadgeTone> = { quente: "accent", morno: "warn", frio: "info", perdido: "danger", bloqueado: "danger" };

/** A cor do quadradinho da raia: vermelho para o que trava, lime para o que dá dinheiro, cinza para o resto. */
const DOT: Record<BoardLane["tone"], string> = {
  danger: "text-danger",
  accent: "text-accent",
  warn: "text-warn",
  info: "text-info",
  ghost: "text-faint",
};

function Card({ card, mine, now, suffix }: { card: BoardCard; mine: boolean; now: number; suffix: string }) {
  return (
    <Link
      href={`/conversas/${card.id}${suffix}`}
      className={cn(
        "group relative flex flex-col gap-2.5 border bg-surface-2 p-3 transition-colors hover:border-accent-line hover:bg-surface-3",
        card.unread > 0 ? "border-line-strong" : "border-line",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={card.leadName} size="sm" tone={card.unread > 0 ? "accent" : "neutral"} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-[13px] leading-tight font-semibold tracking-[-0.01em] group-hover:text-accent">{card.leadName}</p>
          <span className="label text-[9px] text-faint">{timeAgo(card.at, now)}</span>
        </div>
        {card.unread > 0 ? (
          <span className="num grid h-5 min-w-5 shrink-0 place-items-center bg-accent px-1 text-[11px] font-medium text-accent-ink" title={`${card.unread} sem ler`}>
            {card.unread}
          </span>
        ) : null}
      </div>

      <p className="line-clamp-2 text-[12px] leading-snug text-muted">{card.preview}</p>

      {card.summary ? (
        <p className="border-l-2 border-accent-line bg-accent-dim px-2.5 py-1.5 text-[11.5px] leading-snug text-fg/90">
          <span className="label mr-1.5 text-[9px] text-accent">Pedido</span>
          {card.summary}
        </p>
      ) : null}

      {card.action ? (
        <p className="flex items-start gap-1.5 text-[11.5px] leading-snug font-medium text-accent">
          <ArrowRight className="mt-px size-3 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
          {card.action}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {card.numberName ? <Badge tone="neutral">{card.numberName}</Badge> : null}
        {card.product ? <Badge tone="info">{PRODUCT_LABEL[card.product]}</Badge> : null}
        {card.heat && card.heat !== "frio" ? <Badge tone={HEAT_TONE[card.heat]}>{HEAT_LABEL[card.heat]}</Badge> : null}
        {card.amountCents != null ? <span className="num text-[12px] text-accent">{formatCents(card.amountCents)}</span> : null}
        {mine && card.waitingSince ? (
          <span className="label ml-auto inline-flex items-center gap-1 text-[9px] text-warn" title="Desde a última mensagem dele">
            <Clock className="size-3" aria-hidden />
            esperando {timeAgo(card.waitingSince, now).replace("há ", "")}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function Lane({ lane, now, suffix }: { lane: BoardLane; now: number; suffix: string }) {
  const rest = lane.total - lane.cards.length;
  const urgent = lane.mine && lane.total > 0;
  return (
    <section
      aria-label={`${lane.title}, ${lane.total} ${lane.total === 1 ? "conversa" : "conversas"}`}
      className={cn("flex min-w-0 flex-col border bg-surface-1", urgent ? "border-line-strong" : "border-line")}
    >
      <header className="flex flex-col gap-1.5 border-b border-line px-3.5 pt-3 pb-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-[-0.01em]">
            <span aria-hidden className={cn("dot", DOT[lane.tone], lane.total === 0 && "opacity-40")} />
            {lane.title}
          </h3>
          <span className={cn("num text-[20px] leading-none tracking-[-0.04em]", urgent ? "text-fg" : "text-muted")}>{formatInt(lane.total)}</span>
        </div>
        <p className="text-[11.5px] leading-snug text-faint">{lane.hint}</p>
      </header>
      <div className={cn("flex max-h-[min(62dvh,640px)] flex-col gap-2 overflow-y-auto p-2", lane.cards.length === 0 && !lane.mine ? "min-h-0" : "min-h-24")}>
        {lane.cards.length === 0 ? (
          <p className={cn("grid flex-1 place-items-center gap-1 px-3 text-center text-[12px] text-faint", lane.mine ? "py-6" : "py-3")}>
            {lane.mine ? (
              <>
                <Check className="mx-auto size-4 text-accent" aria-hidden />
                Nada esperando por você aqui.
              </>
            ) : (
              "Vazio por enquanto."
            )}
          </p>
        ) : (
          lane.cards.map((c) => <Card key={c.id} card={c} mine={lane.mine} now={now} suffix={suffix} />)
        )}
        {rest > 0 ? <p className="label px-1 py-2 text-center text-[10px] text-faint">+{formatInt(rest)} fora desta vista</p> : null}
      </div>
    </section>
  );
}

/** O quadro: um resumo em cima, a faixa "Sua vez" em destaque, depois o que está andando e o que está parado. */
export function ConversationBoard({ lanes, now, linkSuffix = "" }: { lanes: BoardLane[]; now: number; /** Ex.: "?numero=…", para o filtro por número continuar ao abrir uma conversa. */ linkSuffix?: string }) {
  const byId = new Map<LaneId, BoardLane>(lanes.map((l) => [l.id, l]));
  const mineTotal = lanes.filter((l) => l.mine).reduce((sum, l) => sum + l.total, 0);
  const bandTotals = BANDS.map((band) => band.lanes.reduce((sum, id) => sum + (byId.get(id)?.total ?? 0), 0));
  const all = bandTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col gap-9">
      <dl className="grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        {[
          { label: "Esperando por você", value: bandTotals[0], tone: mineTotal > 0 ? "text-warn" : "text-accent" },
          { label: "Em andamento", value: bandTotals[1], tone: "text-fg" },
          { label: "Paradas", value: bandTotals[2], tone: "text-muted" },
          { label: "Todas", value: all, tone: "text-fg" },
        ].map((s) => (
          <div key={s.label} className="flex flex-col gap-2 bg-surface-1 px-4 py-3.5">
            <dt className="label text-[10px] text-muted">{s.label}</dt>
            <dd className={cn("num text-[28px] leading-none tracking-[-0.04em]", s.tone)}>{formatInt(s.value)}</dd>
          </div>
        ))}
      </dl>

      {BANDS.map((band) => {
        const items = band.lanes.map((id) => byId.get(id)!).filter(Boolean);
        const first = band.id === "sua_vez";
        return (
          <section key={band.id} aria-label={band.title} className="flex flex-col gap-3.5">
            <SectionLabel aside={first ? (mineTotal > 0 ? `${mineTotal} esperando por você` : "tudo em dia") : undefined}>{band.title}</SectionLabel>
            <div className={cn("grid gap-3", items.length === 3 ? "md:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2")}>
              {items.map((lane) => (
                <Lane key={lane.id} lane={lane} now={now} suffix={linkSuffix} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
