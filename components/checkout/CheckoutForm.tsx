'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CreditCard, Loader2, Lock, QrCode, ShieldCheck } from 'lucide-react';
import { Button, Card, Field, Input } from '@/components/ui';
import { createCheckout } from '@/app/checkout/actions';
import { brl } from '@/lib/utils';

export function CheckoutForm({
  planSlug,
  monthly,
  yearly,
  email,
  stripeEnabled,
  mpEnabled,
  demo,
}: {
  planSlug: string;
  monthly: number;
  yearly: number;
  email: string;
  stripeEnabled: boolean;
  mpEnabled: boolean;
  demo: boolean;
}) {
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [method, setMethod] = useState<'card' | 'pix'>(stripeEnabled ? 'card' : mpEnabled ? 'pix' : 'card');
  const [card, setCard] = useState({ name: '', number: '', exp: '', cvc: '', cpf: '' });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const amount = cycle === 'yearly' ? yearly : monthly;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const result = await createCheckout({ planSlug, cycle, method });
        if (result?.url) {
          window.location.href = result.url;
          return;
        }
        if (result?.ok) {
          router.push('/dashboard/assinatura?pagamento=aprovado');
          router.refresh();
          return;
        }
        setError(result?.error ?? 'Não foi possível iniciar o pagamento.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro inesperado');
      }
    });
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {[
          { v: 'monthly', label: 'Mensal', price: monthly, hint: 'cancele quando quiser' },
          { v: 'yearly', label: 'Anual', price: yearly, hint: '2 meses grátis' },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setCycle(opt.v as 'monthly' | 'yearly')}
            className={`rounded-xl border p-3 text-left transition ${
              cycle === opt.v ? 'border-brand-400/60 bg-brand-500/15' : 'border-white/10 hover:bg-white/5'
            }`}
          >
            <p className="text-xs font-bold text-white">{opt.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-white">{brl(opt.price)}</p>
            <p className="text-[10px] text-slate-500">{opt.hint}</p>
          </button>
        ))}
      </div>

      {demo ? (
        <Card className="border-amber-400/25 bg-amber-500/5 p-3 text-[11px] leading-relaxed text-amber-200">
          <strong>Modo demonstração:</strong> nenhum gateway está configurado, então o pagamento é simulado com o mesmo
          fluxo (registro de cobrança + ativação da assinatura). Configure <code>STRIPE_SECRET_KEY</code> ou{' '}
          <code>MERCADOPAGO_ACCESS_TOKEN</code> para cobrar de verdade.
        </Card>
      ) : null}

      <Card className="p-4">
        <p className="text-xs font-semibold text-white">Dados do pagador</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="E-mail">
            <Input value={email} disabled />
          </Field>
          <Field label="CPF/CNPJ">
            <Input value={card.cpf} onChange={(e) => setCard({ ...card, cpf: e.target.value })} placeholder="000.000.000-00" />
          </Field>
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMethod('card')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold ${
              method === 'card' ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" /> Cartão
          </button>
          <button
            type="button"
            onClick={() => setMethod('pix')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold ${
              method === 'pix' ? 'border-brand-400/50 bg-brand-500/15 text-white' : 'border-white/10 text-slate-400'
            }`}
          >
            <QrCode className="h-3.5 w-3.5" /> PIX
          </button>
        </div>

        {method === 'card' && !demo ? (
          <div className="mt-3 space-y-3">
            <Field label="Nome no cartão">
              <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} placeholder="Como está no cartão" />
            </Field>
            <Field label="Número do cartão">
              <Input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="0000 0000 0000 0000" inputMode="numeric" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Validade">
                <Input value={card.exp} onChange={(e) => setCard({ ...card, exp: e.target.value })} placeholder="MM/AA" />
              </Field>
              <Field label="CVV">
                <Input value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} placeholder="123" inputMode="numeric" />
              </Field>
            </div>
            <p className="text-[10px] text-slate-500">Os dados são enviados direto ao gateway no ambiente seguro dele.</p>
          </div>
        ) : method === 'card' && demo ? (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400">
            No modo demonstração não pedimos cartão: a assinatura é ativada imediatamente após a confirmação simulada.
          </p>
        ) : (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-slate-400">
            {mpEnabled
              ? 'Você será levado ao checkout do Mercado Pago para gerar o QR Code PIX.'
              : 'PIX disponível após configurar um gateway (Mercado Pago). No modo demonstração a assinatura é ativada na hora.'}
          </p>
        )}
      </Card>

      {error ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
        </div>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        {demo ? 'Confirmar assinatura (demo)' : `Pagar ${brl(amount)}`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
        <ShieldCheck className="h-3 w-3" /> Ambiente criptografado · confirmação automática
      </p>
    </form>
  );
}
