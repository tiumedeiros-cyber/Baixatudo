import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Logo({ size = 'md', href = '/' }: { size?: 'sm' | 'md' | 'lg'; href?: string | null }) {
  const dim = size === 'sm' ? 'h-8 w-8 text-[15px]' : size === 'lg' ? 'h-12 w-12 text-2xl' : 'h-9 w-9 text-lg';
  const content = (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={cn(
          dim,
          'relative grid place-items-center rounded-xl bg-gradient-to-br from-brand-500 via-brand-600 to-neon-cyan font-black text-white shadow-glow',
        )}
      >
        <span className="relative z-10">ES</span>
        <span className="absolute inset-0 rounded-xl ring-1 ring-white/25" />
      </span>
      <span className="text-[17px] font-bold tracking-tight text-white">
        Editor<span className="text-brand-300">Studio</span>
      </span>
    </span>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 active:scale-[0.99]';
  const variants = {
    primary:
      'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_12px_32px_-12px_rgba(79,70,229,0.9)] hover:from-brand-400 hover:to-brand-500',
    secondary: 'bg-white/8 text-white border border-white/10 hover:bg-white/12',
    outline: 'border border-brand-400/40 text-brand-100 hover:bg-brand-500/10',
    ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
    danger: 'bg-rose-500/15 text-rose-200 border border-rose-400/30 hover:bg-rose-500/25',
  };
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };
  return (
    <button className={cn(base, variants[variant], sizes[size], className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  href,
  variant = 'primary',
  size = 'md',
  className,
}: {
  children: React.ReactNode;
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const map = {
    primary:
      'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_12px_32px_-12px_rgba(79,70,229,0.9)] hover:from-brand-400 hover:to-brand-500',
    secondary: 'bg-white/8 text-white border border-white/10 hover:bg-white/12',
    outline: 'border border-brand-400/40 text-brand-100 hover:bg-brand-500/10',
    ghost: 'text-slate-300 hover:text-white hover:bg-white/5',
  };
  const sizes = { sm: 'h-8 px-3 text-xs', md: 'h-10 px-4 text-sm', lg: 'h-12 px-6 text-[15px]' };
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all active:scale-[0.99]',
        map[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'cyan';
  className?: string;
}) {
  const tones = {
    neutral: 'bg-white/8 text-slate-300 border-white/10',
    success: 'bg-emerald-500/12 text-emerald-300 border-emerald-400/25',
    warning: 'bg-amber-500/12 text-amber-300 border-amber-400/25',
    danger: 'bg-rose-500/12 text-rose-300 border-rose-400/25',
    brand: 'bg-brand-500/15 text-brand-200 border-brand-400/25',
    cyan: 'bg-cyan-500/12 text-cyan-200 border-cyan-400/25',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('glass rounded-2xl', className)}>{children}</div>;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  'w-full rounded-xl border border-white/10 bg-ink-900/70 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-brand-400/60 focus:ring-2 focus:ring-brand-500/20';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, 'min-h-[96px] resize-y', props.className)} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputClass, 'appearance-none pr-8', props.className)} />;
}

export function Stat({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'brand' | 'cyan' | 'emerald' | 'amber';
}) {
  const tones = {
    brand: 'from-brand-500/25 to-transparent text-brand-200',
    cyan: 'from-cyan-500/20 to-transparent text-cyan-200',
    emerald: 'from-emerald-500/20 to-transparent text-emerald-200',
    amber: 'from-amber-500/20 to-transparent text-amber-200',
  };
  return (
    <Card className={cn('relative overflow-hidden p-5')}>
      <div className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70', tones[tone])} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-bold text-white">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
        </div>
        {icon ? <div className={cn('rounded-xl border border-white/10 bg-white/5 p-2', tones[tone])}>{icon}</div> : null}
      </div>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-brand-300">{icon ?? '✦'}</div>
      <p className="text-base font-semibold text-white">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
