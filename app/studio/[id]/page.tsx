import { notFound, redirect } from 'next/navigation';
import { getActiveSubscription, requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Studio } from '@/components/studio/Studio';
import { TimeGuard } from '@/components/studio/TimeGuard';
import { canUseEditor, getTimeBalance, hasActivePlan } from '@/lib/time';
import type { Asset, Project, UserAsset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();

  const [{ data: project }, { data: assets }, { data: userAssets }, sub] = await Promise.all([
    supabase.from('es_projects').select('*').eq('id', id).maybeSingle(),
    supabase.from('es_assets').select('*').eq('is_active', true).order('type'),
    supabase.from('es_user_assets').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
    getActiveSubscription(),
  ]);

  if (!project || project.user_id !== user!.id) notFound();

  // Plano por hora: sem assinatura ativa o editor exige saldo de tempo liberado.
  const balance = await getTimeBalance(user!.id);
  if (!canUseEditor(sub?.status ?? null, balance)) {
    redirect('/dashboard/assinatura?semTempo=1');
  }

  const limits = sub?.plans?.limits;

  return (
    <>
      <TimeGuard planActive={hasActivePlan(sub?.status)} initialRemaining={balance.remaining} />
      <Studio
        project={project as unknown as Project}
        assets={(assets ?? []) as unknown as Asset[]}
        userAssets={(userAssets ?? []) as unknown as UserAsset[]}
        maxQuality={limits?.max_quality ?? 1080}
        premiumAllowed={Boolean(limits?.premium_library)}
      />
    </>
  );
}
