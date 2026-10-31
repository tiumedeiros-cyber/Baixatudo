'use client';
import { useState, useTransition } from 'react';
import { Check, Copy, Loader2, Mail, MessageCircle, QrCode, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui';
import { startManualPayment } from '@/app/checkout/actions';
import { brl } from '@/lib/utils';

type Result = Awaited<ReturnType<typeof startManualPayment>>;

export function ManualPayment({
  kind,
  slug,
  cycle,
  pixKey,
  pixHolder,
  instructions,
  supportEmail,
}: {
  kind: 'plan' | 'hours';
  slug: string;
  cycle?: 'monthly' | 'yearly';
  pixKey: string;
  pixHolder: string;
  instructions: string;
  supportEmail: string;
}) {
  const [pending, start] = useTransition();
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function copy(text: string, tag: string) {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(tag);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  function begin() {
    setError(null);
    start(async () => {
      const result = await startManualPayment({ kind, slug, cycle });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setData(result);
      if (result?.whatsapp) window.open(result.whatsapp, '_blank', 'noopener');
    });
  }

  if (!data) {
    return (
      <Card className="mt-5 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <QrCode className="h-4 w-4 text-emerald-400" /> Pagamento manual (PIX)
        </p>
        <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-slate-400">
          {instructions || 'Pague por PIX e envie o comprovante. Liberamos o acesso após conferir.'}
        </p>
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-slate-500">Chave PIX</p>
              <p className="truncate font-mono text-[12px] text-white">{pixKey || 'peça a chave no WhatsApp'}</p>
              {pixHolder ? <p className="text-[10px] text-slate-500">{pixHolder}</p> : null}
            </div>
            {pixKey ? (
              <button
                type="button"
                onClick={() => copy(pixKey, 'pix')}
                className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/20"
              >
                {copied === 'pix' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            ) : null}
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="mt-0.5 h-3 w-3 text-emerald-400" />
            Ao clicar em “Gerar pedido e abrir WhatsApp”, criamos um pedido registrado no painel e abrimos a conversa com a
            mensagem do comprovante já escrita.
          </p>
        </div>
        <button
          type="button"
          onClick={begin}
          disabled={pending}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-400 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
          Gerar pedido e enviar comprovante no WhatsApp
        </button>
        {error ? <p className="mt-2 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">{error}</p> : null}
      </Card>
    );
  }

  return (
    <Card className="mt-5 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
        <Check className="h-4 w-4" /> Pedido {data.paymentId?.slice(0, 8).toUpperCase()} registrado
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {data.label} · <strong className="text-white">{brl(data.amount ?? 0)}</strong>. Agora envie o comprovante — o
        acesso é liberado após a conferência.
      </p>

      <div className="mt-3 space-y-2">
        {data.pixKey ? (
          <button
            type="button"
            onClick={() => copy(data.pixKey!, 'pix2')}
            className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-left"
          >
            <span className="min-w-0">
              <span className="block text-[10px] uppercase tracking-wider text-slate-500">Chave PIX</span>
              <span className="block truncate font-mono text-[12px] text-white">{data.pixKey}</span>
            </span>
            <span className="shrink-0 rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white">
              {copied === 'pix2' ? 'copiado' : 'copiar'}
            </span>
          </button>
        ) : null}

        {data.whatsapp ? (
          <a
            href={data.whatsapp}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black transition hover:bg-emerald-400"
          >
            <MessageCircle className="h-4 w-4" /> Enviar comprovante no WhatsApp
          </a>
        ) : null}

        {data.email ? (
          <a
            href={`mailto:${data.email}?subject=${encodeURIComponent(`Comprovante do pedido ${data.paymentId?.slice(0, 8).toUpperCase()}`)}`}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/5"
          >
            <Mail className="h-4 w-4" /> Enviar comprovante por e-mail
          </a>
        ) : null}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Guarde o número do pedido <strong className="text-slate-300">{data.paymentId?.slice(0, 8).toUpperCase()}</strong>. Se
          preferir, responda no WhatsApp com o comprovante em foto ou PDF.
        </p>
      </div>
    </Card>
  );
}
