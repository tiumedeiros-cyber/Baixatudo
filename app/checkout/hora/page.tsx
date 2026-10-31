import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Check, Clock, Hourglass, Lock, ShieldCheck } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { Badge, Card, Logo } from '@/components/ui';
import { HourPacksForm } from '@/components/checkout/HourPacksForm';
import { getTimeBalance } from '@/lib/time';

export const dynamic = 'force-dynamic';

const BENEFITS = [
  'Editor completo liberado enquanto houver saldo',
  'Horas não expiram — use quando quiser',
  'Exportação até 1080p no pacote avulso',
  'Projetos, arquivos e biblioteca inclusos',
];

export default async function HourCheckoutPage({ searchParams }: { searchParams: Promise<{ horas?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/checkout/hora');
  const { horas } = await searchParams;

  const balance = await getTimeBalance(user.id);
  const demo = !process.env.STRIPE_SECRET_KEY && !process.env.MERCADOPAGO_ACCESS_TOKEN;

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/5 px-5 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Logo />
          <Link href="/dashboard/assinatura" className="text-xs text-slate-400 hover:text-white">Voltar</Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-4xl gap-5 px-5 py-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <Badge tone="brand">Plano por hora</Badge>
          <h1 className="mt-3 font-display text-3xl font-bold text-white">Compre horas de edição</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sem mensalidade: pague apenas pelo tempo que usar no editor. O cronômetro corre só com o editor aberto.
          </p>

          {horas === 'cancelado' ? (
            <p className="mt-3 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Compra cancelada — nenhuma cobrança foi feita.
            </p>
          ) : null}
          {horas === 'pendente' ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              Pagamento pendente. As horas entram automaticamente assim que for confirmado.
            </p>
          ) : null}

          <div className="mt-5">
            <HourPacksForm demo={demo} remaining={balance.remaining} />
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <Hourglass className="h-3.5 w-3.5" /> Como funciona
            </p>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {BENEFITS.map((b) => (
                <li key={b} className="flex gap-1.5"><Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" /> {b}</li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] leading-relaxed text-slate-400">
              <p className="flex items-center gap-1.5 font-semibold text-white"><Clock className="h-3.5 w-3.5 text-brand-300" /> Controle de tempo</p>
              <p className="mt-1">
                O consumo é calculado no servidor, com trava por conta — abrir duas abas ou recarregar a página não desconta
                tempo em dobro.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-white">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Compra protegida
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Lock className="h-3 w-3" /> Antifraude ativo · liberação automática
            </p>
            <Link href="/dashboard/assinatura" className="mt-3 inline-flex text-[11px] font-semibold text-brand-300 hover:underline">
              Comparar com os planos mensais →
            </Link>
          </Card>
        </div>
      </main>
    </div>
  );
}
