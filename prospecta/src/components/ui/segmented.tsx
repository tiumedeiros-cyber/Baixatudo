import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type SegmentedItem = {
  value: string;
  label: string;
  href: string;
  icon?: LucideIcon;
  /** Número pequeno ao lado do rótulo (ex.: quantas conversas). */
  count?: number;
};

/** Escolha de visão feita de links (funciona sem JavaScript): o item ativo ganha o fundo lime suave. */
export function Segmented({
  items,
  value,
  label,
  className,
}: {
  items: SegmentedItem[];
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex h-9 items-stretch border border-line bg-surface-1 p-0.5", className)}>
      {items.map(({ value: v, label: text, href, icon: Icon, count }) => {
        const active = v === value;
        return (
          <Link
            key={v}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "label inline-flex items-center gap-1.5 px-3 text-[11px] transition-colors",
              active ? "bg-accent-dim text-accent" : "text-muted hover:text-fg",
            )}
          >
            {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
            {text}
            {count != null ? <span className="num text-[10px] opacity-70">{count}</span> : null}
          </Link>
        );
      })}
    </div>
  );
}
