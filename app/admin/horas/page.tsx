import { Hourglass, PlusCircle, Sparkles, TriangleAlert, Users } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card, Input } from '@/components/ui';
import { grantTimeToAll, grantUserTime } from '@/app/admin/actions';
import { formatDuration } from '@/lib/hour-packs';

export const dynamic = 'force-dynamic';

type CreditRow = { user_id: string; seconds_total: number; seconds_used: number; kind: string; created_at: string };

export default async function AdminHours({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string; qtd?: string }> }) {
  await requireAdmin();
  const { ok, erro, qtd } = await searchParams;
  const db = createAdminClient();

  const [{ data: profiles }, { data: credits }, { data: subs }] = await Promise.all([
    db.from('es_profiles').select('id, email, full_name, role, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('es_time_credits').select('user_id, seconds_total, seconds_used, kind, created_at').order('created_at', { ascending: false }),
    db.from('es_subscriptions').select('user_id, status').in('status', ['trial', 'active', 'past_due']),
  ]);

  const balanceMap = new Map<string, { total: number; used: number }>();
  for (const row of (credits ?? []) as CreditRow[]) {
    const current = balanceMap.get(row.user_id) ?? { total: 0, used: 0 };
    current.total += Number(row.seconds_total || 0);
    current.used += Number(row.seconds_used || 0);
    balanceMap.set(row.user_id, current);
  }
  const planMap = new Map((subs ?? []).map((s) => [s.user_id, s.status]));

  const totalGranted = (credits ?? []).reduce((acc, c) => acc + Number(c.seconds_total || 0), 0);
  const totalUsed = (credits ?? []).reduce((acc, c) => acc + Number(c.seconds_used || 0), 0);
  const withTime = [...balanceMap.values()].filter((b) => b.total - b.used > 0).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Plano por hora</h1>
          <p className="mt-1 text-sm text-slate-400">
            Libere tempo de teste para clientes e acompanhe o consumo do editor.
          </p>
        </div>
        <form action={grantTimeToAll} className="flex items-end gap-2">
          <label className="text-[10px] uppercase tracking-wide text-slate-500">
            Bônus para todos
            <Input name="hours" type="number" min={0.5} max={10} step={0.5} defaultValue={1} className="mt-1 w-24" />
          </label>
          <button className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25">
            <Users className="h-3.5 w-3.5" /> Liberar para clientes
          </button>
        </form>
      </div>

      {ok ? (
        <p className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200">
          {ok === 'lote' ? `Bônus liberado para ${qtd ?? 0} clientes.` : 'Tempo liberado com sucesso.'}
        </p>
      ) : null}
      {erro ? (
        <p className="flex items-center gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
          <TriangleAlert className="h-3.5 w-3.5" />
          {erro === 'horas' ? 'Informe um tempo entre 0,5 e 100 horas.' : 'Usuário não encontrado.'}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Tempo liberado</p>
          <p className="mt-1 font-display text-xl font-bold text-white">{formatDuration(totalGranted)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Tempo consumido</p>
          <p className="mt-1 font-display text-xl font-bold text-white">{formatDuration(totalUsed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wide text-slate-500">Clientes com saldo</p>
          <p className="mt-1 font-display text-xl font-bold text-white">{withTime}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Usuário</th>
              <th className="px-4 py-3">Plano</th>
              <th className="px-4 py-3">Saldo de horas</th>
              <th className="px-4 py-3">Liberar tempo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {(profiles ?? []).map((u) => {
              const bal = balanceMap.get(u.id);
              const remaining = Math.max(0, (bal?.total ?? 0) - (bal?.used ?? 0));
              const plan = planMap.get(u.id);
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-white">{u.full_name || '—'}</p>
                    <p className="text-[11px] text-slate-500">{u.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    {plan ? <Badge tone="success">{plan}</Badge> : <Badge tone="neutral">sem plano</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${remaining > 0 ? 'text-emerald-300' : 'text-slate-500'}`}>
                      <Hourglass className="h-3.5 w-3.5" /> {formatDuration(remaining)}
                    </span>
                    <p className="text-[10px] text-slate-600">usado {formatDuration(bal?.used ?? 0)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <form action={grantUserTime} className="flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="userId" value={u.id} />
                      <Input
                        name="hours"
                        type="number"
                        min={0.5}
                        max={100}
                        step={0.5}
                        defaultValue={1}
                        aria-label="Horas"
                        className="w-20 text-[11px]"
                      />
                      <Input name="note" placeholder="motivo (opcional)" className="w-36 text-[11px]" />
                      <button className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-500/20 px-2 text-[11px] font-semibold text-brand-100 hover:bg-brand-500/30">
                        <PlusCircle className="h-3.5 w-3.5" /> Liberar
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {!profiles?.length ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-slate-500">Nenhum usuário ainda.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <p className="flex items-center gap-2 text-xs font-semibold text-white">
          <Sparkles className="h-4 w-4 text-amber-300" /> Como o tempo é cobrado
        </p>
        <ul className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-400">
          <li>• Assinantes (trial/ativo) usam o editor sem consumir horas.</li>
          <li>• Sem assinatura, o editor consome apenas o tempo real com a aba aberta (heartbeat de 30s).</li>
          <li>• O consumo roda em RPC com trava por conta: duas abas não duplicam o desconto.</li>
          <li>• Ao zerar o saldo, o cliente recebe o aviso para comprar horas ou assinar um plano.</li>
        </ul>
      </Card>
    </div>
  );
}
