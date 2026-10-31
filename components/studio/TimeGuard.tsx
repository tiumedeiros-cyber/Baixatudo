'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, Hourglass, LogOut, Sparkles, TriangleAlert } from 'lucide-react';

function fmt(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

/**
 * Cronômetro do plano por hora dentro do editor.
 * - Envia um heartbeat para /api/time (o servidor calcula e desconta o tempo real).
 * - Quando o saldo chega a zero, avisa e bloqueia a edição com CTA de compra.
 */
export function TimeGuard({ planActive, initialRemaining = 0 }: { planActive: boolean; initialRemaining?: number }) {
  const [remaining, setRemaining] = useState(initialRemaining);
  const [active, setActive] = useState(planActive);
  const [expired, setExpired] = useState(!planActive && initialRemaining <= 0);
  const lastTick = useRef(Date.now());

  const tick = useCallback(async () => {
    if (active) return;
    const seconds = Math.max(1, Math.round((Date.now() - lastTick.current) / 1000));
    lastTick.current = Date.now();
    try {
      const res = await fetch('/api/time', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seconds }),
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { remaining: number; planActive: boolean; canEdit: boolean };
      setRemaining(data.remaining);
      setActive(data.planActive);
      if (!data.canEdit) setExpired(true);
      else if (data.remaining > 0) setExpired(false);
    } catch {
      /* sem rede: tenta no próximo ciclo */
    }
  }, [active]);

  useEffect(() => {
    if (active) return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void tick();
    }, 30_000);
    return () => clearInterval(timer);
  }, [active, tick]);

  if (active) return null;

  return (
    <>
      <div className="pointer-events-none fixed bottom-3 left-3 z-[60] hidden lg:block">
        <div
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold shadow-lg backdrop-blur ${
            remaining <= 0
              ? 'border-rose-400/40 bg-rose-500/20 text-rose-100'
              : remaining < 600
                ? 'border-amber-400/40 bg-amber-500/20 text-amber-100'
                : 'border-white/10 bg-black/60 text-slate-200'
          }`}
        >
          <Clock className="h-3 w-3" /> {fmt(remaining)} de edição
        </div>
      </div>

      {expired ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-rose-400/30 bg-ink-900 p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-300">
              <TriangleAlert className="h-5 w-5" />
              <h2 className="font-display text-lg font-bold text-white">Seu tempo de edição acabou</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              O saldo de horas chegou a zero. Seus projetos estão salvos — compre horas avulsas para continuar agora ou
              assine um plano e edite sem cronômetro.
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href="/checkout/hora"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-sm font-semibold text-white hover:from-brand-400 hover:to-brand-500"
              >
                <Hourglass className="h-4 w-4" /> Comprar horas
              </Link>
              <Link
                href="/dashboard/assinatura"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-sm font-semibold text-white hover:bg-white/10"
              >
                <Sparkles className="h-4 w-4 text-amber-300" /> Assinar um plano
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center justify-center gap-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair do editor
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
