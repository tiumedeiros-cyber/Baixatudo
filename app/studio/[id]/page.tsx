import { notFound, redirect } from 'next/navigation';
import { getActiveSubscription, requireUser } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { unstable_cache } from 'next/cache';
import { mergeAssets } from '@/lib/catalog/assets';
import { Studio } from '@/components/studio/Studio';
import { TimeGuard } from '@/components/studio/TimeGuard';
import { canUseEditor, getTimeBalance, hasActivePlan } from '@/lib/time';
import type { Asset, Project, UserAsset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Catálogo de conteúdo vem do código (lib/catalog). O banco só entra com os
  // assets extras do admin e fica em cache de 10 min — o editor não "carrega"
  // o Supabase a cada abertura.
  const extraAssets = await unstable_cache(
    async () => {
      const admin = createAdminClient();
      const { data } = await admin.from('es_assets').select('*').eq('is_active', true).order('type');
      return (data ?? []) as unknown as Asset[];
    },
    ['es_assets_catalog'],
    { revalidate: 600, tags: ['assets'] },
  )();

  const [{ data: project }, { data: userAssets }, sub] = await Promise.all([
    supabase.from('es_projects').select('*').eq('id', id).maybeSingle(),
    supabase.from('es_user_assets').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }),
    getActiveSubscription(),
  ]);
  const assets = mergeAssets(extraAssets);

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
        assets={assets}
        userAssets={(userAssets ?? []) as unknown as UserAsset[]}
        maxQuality={limits?.max_quality ?? 1080}
        premiumAllowed={Boolean(limits?.premium_library)}
      />
    </>
  );
}
