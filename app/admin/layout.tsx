import Link from 'next/link';
import { LayoutDashboard, LogOut } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { AdminNav } from '@/components/admin/AdminNav';
import { MobileMenu } from '@/components/ui/MobileMenu';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-amber-400/10 bg-ink-900 p-4 lg:block">
        <div className="px-2 py-1"><Logo /></div>
        <p className="mt-3 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">Administração</p>
        <div className="mt-2"><AdminNav /></div>
        <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] text-slate-400">
          <p className="font-semibold text-white">{profile?.full_name ?? 'Administrador'}</p>
          <p className="truncate">{profile?.email}</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-white/8 bg-ink-900 px-4 lg:px-8">
          <MobileMenu title="Administração">
            <div className="px-1"><AdminNav /></div>
          </MobileMenu>
          <div className="lg:hidden"><Logo size="sm" /></div>
          <span className="hidden text-sm font-semibold text-white sm:block">Painel administrativo</span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/dashboard"
              className="hidden items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 sm:flex"
            >
              <LayoutDashboard className="h-3.5 w-3.5" /> Área do cliente
            </Link>
            <form action="/auth/signout" method="post">
              <button className="inline-flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/12">
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </form>
          </div>
        </header>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
