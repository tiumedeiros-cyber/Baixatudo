import { requireAdmin } from '@/lib/auth';
import { Logo } from '@/components/ui';
import { AdminNav } from '@/components/admin/AdminNav';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-amber-400/10 bg-ink-950/70 p-4 lg:block">
        <div className="px-2 py-1"><Logo /></div>
        <p className="mt-3 px-2 text-[10px] font-bold uppercase tracking-wider text-amber-300">Administração</p>
        <div className="mt-2"><AdminNav /></div>
        <div className="mt-6 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[11px] text-slate-400">
          <p className="font-semibold text-white">{profile?.full_name ?? 'Administrador'}</p>
          <p className="truncate">{profile?.email}</p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex h-14 items-center gap-3 border-b border-white/5 bg-ink-950/70 px-4 backdrop-blur lg:px-8">
          <div className="lg:hidden"><Logo size="sm" /></div>
          <span className="text-sm font-semibold text-white">Painel administrativo</span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/dashboard" className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">Ver site</a>
            <form action="/auth/signout" method="post">
              <button className="rounded-lg bg-white/8 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/12">Sair</button>
            </form>
          </div>
        </header>
        <div className="flex gap-1 overflow-x-auto border-b border-white/5 px-3 py-2 lg:hidden">
          <AdminNav />
        </div>
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
