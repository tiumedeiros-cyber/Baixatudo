import { Suspense } from 'react';
import { Clock, FolderKanban } from 'lucide-react';
import { requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Badge, ButtonLink, Card, EmptyState } from '@/components/ui';
import { NewProjectButton } from '@/components/dashboard/NewProject';
import { ProjectActions } from '@/components/dashboard/ProjectActions';
import { formatDateTime, shortTime } from '@/lib/utils';
import type { Project } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('es_projects').select('*').eq('user_id', user!.id).order('updated_at', { ascending: false });
  const projects = (data ?? []) as unknown as Project[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Meus projetos</h1>
          <p className="mt-1 text-sm text-slate-400">{projects.length} projeto(s) · autosave a cada 2s</p>
        </div>
        <Suspense fallback={null}><NewProjectButton /></Suspense>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-5 w-5" />}
          title="Sua estante está vazia"
          description="Crie um projeto novo ou importe um vídeo pelo Baixa Tudo."
          action={<Suspense fallback={null}><NewProjectButton label="Criar primeiro projeto" /></Suspense>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="card-hover overflow-hidden">
              <div className="studio-checker relative aspect-video">
                {p.thumb_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.thumb_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-gradient-to-br from-brand-600/30 via-ink-850 to-ink-900">
                    <span className="font-display text-lg font-bold text-white/25">{p.name.slice(0, 18)}</span>
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80">
                  {p.width}×{p.height}
                </span>
                <span className="absolute right-2 top-2">
                  <Badge tone={p.type === 'video' ? 'brand' : 'cyan'}>{p.type}</Badge>
                </span>
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                      <Clock className="h-3 w-3" /> {formatDateTime(p.updated_at)} · {shortTime(p.timeline?.clips?.length ? Math.max(...p.timeline.clips.map((c) => c.start + c.duration)) : 0)}
                    </p>
                  </div>
                  <ProjectActions id={p.id} />
                </div>
                <ButtonLink href={`/studio/${p.id}`} className="mt-3 w-full" size="sm">Abrir no editor</ButtonLink>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
