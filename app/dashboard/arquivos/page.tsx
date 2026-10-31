import { requireUser, getActiveSubscription } from '@/lib/auth';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Uploader } from '@/components/dashboard/Uploader';
import { createAdminClient } from '@/lib/supabase/admin';
import { getQuota } from '@/lib/quota';
import type { UserAsset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  const { user } = await requireUser();
  const sub = await getActiveSubscription();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('es_user_assets')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  const planGb = Number(sub?.plans?.limits?.storage_gb ?? 10);
  const quota = await getQuota(createAdminClient(), user!.id, planGb);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Meus arquivos</h1>
        <p className="mt-1 text-sm text-slate-400">Tudo aqui fica disponível na biblioteca do editor.</p>
      </div>
      <Uploader
        userId={user!.id}
        assets={(data ?? []) as UserAsset[]}
        storageLimitGb={planGb}
        quota={{ usedBytes: quota.usedBytes, limitBytes: quota.limitBytes }}
      />
    </div>
  );
}
