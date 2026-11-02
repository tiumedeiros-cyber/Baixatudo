import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { initials } from '../lib/format';

/* ------------------------------- Ícones --------------------------------- */
type IconName =
  | 'scissors'
  | 'calendar'
  | 'clock'
  | 'user'
  | 'users'
  | 'chart'
  | 'settings'
  | 'bell'
  | 'check'
  | 'x'
  | 'plus'
  | 'arrow-right'
  | 'arrow-left'
  | 'star'
  | 'card'
  | 'tag'
  | 'qr'
  | 'logout'
  | 'menu'
  | 'search'
  | 'money'
  | 'sparkle'
  | 'shield'
  | 'globe'
  | 'download'
  | 'trash'
  | 'edit'
  | 'message'
  | 'pin'
  | 'phone'
  | 'mail'
  | 'instagram'
  | 'chevron-left'
  | 'chevron-right'
  | 'grid';

const paths: Record<IconName, string> = {
  scissors: 'M20 4L8.5 15.5M20 20L8.5 8.5M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6z',
  calendar: 'M8 2v4M16 2v4M3.5 9h17M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  clock: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  user: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  users: 'M17 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9.5 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13A4 4 0 0119 7',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 003.68 15a1.65 1.65 0 00-1.51-1H2a2 2 0 110-4h.09A1.65 1.65 0 004.6 8.6a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6 1.65 1.65 0 0010 3.09V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0020.4 9c.2.61.77 1 1.42 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z',
  bell: 'M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0',
  check: 'M20 6L9 17l-5-5',
  x: 'M18 6L6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  card: 'M21 4H3a2 2 0 00-2 2v12a2 2 0 002 2h18a2 2 0 002-2V6a2 2 0 00-2-2zM1 10h22',
  tag: 'M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01',
  qr: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM21 14v7h-7M17 21h4',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  menu: 'M3 6h18M3 12h18M3 18h18',
  search: 'M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z',
  money: 'M2 7h20v10H2zM12 15a3 3 0 100-6 3 3 0 000 6z',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3a15 15 0 010 18 15 15 0 010-18z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  edit: 'M11 4H4v16h16v-7M18.5 2.5l3 3L12 15l-4 1 1-4z',
  message: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 1118 0zM12 13a3 3 0 100-6 3 3 0 000 6z',
  phone: 'M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6A19.8 19.8 0 012 4.2 2 2 0 014 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.1a2 2 0 012.1-.5c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z',
  mail: 'M4 4h16v16H4zM4 6l8 7 8-7',
  instagram: 'M7 2h10a5 5 0 015 5v10a5 5 0 01-5 5H7a5 5 0 01-5-5V7a5 5 0 015-5zM12 16a4 4 0 100-8 4 4 0 000 8zM17.5 6.5h.01',
  'chevron-left': 'M15 18l-6-6 6-6',
  'chevron-right': 'M9 18l6-6-6-6',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
};

export function Icon({ name, className = 'h-5 w-5', strokeWidth = 1.7 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

/* -------------------------------- Botões -------------------------------- */
export function Button({
  variant = 'primary',
  loading,
  icon,
  children,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'dark' | 'danger'; loading?: boolean; icon?: IconName }) {
  return (
    <button className={`btn-${variant} ${className}`} disabled={loading || props.disabled} {...props}>
      {loading ? <Spinner className="h-4 w-4" /> : icon ? <Icon name={icon} className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* -------------------------------- Campos -------------------------------- */
export function Field({ label, hint, children, className = '' }: { label?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && <span className="mt-1 block text-xs text-cream-300/60">{hint}</span>}
    </label>
  );
}

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`field ${props.className || ''}`} {...props} />
);

export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={`field ${props.className || ''}`} {...props} />
);

export const Textarea = (props: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={`field ${props.className || ''}`} {...props} />
);

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-brass-400' : 'bg-ink-600'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-cream-50 transition ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

/* -------------------------------- Blocos -------------------------------- */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' }) {
  const tones = {
    neutral: 'border-white/15 bg-white/5 text-cream-200',
    success: 'border-moss-400/30 bg-moss-400/15 text-moss-400',
    warn: 'border-brass-400/30 bg-brass-400/15 text-brass-200',
    danger: 'border-rose-400/30 bg-rose-400/15 text-rose-400',
    info: 'border-sky-400/30 bg-sky-400/15 text-sky-300',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function Avatar({ name, url, size = 44 }: { name?: string; url?: string | null; size?: number }) {
  if (url) {
    return <img src={url} alt={name || ''} style={{ width: size, height: size }} className="rounded-full object-cover" loading="lazy" />;
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.34) }}
      className="inline-flex items-center justify-center rounded-full border border-brass-400/30 bg-brass-400/15 font-semibold text-brass-200"
    >
      {initials(name)}
    </span>
  );
}

