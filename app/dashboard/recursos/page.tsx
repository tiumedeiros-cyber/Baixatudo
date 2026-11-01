import { Library } from 'lucide-react';
import { requireUser, getActiveSubscription } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatBytes, getQuota } from '@/lib/quota';
import { FreeResources } from '@/components/dashboard/FreeResources';
import { StockBrowser } from '@/components/dashboard/StockBrowser';

export const metadata = { title: 'Recursos grátis · Editor Studio' };
export const dynamic = 'force-dynamic';

export default async function FreeResourcesPage() {
  const { user } = await requireUser();
  const sub = await getActiveSubscription();
  const planGb = Number(sub?.plans?.limits?.storage_gb ?? 10);
  const quota = await getQuota(createAdminClient(), user!.id, planGb);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
          <Library className="h-6 w-6 text-brand-300" /> Recursos grátis
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">
          Fotos, músicas, ícones, imagens geradas por IA e QR Code — tudo de fontes abertas, <strong className="text-slate-200">sem chave e sem custo</strong>.
          O que você salvar entra em Meus arquivos e na biblioteca do editor.
        </p>
      </div>
      <FreeResources storageLabel={`${formatBytes(quota.freeBytes)} livres de ${formatBytes(quota.limitBytes)}`} />

      {/* Módulo 2 · bancos profissionais gratuitos (Pexels, Unsplash, Pixabay, Freesound).
          Componente isolado: não mexe em nada do editor nem na timeline. */}
      <StockBrowser />
    </div>
  );
}
