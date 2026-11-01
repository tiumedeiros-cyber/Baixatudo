import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card, Input } from '@/components/ui';
import { UserActions } from '@/components/admin/UserEdit';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q } = await searchParams;
  const db = createAdminClient();

  let query = db.from('es_profiles').select('*').order('created_at', { ascending: false }).limit(100);
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);
  const [{ data: profiles }, { data: subs }, { data: plans }] = await Promise.all([
    query,
    db.from('es_subscriptions').select('*, es_plans(name)').in('status', ['trial', 'active', 'past_due']),
    db.from('es_plans').select('id,name').eq('is_active', true).order('sort_order'),
  ]);
  const planList = ((plans ?? []) as Array<{ id: string; name: string }>).map((p) => ({ id: p.id, name: p.name }));

  const subMap = new Map((subs ?? []).map((s) => [s.user_id, s]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Usuários</h1>
          <p className="mt-1 text-sm text-slate-400">{profiles?.length ?? 0} contas listadas</p>
        </div>
        <form className="flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Buscar e-mail ou nome…" className="w-56" />
          <button className="rounded-xl bg-white/8 px-4 text-xs font-semibold text-white hover:bg-white/12">Buscar</button>
        </form>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Criado</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(profiles ?? []).map((u) => {
              const sub = subMap.get(u.id) as unknown as
                | { es_plans?: { name: string }; status?: string; plan_id?: string }
                | undefined;
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-white">{u.full_name || '—'}</p>
                    <p className="text-[11px] text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {sub?.es_plans?.name ?? '—'}
                    {sub?.status ? <span className="ml-1 text-[10px] text-slate-500">({sub.status})</span> : null}
                  </td>
                  <td className="px-4 py-3"><Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{u.role}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={u.status === 'active' ? 'success' : 'danger'}>{u.status}</Badge></td>
                  <td className="px-4 py-3 text-[11px] text-slate-500">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3">
                    <UserActions
                      userId={u.id}
                      status={u.status}
                      role={u.role}
                      email={u.email}
                      plans={planList}
                      currentPlanId={sub?.plan_id}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
