import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Check, Lock, ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, Card, Logo } from '@/components/ui';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { brl } from '@/lib/utils';
import type { Plan } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=/checkout/${slug}`);

  const supabase = await createSupabaseServerClient();
  const { data: plan } = await supabase.from('es_plans').select('*').eq('slug', slug).eq('is_active', true).maybeSingle();
  if (!plan) notFound();
  const typedPlan = plan as unknown as Plan;

  const stripeEnabled = Boolean(process.env.STRIPE_SECRET_KEY);
  const mpEnabled = Boolean(process.env.MERCADOPAGO_ACCESS_TOKEN);

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <Link href="/dashboard/assinatura" className="text-xs text-slate-400 hover:text-white">Voltar</Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-5 px-5 py-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <Badge tone="brand">Checkout seguro</Badge>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Assinar {typedPlan.name}</h1>
          <p className="mt-2 text-sm text-slate-400">{typedPlan.description}</p>
          <CheckoutForm
            planSlug={typedPlan.slug}
            monthly={Number(typedPlan.price_monthly)}
            yearly={Number(typedPlan.price_yearly)}
            email={user.email ?? ''}
            stripeEnabled={stripeEnabled}
            mpEnabled={mpEnabled}
            demo={!stripeEnabled && !mpEnabled}
          />
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Resumo</p>
            <div className="mt-2 flex items-end justify-between">
              <span className="font-display text-xl font-bold text-white">{typedPlan.name}</span>
              <span className="text-lg font-bold text-white">{brl(typedPlan.price_monthly)}</span>
            </div>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-300">
              {(typedPlan.features ?? []).map((f) => (
                <li key={f} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 text-emerald-400" /> {f}</li>
              ))}
            </ul>
          </Card>
          <Card className="p-5 text-[11px] leading-relaxed text-slate-400">
            <p className="flex items-center gap-1.5 font-semibold text-white"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Pagamento protegido</p>
            <ul className="mt-2 space-y-1.5">
              <li className="flex gap-1.5"><Lock className="mt-0.5 h-3 w-3" /> Dados do cartão nunca passam pelos nossos servidores.</li>
              <li className="flex gap-1.5"><Lock className="mt-0.5 h-3 w-3" /> Confirmação automática por webhook assinado.</li>
              <li className="flex gap-1.5"><Lock className="mt-0.5 h-3 w-3" /> Análise antifraude e limite de tentativas.</li>
              <li className="flex gap-1.5"><Lock className="mt-0.5 h-3 w-3" /> 7 dias de garantia (CDC art. 49).</li>
            </ul>
          </Card>
        </div>
      </main>
    </div>
  );
}
