import Link from "next/link";
import { ArrowUpRight, Check, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NextStep {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  /** "warn": tem algo esperando por você. "ok": em dia. "neutral": só informação. */
  tone: "warn" | "ok" | "neutral";
}

const VALUE_TONE: Record<NextStep["tone"], string> = { warn: "text-warn", ok: "text-accent", neutral: "text-fg" };

/** A faixa "o que fazer agora": três atalhos, cada um com o número que mostra se há algo esperando por você. */
export function NextSteps({ items }: { items: NextStep[] }) {
  return (
    <section aria-label="O que fazer agora" className="grid gap-px border border-line bg-line md:grid-cols-3">
      {items.map(({ href, icon: Icon, label, value, hint, tone }, i) => (
        <Link
          key={href + label}
          href={href}
          className="rise group relative flex items-start gap-4 bg-surface-1 p-4 transition-colors hover:bg-surface-2"
          style={{ "--i": i } as React.CSSProperties}
        >
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center border",
              tone === "warn" ? "border-warn/40 bg-warn/10 text-warn" : tone === "ok" ? "border-accent-line bg-accent-dim text-accent" : "border-line-strong bg-surface-3 text-fg/80",
            )}
          >
            {tone === "ok" ? <Check className="size-4" aria-hidden /> : <Icon className="size-4" aria-hidden />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="label text-[10px] text-muted">{label}</span>
            <span className={cn("num text-[26px] leading-none tracking-[-0.04em]", VALUE_TONE[tone])}>{value}</span>
            <span className="text-[12px] leading-snug text-faint">{hint}</span>
          </span>
          <ArrowUpRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-accent" aria-hidden />
        </Link>
      ))}
    </section>
  );
}
