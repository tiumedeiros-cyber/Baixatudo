import { cn } from "@/lib/utils";

const CONTROL =
  "w-full border border-line bg-surface-1 px-3 text-[14px] text-fg placeholder:text-faint " +
  "transition-colors hover:border-line-strong focus:border-accent focus:bg-surface-2 focus-visible:outline-none " +
  "disabled:opacity-50";

export function Input({ className, ...rest }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(CONTROL, "min-h-24 py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: React.ComponentProps<"select">) {
  return (
    <select className={cn(CONTROL, "h-10 appearance-none pr-8", className)} {...rest}>
      {children}
    </select>
  );
}

/** Rótulo mono + controle + dica opcional. */
export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="label text-[10px] text-muted">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[12px] leading-snug text-faint">{hint}</p> : null}
    </div>
  );
}
