import { cn } from "@/lib/utils";

/** As duas iniciais do nome (sem emoji nem símbolos), ou "?" quando não há letra. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, " ")
    .split(/[\s·|\-–—/,:]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((w) => w.length > 0 && !/^(de|da|do|das|dos|e|the)$/i.test(w));
  const first = words[0]?.[0];
  if (!first) return "?";
  const second = words.length > 1 ? words[1][0] : (words[0][1] ?? "");
  return (first + second).toUpperCase();
}

const SIZE = {
  sm: "size-7 text-[10px]",
  md: "size-9 text-[12px]",
  lg: "size-11 text-[14px]",
} as const;

const TONE = {
  neutral: "border-line-strong bg-surface-3 text-fg/80",
  accent: "border-accent-line bg-accent-dim text-accent",
  warn: "border-warn/40 bg-warn/10 text-warn",
  ghost: "border-line bg-surface-2 text-muted",
} as const;

/** Monograma quadrado do lead: dá um ponto de apoio visual a listas e cartões. */
export function Avatar({
  name,
  size = "md",
  tone = "neutral",
  className,
}: {
  name: string;
  size?: keyof typeof SIZE;
  tone?: keyof typeof TONE;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("num grid shrink-0 place-items-center border font-medium tracking-normal", SIZE[size], TONE[tone], className)}
    >
      {initialsOf(name)}
    </span>
  );
}
