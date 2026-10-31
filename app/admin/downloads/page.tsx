import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card } from '@/components/ui';
import { formatDateTime, truncate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AdminDownloads() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db
    .from('es_downloads')
    .select('*, es_profiles(email)')
    .order('created_at', { ascending: false })
    .limit(200);
  const downloads = data ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Downloads · Baixa Tudo</h1>
        <p className="mt-1 text-sm text-slate-400">{downloads.length} solicitações registradas</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.02] text-left text-[10px] uppercase tracking-wider text-slate-500">
            <tr><th className="px-4 py-3">Usuário</th><th className="px-4 py-3">Serviço</th><th className="px-4 py-3">Link</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Data</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {downloads.map((d) => (
              <tr key={d.id}>
                <td className="px-4 py-2 text-xs text-slate-300">{(d.es_profiles as { email?: string } | null)?.email ?? 'anônimo'}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{d.service ?? '—'}</td>
                <td className="max-w-[260px] truncate px-4 py-2 text-[11px] text-slate-500">{truncate(d.source_url, 60)}</td>
                <td className="px-4 py-2 text-xs text-slate-400">{d.media_type}</td>
                <td className="px-4 py-2"><Badge tone={d.status === 'ready' ? 'success' : d.status === 'error' ? 'danger' : 'warning'}>{d.status}</Badge></td>
                <td className="px-4 py-2 text-[11px] text-slate-500">{formatDateTime(d.created_at)}</td>
              </tr>
            ))}
            {!downloads.length ? <tr><td colSpan={6} className="px-4 py-8 text-center text-xs text-slate-500">Nenhum download ainda.</td></tr> : null}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
