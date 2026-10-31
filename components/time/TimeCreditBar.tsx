'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, Hourglass, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

type Snapshot = {
  remaining: number;
  total: number;
  used: number;
  planActive: boolean;
  planName: string | null;
  planStatus: string | null;
  periodEnd: string | null;
  canEdit: boolean;
};

function fmt(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 864e5));
}

/**
 * Barra de tempo do plano por hora.
 * Mostra horas restantes (ou a validade do plano mensal) e avisa quando o saldo acaba.
 */
export function TimeCreditBar({
  initial,
  compact = false,
  className,
}: {
  initial?: Partial<Snapshot>;
  compact?: boolean;
  className?: string;
}) {
  const [data, setData] = useState<Snapshot | null>(initial ? ({ ...(initial as Snapshot) }) : null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/time', { cache: 'no-store' });
      if (!res.ok) return;
      setData((await res.json()) as Snapshot);
    } catch {
      /* offline: mantém o último valor */
    }
  }, []);

  useEffect(() => {
    void load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [load]);

  if (!data) {
    return (
      <div className={cn('rounded-2xl border border-white/10 bg-ink-900 p-4', className)}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Tempo de edição</p>
        <div className="mt-2 h-6 w-24 animate-pulse rounded bg-white/10" />
        <div className="mt-3 h-2.5 animate-pulse rounded-full bg-white/8" />
      </div>
    );
  }

  const planActive = Boolean(data?.planActive);
  const remaining = data?.remaining ?? 0;
  const total = data?.total ?? 0;
  const days = daysUntil(data?.periodEnd ?? null);
  const pct = planActive
    ? days === null
      ? 100
      : Math.max(4, Math.min(100, Math.round((days / 30) * 100)))
    : total > 0
      ? Math.max(0, Math.min(100, Math.round((remaining / total) * 100)))
      : 0;
  const empty = !planActive && remaining <= 0;
  const low = !planActive && remaining > 0 && pct <= 20;

  return (
    <div
      className={cn(
        'rounded-2xl border p-4',
        empty ? 'border-rose-400/30 bg-rose-500/[0.07]' : 'border-white/10 bg-ink-900',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {planActive ? <Sparkles className="h-3.5 w-3.5 text-emerald-300" /> : <Hourglass className="h-3.5 w-3.5 text-brand-300" />}
          {planActive ? 'Plano ativo' : 'Tempo de edição'}
        </span>
        {planActive ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
            {data?.planName ?? 'ilimitado'}
          </span>
        ) : (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', empty ? 'bg-rose-500/20 text-rose-200' : low ? 'bg-amber-500/20 text-amber-200' : 'bg-brand-500/20 text-brand-200')}>
            {empty ? 'esgotado' : low ? 'acabando' : 'saldo'}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={cn('font-display text-2xl font-extrabold', empty ? 'text-rose-200' : 'text-white')}>
          {planActive ? (days === null ? 'Ilimitado' : `${days} dias`) : fmt(remaining)}
        </span>
        <span className="text-[11px] text-slate-500">
          {planActive ? 'de acesso ao editor' : total > 0 ? `de ${fmt(total)}` : 'sem horas'}
        </span>
      </div>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/8">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-500',
            empty
              ? 'bg-rose-500'
              : planActive
                ? 'bg-gradient-to-r from-emerald-400 to-neon-cyan'
                : low
                  ? 'bg-gradient-to-r from-amber-400 to-rose-400'
                  : 'bg-gradient-to-r from-brand-500 to-neon-cyan',
          )}
          style={{ width: `${empty ? 0 : pct}%` }}
        />
      </div>

      {!compact ? (
        <p className={cn('mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed', empty ? 'text-rose-200' : 'text-slate-500')}>
          {empty ? <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> : <Clock className="mt-0.5 h-3 w-3 shrink-0" />}
          {empty
            ? 'Seu tempo terminou. Compre horas avulsas ou assine um plano para voltar a editar.'
            : planActive
              ? `Renovação em ${data?.periodEnd ? new Date(data.periodEnd).toLocaleDateString('pt-BR') : '—'} · o editor fica liberado sem consumir horas.`
              : 'O cronômetro só corre enquanto o editor está aberto. Cada hora comprada não expira.'}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          href="/checkout/hora"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 px-3 text-[11px] font-semibold text-white hover:from-brand-400 hover:to-brand-500"
        >
          <Hourglass className="h-3.5 w-3.5" /> Comprar horas
        </Link>
        <Link
          href="/dashboard/assinatura"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 text-[11px] font-semibold text-slate-200 hover:bg-white/10"
        >
          Ver planos
        </Link>
      </div>
    </div>
  );
}
