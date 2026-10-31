'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Hourglass, Sparkles } from 'lucide-react';

function fmt(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`;
  if (m > 0) return `${m}min`;
  return `${total}s`;
}

/** Saldo de tempo compacto no header mobile do painel. */
export function MobileTimePill() {
  const [state, setState] = useState<{ remaining: number; planActive: boolean; planName: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/time', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { remaining: number; planActive: boolean; planName: string | null };
        if (alive) setState(data);
      } catch {
        /* silencioso */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!state) return null;

  return (
    <Link
      href="/dashboard/assinatura"
      className={`ml-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold lg:hidden ${
        state.planActive
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
          : state.remaining > 0
            ? 'border-brand-400/30 bg-brand-500/10 text-brand-100'
            : 'border-rose-400/30 bg-rose-500/10 text-rose-200'
      }`}
    >
      {state.planActive ? <Sparkles className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
      {state.planActive ? state.planName ?? 'plano' : `${fmt(state.remaining)}`}
    </Link>
  );
}
