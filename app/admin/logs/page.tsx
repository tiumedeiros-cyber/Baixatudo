import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card } from '@/components/ui';
import { formatDateTime } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminLogs() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from('es_audit_logs').select('*').order('created_at', { ascending: false }).limit(200);
  const logs = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Logs & auditoria</h1>
        <p className="mt-1 text-sm text-slate-400">Últimas 200 ações sensíveis registradas.</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Ator</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Entidade</th><th className="px-4 py-3">Detalhes</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-2 text-[11px] text-slate-500">{formatDateTime(l.created_at)}</td>
                <td className="px-4 py-2 text-xs text-slate-300">{l.actor_email ?? 'sistema'}</td>
                <td className="px-4 py-2"><Badge tone="brand">{l.action}</Badge></td>
                <td className="px-4 py-2 text-xs text-slate-400">{l.entity ?? '—'}</td>
                <td className="max-w-[320px] truncate px-4 py-2 text-[11px] text-slate-500">{JSON.stringify(l.meta).slice(0, 120)}</td>
              </tr>
            ))}
            {!logs.length ? <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-500">Nenhum log ainda.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
