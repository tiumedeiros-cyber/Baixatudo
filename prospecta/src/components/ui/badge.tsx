import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "accent" | "warn" | "danger" | "info" | "ghost";

const TONE: Record<BadgeTone, string> = {
  neutral: "border-line-strong bg-surface-3 text-fg/85",
  accent: "border-accent-line bg-accent-dim text-accent",
  warn: "border-warn/35 bg-warn/10 text-warn",
  danger: "border-danger/40 bg-danger/10 text-danger",
  info: "border-info/35 bg-info/10 text-info",
  ghost: "border-line bg-transparent text-muted",
};

export function Badge({
  tone = "neutral",
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  /** Quadradinho de status antes do texto. */
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "label inline-flex h-5 items-center gap-1.5 border px-1.5 text-[10px] whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="dot" /> : null}
      {children}
    </span>
  );
}
