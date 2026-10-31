'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Clock, CreditCard, Hourglass, Loader2, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui';
import { purchaseHours } from '@/app/checkout/actions';
import { HOUR_PACKS } from '@/lib/hour-packs';
import { ManualPayment } from './ManualPayment';
import { brl } from '@/lib/utils';

export function HourPacksForm({
  demo,
  remaining,
  manual = false,
  pixKey = '',
  pixHolder = '',
  instructions = '',
  supportEmail = '',
}: {
  demo: boolean;
  remaining: number;
  manual?: boolean;
  pixKey?: string;
  pixHolder?: string;
  instructions?: string;
  supportEmail?: string;
}) {
  const [selected, setSelected] = useState(HOUR_PACKS[1].slug);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const router = useRouter();

  function buy() {
    setError(null);
    start(async () => {
      try {
        const result = await purchaseHours(selected);
        if (result?.url) {
          window.location.href = result.url;
          return;
        }
        if (result?.ok) {
          setDone(result.remaining ?? null);
          router.refresh();
          return;
        }
        setError(result?.error ?? 'Não foi possível concluir a compra.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha inesperada.');
      }
    });
  }

  if (done !== null) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-2 text-emerald-300">
          <Check className="h-5 w-5" />
          <h2 className="font-display text-lg font-bold text-white">Horas liberadas!</h2>
        </div>
        <p className="mt-2 text-sm text-slate-300">
          Seu saldo agora é de <strong className="text-white">{(done / 3600).toFixed(2).replace('.', ',')} h</strong> de edição.
          O cronômetro só corre com o editor aberto.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/dashboard/projetos"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-4 text-sm font-semibold text-white"
          >
            <Hourglass className="h-4 w-4" /> Ir para meus projetos
          </Link>
          <Link href="/dashboard/assinatura" className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white">
            Ver assinatura
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {remaining > 0 ? (
        <div className="rounded-xl border border-brand-400/25 bg-brand-500/10 px-4 py-3 text-xs text-brand-100">
          Você tem <strong>{(remaining / 3600).toFixed(2).replace('.', ',')} h</strong> de saldo. As horas compradas se somam e não expiram.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        {HOUR_PACKS.map((pack) => {
          const active = selected === pack.slug;
          return (
            <button
              key={pack.slug}
              type="button"
              onClick={() => setSelected(pack.slug)}
              className={`relative rounded-2xl border p-4 text-left transition ${
                active ? 'border-brand-400/60 bg-brand-500/10 shadow-[0_16px_40px_-24px_rgba(79,70,229,0.9)]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
              }`}
            >
              {pack.highlight ? (
                <span className="absolute -top-2 right-3 rounded-full bg-amber-400 px-2 py-0.5 text-[9px] font-bold uppercase text-ink-950">
                  mais vendido
                </span>
              ) : null}
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <Clock className="h-3.5 w-3.5" /> {pack.label}
              </p>
              <p className="mt-1 font-display text-xl font-extrabold text-white">{brl(pack.price)}</p>
              <p className="text-[11px] text-slate-500">{brl(pack.perHour)} / hora</p>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">{pack.note}</p>
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <TriangleAlert className="h-3.5 w-3.5" /> {error}
        </p>
      ) : null}

      {manual ? (
        <ManualPayment
          kind="hours"
          slug={selected}
          pixKey={pixKey}
          pixHolder={pixHolder}
          instructions={instructions}
          supportEmail={supportEmail}
        />
      ) : (
      <button
        type="button"
        onClick={buy}
        disabled={pending}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 text-sm font-bold text-white shadow-[0_16px_36px_-18px_rgba(79,70,229,0.95)] transition hover:from-brand-400 hover:to-brand-500 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {pending ? 'Processando…' : `Comprar ${HOUR_PACKS.find((p) => p.slug === selected)?.label}`}
      </button>
      )}

      <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
        {manual
          ? 'Pagamento manual: o acesso é liberado após a conferência do comprovante.'
          : demo
            ? 'Ambiente de demonstração: a liberação é imediata e registrada na auditoria.'
            : 'Pagamento protegido por antifraude e liberação automática após confirmação.'}
      </p>

      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
        <p className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Precisa editar todo mês?
        </p>
        <Link href="/dashboard/assinatura" className="text-[11px] font-semibold text-brand-300 hover:underline">
          Ver planos mensais
        </Link>
      </div>
    </div>
  );
}
