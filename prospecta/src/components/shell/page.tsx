import { cn } from "@/lib/utils";

/** Cabeçalho padrão de página: eyebrow mono com o quadradinho lime, título, descrição e ações. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="relative border-b border-line bg-surface-0">
      <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" aria-hidden />
      <div className="relative mx-auto flex max-w-[1480px] flex-wrap items-end justify-between gap-x-6 gap-y-4 px-5 pt-8 pb-6 lg:px-10">
        <div className="rise flex min-w-0 max-w-2xl flex-col gap-2.5">
          <p className="label kicker text-accent">{eyebrow}</p>
          <h1 className="text-[28px] leading-[1.04] font-semibold tracking-[-0.035em] lg:text-[36px]">{title}</h1>
          {description ? <p className="max-w-xl text-[13.5px] leading-relaxed text-muted">{description}</p> : null}
        </div>
        {actions ? (
          <div className="rise flex flex-wrap items-center gap-2" style={{ "--i": 2 } as React.CSSProperties}>
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}

export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto max-w-[1480px] px-5 py-7 lg:px-10 lg:py-8", className)}>{children}</div>;
}

/** Título de bloco dentro da página: quadradinho lime, rótulo mono e uma linha até o fim. */
export function SectionLabel({
  children,
  aside,
  className,
}: {
  children: React.ReactNode;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <h2 className="label kicker text-[11px] text-fg/80">{children}</h2>
      {aside ? <span className="label text-[10px] text-muted">{aside}</span> : null}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/** Painel com borda de 1px e cabeçalho enxuto. */
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("border border-line bg-surface-1", className)}>
      {title || action ? (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-line px-4 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            {eyebrow ? <p className="label text-[10px] text-faint">{eyebrow}</p> : null}
            {title ? <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em]">{title}</h2> : null}
          </div>
          {action}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function Stat({
  label,
  value,
  sub,
  accent,
  index = 0,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  index?: number;
}) {
  return (
    <div
      className={cn(
        "rise relative flex flex-col gap-3 border bg-surface-1 p-4",
        accent ? "border-accent-line bg-gradient-to-b from-accent-dim to-surface-1" : "border-line",
      )}
      style={{ "--i": index } as React.CSSProperties}
    >
      {accent ? <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-accent" /> : null}
      <p className="label text-[10px] text-muted">{label}</p>
      <p className={cn("num text-[32px] leading-none font-medium tracking-[-0.04em]", accent && "text-accent")}>{value}</p>
      <p className="min-h-4 text-[12px] text-faint">{sub}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  glyph = "—",
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  glyph?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
      <span className="num grid size-14 place-items-center border border-dashed border-line-strong bg-surface-2 text-xl text-faint">{glyph}</span>
      <div className="flex max-w-sm flex-col gap-1.5">
        <p className="text-[15px] font-semibold tracking-[-0.01em]">{title}</p>
        <p className="text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}
