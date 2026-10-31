import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card } from '@/components/ui';
import { PaymentActions } from '@/components/admin/ActionButtons';
import { brl, formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminPayments() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db
    .from('es_payments')
    .select('*, es_profiles(email, full_name), es_plans(name)')
    .order('created_at', { ascending: false })
    .limit(200);
  const payments = data ?? [];

  const approved = payments.filter((p) => p.status === 'approved');
  const total = approved.reduce((acc, p) => acc + Number(p.amount), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Pagamentos</h1>
          <p className="mt-1 text-sm text-slate-400">{payments.length} transações · {brl(total)} aprovados</p>
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Gateway</th>
              <th className="px-4 py-3">Risco</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {payments.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 text-xs text-slate-300">
                  {(p.es_profiles as { email?: string } | null)?.email ?? p.user_id.slice(0, 8)}
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{(p.es_plans as { name?: string } | null)?.name ?? '—'}</td>
                <td className="px-4 py-3 text-xs font-semibold text-white">{brl(p.amount)}</td>
                <td className="px-4 py-3 text-xs capitalize text-slate-400">{p.gateway}</td>
                <td className="px-4 py-3">
                  <Badge tone={p.risk_score > 60 ? 'danger' : p.risk_score > 30 ? 'warning' : 'success'}>{p.risk_score}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={p.status === 'approved' ? 'success' : p.status === 'pending' ? 'warning' : 'danger'}>{p.status}</Badge>
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-500">{formatDateTime(p.created_at)}</td>
                <td className="px-4 py-3"><PaymentActions id={p.id} status={p.status} /></td>
              </tr>
            ))}
            {!payments.length ? <tr><td colSpan={8} className="px-4 py-8 text-center text-xs text-slate-500">Nenhuma transação registrada.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
