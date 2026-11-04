import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "soft" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg" | "icon";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-[#d8ff33] active:bg-[#b9e600]",
  secondary: "border border-line-strong bg-surface-2 text-fg hover:border-fg/50 hover:bg-surface-3",
  soft: "border border-accent-line bg-accent-dim text-accent hover:bg-accent/15 hover:border-accent/60",
  ghost: "text-muted hover:bg-surface-3 hover:text-fg",
  danger: "border border-danger/40 text-danger hover:border-danger/70 hover:bg-danger/10",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[12px]",
  md: "h-9 gap-2 px-4 text-[13px]",
  lg: "h-11 gap-2 px-5 text-[14px]",
  icon: "size-8 shrink-0",
};

/** Classes de botão, para usar também em <Link> e <label>. */
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className?: string,
) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.005em]",
    "transition-[background-color,color,border-color,transform] duration-150",
    "active:translate-y-px disabled:pointer-events-none disabled:opacity-40",
    VARIANT[variant],
    SIZE[size],
    className,
  );
}

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ variant, size, className, type = "button", ...rest }: Props) {
  return <button type={type} className={buttonClass(variant, size, className)} {...rest} />;
}
