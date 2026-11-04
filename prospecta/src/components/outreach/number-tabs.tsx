import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NumberTabs as Tabs } from "@/lib/outreach/conversation-numbers";

function Chip({ href, active, label, total, waiting, paused }: { href: string; active: boolean; label: string; total: number; waiting: number; paused?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={`${label}: ${total} ${total === 1 ? "conversa" : "conversas"}${waiting > 0 ? `, ${waiting} esperando por você` : ""}${paused ? ". Número pausado." : ""}`}
      className={cn(
        "label flex h-8 shrink-0 items-center gap-2 border px-3 text-[10px] transition-colors",
        active ? "border-accent-line bg-accent-dim text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      <span className="max-w-[150px] truncate">{label}</span>
      <span className="num opacity-70">{total}</span>
      {waiting > 0 ? (
        <span className="num grid h-4 min-w-4 place-items-center border border-warn/35 bg-warn/10 px-1 text-[10px] text-warn">{waiting}</span>
      ) : null}
      {paused ? <span aria-hidden className="size-1.5 bg-warn" /> : null}
    </Link>
  );
}

/**
 * O filtro por número das Conversas: "Todos" e um botão por número, com quantas conversas ele tem, quantas esperam por você (o
 * selo laranja) e se está pausado (o quadradinho). `hrefFor(null)` é o de "Todos".
 */
export function NumberTabs({
  data,
  activeId,
  hrefFor,
  wrap = false,
}: {
  data: Tabs;
  activeId: string | null;
  hrefFor: (id: string | null) => string;
  /** Quebra em linhas (a coluna estreita da caixa de entrada); sem isso rola para o lado. */
  wrap?: boolean;
}) {
  if (!data.multi) return null;
  return (
    <nav aria-label="Filtrar conversas por número" className={cn("flex gap-1.5", wrap ? "flex-wrap" : "no-scrollbar overflow-x-auto")}>
      <Chip href={hrefFor(null)} active={activeId === null} label="Todos" total={data.all.total} waiting={data.all.waiting} />
      {data.tabs.map((t) => (
        <Chip key={t.id} href={hrefFor(t.id)} active={activeId === t.id} label={t.name} total={t.total} waiting={t.waiting} paused={t.paused} />
      ))}
    </nav>
  );
}
