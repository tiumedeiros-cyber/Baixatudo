import Link from 'next/link';
import { redirect } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';
import { getActiveSubscription, requireUser } from '@/lib/auth';
import { Badge, ButtonLink, Logo } from '@/components/ui';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUser();
  if (!user) redirect('/login');
  const subscription = await getActiveSubscription();
  const plan = subscription?.plans;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden border-r border-white/5 bg-ink-950/60 p-4 lg:block">
        <div className="px-2 py-2">
          <Logo />
        </div>
        <div className="mt-4">
          <Sidebar isAdmin={profile?.role === 'admin'} />
        </div>
        <div className="mt-6 rounded-2xl border border-white/8 bg-gradient-to-br from-brand-600/20 to-transparent p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-200">
            Plano {plan?.name ?? '—'}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {subscription?.status === 'trial' ? 'Trial até ' : 'Renova em '}
            {formatDate(subscription?.current_period_end)}
          </p>
          <ButtonLink href="/dashboard/assinatura" size="sm" variant="secondary" className="mt-3 w-full">
            Gerenciar
          </ButtonLink>
        </div>
        <form action="/auth/signout" method="post" className="mt-4 px-1">
          <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-slate-500 transition hover:bg-white/5 hover:text-slate-300">
            <LogOut className="h-3.5 w-3.5" /> Sair da conta
          </button>
        </form>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-40 border-b border-white/5 bg-ink-950/75 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 lg:px-8">
            <div className="lg:hidden"><Logo size="sm" /></div>
            <div className="hidden text-sm text-slate-400 lg:block">
              Olá, <span className="font-semibold text-white">{profile?.full_name || user.email}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone={subscription?.status === 'active' ? 'success' : subscription?.status === 'trial' ? 'brand' : 'warning'}>
                {subscription?.status === 'active' ? `Ativo · ${plan?.name}` : subscription?.status === 'trial' ? 'Trial' : 'Inativo'}
              </Badge>
              <Link
                href="/dashboard/projetos?novo=1"
                className="hidden h-9 items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 px-3.5 text-xs font-semibold text-white shadow-[0_10px_24px_-12px_rgba(79,70,229,0.9)] sm:flex"
              >
                <Plus className="h-3.5 w-3.5" /> Novo projeto
              </Link>
              <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-neon-pink text-xs font-bold text-white">
                {(profile?.full_name || user.email || 'US').slice(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto px-4 pb-2 no-scrollbar lg:hidden">
            <MobileNav isAdmin={profile?.role === 'admin'} />
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function MobileNav({ isAdmin }: { isAdmin: boolean }) {
  return <Sidebar isAdmin={isAdmin} />;
}