export function StarRating({ value = 0, onChange, size = 16 }: { value?: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : undefined} aria-label="avaliação">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(star)}
          aria-label={`${star} estrelas`}
          className={onChange ? 'transition hover:scale-110' : 'cursor-default'}
        >
          <svg width={size} height={size} viewBox="0 0 24 24" fill={star <= Math.round(value) ? '#e0a45c' : 'none'} stroke="#e0a45c" strokeWidth="1.6">
            <path d={paths.star} />
          </svg>
        </button>
      ))}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        className={`w-full ${width} animate-rise rounded-t-3xl border border-white/10 bg-ink-900 p-6 shadow-2xl sm:rounded-3xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="text-xl text-cream-50">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 text-cream-300 hover:bg-white/10 hover:text-cream-50" aria-label="Fechar">
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, description, action }: { icon?: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
      <span className="rounded-full bg-brass-400/10 p-3 text-brass-300">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div>
        <p className="font-medium text-cream-100">{title}</p>
        {description && <p className="mt-1 max-w-sm text-sm text-cream-300/70">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, description, align = 'left' }: { eyebrow?: string; title: string; description?: string; align?: 'left' | 'center' }) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.24em] text-brass-300">{eyebrow}</p>}
      <h2 className="text-3xl leading-tight text-cream-50 sm:text-4xl">{title}</h2>
      {description && <p className="mt-3 text-cream-300/80">{description}</p>}
    </div>
  );
}

/* -------------------------------- Toast --------------------------------- */
type Toast = { id: number; message: string; tone: 'success' | 'error' | 'info' };
const ToastContext = createContext<{ push: (message: string, tone?: Toast['tone']) => void }>({ push: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 4200);
  }, []);
  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
              item.tone === 'success'
                ? 'border-moss-400/30 bg-ink-900/95 text-cream-100'
                : item.tone === 'error'
                  ? 'border-rose-400/40 bg-ink-900/95 text-cream-100'
                  : 'border-white/15 bg-ink-900/95 text-cream-100'
            }`}
          >
            <span className={item.tone === 'error' ? 'text-rose-400' : 'text-moss-400'}>
              <Icon name={item.tone === 'error' ? 'x' : 'check'} className="h-4 w-4" />
            </span>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ------------------------------- Gráficos ------------------------------- */
export function Sparkline({ data, height = 56, className = '' }: { data: number[]; height?: number; className?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const width = 100;
  const step = width / Math.max(1, data.length - 1);
  const points = data.map((v, i) => `${(i * step).toFixed(2)},${(height - ((v - min) / range) * (height - 6) - 3).toFixed(2)}`);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }}>
      <polygon points={`0,${height} ${points.join(' ')} ${width},${height}`} fill="url(#spark)" opacity="0.35" />
      <polyline points={points.join(' ')} fill="none" stroke="#e0a45c" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <defs>
        <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0a45c" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#e0a45c" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function BarChart({ items, format }: { items: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex items-center justify-between text-xs text-cream-300/80">
            <span>{item.label}</span>
            <span className="font-medium text-cream-100">{format ? format(item.value) : item.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/8">
            <div className="h-full rounded-full bg-gradient-to-r from-brass-500 to-brass-300" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, trend }: { label: string; value: ReactNode; hint?: string; icon?: IconName; trend?: number }) {
  return (
    <div className="card-tight">
      <div className="flex items-start justify-between">
        <p className="text-xs uppercase tracking-[0.14em] text-cream-300/60">{label}</p>
        {icon && <span className="text-brass-300/80"><Icon name={icon} className="h-4 w-4" /></span>}
      </div>
      <p className="mt-3 font-display text-2xl text-cream-50">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs text-cream-300/60">
        {typeof trend === 'number' && (
          <span className={trend >= 0 ? 'text-moss-400' : 'text-rose-400'}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
          </span>
        )}
        {hint}
      </div>
    </div>
  );
}
