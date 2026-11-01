import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { Badge, Card } from '@/components/ui';
import { upsertPlan } from '@/app/admin/actions';
import { brl } from '@/lib/utils';
import type { Plan } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AdminPlans() {
  await requireAdmin();
  const db = createAdminClient();
  const { data } = await db.from('es_plans').select('*').order('sort_order');
  const plans = (data ?? []) as unknown as Plan[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Planos</h1>
        <p className="mt-1 text-sm text-slate-400">Preços, recursos e limites exibidos na landing e no checkout.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className="p-4">
            <form action={upsertPlan} className="space-y-2">
              <input type="hidden" name="id" value={plan.id} />
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{plan.name}</h3>
                <Badge tone={plan.is_active ? 'success' : 'danger'}>{plan.is_active ? 'ativo' : 'inativo'}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input name="name" defaultValue={plan.name} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white" placeholder="Nome" />
                <input name="slug" defaultValue={plan.slug} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white" placeholder="slug" />
                <input name="price_monthly" type="number" step="0.01" defaultValue={plan.price_monthly} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white" />
                <input name="price_yearly" type="number" step="0.01" defaultValue={plan.price_yearly} className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white" />
              </div>
              <input name="description" defaultValue={plan.description ?? ''} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-white" placeholder="Descrição" />
              <textarea name="features" defaultValue={(plan.features ?? []).join('\n')} rows={5} className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white" placeholder="Um recurso por linha" />
              <div className="grid grid-cols-3 gap-1">
                <label className="text-[9px] uppercase tracking-wider text-slate-500">
                  Projetos
                  <input name="projects" type="number" defaultValue={plan.limits?.projects} className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
                <label className="text-[9px] uppercase tracking-wider text-cyan-300">
                  Storage (GB)
                  <input name="storage_gb" type="number" defaultValue={plan.limits?.storage_gb} className="mt-0.5 w-full rounded-lg border border-cyan-400/40 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
                <label className="text-[9px] uppercase tracking-wider text-slate-500">
                  Qualidade
                  <input name="max_quality" type="number" defaultValue={plan.limits?.max_quality} className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
                <label className="text-[9px] uppercase tracking-wider text-slate-500">
                  Min TTS
                  <input name="tts_minutes" type="number" defaultValue={plan.limits?.tts_minutes} className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
                <label className="text-[9px] uppercase tracking-wider text-slate-500">
                  Downloads/dia
                  <input name="downloads_per_day" type="number" defaultValue={plan.limits?.downloads_per_day} className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
                <label className="text-[9px] uppercase tracking-wider text-slate-500">
                  Trial (dias)
                  <input name="trial_days" type="number" defaultValue={plan.trial_days} className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-1.5 py-1 text-[10px] text-white" />
                </label>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-500">
                O limite de <strong className="text-cyan-300">Storage (GB)</strong> é aplicado de verdade: o upload, a
                importação, o Baixa Tudo e a IA somam os bytes do usuário e bloqueiam quando o plano enche.
              </p>
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <label className="flex items-center gap-1"><input type="checkbox" name="premium_library" defaultChecked={plan.limits?.premium_library} className="accent-brand-500" /> Premium</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="unlimited" defaultChecked={Boolean(plan.limits?.unlimited)} className="accent-brand-500" /> Ilimitado</label>
                <label className="flex items-center gap-1"><input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="accent-brand-500" /> Ativo</label>
                <input name="sort_order" type="number" defaultValue={plan.sort_order} className="w-12 rounded border border-white/10 bg-black/30 px-1 py-0.5 text-white" title="Ordem" />
              </div>
              <button className="w-full rounded-lg bg-gradient-to-r from-brand-500 to-brand-600 py-1.5 text-xs font-semibold text-white">Salvar {brl(plan.price_monthly)}</button>
            </form>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-white">Novo plano</h3>
        <form action={upsertPlan} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input name="name" placeholder="Nome" required className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="slug" placeholder="slug" required className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="price_monthly" type="number" step="0.01" placeholder="Preço mensal" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="price_yearly" type="number" step="0.01" placeholder="Preço anual" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="description" placeholder="Descrição" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white sm:col-span-2" />
          <textarea name="features" rows={3} placeholder="Recursos (um por linha)" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white sm:col-span-2" />
          <input name="projects" type="number" defaultValue={10} placeholder="Projetos" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="storage_gb" type="number" defaultValue={10} placeholder="GB" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="max_quality" type="number" defaultValue={1080} placeholder="Qualidade" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <input name="trial_days" type="number" defaultValue={0} placeholder="Trial" className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white" />
          <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" name="unlimited" className="accent-brand-500" /> Plano ilimitado</label>
          <button className="rounded-lg bg-white/10 py-2 text-xs font-semibold text-white sm:col-span-2">Criar plano</button>
        </form>
      </Card>
    </div>
  );
}
