import Link from 'next/link';
import { Suspense } from 'react';
import { ArrowRight, Clock, Download, FolderKanban, HardDrive, Sparkles, Wand2 } from 'lucide-react';
import { getActiveSubscription, requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, ButtonLink, Card, EmptyState, Stat } from '@/components/ui';
import { NewProjectButton } from '@/components/dashboard/NewProject';
import { bytes, formatDateTime } from '@/lib/utils';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DashboardHome() {
  const { user, profile } = await requireUser();
  const subscription = await getActiveSubscription();
  const plan = subscription?.plans;
  const supabase = await createSupabaseServerClient();

  const [{ data: projects }, { data: assets }, { count: downloads }] = await Promise.all([
    supabase.from('es_projects').select('*').eq('user_id', user!.id).order('updated_at', { ascending: false }).limit(6),
    supabase.from('es_user_assets').select('size_bytes').eq('user_id', user!.id),
    supabase.from('es_downloads').select('id', { count: 'exact', head: true }).eq('user_id', user!.id),
  ]);

  const usedBytes = (assets ?? []).reduce((acc, a) => acc + Number(a.size_bytes || 0), 0);
  const storageLimit = (plan?.limits?.storage_gb ?? 5) * 1024 ** 3;
  const pct = Math.min(100, Math.round((usedBytes / storageLimit) * 100));
  const list = (projects ?? []) as unknown as Project[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">
            Painel de {profile?.full_name?.split(' ')[0] || 'criador'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Plano {plan?.name ?? '—'} ·{' '}
            {subscription?.cancel_at_period_end ? 'cancelamento agendado' : 'tudo pronto para editar'}
          </p>
        </div>
        <Suspense fallback={null}>
          <NewProjectButton />
        </Suspense>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Projetos" value={list.length} hint={`limite do plano: ${plan?.limits?.projects ?? '—'}`} icon={<FolderKanban className="h-4 w-4" />} />
        <Stat label="Armazenamento" value={bytes(usedBytes)} hint={`de ${plan?.limits?.storage_gb ?? 5} GB`} icon={<HardDrive className="h-4 w-4" />} tone="cyan" />
        <Stat label="Downloads" value={downloads ?? 0} hint="via Baixa Tudo" icon={<Download className="h-4 w-4" />} tone="emerald" />
        <Stat label="Qualidade máxima" value={`${plan?.limits?.max_quality ?? 1080}p`} hint={plan?.limits?.export_4k ? '4K liberado' : 'upgrade para 4K'} icon={<Sparkles className="h-4 w-4" />} tone="amber" />
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-white">Uso de armazenamento</span>
          <span className="text-xs text-slate-400">{bytes(usedBytes)} / {(plan?.limits?.storage_gb ?? 5)} GB</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/8">
          <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-neon-cyan" style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Projetos recentes</h2>
            <Link href="/dashboard/projetos" className="text-xs text-brand-300 hover:underline">Ver todos</Link>
          </div>
          <div className="mt-4">
            {list.length === 0 ? (
              <EmptyState
                title="Nenhum projeto ainda"
                description="Crie seu primeiro projeto e arraste um vídeo para a timeline."
                action={<NewProjectButton label="Criar projeto" />}
                icon={<Wand2 className="h-5 w-5" />}
              />
            ) : (
              <ul className="divide-y divide-white/5">
                {list.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    <div className="grid h-10 w-14 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-gradient-to-br from-brand-600/40 to-ink-800">
                      {p.thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.thumb_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] text-slate-400">{p.width}×{p.height}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">{p.name}</p>
                      <p className="flex items-center gap-2 text-[11px] text-slate-500">
                        <Clock className="h-3 w-3" /> {formatDateTime(p.updated_at)}
                      </p>
                    </div>
                    <Badge tone={p.status === 'published' ? 'success' : 'neutral'}>{p.status === 'draft' ? 'rascunho' : p.status}</Badge>
                    <ButtonLink href={`/studio/${p.id}`} size="sm" variant="secondary">
                      Abrir <ArrowRight className="h-3.5 w-3.5" />
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Atalhos</h2>
            <div className="mt-3 grid gap-2">
              <ButtonLink href="/dashboard/baixa-tudo" variant="secondary" className="justify-start">
                <Download className="h-4 w-4 text-emerald-300" /> Baixar vídeo/áudio
              </ButtonLink>
              <ButtonLink href="/dashboard/arquivos" variant="secondary" className="justify-start">
                <HardDrive className="h-4 w-4 text-cyan-300" /> Enviar arquivos
              </ButtonLink>
              <ButtonLink href="/dashboard/assinatura" variant="secondary" className="justify-start">
                <Sparkles className="h-4 w-4 text-amber-300" /> Fazer upgrade
              </ButtonLink>
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Dicas rápidas</h2>
            <ul className="mt-3 space-y-2 text-[12px] leading-relaxed text-slate-400">
              <li><kbd className="rounded bg-white/10 px-1">Espaço</kbd> toca/pausa · <kbd className="rounded bg-white/10 px-1">C</kbd> corta no playhead</li>
              <li><kbd className="rounded bg-white/10 px-1">S</kbd> divide clipe · <kbd className="rounded bg-white/10 px-1">Del</kbd> remove</li>
              <li><kbd className="rounded bg-white/10 px-1">Ctrl</kbd> + rolagem dá zoom na régua</li>
              <li>Arraste as bordas do clipe para aparar por frame</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
