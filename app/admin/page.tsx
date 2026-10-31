import Link from 'next/link';
import { Activity, CreditCard, Download, TrendingUp, Users, Video } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card, Stat } from '@/components/ui';
import { brl, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: profiles }, { data: subs }, { data: payments }, { count: downloads }, { count: projects }] = await Promise.all([
    db.from('es_profiles').select('*').order('created_at', { ascending: false }),
    db.from('es_subscriptions').select('*, es_plans(*)'),
    db.from('es_payments').select('*, es_profiles(email, full_name)').order('created_at', { ascending: false }).limit(8),
    db.from('es_downloads').select('id', { count: 'exact', head: true }),
    db.from('es_projects').select('id', { count: 'exact', head: true }),
  ]);

  const users = profiles ?? [];
  const subscriptions = (subs ?? []) as unknown as { status: string; billing_cycle: string; created_at: string; es_plans: { price_monthly: number; price_yearly: number; name: string } | null; user_id: string }[];
  const active = subscriptions.filter((s) => s.status === 'active');
  const trials = subscriptions.filter((s) => s.status === 'trial');
  const mrr = active.reduce((acc, s) => {
    const plan = s.es_plans;
    if (!plan) return acc;
    return acc + (s.billing_cycle === 'yearly' ? Number(plan.price_yearly) / 12 : Number(plan.price_monthly));
  }, 0);
  const revenue30 = (payments ?? [])
    .filter((p) => p.status === 'approved' && new Date(p.created_at).getTime() > Date.now() - 30 * 864e5)
    .reduce((acc, p) => acc + Number(p.amount), 0);
  const newUsers30 = users.filter((u) => new Date(u.created_at).getTime() > Date.now() - 30 * 864e5).length;
  const conversion = users.length ? Math.round((active.length / users.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Visão geral do negócio</h1>
        <p className="mt-1 text-sm text-slate-400">Métricas em tempo real do Supabase.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="MRR" value={brl(mrr)} hint={`${active.length} assinaturas ativas`} icon={<TrendingUp className="h-4 w-4" />} tone="emerald" />
        <Stat label="Receita (30d)" value={brl(revenue30)} hint="pagamentos aprovados" icon={<CreditCard className="h-4 w-4" />} />
        <Stat label="Usuários" value={users.length} hint={`${newUsers30} novos em 30d`} icon={<Users className="h-4 w-4" />} tone="cyan" />
        <Stat label="Conversão" value={`${conversion}%`} hint={`${trials.length} em trial`} icon={<Activity className="h-4 w-4" />} tone="amber" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Projetos criados" value={projects ?? 0} icon={<Video className="h-4 w-4" />} tone="brand" />
        <Stat label="Downloads (Baixa Tudo)" value={downloads ?? 0} icon={<Download className="h-4 w-4" />} tone="emerald" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
            <h2 className="text-sm font-semibold text-white">Pagamentos recentes</h2>
            <Link href="/admin/pagamentos" className="text-xs text-brand-300 hover:underline">Ver todos</Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
              <tr><th className="px-4 py-2">Cliente</th><th className="px-4 py-2">Valor</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Data</th></tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(payments ?? []).map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-xs text-slate-300">{(p.es_profiles as { email?: string } | null)?.email ?? p.user_id.slice(0, 8)}</td>
                  <td className="px-4 py-2 text-xs font-semibold text-white">{brl(p.amount)}</td>
                  <td className="px-4 py-2">
                    <Badge tone={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'}>{p.status}</Badge>
                  </td>
                  <td className="px-4 py-2 text-[11px] text-slate-500">{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
              {!payments?.length ? <tr><td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-500">Nenhum pagamento ainda.</td></tr> : null}
            </tbody>
          </table>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-white">Novos cadastros</h2>
          <ul className="mt-3 space-y-2">
            {users.slice(0, 6).map((u) => (
              <li key={u.id} className="flex items-center gap-2 text-xs">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-neon-pink text-[9px] font-bold text-white">
                  {(u.full_name || u.email || 'US').slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-300">{u.email}</span>
                <span className="text-[10px] text-slate-600">{formatDateTime(u.created_at)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
